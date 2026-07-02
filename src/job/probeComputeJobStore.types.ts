/**
 * 模块名称：Probe Compute Job Store 类型
 * 模块说明：内存 job 记录（内部可变状态）。
 */

import type { IProbeComputeCompareResult } from "../types/devVideoCompare.types.js";
import type { IDevVideoCompressCompareVmafReport } from "../types/devVideoVmaf.types.js";
import type { IDevVideoCompressCompareVmafRow } from "../types/devVideoVmaf.types.js";
import type {
	IProbeComputeJobCreateRequest,
	TProbeComputeJobPhase,
	TProbeComputeJobStatus,
} from "../types/probeComputeJob.types.js";

export interface IProbeComputeJobMutableEntry {
	jobId: string;
	request: IProbeComputeJobCreateRequest;
	status: TProbeComputeJobStatus;
	phase?: TProbeComputeJobPhase;
	createdAtMs: number;
	startedAtMs: number | null;
	completedAtMs: number | null;
	cancelRequested: boolean;
	errorMessage: string | null;
	compareCompletedRenditions: number;
	compareTotalRenditions: number;
	compareRenditions: IProbeComputeCompareResult["renditions"];
	vmafCompletedCandidates: number;
	vmafTotalCandidates: number;
	vmafRows: IDevVideoCompressCompareVmafRow[];
	compareResult: IProbeComputeCompareResult | null;
	vmafReport: IDevVideoCompressCompareVmafReport | null;
}

export interface ICreateProbeComputeJobParams {
	jobId: string;
	request: IProbeComputeJobCreateRequest;
	nowMs: number;
}

export interface IProbeComputeJobSnapshot {
	jobId: string;
	request: IProbeComputeJobCreateRequest;
	status: TProbeComputeJobStatus;
	phase?: TProbeComputeJobPhase;
	createdAtMs: number;
	startedAtMs: number | null;
	completedAtMs: number | null;
	cancelRequested: boolean;
	errorMessage: string | null;
	compareCompletedRenditions: number;
	compareTotalRenditions: number;
	compareRenditions: IProbeComputeCompareResult["renditions"];
	vmafCompletedCandidates: number;
	vmafTotalCandidates: number;
	vmafRows: IDevVideoCompressCompareVmafRow[];
	compareResult: IProbeComputeCompareResult | null;
	vmafReport: IDevVideoCompressCompareVmafReport | null;
}
