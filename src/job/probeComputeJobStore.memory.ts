/**
 * 模块名称：Probe Compute Job 内存 Store
 * 模块说明：只保存状态；不发 HTTP、不 spawn 进程。
 */

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
import type { IProbeComputeCompareResult } from "../types/devVideoCompare.types.js";
import type {
	IDevVideoCompressCompareVmafReport,
	IDevVideoCompressCompareVmafRow,
} from "../types/devVideoVmaf.types.js";
import { abortProbeComputeVmafSideEffects } from "../domain/vmaf/vmafAbortContext.helpers.js";
import type { TProbeComputeJobPhase } from "../types/probeComputeJob.types.js";
import type {
	ICreateProbeComputeJobParams,
	IProbeComputeJobMutableEntry,
	IProbeComputeJobSnapshot,
} from "./probeComputeJobStore.types.js";

const entryByJobId = new Map<string, IProbeComputeJobMutableEntry>();

function cloneSnapshot(entry: IProbeComputeJobMutableEntry): IProbeComputeJobSnapshot {
	return {
		jobId: entry.jobId,
		request: entry.request,
		status: entry.status,
		phase: entry.phase,
		createdAtMs: entry.createdAtMs,
		startedAtMs: entry.startedAtMs,
		completedAtMs: entry.completedAtMs,
		cancelRequested: entry.cancelRequested,
		errorMessage: entry.errorMessage,
		compareCompletedRenditions: entry.compareCompletedRenditions,
		compareTotalRenditions: entry.compareTotalRenditions,
		compareRenditions: entry.compareRenditions.slice(),
		vmafCompletedCandidates: entry.vmafCompletedCandidates,
		vmafTotalCandidates: entry.vmafTotalCandidates,
		vmafRows: entry.vmafRows.slice(),
		compareResult: entry.compareResult,
		vmafReport: entry.vmafReport,
	};
}

function isTerminalStatus(status: IProbeComputeJobMutableEntry["status"]): boolean {
	return status === "ready" || status === "failed" || status === "cancelled";
}

function isEntryExpired(
	entry: IProbeComputeJobMutableEntry,
	config: IProbeWorkerEffectiveConfig,
	nowMs: number,
): boolean {
	if (entry.completedAtMs !== null) {
		return nowMs - entry.completedAtMs > config.job.terminalRetainMs;
	}
	if (entry.startedAtMs !== null && entry.status === "running") {
		return nowMs - entry.startedAtMs > config.job.maxRuntimeMs;
	}
	return false;
}

function purgeExpiredEntries(config: IProbeWorkerEffectiveConfig, nowMs: number): void {
	for (const [jobId, entry] of entryByJobId.entries()) {
		if (isEntryExpired(entry, config, nowMs)) {
			entryByJobId.delete(jobId);
		}
	}
}

/**
 * 创建 pending job。
 */
export function createProbeComputeJob(
	params: ICreateProbeComputeJobParams,
): IProbeComputeJobSnapshot {
	const entry: IProbeComputeJobMutableEntry = {
		jobId: params.jobId,
		request: params.request,
		status: "pending",
		createdAtMs: params.nowMs,
		startedAtMs: null,
		completedAtMs: null,
		cancelRequested: false,
		errorMessage: null,
		compareCompletedRenditions: 0,
		compareTotalRenditions: params.request.compare?.renditions.length ?? 0,
		compareRenditions: [],
		vmafCompletedCandidates: 0,
		vmafTotalCandidates: params.request.vmaf?.candidates.length ?? 0,
		vmafRows: [],
		compareResult: null,
		vmafReport: null,
	};

	entryByJobId.set(params.jobId, entry);
	return cloneSnapshot(entry);
}

/**
 * 按 jobId 获取快照；过期则返回 null。
 */
export function getProbeComputeJobSnapshot(
	jobId: string,
	config: IProbeWorkerEffectiveConfig,
	nowMs: number,
): IProbeComputeJobSnapshot | null {
	purgeExpiredEntries(config, nowMs);
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return null;
	}
	return cloneSnapshot(entry);
}

export function getProbeComputeJobMutableEntry(jobId: string): IProbeComputeJobMutableEntry | null {
	return entryByJobId.get(jobId) ?? null;
}

export function markProbeComputeJobRunning(
	jobId: string,
	phase: TProbeComputeJobPhase | undefined,
	nowMs: number,
): boolean {
	const entry = entryByJobId.get(jobId);
	if (!entry || entry.status !== "pending") {
		return false;
	}
	entry.status = "running";
	entry.startedAtMs = nowMs;
	entry.phase = phase;
	return true;
}

export function setProbeComputeJobPhase(jobId: string, phase: TProbeComputeJobPhase): void {
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return;
	}
	entry.phase = phase;
}

/**
 * compare 阶段增量写入单条 rendition（供 poll 进度）。
 */
export function appendProbeCompareRendition(
	jobId: string,
	rendition: IProbeComputeCompareResult["renditions"][number],
): void {
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return;
	}
	entry.compareRenditions.push(rendition);
	entry.compareCompletedRenditions += 1;
}

/**
 * compare 阶段跳过 HLS rendition 时递增进度（不计入 renditions 列表）。
 */
export function incrementProbeCompareCompletedRenditions(jobId: string): void {
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return;
	}
	entry.compareCompletedRenditions += 1;
}

export function setProbeComputeCompareResult(
	jobId: string,
	compareResult: IProbeComputeCompareResult,
): void {
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return;
	}
	entry.compareResult = compareResult;
	entry.compareRenditions = compareResult.renditions.slice();
}

export function appendProbeVmafRow(jobId: string, row: IDevVideoCompressCompareVmafRow): void {
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return;
	}
	entry.vmafRows.push(row);
	entry.vmafCompletedCandidates = entry.vmafRows.length;
}

export function setProbeComputeVmafReport(
	jobId: string,
	vmafReport: IDevVideoCompressCompareVmafReport,
): void {
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return;
	}
	entry.vmafReport = vmafReport;
	entry.vmafRows = vmafReport.rows.slice();
	entry.vmafCompletedCandidates = vmafReport.rows.length;
}

export function requestProbeComputeJobCancel(jobId: string, nowMs: number): IProbeComputeJobSnapshot | null {
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return null;
	}

	if (isTerminalStatus(entry.status)) {
		return cloneSnapshot(entry);
	}

	entry.cancelRequested = true;

	if (entry.status === "running") {
		abortProbeComputeVmafSideEffects(jobId);
	}

	if (entry.status === "pending") {
		entry.status = "cancelled";
		entry.completedAtMs = nowMs;
	}

	return cloneSnapshot(entry);
}

export function finalizeProbeComputeJobCancelled(
	jobId: string,
	nowMs: number,
	partialResults?: {
		compareResult?: IProbeComputeCompareResult | null;
		vmafReport?: IDevVideoCompressCompareVmafReport | null;
	},
): IProbeComputeJobSnapshot | null {
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return null;
	}
	entry.status = "cancelled";
	entry.completedAtMs = nowMs;

	if (partialResults?.compareResult) {
		entry.compareResult = partialResults.compareResult;
		entry.compareRenditions = partialResults.compareResult.renditions.slice();
		entry.compareCompletedRenditions = partialResults.compareResult.renditions.length;
	}

	if (partialResults?.vmafReport) {
		entry.vmafReport = partialResults.vmafReport;
		entry.vmafRows = partialResults.vmafReport.rows.slice();
		entry.vmafCompletedCandidates = partialResults.vmafReport.rows.length;
	}

	return cloneSnapshot(entry);
}

export function finalizeProbeComputeJobReady(
	jobId: string,
	results: {
		compareResult: IProbeComputeCompareResult | null;
		vmafReport: IDevVideoCompressCompareVmafReport | null;
	},
	nowMs: number,
): IProbeComputeJobSnapshot | null {
	const entry = entryByJobId.get(jobId);
	if (!entry || entry.cancelRequested) {
		return null;
	}

	entry.status = "ready";
	entry.completedAtMs = nowMs;
	entry.compareResult = results.compareResult;
	entry.vmafReport = results.vmafReport;

	if (results.compareResult) {
		entry.compareCompletedRenditions = results.compareResult.renditions.length;
		entry.compareRenditions = results.compareResult.renditions.slice();
	}

	if (results.vmafReport) {
		entry.vmafCompletedCandidates = results.vmafReport.rows.length;
		entry.vmafRows = results.vmafReport.rows.slice();
	}

	return cloneSnapshot(entry);
}

export function markProbeComputeJobFailed(
	jobId: string,
	errorMessage: string,
	nowMs: number,
): IProbeComputeJobSnapshot | null {
	const entry = entryByJobId.get(jobId);
	if (!entry) {
		return null;
	}
	entry.status = "failed";
	entry.errorMessage = errorMessage;
	entry.completedAtMs = nowMs;
	return cloneSnapshot(entry);
}

/** 单测清理 */
export function resetProbeComputeJobStoreForTests(): void {
	entryByJobId.clear();
}
