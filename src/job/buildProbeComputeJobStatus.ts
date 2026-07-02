/**
 * 模块名称：Job poll 响应构建
 * 模块说明：store 快照 → IProbeComputeJobStatus。
 */

import type { IProbeComputeJobStatus } from "../types/probeComputeJob.types.js";
import type { IProbeComputeJobSnapshot } from "./probeComputeJobStore.types.js";

/**
 * 将内部 job 快照映射为 GET /v1/jobs/:jobId data。
 */
export function buildProbeComputeJobStatus(
	snapshot: IProbeComputeJobSnapshot,
): IProbeComputeJobStatus {
	const status: IProbeComputeJobStatus = {
		jobId: snapshot.jobId,
		status: snapshot.status,
	};

	if (snapshot.phase) {
		status.phase = snapshot.phase;
	}

	if (snapshot.compareTotalRenditions > 0) {
		status.compare = {
			completedRenditions: snapshot.compareCompletedRenditions,
			totalRenditions: snapshot.compareTotalRenditions,
		};
		if (snapshot.compareRenditions.length > 0) {
			status.compare.renditions = snapshot.compareRenditions.slice();
		}
	}

	if (snapshot.vmafTotalCandidates > 0) {
		status.vmaf = {
			completedCandidates: snapshot.vmafCompletedCandidates,
			totalCandidates: snapshot.vmafTotalCandidates,
		};
		if (snapshot.vmafRows.length > 0) {
			status.vmaf.rows = snapshot.vmafRows.slice();
		}
	}

	if (snapshot.compareResult) {
		status.compareResult = snapshot.compareResult;
	}

	if (snapshot.vmafReport) {
		status.vmafReport = snapshot.vmafReport;
	}

	if (snapshot.errorMessage) {
		status.errorMessage = snapshot.errorMessage;
	}

	if (snapshot.startedAtMs !== null && snapshot.completedAtMs !== null) {
		status.totalDurationMs = snapshot.completedAtMs - snapshot.startedAtMs;
	}

	return status;
}
