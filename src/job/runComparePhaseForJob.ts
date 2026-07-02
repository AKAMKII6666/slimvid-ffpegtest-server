/**
 * 模块名称：Compare 阶段执行器
 * 模块说明：并行 ffprobe 各 rendition；任一失败则抛错（整 job failed）。
 */

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
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

export interface IRunComparePhaseDeps {
	config: IProbeWorkerEffectiveConfig;
	probeVideoUrlMetadataFn?: (
		url: string,
		options?: IProbeVideoUrlMetadataOptions,
	) => ReturnType<typeof probeVideoUrlMetadata>;
}

async function mapWithConcurrency<TItem, TResult>(
	items: TItem[],
	concurrency: number,
	mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
	const results: TResult[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= items.length) {
				return;
			}
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	}

	const workerCount = Math.max(1, Math.min(concurrency, items.length));
	const workers: Array<Promise<void>> = [];
	for (let index = 0; index < workerCount; index += 1) {
		workers.push(worker());
	}
	await Promise.all(workers);
	return results;
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
		async function probeRendition(rendition): Promise<IDevVideoCompressCompareRendition> {
			if (entry.cancelRequested) {
				throw new Error("Compare phase cancelled");
			}

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
			return probed;
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
