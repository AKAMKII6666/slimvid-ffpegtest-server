/**
 * 模块名称：Compare 阶段执行器
 * 模块说明：并行 ffprobe 各 rendition；任一失败则抛错（整 job failed）。
 */

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
import { createModuleLogger } from "../logging/createModuleLogger.js";
import { resolveProbeUrlHostForLog } from "../logging/resolveProbeUrlHostForLog.helpers.js";
import {
	probeVideoUrlMetadata,
	type IProbeVideoUrlMetadataOptions,
} from "../domain/probe/probeVideoUrlMetadata.js";
import type { IProbeComputeCompareResult } from "../types/devVideoCompare.types.js";
import type { IDevVideoCompressCompareRendition } from "../types/devVideoCompare.types.js";
import {
	appendProbeCompareRendition,
	getProbeComputeJobMutableEntry,
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

	const renditions = await mapWithConcurrency(
		compare.renditions,
		parallelism,
		async function probeRendition(rendition, renditionIndex): Promise<IDevVideoCompressCompareRendition> {
			if (entry.cancelRequested) {
				throw new Error("Compare phase cancelled");
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
						durationSeconds: probed.durationSeconds,
						sizeBytes: probed.sizeBytes,
					},
					"compare probe rendition done",
				);

				return probed;
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				log.warn(
					{
						jobId: jobId,
						phase: "compare_probe_rendition",
						step: "failed",
						renditionIndex: renditionIndex,
						renditionLabel: rendition.label,
						renditionGroup: rendition.group,
						urlHost: resolveProbeUrlHostForLog(rendition.url),
						err: message,
					},
					"compare probe rendition failed",
				);
				throw new Error('Failed to probe rendition "' + rendition.label + '": ' + message);
			}
		},
	);

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
