/**
 * 模块名称：VMAF mock 辅助
 * 模块说明：R3 unified / vmaf job 的 stub report（R4 替换为真实 libvmaf）。
 */

import type { IDevVideoCompressCompareVmafReport } from "../types/devVideoVmaf.types.js";
import type { IProbeComputeJobMutableEntry } from "./probeComputeJobStore.types.js";

export function buildStubVmafReport(
	entry: IProbeComputeJobMutableEntry,
	startedAtMs: number,
	nowMs: number,
): IDevVideoCompressCompareVmafReport {
	const vmaf = entry.request.vmaf;
	const vmafModel = vmaf?.options?.vmafModel ?? "vmaf_v0.6.1";

	return {
		jobId: entry.jobId,
		videoId: entry.request.caller.videoId,
		referenceLabel: vmaf?.reference.label ?? "Original source",
		vmafModel,
		probedAtIso: new Date(nowMs).toISOString(),
		totalDurationMs: nowMs - startedAtMs,
		rows: (vmaf?.candidates ?? []).map(function mapRow(candidate) {
			return {
				candidateLabel: candidate.label,
				candidateGroup: candidate.group,
				candidateUrl: candidate.url,
				deliveryWidth: candidate.width || 1280,
				deliveryHeight: candidate.height || 720,
				vmafMean: 95.5,
				vmafHarmonicMean: 94.2,
				skipped: false,
			};
		}),
	};
}
