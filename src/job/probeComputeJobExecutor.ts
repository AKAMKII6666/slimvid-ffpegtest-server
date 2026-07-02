/**
 * 模块名称：Job 执行编排
 * 模块说明：compare 真实 ffprobe + vmaf libvmaf 阶段。
 */

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
import { createModuleLogger } from "../logging/createModuleLogger.js";
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

const log = createModuleLogger({ module: "job.executor" });

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

function logJobContext(entry: IProbeComputeJobMutableEntry, jobId: string): Record<string, unknown> {
	return {
		jobId: jobId,
		jobKind: entry.request.jobKind,
		shopDomain: entry.request.caller.shopDomain,
		videoId: entry.request.caller.videoId,
		productId: entry.request.caller.productId,
		clientJobId: entry.request.clientJobId,
		batchId: entry.request.caller.batchId,
	};
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

	log.info(
		{
			...logJobContext(entry, jobId),
			phase: "worker_start",
			initialPhase: initialPhase,
		},
		"probe job worker start",
	);

	try {
		if (jobNeedsComparePhase(entry)) {
			log.info(
				{
					...logJobContext(entry, jobId),
					phase: "compare_start",
					renditionCount: entry.request.compare?.renditions.length ?? 0,
				},
				"compare phase start",
			);
			compareResult = await runComparePhaseForJob(jobId, {
				config: deps.config,
				...(deps.compareDeps ?? {}),
			});
			log.info(
				{
					...logJobContext(entry, jobId),
					phase: "compare_done",
					renditionCount: compareResult.renditions.length,
				},
				"compare phase done",
			);
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : "Compare phase failed";
		log.warn(
			{
				...logJobContext(entry, jobId),
				phase: "compare_failed",
				err: message,
			},
			"compare phase failed",
		);
		markProbeComputeJobFailed(jobId, message, deps.nowMs());
		deps.onJobFinished();
		return;
	}

	const afterCompare = getProbeComputeJobMutableEntry(jobId);
	if (!afterCompare || afterCompare.cancelRequested || afterCompare.status === "cancelled") {
		log.info(
			{
				...logJobContext(entry, jobId),
				phase: "job_cancelled",
				afterPhase: "compare",
			},
			"probe job cancelled",
		);
		finalizeProbeComputeJobCancelled(jobId, deps.nowMs(), { compareResult });
		deps.onJobFinished();
		return;
	}

	let vmafReport: IDevVideoCompressCompareVmafReport | null = null;

	if (jobNeedsVmafPhase(afterCompare)) {
		if (afterCompare.request.jobKind === "unified") {
			setProbeComputeJobPhase(jobId, "vmaf");
		}

		log.info(
			{
				...logJobContext(afterCompare, jobId),
				phase: "vmaf_start",
				candidateCount: afterCompare.request.vmaf?.candidates.length ?? 0,
			},
			"vmaf phase start",
		);

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
			log.warn(
				{
					...logJobContext(afterCompare, jobId),
					phase: "vmaf_failed",
					err: message,
				},
				"vmaf phase failed",
			);
			markProbeComputeJobFailed(jobId, message, deps.nowMs());
			deps.onJobFinished();
			return;
		}

		const skippedCount =
			vmafReport?.rows.filter(function (row): boolean {
				return row.skipped;
			}).length ?? 0;
		log.info(
			{
				...logJobContext(afterCompare, jobId),
				phase: "vmaf_done",
				rowCount: vmafReport?.rows.length ?? 0,
				skippedCount: skippedCount,
				totalDurationMs: vmafReport?.totalDurationMs,
			},
			"vmaf phase done",
		);
	}

	const afterVmaf = getProbeComputeJobMutableEntry(jobId);
	if (!afterVmaf || afterVmaf.cancelRequested || afterVmaf.status === "cancelled") {
		if (afterVmaf?.status !== "cancelled") {
			finalizeProbeComputeJobCancelled(jobId, deps.nowMs(), {
				compareResult,
				vmafReport,
			});
		}
		log.info(
			{
				...logJobContext(entry, jobId),
				phase: "job_cancelled",
				afterPhase: "vmaf",
			},
			"probe job cancelled",
		);
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

	log.info(
		{
			...logJobContext(entry, jobId),
			phase: "job_ready",
			totalDurationMs: deps.nowMs() - startedAtMs,
			hasCompareResult: compareResult !== null,
			hasVmafReport: vmafReport !== null,
		},
		"probe job ready",
	);

	deps.onJobFinished();
}
