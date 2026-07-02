/**
 * 模块名称：Job 创建服务
 * 模块说明：编排 store、clientJobId 幂等与队列入队。
 */

import { randomUUID } from "node:crypto";

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
import { createModuleLogger } from "../logging/createModuleLogger.js";
import {
	findJobIdByClientJobId,
	registerClientJobIdMapping,
} from "./probeComputeJobClientIdIndex.memory.js";
import type { IProbeComputeJobScheduler } from "./probeComputeJobScheduler.js";
import {
	createProbeComputeJob,
	getProbeComputeJobSnapshot,
	markProbeComputeJobFailed,
} from "./probeComputeJobStore.memory.js";
import type {
	IProbeComputeJobCreateRequest,
	IProbeComputeJobCreateResponse,
} from "../types/probeComputeJob.types.js";

const log = createModuleLogger({ module: "job.service" });

export interface ICreateProbeComputeJobServiceParams {
	request: IProbeComputeJobCreateRequest;
	config: IProbeWorkerEffectiveConfig;
	scheduler: IProbeComputeJobScheduler;
	nowMs: number;
}

/**
 * 创建 job 或返回 clientJobId 幂等命中。
 */
export function createProbeComputeJobService(
	params: ICreateProbeComputeJobServiceParams,
): IProbeComputeJobCreateResponse {
	const { request, config, scheduler, nowMs } = params;

	if (request.clientJobId) {
		const existingJobId = findJobIdByClientJobId(request.clientJobId, nowMs);
		if (existingJobId) {
			const existing = getProbeComputeJobSnapshot(existingJobId, config, nowMs);
			if (existing) {
				return {
					jobId: existing.jobId,
					status: existing.status === "pending" ? "pending" : "running",
					clientJobId: request.clientJobId,
					totalCandidates:
						existing.vmafTotalCandidates > 0
							? existing.vmafTotalCandidates
							: undefined,
				};
			}
		}
	}

	const jobId = randomUUID();
	createProbeComputeJob({
		jobId,
		request,
		nowMs,
	});

	if (request.clientJobId) {
		registerClientJobIdMapping(
			request.clientJobId,
			jobId,
			config.job.clientJobTtlMs,
			nowMs,
		);
	}

	scheduler.enqueue(jobId);

	log.info(
		{
			jobId: jobId,
			jobKind: request.jobKind,
			clientJobId: request.clientJobId,
			shopDomain: request.caller.shopDomain,
			videoId: request.caller.videoId,
			productId: request.caller.productId,
			batchId: request.caller.batchId,
			compareRenditionCount: request.compare?.renditions.length,
			vmafCandidateCount: request.vmaf?.candidates.length,
			phase: "job_created",
		},
		"probe job created and enqueued",
	);

	const snapshot = getProbeComputeJobSnapshot(jobId, config, nowMs);
	const status = snapshot?.status === "running" ? "running" : "pending";

	return {
		jobId,
		status,
		clientJobId: request.clientJobId,
		totalCandidates: request.vmaf?.candidates.length,
	};
}

/**
 * GET 前检查 running 超时。
 */
export function getProbeComputeJobSnapshotWithRuntimeCheck(
	jobId: string,
	config: IProbeWorkerEffectiveConfig,
	nowMs: number,
) {
	const snapshot = getProbeComputeJobSnapshot(jobId, config, nowMs);
	if (!snapshot) {
		return null;
	}

	if (
		snapshot.status === "running" &&
		snapshot.startedAtMs !== null &&
		nowMs - snapshot.startedAtMs > config.job.maxRuntimeMs
	) {
		return markProbeComputeJobFailed(jobId, "Job exceeded max runtime", nowMs);
	}

	return snapshot;
}
