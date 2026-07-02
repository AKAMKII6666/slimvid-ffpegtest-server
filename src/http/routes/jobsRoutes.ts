/**
 * 模块名称：Jobs API 路由
 * 模块说明：POST/GET/cancel /v1/jobs；handler 保持薄。
 */

import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { IProbeWorkerEffectiveConfig } from "../../config/probeWorkerConfig.types.js";
import { createBearerAuthPreHandler } from "../auth/createBearerAuthPreHandler.js";
import { parseProbeComputeJobCreateBody } from "../guards/parseProbeComputeJobCreateBody.js";
import { buildErrorResponse, buildOkResponse } from "../responses/buildApiResponse.js";
import type {
	IProbeComputeJobCancelResponse,
	IProbeComputeJobCreateResponse,
} from "../../types/probeComputeJob.types.js";
import { buildProbeComputeJobStatus } from "../../job/buildProbeComputeJobStatus.js";
import {
	findJobIdByClientJobId,
	registerClientJobIdMapping,
} from "../../job/probeComputeJobClientIdIndex.memory.js";
import type { IProbeComputeJobScheduler } from "../../job/probeComputeJobScheduler.js";
import {
	createProbeComputeJob,
	getProbeComputeJobSnapshot,
	requestProbeComputeJobCancel,
} from "../../job/probeComputeJobStore.memory.js";

export interface IRegisterJobsRoutesOptions {
	config: IProbeWorkerEffectiveConfig;
	authToken: string;
	scheduler: IProbeComputeJobScheduler;
	nowMs?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 注册 /v1/jobs 相关路由（含 Bearer 鉴权）。
 */
export async function registerJobsRoutes(
	app: FastifyInstance,
	options: IRegisterJobsRoutesOptions,
): Promise<void> {
	const nowMs = options.nowMs ?? Date.now;
	const authPreHandler = createBearerAuthPreHandler({
		expectedToken: options.authToken,
	});

	await app.register(
		async function jobsPlugin(jobsApp): Promise<void> {
			jobsApp.addHook("preHandler", authPreHandler);

			jobsApp.post("/jobs", async function handleCreateJob(request, reply) {
				const parsed = parseProbeComputeJobCreateBody(request.body);
				if (!parsed.ok) {
					const statusCode = parsed.code === "invalid_url_scheme" ? 400 : 400;
					return reply.status(statusCode).send(
						buildErrorResponse(parsed.error, parsed.code),
					);
				}

				const body = parsed.body;
				const currentMs = nowMs();

				if (body.clientJobId) {
					const existingJobId = findJobIdByClientJobId(body.clientJobId, currentMs);
					if (existingJobId) {
						const existing = getProbeComputeJobSnapshot(
							existingJobId,
							options.config,
							currentMs,
						);
						if (existing) {
							const response: IProbeComputeJobCreateResponse = {
								jobId: existing.jobId,
								status: existing.status === "pending" ? "pending" : "running",
								clientJobId: body.clientJobId,
								totalCandidates:
									existing.vmafTotalCandidates > 0
										? existing.vmafTotalCandidates
										: undefined,
							};
							return reply.status(200).send(buildOkResponse(response));
						}
					}
				}

				const jobId = randomUUID();
				const snapshot = createProbeComputeJob({
					jobId,
					request: body,
					nowMs: currentMs,
				});

				if (body.clientJobId) {
					registerClientJobIdMapping(
						body.clientJobId,
						jobId,
						options.config.job.clientJobTtlMs,
						currentMs,
					);
				}

				options.scheduler.enqueue(jobId);

				const createResponse: IProbeComputeJobCreateResponse = {
					jobId: snapshot.jobId,
					status: "pending",
					clientJobId: body.clientJobId,
					totalCandidates:
						snapshot.vmafTotalCandidates > 0 ? snapshot.vmafTotalCandidates : undefined,
				};

				return reply.status(200).send(buildOkResponse(createResponse));
			});

			jobsApp.get("/jobs/:jobId", async function handlePollJob(request, reply) {
				const params = request.params;
				if (!isRecord(params) || typeof params.jobId !== "string") {
					return reply.status(400).send(
						buildErrorResponse("Invalid jobId", "invalid_body"),
					);
				}

				const snapshot = getProbeComputeJobSnapshot(
					params.jobId,
					options.config,
					nowMs(),
				);
				if (!snapshot) {
					return reply.status(404).send(
						buildErrorResponse("Job not found", "job_not_found"),
					);
				}

				return reply.status(200).send(buildOkResponse(buildProbeComputeJobStatus(snapshot)));
			});

			jobsApp.post("/jobs/:jobId/cancel", async function handleCancelJob(request, reply) {
				const params = request.params;
				if (!isRecord(params) || typeof params.jobId !== "string") {
					return reply.status(400).send(
						buildErrorResponse("Invalid jobId", "invalid_body"),
					);
				}

				const snapshot = getProbeComputeJobSnapshot(
					params.jobId,
					options.config,
					nowMs(),
				);
				if (!snapshot) {
					return reply.status(404).send(
						buildErrorResponse("Job not found", "job_not_found"),
					);
				}

				if (snapshot.status === "cancelled") {
					const response: IProbeComputeJobCancelResponse = {
						jobId: snapshot.jobId,
						status: "already_cancelled",
					};
					return reply.status(200).send(buildOkResponse(response));
				}

				if (snapshot.status === "ready" || snapshot.status === "failed") {
					return reply.status(409).send(
						buildErrorResponse("Job is not cancellable", "job_not_cancellable"),
					);
				}

				const updated = requestProbeComputeJobCancel(params.jobId, nowMs());
				if (!updated) {
					return reply.status(404).send(
						buildErrorResponse("Job not found", "job_not_found"),
					);
				}

				const response: IProbeComputeJobCancelResponse = {
					jobId: updated.jobId,
					status: "cancelled",
				};
				return reply.status(200).send(buildOkResponse(response));
			});
		},
		{ prefix: "/v1" },
	);
}
