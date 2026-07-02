/**
 * 模块名称：Probe Compute Job API 类型
 * 模块说明：POST/GET/cancel /v1/jobs 请求与响应；对齐 job-spec-v1 / job-status-v1。
 */

import type { IProbeComputeCompareResult } from "./devVideoCompare.types.js";
import type { IDevVideoCompressCompareVmafReport } from "./devVideoVmaf.types.js";
import type { IDevVideoCompressCompareRendition } from "./devVideoCompare.types.js";
import type { IDevVideoCompressCompareVmafRow } from "./devVideoVmaf.types.js";

export const PROBE_COMPUTE_JOB_SCHEMA_VERSION = 1 as const;

export type TProbeComputeJobKind = "compare" | "vmaf" | "unified";

export type TProbeComputeJobStatus =
	| "pending"
	| "running"
	| "ready"
	| "failed"
	| "cancelled";

export type TProbeComputeJobPhase = "compare" | "vmaf";

export interface IProbeComputeJobCaller {
	shopDomain: string;
	productId: string;
	videoId: string;
	batchId?: string;
}

export interface IProbeComputeCompareSpecInput {
	productName: string;
	linkedCompressTaskId?: string;
	renditions: Array<{
		group: "shopify" | "slimvid";
		label: string;
		url: string;
	}>;
}

export interface IProbeComputeVmafSpecInput {
	reference: {
		label: string;
		url: string;
	};
	candidates: Array<{
		label: string;
		group: "shopify" | "slimvid";
		url: string;
		width: number;
		height: number;
		formatHint: string;
		mimeType: string;
	}>;
	options?: {
		vmafModel?: string;
		durationMismatchThresholdSec?: number;
		includeFrameAnalytics?: boolean;
		includeScreenshots?: boolean;
	};
}

/** POST /v1/jobs 请求体（guard 通过后） */
export interface IProbeComputeJobCreateRequest {
	schemaVersion: typeof PROBE_COMPUTE_JOB_SCHEMA_VERSION;
	jobKind: TProbeComputeJobKind;
	clientJobId?: string;
	caller: IProbeComputeJobCaller;
	compare?: IProbeComputeCompareSpecInput;
	vmaf?: IProbeComputeVmafSpecInput;
}

export interface IProbeComputeJobCreateResponse {
	jobId: string;
	status: "pending" | "running";
	clientJobId?: string;
	totalCandidates?: number;
}

export interface IProbeComputeJobCancelRequest {
	reason?: string;
}

export interface IProbeComputeJobCancelResponse {
	jobId: string;
	status: "cancelled" | "already_cancelled";
}

/** GET /v1/jobs/:jobId poll 响应 data */
export interface IProbeComputeJobStatus {
	jobId: string;
	status: TProbeComputeJobStatus;
	phase?: TProbeComputeJobPhase;
	compare?: {
		completedRenditions: number;
		totalRenditions: number;
		renditions?: IDevVideoCompressCompareRendition[];
	};
	vmaf?: {
		completedCandidates: number;
		totalCandidates: number;
		rows?: IDevVideoCompressCompareVmafRow[];
	};
	compareResult?: IProbeComputeCompareResult;
	vmafReport?: IDevVideoCompressCompareVmafReport;
	errorMessage?: string;
	totalDurationMs?: number;
}

export type TProbeComputeParseErrorCode =
	| "invalid_body"
	| "unsupported_schema"
	| "invalid_url_scheme";

export interface IProbeComputeParseError {
	ok: false;
	code: TProbeComputeParseErrorCode;
	error: string;
}

export interface IProbeComputeParseSuccess {
	ok: true;
	body: IProbeComputeJobCreateRequest;
}

export type TProbeComputeParseResult = IProbeComputeParseSuccess | IProbeComputeParseError;
