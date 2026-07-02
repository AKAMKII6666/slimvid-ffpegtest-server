/**
 * 模块名称：Job 队列与调度
 * 模块说明：pending FIFO；槽满时保持 pending（无 worker_busy）。
 */

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
import { runProbeComputeJobExecutor } from "./probeComputeJobExecutor.js";
import type { IRunComparePhaseDeps } from "./runComparePhaseForJob.js";
import type { IRunVmafPhaseDeps } from "./runVmafPhaseForJob.js";
import { getProbeComputeJobMutableEntry } from "./probeComputeJobStore.memory.js";

export interface IProbeComputeJobScheduler {
	enqueue: (jobId: string) => void;
	scheduleNext: () => void;
	getRunningCompareJobs: () => number;
	getRunningVmafJobs: () => number;
	getPendingJobIds: () => string[];
	resetForTests: () => void;
}

export interface ICreateProbeComputeJobSchedulerOptions {
	config: IProbeWorkerEffectiveConfig;
	nowMs: () => number;
	compareDeps?: IRunComparePhaseDeps;
	vmafDeps?: IRunVmafPhaseDeps;
}

interface IProbeComputeJobSchedulerState {
	pendingJobIds: string[];
	runningCompareJobIds: Set<string>;
	runningVmafJobIds: Set<string>;
}

function usesComparePool(jobKind: string): boolean {
	return jobKind === "compare" || jobKind === "unified";
}

function usesVmafPool(jobKind: string): boolean {
	return jobKind === "vmaf" || jobKind === "unified";
}

/**
 * 创建进程内 job 调度器。
 */
export function createProbeComputeJobScheduler(
	options: ICreateProbeComputeJobSchedulerOptions,
): IProbeComputeJobScheduler {
	const { config, nowMs, compareDeps, vmafDeps } = options;
	const state: IProbeComputeJobSchedulerState = {
		pendingJobIds: [],
		runningCompareJobIds: new Set(),
		runningVmafJobIds: new Set(),
	};

	function releaseJobSlots(jobId: string): void {
		state.runningCompareJobIds.delete(jobId);
		state.runningVmafJobIds.delete(jobId);
	}

	function canStartJob(jobId: string): boolean {
		const entry = getProbeComputeJobMutableEntry(jobId);
		if (!entry || entry.status !== "pending") {
			return false;
		}

		if (usesComparePool(entry.request.jobKind)) {
			if (state.runningCompareJobIds.size >= config.concurrency.maxFfprobeParallel) {
				return false;
			}
		}

		if (usesVmafPool(entry.request.jobKind)) {
			if (state.runningVmafJobIds.size >= config.concurrency.maxVmafJobs) {
				return false;
			}
		}

		return true;
	}

	function occupyJobSlots(jobId: string): void {
		const entry = getProbeComputeJobMutableEntry(jobId);
		if (!entry) {
			return;
		}

		if (usesComparePool(entry.request.jobKind)) {
			state.runningCompareJobIds.add(jobId);
		}
		if (usesVmafPool(entry.request.jobKind)) {
			state.runningVmafJobIds.add(jobId);
		}
	}

	function scheduleNext(): void {
		for (let index = 0; index < state.pendingJobIds.length; index += 1) {
			const jobId = state.pendingJobIds[index];
			if (!jobId) {
				continue;
			}
			if (!canStartJob(jobId)) {
				continue;
			}

			state.pendingJobIds.splice(index, 1);
			occupyJobSlots(jobId);

			void runProbeComputeJobExecutor(jobId, {
				config,
				nowMs,
				compareDeps,
				vmafDeps,
				onJobFinished: function onJobFinished(): void {
					releaseJobSlots(jobId);
					scheduleNext();
				},
			});

			return;
		}
	}

	return {
		enqueue: function enqueue(jobId: string): void {
			state.pendingJobIds.push(jobId);
			scheduleNext();
		},
		scheduleNext,
		getRunningCompareJobs: function getRunningCompareJobs(): number {
			return state.runningCompareJobIds.size;
		},
		getRunningVmafJobs: function getRunningVmafJobs(): number {
			return state.runningVmafJobIds.size;
		},
		getPendingJobIds: function getPendingJobIds(): string[] {
			return state.pendingJobIds.slice();
		},
		resetForTests: function resetForTests(): void {
			state.pendingJobIds = [];
			state.runningCompareJobIds.clear();
			state.runningVmafJobIds.clear();
		},
	};
}

let defaultScheduler: IProbeComputeJobScheduler | null = null;

export function getProbeComputeJobScheduler(
	config: IProbeWorkerEffectiveConfig,
	nowMs: () => number = Date.now,
	compareDeps?: IRunComparePhaseDeps,
): IProbeComputeJobScheduler {
	if (!defaultScheduler) {
		defaultScheduler = createProbeComputeJobScheduler({ config, nowMs, compareDeps });
	}
	return defaultScheduler;
}

export function resetProbeComputeJobSchedulerForTests(): void {
	defaultScheduler = null;
}
