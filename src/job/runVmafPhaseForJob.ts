/**
 * 模块名称：VMAF 阶段执行器
 * 模块说明：reference 下载 → candidates 串行 libvmaf；单 candidate skip 不 fail job。
 */

import type { IProbeWorkerEffectiveConfig, IProbeWorkerR2Config } from "../config/probeWorkerConfig.types.js";
import { loadProbeWorkerR2Config } from "../config/loadProbeWorkerR2Config.js";
import {
	streamDownloadToTempFile,
	type TStreamDownloadToTempFileResult,
} from "../domain/download/streamDownloadToTempFile.js";
import {
	probeRuntimeCapabilities,
	type TVmafExecutionMode,
} from "../domain/ffmpeg/probeRuntimeCapabilities.js";
import type { IProbedVideoUrlMetadata } from "../domain/probe/ffprobeParse.helpers.js";
import {
	probeVideoUrlMetadata,
	type IProbeVideoUrlMetadataOptions,
} from "../domain/probe/probeVideoUrlMetadata.js";
import { enrichVmafFrameAnalyticsWithProbeScreenshots } from "../domain/screenshot/enrichVmafFrameAnalyticsWithProbeScreenshots.js";
import { buildVmafRowFrameAnalytics } from "../domain/vmaf/buildVmafRowFrameAnalytics.js";
import {
	isVmafCandidateSkippableAsHls,
	type IVmafCandidateDraft,
} from "../domain/vmaf/buildVmafCandidates.js";
import {
	DEFAULT_VMAF_MODEL_VERSION,
	runVmafPairWithFfmpeg,
	type IRunVmafPairWithFfmpegResult,
} from "../domain/vmaf/runVmafPairWithFfmpeg.js";
import { resolveVmafJobExecutionMode } from "../domain/vmaf/resolveVmafJobExecutionMode.js";
import { createVmafAbortContext } from "../domain/vmaf/vmafAbortContext.helpers.js";
import type {
	IDevVideoCompressCompareVmafReport,
	IDevVideoCompressCompareVmafRow,
	IDevVideoCompressCompareVmafRowFrameAnalyticsByMode,
	TDevVideoCompressCompareVmafSkipReason,
} from "../types/devVideoVmaf.types.js";
import {
	appendProbeVmafRow,
	finalizeProbeComputeJobCancelled,
	getProbeComputeJobMutableEntry,
	setProbeComputeVmafReport,
} from "./probeComputeJobStore.memory.js";

export const DEFAULT_VMAF_DURATION_MISMATCH_THRESHOLD_SECONDS = 2;

export interface IRunVmafPhaseDeps {
	config: IProbeWorkerEffectiveConfig;
	streamDownloadToTempFileFn?: (
		url: string,
		options?: Parameters<typeof streamDownloadToTempFile>[1],
	) => Promise<TStreamDownloadToTempFileResult>;
	probeVideoUrlMetadataFn?: (
		url: string,
		options?: IProbeVideoUrlMetadataOptions,
	) => Promise<IProbedVideoUrlMetadata>;
	runVmafPairWithFfmpegFn?: typeof runVmafPairWithFfmpeg;
	isLibvmafAvailableFn?: (config: IProbeWorkerEffectiveConfig) => Promise<boolean>;
	probeRuntimeCapabilitiesFn?: typeof probeRuntimeCapabilities;
	r2Config?: IProbeWorkerR2Config | null;
	loadR2ConfigFn?: () => IProbeWorkerR2Config | null;
}

function buildSkippedVmafRow(
	candidate: IVmafCandidateDraft,
	skipReason: TDevVideoCompressCompareVmafSkipReason,
	deliveryWidth: number,
	deliveryHeight: number,
): IDevVideoCompressCompareVmafRow {
	return {
		candidateLabel: candidate.label,
		candidateGroup: candidate.group,
		candidateUrl: candidate.url,
		deliveryWidth: deliveryWidth,
		deliveryHeight: deliveryHeight,
		vmafAtDelivery: null,
		vmafAtDisplay1080p: null,
		skipped: true,
		skipReason: skipReason,
	};
}

function buildVmafCandidateRow(params: {
	candidate: IVmafCandidateDraft;
	deliveryWidth: number;
	deliveryHeight: number;
	vmafAtDelivery: number | null;
	vmafAtDisplay1080p: number | null;
	deliveryVmafResult: IRunVmafPairWithFfmpegResult;
	displayVmafResult: IRunVmafPairWithFfmpegResult;
	includeFrameAnalytics: boolean;
	vmafFrameAnalytics?: IDevVideoCompressCompareVmafRowFrameAnalyticsByMode;
}): IDevVideoCompressCompareVmafRow {
	const row: IDevVideoCompressCompareVmafRow = {
		candidateLabel: params.candidate.label,
		candidateGroup: params.candidate.group,
		candidateUrl: params.candidate.url,
		deliveryWidth: params.deliveryWidth,
		deliveryHeight: params.deliveryHeight,
		vmafAtDelivery: params.vmafAtDelivery,
		vmafAtDisplay1080p: params.vmafAtDisplay1080p,
		skipped: false,
	};

	if (params.vmafFrameAnalytics) {
		row.vmafFrameAnalytics = params.vmafFrameAnalytics;
	} else if (params.includeFrameAnalytics) {
		const frameAnalytics = buildVmafRowFrameAnalytics(
			params.deliveryVmafResult,
			params.displayVmafResult,
		);
		if (frameAnalytics) {
			row.vmafFrameAnalytics = frameAnalytics;
		}
	}

	return row;
}

async function resolveVmafRowFrameAnalytics(params: {
	jobId: string;
	shopDomain: string;
	candidate: IVmafCandidateDraft;
	referenceLabel: string;
	referenceFilePath: string;
	distortedFilePath: string;
	deliveryVmafResult: IRunVmafPairWithFfmpegResult;
	displayVmafResult: IRunVmafPairWithFfmpegResult;
	includeFrameAnalytics: boolean;
	includeScreenshots: boolean;
	r2Config: IProbeWorkerR2Config | null;
	shouldAbort: () => boolean;
	config: IProbeWorkerEffectiveConfig;
}): Promise<IDevVideoCompressCompareVmafRowFrameAnalyticsByMode | undefined> {
	if (!params.includeFrameAnalytics) {
		return undefined;
	}

	if (!params.includeScreenshots) {
		return buildVmafRowFrameAnalytics(params.deliveryVmafResult, params.displayVmafResult);
	}

	let deliveryAnalytics = params.deliveryVmafResult.frameAnalytics;
	let displayAnalytics = params.displayVmafResult.frameAnalytics;

	if (deliveryAnalytics) {
		deliveryAnalytics = await enrichVmafFrameAnalyticsWithProbeScreenshots({
			r2Config: params.r2Config,
			shopDomain: params.shopDomain,
			jobId: params.jobId,
			vmafMode: "delivery",
			candidateLabel: params.candidate.label,
			referenceLabel: params.referenceLabel,
			referenceFilePath: params.referenceFilePath,
			distortedFilePath: params.distortedFilePath,
			frameAnalytics: deliveryAnalytics,
			shouldAbort: params.shouldAbort,
			ffmpegPath: params.config.ffmpeg.ffmpegPath,
			keySegment: params.config.screenshots.keySegment,
			maxSegmentsPerMode: params.config.screenshots.maxSegmentsPerMode,
		});
	}

	if (displayAnalytics) {
		displayAnalytics = await enrichVmafFrameAnalyticsWithProbeScreenshots({
			r2Config: params.r2Config,
			shopDomain: params.shopDomain,
			jobId: params.jobId,
			vmafMode: "display1080p",
			candidateLabel: params.candidate.label,
			referenceLabel: params.referenceLabel,
			referenceFilePath: params.referenceFilePath,
			distortedFilePath: params.distortedFilePath,
			frameAnalytics: displayAnalytics,
			shouldAbort: params.shouldAbort,
			ffmpegPath: params.config.ffmpeg.ffmpegPath,
			keySegment: params.config.screenshots.keySegment,
			maxSegmentsPerMode: params.config.screenshots.maxSegmentsPerMode,
		});
	}

	if (!deliveryAnalytics && !displayAnalytics) {
		return undefined;
	}

	return {
		delivery: deliveryAnalytics,
		display1080p: displayAnalytics,
	};
}

function resolveVmafCandidateDeliveryDimensions(
	candidate: IVmafCandidateDraft,
	probed: IProbedVideoUrlMetadata | null,
): { width: number; height: number } {
	if (candidate.width > 0 && candidate.height > 0) {
		return {
			width: candidate.width,
			height: candidate.height,
		};
	}
	if (probed && probed.width > 0 && probed.height > 0) {
		return {
			width: probed.width,
			height: probed.height,
		};
	}
	return {
		width: 0,
		height: 0,
	};
}

function buildPartialVmafReport(
	jobId: string,
	videoId: string,
	referenceLabel: string,
	vmafModel: string,
	startedAtMs: number,
	rows: IDevVideoCompressCompareVmafRow[],
): IDevVideoCompressCompareVmafReport {
	return {
		jobId: jobId,
		videoId: videoId,
		referenceLabel: referenceLabel,
		vmafModel: vmafModel,
		probedAtIso: new Date().toISOString(),
		totalDurationMs: Date.now() - startedAtMs,
		rows: rows,
	};
}

async function probeVideoUrlMetadataSoft(
	url: string,
	probeFn: IRunVmafPhaseDeps["probeVideoUrlMetadataFn"],
	config: IProbeWorkerEffectiveConfig,
): Promise<IProbedVideoUrlMetadata | null> {
	const fn = probeFn ?? probeVideoUrlMetadata;
	try {
		return await fn(url, {
			ffprobePath: config.ffmpeg.ffprobePath,
			ffprobeTimeoutMs: config.probe.ffprobeTimeoutMs,
		});
	} catch {
		return null;
	}
}

function finalizeVmafJobIfCancelled(
	jobId: string,
	videoId: string,
	referenceLabel: string,
	vmafModel: string,
	startedAtMs: number,
	rows: IDevVideoCompressCompareVmafRow[],
	nowMs: number,
): boolean {
	const entry = getProbeComputeJobMutableEntry(jobId);
	if (!entry || !entry.cancelRequested) {
		return false;
	}

	const partialReport = buildPartialVmafReport(
		jobId,
		videoId,
		referenceLabel,
		vmafModel,
		startedAtMs,
		rows,
	);
	finalizeProbeComputeJobCancelled(jobId, nowMs, {
		vmafReport: partialReport,
	});
	return true;
}

/**
 * 执行 VMAF 阶段；reference 下载失败抛错（整 job failed）。
 */
export async function runVmafPhaseForJob(
	jobId: string,
	startedAtMs: number,
	deps: IRunVmafPhaseDeps,
	nowMs: () => number,
): Promise<IDevVideoCompressCompareVmafReport | null> {
	const entry = getProbeComputeJobMutableEntry(jobId);
	if (!entry || !entry.request.vmaf) {
		return null;
	}

	const vmafSpec = entry.request.vmaf;
	const reference = vmafSpec.reference;
	const candidates = vmafSpec.candidates;
	const vmafModel = vmafSpec.options?.vmafModel ?? deps.config.vmaf.model ?? DEFAULT_VMAF_MODEL_VERSION;
	const durationMismatchThreshold =
		vmafSpec.options?.durationMismatchThresholdSec ??
		DEFAULT_VMAF_DURATION_MISMATCH_THRESHOLD_SECONDS;
	const includeFrameAnalytics = vmafSpec.options?.includeFrameAnalytics !== false;
	const includeScreenshots =
		vmafSpec.options?.includeScreenshots !== false && deps.config.screenshots.enabled;
	const r2Config =
		deps.r2Config !== undefined
			? deps.r2Config
			: (deps.loadR2ConfigFn?.() ?? loadProbeWorkerR2Config());
	const shopDomain = entry.request.caller.shopDomain;

	if (!reference.url.trim()) {
		throw new Error("VMAF reference URL is missing");
	}
	if (candidates.length === 0) {
		throw new Error("No VMAF candidates found for job");
	}

	const abortContext = createVmafAbortContext(jobId);
	const shouldAbort = abortContext.shouldAbort;
	const downloadFn = deps.streamDownloadToTempFileFn ?? streamDownloadToTempFile;
	const runVmafFn = deps.runVmafPairWithFfmpegFn ?? runVmafPairWithFfmpeg;
	const probeCapabilitiesFn = deps.probeRuntimeCapabilitiesFn ?? probeRuntimeCapabilities;

	const resultRows: IDevVideoCompressCompareVmafRow[] = [];
	let referenceCleanup: (() => Promise<void>) | null = null;

	try {
		if (deps.isLibvmafAvailableFn) {
			const libvmafOk = await deps.isLibvmafAvailableFn(deps.config);
			if (!libvmafOk) {
				throw new Error("libvmaf is not available in ffmpeg");
			}
		}

		const runtimeCapabilities = await probeCapabilitiesFn({ config: deps.config });
		if (!runtimeCapabilities.libvmafAvailable) {
			throw new Error("libvmaf is not available in ffmpeg");
		}

		const vmafExecutionMode: TVmafExecutionMode = resolveVmafJobExecutionMode(
			deps.config,
			runtimeCapabilities,
		);

		if (
			finalizeVmafJobIfCancelled(
				jobId,
				entry.request.caller.videoId,
				reference.label,
				vmafModel,
				startedAtMs,
				resultRows,
				nowMs(),
			)
		) {
			return null;
		}

		const referenceProbed = await probeVideoUrlMetadataSoft(
			reference.url,
			deps.probeVideoUrlMetadataFn,
			deps.config,
		);
		const referenceDurationSeconds =
			referenceProbed && referenceProbed.durationSeconds > 0
				? referenceProbed.durationSeconds
				: 0;
		const referenceFrameRateFps =
			referenceProbed && referenceProbed.frameRateFps > 0 ? referenceProbed.frameRateFps : 0;

		if (referenceDurationSeconds <= 0) {
			throw new Error("Original source duration is not available");
		}

		if (
			finalizeVmafJobIfCancelled(
				jobId,
				entry.request.caller.videoId,
				reference.label,
				vmafModel,
				startedAtMs,
				resultRows,
				nowMs(),
			)
		) {
			return null;
		}

		const referenceDownload = await downloadFn(reference.url, {
			signal: abortContext.downloadSignal,
			timeoutMs: deps.config.probe.downloadTimeoutMs,
		});
		if (!referenceDownload.ok) {
			if (
				shouldAbort() &&
				finalizeVmafJobIfCancelled(
					jobId,
					entry.request.caller.videoId,
					reference.label,
					vmafModel,
					startedAtMs,
					resultRows,
					nowMs(),
				)
			) {
				return null;
			}
			throw new Error("Failed to download original source: " + referenceDownload.error);
		}
		referenceCleanup = referenceDownload.cleanup;

		for (let index = 0; index < candidates.length; index += 1) {
			if (
				finalizeVmafJobIfCancelled(
					jobId,
					entry.request.caller.videoId,
					reference.label,
					vmafModel,
					startedAtMs,
					resultRows,
					nowMs(),
				)
			) {
				return null;
			}

			const candidate = candidates[index];

			if (isVmafCandidateSkippableAsHls(candidate)) {
				const row = buildSkippedVmafRow(candidate, "hls", candidate.width, candidate.height);
				resultRows.push(row);
				appendProbeVmafRow(jobId, row);
				continue;
			}

			const candidateProbed = await probeVideoUrlMetadataSoft(
				candidate.url,
				deps.probeVideoUrlMetadataFn,
				deps.config,
			);
			if (!candidateProbed) {
				const row = buildSkippedVmafRow(candidate, "ffprobe_incomplete", 0, 0);
				resultRows.push(row);
				appendProbeVmafRow(jobId, row);
				continue;
			}

			const dimensions = resolveVmafCandidateDeliveryDimensions(candidate, candidateProbed);
			if (dimensions.width <= 0 || dimensions.height <= 0) {
				const row = buildSkippedVmafRow(
					candidate,
					"ffprobe_incomplete",
					dimensions.width,
					dimensions.height,
				);
				resultRows.push(row);
				appendProbeVmafRow(jobId, row);
				continue;
			}

			const candidateDurationSeconds =
				candidateProbed.durationSeconds > 0 ? candidateProbed.durationSeconds : 0;
			if (candidateDurationSeconds <= 0) {
				const row = buildSkippedVmafRow(
					candidate,
					"ffprobe_incomplete",
					dimensions.width,
					dimensions.height,
				);
				resultRows.push(row);
				appendProbeVmafRow(jobId, row);
				continue;
			}

			const durationDelta = Math.abs(referenceDurationSeconds - candidateDurationSeconds);
			if (durationDelta > durationMismatchThreshold) {
				const row = buildSkippedVmafRow(
					candidate,
					"duration_mismatch",
					dimensions.width,
					dimensions.height,
				);
				resultRows.push(row);
				appendProbeVmafRow(jobId, row);
				continue;
			}

			const maxDurationSeconds = Math.min(referenceDurationSeconds, candidateDurationSeconds);

			if (
				shouldAbort() &&
				finalizeVmafJobIfCancelled(
					jobId,
					entry.request.caller.videoId,
					reference.label,
					vmafModel,
					startedAtMs,
					resultRows,
					nowMs(),
				)
			) {
				return null;
			}

			const candidateDownload = await downloadFn(candidate.url, {
				signal: abortContext.downloadSignal,
				timeoutMs: deps.config.probe.downloadTimeoutMs,
			});
			if (!candidateDownload.ok) {
				if (
					shouldAbort() &&
					finalizeVmafJobIfCancelled(
						jobId,
						entry.request.caller.videoId,
						reference.label,
						vmafModel,
						startedAtMs,
						resultRows,
						nowMs(),
					)
				) {
					return null;
				}
				const row = buildSkippedVmafRow(
					candidate,
					"download_failed",
					dimensions.width,
					dimensions.height,
				);
				resultRows.push(row);
				appendProbeVmafRow(jobId, row);
				continue;
			}

			try {
				const deliveryVmafResult = await runVmafFn(
					{
						distortedFilePath: candidateDownload.filePath,
						referenceFilePath: referenceDownload.filePath,
						mode: "delivery",
						deliveryWidth: dimensions.width,
						deliveryHeight: dimensions.height,
						maxDurationSeconds: maxDurationSeconds,
						frameRateFps:
							includeFrameAnalytics && referenceFrameRateFps > 0
								? referenceFrameRateFps
								: undefined,
						jobId: jobId,
						shouldAbort: shouldAbort,
						ffmpegPath: deps.config.ffmpeg.ffmpegPath,
						ffmpegTimeoutMs: deps.config.vmaf.ffmpegTimeoutMs,
						vmafModel: vmafModel,
						vmafExecutionMode: vmafExecutionMode,
					},
					deps.config,
				);
				const vmafAtDelivery = deliveryVmafResult.mean;

				const displayVmafResult = await runVmafFn(
					{
						distortedFilePath: candidateDownload.filePath,
						referenceFilePath: referenceDownload.filePath,
						mode: "display1080p",
						maxDurationSeconds: maxDurationSeconds,
						frameRateFps:
							includeFrameAnalytics && referenceFrameRateFps > 0
								? referenceFrameRateFps
								: undefined,
						jobId: jobId,
						shouldAbort: shouldAbort,
						ffmpegPath: deps.config.ffmpeg.ffmpegPath,
						ffmpegTimeoutMs: deps.config.vmaf.ffmpegTimeoutMs,
						vmafModel: vmafModel,
						vmafExecutionMode: vmafExecutionMode,
					},
					deps.config,
				);
				const vmafAtDisplay1080p = displayVmafResult.mean;

				if (shouldAbort()) {
					if (vmafAtDelivery !== null || vmafAtDisplay1080p !== null) {
						const partialRow = buildVmafCandidateRow({
							candidate: candidate,
							deliveryWidth: dimensions.width,
							deliveryHeight: dimensions.height,
							vmafAtDelivery: vmafAtDelivery,
							vmafAtDisplay1080p: vmafAtDisplay1080p,
							deliveryVmafResult: deliveryVmafResult,
							displayVmafResult: displayVmafResult,
							includeFrameAnalytics: includeFrameAnalytics,
						});
						resultRows.push(partialRow);
						appendProbeVmafRow(jobId, partialRow);
					}
					finalizeVmafJobIfCancelled(
						jobId,
						entry.request.caller.videoId,
						reference.label,
						vmafModel,
						startedAtMs,
						resultRows,
						nowMs(),
					);
					return null;
				}

				if (vmafAtDelivery === null && vmafAtDisplay1080p === null) {
					const row = buildSkippedVmafRow(
						candidate,
						"vmaf_failed",
						dimensions.width,
						dimensions.height,
					);
					resultRows.push(row);
					appendProbeVmafRow(jobId, row);
					continue;
				}

				const vmafFrameAnalytics = await resolveVmafRowFrameAnalytics({
					jobId: jobId,
					shopDomain: shopDomain,
					candidate: candidate,
					referenceLabel: reference.label,
					referenceFilePath: referenceDownload.filePath,
					distortedFilePath: candidateDownload.filePath,
					deliveryVmafResult: deliveryVmafResult,
					displayVmafResult: displayVmafResult,
					includeFrameAnalytics: includeFrameAnalytics,
					includeScreenshots: includeScreenshots,
					r2Config: r2Config,
					shouldAbort: shouldAbort,
					config: deps.config,
				});

				const row = buildVmafCandidateRow({
					candidate: candidate,
					deliveryWidth: dimensions.width,
					deliveryHeight: dimensions.height,
					vmafAtDelivery: vmafAtDelivery,
					vmafAtDisplay1080p: vmafAtDisplay1080p,
					deliveryVmafResult: deliveryVmafResult,
					displayVmafResult: displayVmafResult,
					includeFrameAnalytics: includeFrameAnalytics,
					vmafFrameAnalytics: vmafFrameAnalytics,
				});
				resultRows.push(row);
				appendProbeVmafRow(jobId, row);
			} finally {
				await candidateDownload.cleanup();
			}
		}

		const vmafReport = buildPartialVmafReport(
			jobId,
			entry.request.caller.videoId,
			reference.label,
			vmafModel,
			startedAtMs,
			resultRows,
		);
		setProbeComputeVmafReport(jobId, vmafReport);
		return vmafReport;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : "VMAF phase failed";
		if (
			shouldAbort() &&
			finalizeVmafJobIfCancelled(
				jobId,
				entry.request.caller.videoId,
				reference.label,
				vmafModel,
				startedAtMs,
				resultRows,
				nowMs(),
			)
		) {
			return null;
		}
		throw new Error(message);
	} finally {
		abortContext.dispose();
		if (referenceCleanup) {
			await referenceCleanup();
		}
	}
}
