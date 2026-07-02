/**
 * 模块名称：Job 执行编排
 * 模块说明：compare 真实 ffprobe + vmaf libvmaf 阶段。
 */

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
import type { IProbeComputeCompareResult } from "../types/devVideoCompare.types.js";
import type { IDevVideoCompressCompareVmafReport } from "../types/devVideoVmaf.types.js";
import type { IProbeComputeJobMutableEntry } from "./probeComputeJobStore.types.js";
import {
	finalizeProbeComputeJobCancelled,
	finalizeProbeComputeJobReady,
	getProbeComputeJobMutableEntry,
	markProbeComputeJobFailed,
	markProbeComputeJobRunning,
	setProbeComputeJobPhase,
} from "./probeComputeJobStore.memory.js";
import { runComparePhaseForJob, type IRunComparePhaseDeps } from "./runComparePhaseForJob.js";
import { runVmafPhaseForJob, type IRunVmafPhaseDeps } from "./runVmafPhaseForJob.js";

export interface IProbeComputeJobExecutorDeps {
	config: IProbeWorkerEffectiveConfig;
	nowMs: () => number;
	onJobFinished: () => void;
	compareDeps?: IRunComparePhaseDeps;
	vmafDeps?: IRunVmafPhaseDeps;
}

function jobNeedsComparePhase(entry: IProbeComputeJobMutableEntry): boolean {
	return entry.request.jobKind === "compare" || entry.request.jobKind === "unified";
}

function jobNeedsVmafPhase(entry: IProbeComputeJobMutableEntry): boolean {
	return entry.request.jobKind === "vmaf" || entry.request.jobKind === "unified";
}

/**
 * 异步执行 job：compare + vmaf 阶段。
 */
export async function runProbeComputeJobExecutor(
	jobId: string,
	deps: IProbeComputeJobExecutorDeps,
): Promise<void> {
	const entry = getProbeComputeJobMutableEntry(jobId);
	if (!entry || entry.status !== "pending") {
		return;
	}

	const initialPhase = jobNeedsComparePhase(entry) ? "compare" : "vmaf";
	const started = markProbeComputeJobRunning(jobId, initialPhase, deps.nowMs());
	if (!started) {
		return;
	}

	const startedAtMs = deps.nowMs();
	let compareResult: IProbeComputeCompareResult | null = null;

	try {
		if (jobNeedsComparePhase(entry)) {
			compareResult = await runComparePhaseForJob(jobId, {
				config: deps.config,
				...(deps.compareDeps ?? {}),
			});
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : "Compare phase failed";
		markProbeComputeJobFailed(jobId, message, deps.nowMs());
		deps.onJobFinished();
		return;
	}

	const afterCompare = getProbeComputeJobMutableEntry(jobId);
	if (!afterCompare || afterCompare.cancelRequested || afterCompare.status === "cancelled") {
		finalizeProbeComputeJobCancelled(jobId, deps.nowMs(), { compareResult });
		deps.onJobFinished();
		return;
	}

	let vmafReport: IDevVideoCompressCompareVmafReport | null = null;

	if (jobNeedsVmafPhase(afterCompare)) {
		if (afterCompare.request.jobKind === "unified") {
			setProbeComputeJobPhase(jobId, "vmaf");
		}

		try {
			vmafReport = await runVmafPhaseForJob(
				jobId,
				startedAtMs,
				{
					config: deps.config,
					...(deps.vmafDeps ?? {}),
				},
				deps.nowMs,
			);
		} catch (error: unknown) {
			const current = getProbeComputeJobMutableEntry(jobId);
			if (current?.status === "failed") {
				deps.onJobFinished();
				return;
			}
			const message = error instanceof Error ? error.message : "VMAF phase failed";
			markProbeComputeJobFailed(jobId, message, deps.nowMs());
			deps.onJobFinished();
			return;
		}
	}

	const afterVmaf = getProbeComputeJobMutableEntry(jobId);
	if (!afterVmaf || afterVmaf.cancelRequested || afterVmaf.status === "cancelled") {
		if (afterVmaf?.status !== "cancelled") {
			finalizeProbeComputeJobCancelled(jobId, deps.nowMs(), {
				compareResult,
				vmafReport,
			});
		}
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
