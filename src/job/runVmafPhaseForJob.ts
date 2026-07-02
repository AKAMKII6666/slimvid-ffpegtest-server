/**
 * 模块名称：VMAF 阶段执行器
 * 模块说明：reference 下载 → candidates 并行 libvmaf；单 candidate skip 不 fail job。
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
import {
	resolveVmafCandidateParallelism,
	resolveVmafJobExecutionMode,
} from "../domain/vmaf/resolveVmafJobExecutionMode.js";
import { createVmafAbortContext } from "../domain/vmaf/vmafAbortContext.helpers.js";
import type {
	IDevVideoCompressCompareVmafReport,
	IDevVideoCompressCompareVmafRow,
	IDevVideoVmafFrameAnalytics,
	TDevVideoCompressCompareVmafSkipReason,
} from "../types/devVideoVmaf.types.js";
import {
	appendProbeVmafRow,
	finalizeProbeComputeJobCancelled,
	getProbeComputeJobMutableEntry,
	setProbeComputeVmafReport,
} from "./probeComputeJobStore.memory.js";
import { mapWithConcurrency } from "./mapWithConcurrency.js";
import { createModuleLogger } from "../logging/createModuleLogger.js";
import { resolveProbeUrlHostForLog } from "../logging/resolveProbeUrlHostForLog.helpers.js";

const log = createModuleLogger({ module: "job.vmaf" });

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
		vmafMean: null,
		vmafHarmonicMean: null,
		skipped: true,
		skipReason: skipReason,
	};
}

function buildVmafCandidateRow(params: {
	candidate: IVmafCandidateDraft;
	deliveryWidth: number;
	deliveryHeight: number;
	vmafMean: number | null;
	vmafHarmonicMean: number | null;
	vmafResult: IRunVmafPairWithFfmpegResult;
	includeFrameAnalytics: boolean;
	vmafFrameAnalytics?: IDevVideoVmafFrameAnalytics | null;
}): IDevVideoCompressCompareVmafRow {
	const row: IDevVideoCompressCompareVmafRow = {
		candidateLabel: params.candidate.label,
		candidateGroup: params.candidate.group,
		candidateUrl: params.candidate.url,
		deliveryWidth: params.deliveryWidth,
		deliveryHeight: params.deliveryHeight,
		vmafMean: params.vmafMean,
		vmafHarmonicMean: params.vmafHarmonicMean,
		skipped: false,
	};

	if (params.vmafFrameAnalytics) {
		row.vmafFrameAnalytics = params.vmafFrameAnalytics;
	} else if (params.includeFrameAnalytics) {
		const frameAnalytics = buildVmafRowFrameAnalytics(params.vmafResult);
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
	vmafResult: IRunVmafPairWithFfmpegResult;
	includeFrameAnalytics: boolean;
	includeScreenshots: boolean;
	r2Config: IProbeWorkerR2Config | null;
	shouldAbort: () => boolean;
	config: IProbeWorkerEffectiveConfig;
}): Promise<IDevVideoVmafFrameAnalytics | undefined> {
	if (!params.includeFrameAnalytics) {
		return undefined;
	}

	if (!params.includeScreenshots) {
		return buildVmafRowFrameAnalytics(params.vmafResult);
	}

	let frameAnalytics = params.vmafResult.frameAnalytics;
	if (!frameAnalytics) {
		return undefined;
	}

	frameAnalytics = await enrichVmafFrameAnalyticsWithProbeScreenshots({
		r2Config: params.r2Config,
		shopDomain: params.shopDomain,
		jobId: params.jobId,
		vmafMode: "referenceResolution",
		candidateLabel: params.candidate.label,
		referenceLabel: params.referenceLabel,
		referenceFilePath: params.referenceFilePath,
		distortedFilePath: params.distortedFilePath,
		frameAnalytics: frameAnalytics,
		shouldAbort: params.shouldAbort,
		ffmpegPath: params.config.ffmpeg.ffmpegPath,
		keySegment: params.config.screenshots.keySegment,
		maxSegmentsPerMode: params.config.screenshots.maxSegmentsPerMode,
	});

	return frameAnalytics ?? undefined;
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
	jobId: string,
	url: string,
	probeFn: IRunVmafPhaseDeps["probeVideoUrlMetadataFn"],
	config: IProbeWorkerEffectiveConfig,
	context: string,
): Promise<IProbedVideoUrlMetadata | null> {
	const fn = probeFn ?? probeVideoUrlMetadata;
	try {
		return await fn(url, {
			ffprobePath: config.ffmpeg.ffprobePath,
			ffprobeTimeoutMs: config.probe.ffprobeTimeoutMs,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		log.warn(
			{
				jobId: jobId,
				phase: "vmaf_ffprobe_soft",
				context: context,
				urlHost: resolveProbeUrlHostForLog(url),
				err: message,
			},
			"vmaf soft ffprobe failed",
		);
		return null;
	}
}

function logVmafCandidateSkipped(
	jobId: string,
	candidate: IVmafCandidateDraft,
	candidateIndex: number,
	skipReason: TDevVideoCompressCompareVmafSkipReason,
	extra?: Record<string, unknown>,
): void {
	log.warn(
		{
			jobId: jobId,
			phase: "vmaf_candidate_skipped",
			candidateIndex: candidateIndex,
			candidateLabel: candidate.label,
			candidateGroup: candidate.group,
			urlHost: resolveProbeUrlHostForLog(candidate.url),
			skipReason: skipReason,
			...extra,
		},
		"vmaf candidate skipped",
	);
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
		const candidateParallelism = resolveVmafCandidateParallelism(
			deps.config,
			vmafExecutionMode,
		);

		log.info(
			{
				jobId: jobId,
				phase: "vmaf_libvmaf_probe",
				libvmafAvailable: runtimeCapabilities.libvmafAvailable,
				libvmafCudaAvailable: runtimeCapabilities.libvmafCudaAvailable,
				vmafExecutionMode: vmafExecutionMode,
				candidateParallelism: candidateParallelism,
				configuredMaxVmafCandidatesParallel:
					deps.config.concurrency.maxVmafCandidatesParallel,
				candidateCount: candidates.length,
				includeFrameAnalytics: includeFrameAnalytics,
				includeScreenshots: includeScreenshots,
				r2Configured: r2Config !== null,
			},
			"vmaf libvmaf probe",
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
			jobId,
			reference.url,
			deps.probeVideoUrlMetadataFn,
			deps.config,
			"reference",
		);
		const referenceDurationSeconds =
			referenceProbed && referenceProbed.durationSeconds > 0
				? referenceProbed.durationSeconds
				: 0;
		const referenceFrameRateFps =
			referenceProbed && referenceProbed.frameRateFps > 0 ? referenceProbed.frameRateFps : 0;
		const referenceWidth =
			referenceProbed && referenceProbed.width > 0 ? referenceProbed.width : 0;
		const referenceHeight =
			referenceProbed && referenceProbed.height > 0 ? referenceProbed.height : 0;

		if (referenceDurationSeconds <= 0) {
			log.warn(
				{
					jobId: jobId,
					phase: "vmaf_reference_probe",
					urlHost: resolveProbeUrlHostForLog(reference.url),
					referenceProbed: referenceProbed !== null,
				},
				"vmaf reference duration unavailable",
			);
			throw new Error("Original source duration is not available");
		}

		log.info(
			{
				jobId: jobId,
				phase: "vmaf_reference_probed",
				urlHost: resolveProbeUrlHostForLog(reference.url),
				referenceDurationSeconds: referenceDurationSeconds,
				referenceFrameRateFps: referenceFrameRateFps,
				referenceWidth: referenceWidth,
				referenceHeight: referenceHeight,
			},
			"vmaf reference probed",
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

		log.info(
			{
				jobId: jobId,
				phase: "vmaf_reference_download",
				step: "start",
				urlHost: resolveProbeUrlHostForLog(reference.url),
			},
			"vmaf reference download start",
		);

		const referenceDownload = await downloadFn(reference.url, {
			signal: abortContext.downloadSignal,
			timeoutMs: deps.config.probe.downloadTimeoutMs,
		});
		if (!referenceDownload.ok) {
			log.warn(
				{
					jobId: jobId,
					phase: "vmaf_reference_download",
					step: "failed",
					urlHost: resolveProbeUrlHostForLog(reference.url),
					err: referenceDownload.error,
				},
				"vmaf reference download failed",
			);
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

		log.info(
			{
				jobId: jobId,
				phase: "vmaf_reference_download",
				step: "done",
				urlHost: resolveProbeUrlHostForLog(reference.url),
				fileSizeBytes: referenceDownload.fileSize,
			},
			"vmaf reference download done",
		);

		let vmafPhaseCancelled = false;

		const candidateRows = await mapWithConcurrency(
			candidates,
			candidateParallelism,
			async function processVmafCandidate(
				candidate,
				candidateIndex,
			): Promise<IDevVideoCompressCompareVmafRow> {
				if (
					vmafPhaseCancelled ||
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
					vmafPhaseCancelled = true;
					return buildSkippedVmafRow(candidate, "vmaf_failed", 0, 0);
				}

				log.info(
					{
						jobId: jobId,
						phase: "vmaf_candidate_start",
						candidateIndex: candidateIndex,
						candidateLabel: candidate.label,
						candidateGroup: candidate.group,
						urlHost: resolveProbeUrlHostForLog(candidate.url),
					},
					"vmaf candidate start",
				);

				if (isVmafCandidateSkippableAsHls(candidate)) {
					const row = buildSkippedVmafRow(candidate, "hls", candidate.width, candidate.height);
					appendProbeVmafRow(jobId, row);
					logVmafCandidateSkipped(jobId, candidate, candidateIndex, "hls");
					return row;
				}

				const candidateProbed = await probeVideoUrlMetadataSoft(
					jobId,
					candidate.url,
					deps.probeVideoUrlMetadataFn,
					deps.config,
					"candidate",
				);
				if (!candidateProbed) {
					const row = buildSkippedVmafRow(candidate, "ffprobe_incomplete", 0, 0);
					appendProbeVmafRow(jobId, row);
					logVmafCandidateSkipped(jobId, candidate, candidateIndex, "ffprobe_incomplete");
					return row;
				}

				const dimensions = resolveVmafCandidateDeliveryDimensions(candidate, candidateProbed);
				if (dimensions.width <= 0 || dimensions.height <= 0) {
					const row = buildSkippedVmafRow(
						candidate,
						"ffprobe_incomplete",
						dimensions.width,
						dimensions.height,
					);
					appendProbeVmafRow(jobId, row);
					logVmafCandidateSkipped(jobId, candidate, candidateIndex, "ffprobe_incomplete", {
						deliveryWidth: dimensions.width,
						deliveryHeight: dimensions.height,
					});
					return row;
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
					appendProbeVmafRow(jobId, row);
					logVmafCandidateSkipped(jobId, candidate, candidateIndex, "ffprobe_incomplete", {
						reason: "duration_missing",
					});
					return row;
				}

				const durationDelta = Math.abs(referenceDurationSeconds - candidateDurationSeconds);
				if (durationDelta > durationMismatchThreshold) {
					const row = buildSkippedVmafRow(
						candidate,
						"duration_mismatch",
						dimensions.width,
						dimensions.height,
					);
					appendProbeVmafRow(jobId, row);
					logVmafCandidateSkipped(jobId, candidate, candidateIndex, "duration_mismatch", {
						referenceDurationSeconds: referenceDurationSeconds,
						candidateDurationSeconds: candidateDurationSeconds,
						durationDelta: durationDelta,
						thresholdSeconds: durationMismatchThreshold,
					});
					return row;
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
					vmafPhaseCancelled = true;
					return buildSkippedVmafRow(candidate, "vmaf_failed", dimensions.width, dimensions.height);
				}

				const candidateDownload = await downloadFn(candidate.url, {
					signal: abortContext.downloadSignal,
					timeoutMs: deps.config.probe.downloadTimeoutMs,
				});
				if (!candidateDownload.ok) {
					log.warn(
						{
							jobId: jobId,
							phase: "vmaf_candidate_download",
							step: "failed",
							candidateIndex: candidateIndex,
							candidateLabel: candidate.label,
							urlHost: resolveProbeUrlHostForLog(candidate.url),
							err: candidateDownload.error,
						},
						"vmaf candidate download failed",
					);
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
						vmafPhaseCancelled = true;
						return buildSkippedVmafRow(candidate, "vmaf_failed", dimensions.width, dimensions.height);
					}
					const row = buildSkippedVmafRow(
						candidate,
						"download_failed",
						dimensions.width,
						dimensions.height,
					);
					appendProbeVmafRow(jobId, row);
					logVmafCandidateSkipped(jobId, candidate, candidateIndex, "download_failed", {
						err: candidateDownload.error,
					});
					return row;
				}

				log.info(
					{
						jobId: jobId,
						phase: "vmaf_candidate_download",
						step: "done",
						candidateIndex: candidateIndex,
						candidateLabel: candidate.label,
						fileSizeBytes: candidateDownload.fileSize,
					},
					"vmaf candidate download done",
				);

				try {
					const frameRateFpsForAnalytics =
						includeFrameAnalytics && referenceFrameRateFps > 0
							? referenceFrameRateFps
							: undefined;

					if (referenceWidth <= 0 || referenceHeight <= 0) {
						const row = buildSkippedVmafRow(
							candidate,
							"ffprobe_incomplete",
							dimensions.width,
							dimensions.height,
						);
						appendProbeVmafRow(jobId, row);
						logVmafCandidateSkipped(jobId, candidate, candidateIndex, "ffprobe_incomplete", {
							reason: "reference_dimensions_missing",
							referenceWidth: referenceWidth,
							referenceHeight: referenceHeight,
						});
						return row;
					}

					const vmafResult = await runVmafFn(
						{
							distortedFilePath: candidateDownload.filePath,
							referenceFilePath: referenceDownload.filePath,
							referenceWidth: referenceWidth,
							referenceHeight: referenceHeight,
							maxDurationSeconds: maxDurationSeconds,
							frameRateFps: frameRateFpsForAnalytics,
							jobId: jobId,
							shouldAbort: shouldAbort,
							ffmpegPath: deps.config.ffmpeg.ffmpegPath,
							ffmpegTimeoutMs: deps.config.vmaf.ffmpegTimeoutMs,
							vmafModel: vmafModel,
							vmafExecutionMode: vmafExecutionMode,
						},
						deps.config,
					);
					const vmafMean = vmafResult.mean;
					const vmafHarmonicMean = vmafResult.harmonicMean;

					if (shouldAbort()) {
						if (vmafMean !== null || vmafHarmonicMean !== null) {
							const partialRow = buildVmafCandidateRow({
								candidate: candidate,
								deliveryWidth: dimensions.width,
								deliveryHeight: dimensions.height,
								vmafMean: vmafMean,
								vmafHarmonicMean: vmafHarmonicMean,
								vmafResult: vmafResult,
								includeFrameAnalytics: includeFrameAnalytics,
							});
							appendProbeVmafRow(jobId, partialRow);
							return partialRow;
						}
						vmafPhaseCancelled = true;
						finalizeVmafJobIfCancelled(
							jobId,
							entry.request.caller.videoId,
							reference.label,
							vmafModel,
							startedAtMs,
							resultRows,
							nowMs(),
						);
						return buildSkippedVmafRow(candidate, "vmaf_failed", dimensions.width, dimensions.height);
					}

					if (vmafMean === null && vmafHarmonicMean === null) {
						const row = buildSkippedVmafRow(
							candidate,
							"vmaf_failed",
							dimensions.width,
							dimensions.height,
						);
						appendProbeVmafRow(jobId, row);
						logVmafCandidateSkipped(jobId, candidate, candidateIndex, "vmaf_failed", {
							failureReason: vmafResult.failureReason,
							ffmpegExitCode: vmafResult.ffmpegExitCode,
							ffmpegStderrExcerpt: vmafResult.ffmpegStderrExcerpt,
						});
						return row;
					}

					const vmafFrameAnalytics = await resolveVmafRowFrameAnalytics({
						jobId: jobId,
						shopDomain: shopDomain,
						candidate: candidate,
						referenceLabel: reference.label,
						referenceFilePath: referenceDownload.filePath,
						distortedFilePath: candidateDownload.filePath,
						vmafResult: vmafResult,
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
						vmafMean: vmafMean,
						vmafHarmonicMean: vmafHarmonicMean,
						vmafResult: vmafResult,
						includeFrameAnalytics: includeFrameAnalytics,
						vmafFrameAnalytics: vmafFrameAnalytics,
					});
					appendProbeVmafRow(jobId, row);

					log.info(
						{
							jobId: jobId,
							phase: "vmaf_candidate_done",
							candidateIndex: candidateIndex,
							candidateLabel: candidate.label,
							vmafMean: vmafMean,
							vmafHarmonicMean: vmafHarmonicMean,
						},
						"vmaf candidate done",
					);
					return row;
				} finally {
					await candidateDownload.cleanup();
				}
			},
		);

		if (vmafPhaseCancelled) {
			return null;
		}

		for (let rowIndex = 0; rowIndex < candidateRows.length; rowIndex += 1) {
			const row = candidateRows[rowIndex];
			if (row) {
				resultRows.push(row);
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
		log.warn(
			{
				jobId: jobId,
				phase: "vmaf_phase_error",
				err: message,
			},
			"vmaf phase error",
		);
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
