/**
 * 模块名称：Mock Job 执行器
 * 模块说明：@legacy R2 纯 mock 路径；生产调度已改用 probeComputeJobExecutor。
 */

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
import type { IProbeComputeCompareResult } from "../types/devVideoCompare.types.js";
import type { IDevVideoCompressCompareVmafReport } from "../types/devVideoVmaf.types.js";
import type { IProbeComputeJobMutableEntry } from "./probeComputeJobStore.types.js";
import { buildStubVmafReport } from "./probeComputeJobVmafMock.helpers.js";
import {
	finalizeProbeComputeJobCancelled,
	finalizeProbeComputeJobReady,
	getProbeComputeJobMutableEntry,
	markProbeComputeJobRunning,
	setProbeComputeJobPhase,
} from "./probeComputeJobStore.memory.js";

export interface IProbeComputeJobMockExecutorDeps {
	config: IProbeWorkerEffectiveConfig;
	nowMs: () => number;
	onJobFinished: () => void;
	delayMs?: number;
}

function buildStubCompareResult(entry: IProbeComputeJobMutableEntry): IProbeComputeCompareResult {
	const compare = entry.request.compare;
	const probedAtIso = new Date().toISOString();

	return {
		productName: compare?.productName ?? "Mock Product",
		videoId: entry.request.caller.videoId,
		linkedCompressTaskId: compare?.linkedCompressTaskId,
		probedAtIso,
		renditions: (compare?.renditions ?? []).map(function mapRendition(rendition) {
			return {
				group: rendition.group,
				label: rendition.label,
				url: rendition.url,
				width: 1280,
				height: 720,
				frameRateFps: 30,
				bitrateKbps: 2000,
				codec: "h264",
				format: "mp4",
				container: "mp4",
				durationSeconds: 10,
				sizeBytes: 1_000_000,
			};
		}),
	};
}

function jobNeedsComparePhase(entry: IProbeComputeJobMutableEntry): boolean {
	return entry.request.jobKind === "compare" || entry.request.jobKind === "unified";
}

function jobNeedsVmafPhase(entry: IProbeComputeJobMutableEntry): boolean {
	return entry.request.jobKind === "vmaf" || entry.request.jobKind === "unified";
}

/**
 * @legacy 纯 mock 执行；测试或回退用。
 */
export async function runProbeComputeJobMockExecutor(
	jobId: string,
	deps: IProbeComputeJobMockExecutorDeps,
): Promise<void> {
	const delayMs = deps.delayMs ?? 5;
	const entry = getProbeComputeJobMutableEntry(jobId);
	if (!entry || entry.status !== "pending") {
		return;
	}

	const initialPhase = jobNeedsComparePhase(entry) ? "compare" : "vmaf";
	const started = markProbeComputeJobRunning(jobId, initialPhase, deps.nowMs());
	if (!started) {
		return;
	}

	await new Promise(function wait(resolve): void {
		setTimeout(resolve, delayMs);
	});

	const current = getProbeComputeJobMutableEntry(jobId);
	if (!current) {
		deps.onJobFinished();
		return;
	}

	if (current.cancelRequested) {
		finalizeProbeComputeJobCancelled(jobId, deps.nowMs());
		deps.onJobFinished();
		return;
	}

	let compareResult: IProbeComputeCompareResult | null = null;
	let vmafReport: IDevVideoCompressCompareVmafReport | null = null;
	const startedAtMs = current.startedAtMs ?? deps.nowMs();

	if (jobNeedsComparePhase(current)) {
		compareResult = buildStubCompareResult(current);
	}

	if (jobNeedsVmafPhase(current)) {
		if (current.request.jobKind === "unified") {
			setProbeComputeJobPhase(jobId, "vmaf");
		}
		const delayMs = deps.delayMs ?? 5;
		await new Promise(function wait(resolve): void {
			setTimeout(resolve, delayMs);
		});
		vmafReport = buildStubVmafReport(current, startedAtMs, deps.nowMs());
	}

	const afterVmaf = getProbeComputeJobMutableEntry(jobId);
	if (!afterVmaf || afterVmaf.cancelRequested) {
		finalizeProbeComputeJobCancelled(jobId, deps.nowMs());
		deps.onJobFinished();
		return;
	}

	finalizeProbeComputeJobReady(
		jobId,
		{
			compareResult,
			vmafReport,
		},
		deps.nowMs(),
	);

	deps.onJobFinished();
}
