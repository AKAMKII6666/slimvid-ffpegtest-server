/**
 * 模块名称：Compare 阶段执行器
 * 模块说明：并行 ffprobe 各 rendition；HLS 跳过；失败档位重试后 skip；缺 SlimVID 则整 job failed。
 */

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
import { isSkippableHlsProbeTarget } from "../domain/probe/isSkippableHlsProbeTarget.js";
import {
	probeVideoUrlMetadata,
	type IProbeVideoUrlMetadataOptions,
} from "../domain/probe/probeVideoUrlMetadata.js";
import { createModuleLogger } from "../logging/createModuleLogger.js";
import { resolveProbeUrlHostForLog } from "../logging/resolveProbeUrlHostForLog.helpers.js";
import { truncateLogText } from "../logging/truncateLogText.helpers.js";
import type { IProbeComputeCompareResult } from "../types/devVideoCompare.types.js";
import type { IDevVideoCompressCompareRendition } from "../types/devVideoCompare.types.js";
import type { IProbeComputeCompareSpecInput } from "../types/probeComputeJob.types.js";
import {
	COMPARE_PROBE_RENDITION_MAX_ATTEMPTS,
	COMPARE_PROBE_RENDITION_RETRY_DELAY_MS,
} from "./compareProbeRendition.constants.js";
import {
	appendProbeCompareRendition,
	getProbeComputeJobMutableEntry,
	incrementProbeCompareCompletedRenditions,
	setProbeComputeCompareResult,
} from "./probeComputeJobStore.memory.js";
import { mapWithConcurrency } from "./mapWithConcurrency.js";

const log = createModuleLogger({ module: "job.compare" });

export interface IRunComparePhaseDeps {
	config: IProbeWorkerEffectiveConfig;
	probeVideoUrlMetadataFn?: (
		url: string,
		options?: IProbeVideoUrlMetadataOptions,
	) => ReturnType<typeof probeVideoUrlMetadata>;
}

function sleepMs(durationMs: number): Promise<void> {
	return new Promise(function wait(resolve): void {
		setTimeout(resolve, durationMs);
	});
}

function compareSpecIncludesSlimvidRendition(
	renditions: IProbeComputeCompareSpecInput["renditions"],
): boolean {
	for (let index = 0; index < renditions.length; index++) {
		if (renditions[index].group === "slimvid") {
			return true;
		}
	}
	return false;
}

function assertComparePhaseProducedRequiredRenditions(
	probedRenditions: IDevVideoCompressCompareRendition[],
	specRenditions: IProbeComputeCompareSpecInput["renditions"],
): void {
	if (probedRenditions.length === 0) {
		throw new Error("Compare phase probed zero renditions");
	}
	if (!compareSpecIncludesSlimvidRendition(specRenditions)) {
		return;
	}
	for (let index = 0; index < probedRenditions.length; index++) {
		if (probedRenditions[index].group === "slimvid") {
			return;
		}
	}
	throw new Error("Compare phase missing required SlimVID (mapped) rendition");
}

function logCompareRenditionSkipped(
	jobId: string,
	rendition: IProbeComputeCompareSpecInput["renditions"][number],
	renditionIndex: number,
	skipReason: string,
	err?: string,
): void {
	log.info(
		{
			jobId: jobId,
			phase: "compare_probe_rendition_skipped",
			skipReason: skipReason,
			renditionIndex: renditionIndex,
			renditionLabel: rendition.label,
			renditionGroup: rendition.group,
			urlHost: resolveProbeUrlHostForLog(rendition.url),
			...(err ? { err: truncateLogText(err) } : {}),
		},
		"compare probe rendition skipped (" + skipReason + ")",
	);
}

/**
 * 执行 compare ffprobe 阶段并写入 store 进度。
 */
export async function runComparePhaseForJob(
	jobId: string,
	deps: IRunComparePhaseDeps,
): Promise<IProbeComputeCompareResult> {
	const entry = getProbeComputeJobMutableEntry(jobId);
	if (!entry || !entry.request.compare) {
		throw new Error("Compare spec is missing for job");
	}

	const compare = entry.request.compare;
	const probeFn = deps.probeVideoUrlMetadataFn ?? probeVideoUrlMetadata;
	const ffprobePath = deps.config.ffmpeg.ffprobePath;
	const ffprobeTimeoutMs = deps.config.probe.ffprobeTimeoutMs;
	const parallelism = deps.config.concurrency.maxFfprobeParallel;

	const probeResults = await mapWithConcurrency(
		compare.renditions,
		parallelism,
		async function probeRendition(
			rendition,
			renditionIndex,
		): Promise<IDevVideoCompressCompareRendition | null> {
			if (entry.cancelRequested) {
				throw new Error("Compare phase cancelled");
			}

			if (isSkippableHlsProbeTarget({ url: rendition.url, label: rendition.label })) {
				incrementProbeCompareCompletedRenditions(jobId);
				logCompareRenditionSkipped(jobId, rendition, renditionIndex, "hls");
				return null;
			}

			log.info(
				{
					jobId: jobId,
					phase: "compare_probe_rendition",
					step: "start",
					renditionIndex: renditionIndex,
					renditionLabel: rendition.label,
					renditionGroup: rendition.group,
					urlHost: resolveProbeUrlHostForLog(rendition.url),
				},
				"compare probe rendition start",
			);

			let lastErrorMessage = "unknown probe error";

			for (let attempt = 1; attempt <= COMPARE_PROBE_RENDITION_MAX_ATTEMPTS; attempt++) {
				if (entry.cancelRequested) {
					throw new Error("Compare phase cancelled");
				}

				try {
					const metadata = await probeFn(rendition.url, {
						ffprobePath,
						ffprobeTimeoutMs,
					});

					const probed: IDevVideoCompressCompareRendition = {
						group: rendition.group,
						label: rendition.label,
						url: rendition.url,
						width: metadata.width,
						height: metadata.height,
						frameRateFps: metadata.frameRateFps,
						bitrateKbps: metadata.bitrateKbps,
						codec: metadata.codec,
						format: metadata.format,
						container: metadata.container,
						durationSeconds: metadata.durationSeconds,
						sizeBytes: metadata.sizeBytes,
					};

					appendProbeCompareRendition(jobId, probed);

					log.info(
						{
							jobId: jobId,
							phase: "compare_probe_rendition",
							step: "done",
							renditionIndex: renditionIndex,
							renditionLabel: rendition.label,
							renditionGroup: rendition.group,
							urlHost: resolveProbeUrlHostForLog(rendition.url),
							probeAttempt: attempt,
							durationSeconds: probed.durationSeconds,
							sizeBytes: probed.sizeBytes,
						},
						"compare probe rendition done",
					);

					return probed;
				} catch (err: unknown) {
					lastErrorMessage = err instanceof Error ? err.message : String(err);
					const willRetry = attempt < COMPARE_PROBE_RENDITION_MAX_ATTEMPTS;
					log.warn(
						{
							jobId: jobId,
							phase: "compare_probe_rendition",
							step: willRetry ? "retry" : "failed",
							renditionIndex: renditionIndex,
							renditionLabel: rendition.label,
							renditionGroup: rendition.group,
							urlHost: resolveProbeUrlHostForLog(rendition.url),
							probeAttempt: attempt,
							maxAttempts: COMPARE_PROBE_RENDITION_MAX_ATTEMPTS,
							err: truncateLogText(lastErrorMessage),
						},
						willRetry
							? "compare probe rendition failed; retrying"
							: "compare probe rendition failed; skipping",
					);

					if (willRetry) {
						await sleepMs(COMPARE_PROBE_RENDITION_RETRY_DELAY_MS);
					}
				}
			}

			incrementProbeCompareCompletedRenditions(jobId);
			logCompareRenditionSkipped(
				jobId,
				rendition,
				renditionIndex,
				"ffprobe_failed",
				lastErrorMessage,
			);
			return null;
		},
	);

	const renditions = probeResults.filter(function keepProbed(
		row,
	): row is IDevVideoCompressCompareRendition {
		return row !== null;
	});

	assertComparePhaseProducedRequiredRenditions(renditions, compare.renditions);

	const compareResult: IProbeComputeCompareResult = {
		productName: compare.productName,
		videoId: entry.request.caller.videoId,
		linkedCompressTaskId: compare.linkedCompressTaskId,
		probedAtIso: new Date().toISOString(),
		renditions,
	};

	setProbeComputeCompareResult(jobId, compareResult);
	return compareResult;
}
