/**
 * 模块名称：VMAF worker AbortContext
 * 模块说明：贯穿 download / ffmpeg 的 cancel 检查与 download signal。
 */

import { getProbeComputeJobMutableEntry } from "../../job/probeComputeJobStore.memory.js";
import {
	abortVmafDownloads,
	registerVmafDownloadAbort,
	unregisterVmafDownloadAbort,
} from "../ffmpeg/vmafDownloadAbortRegistry.memory.js";
import { killVmafFfmpegProcesses } from "../ffmpeg/vmafProcessRegistry.memory.js";

export interface IVmafAbortContext {
	shouldAbort: () => boolean;
	downloadSignal: AbortSignal;
	dispose: () => void;
}

export function createVmafAbortContext(jobId: string): IVmafAbortContext {
	const normalizedJobId = jobId.trim();
	const downloadAbortController = new AbortController();
	registerVmafDownloadAbort(normalizedJobId, downloadAbortController);

	return {
		shouldAbort: function (): boolean {
			const entry = getProbeComputeJobMutableEntry(normalizedJobId);
			return entry?.cancelRequested ?? false;
		},
		downloadSignal: downloadAbortController.signal,
		dispose: function (): void {
			unregisterVmafDownloadAbort(normalizedJobId);
		},
	};
}

export function abortProbeComputeVmafSideEffects(jobId: string): void {
	killVmafFfmpegProcesses(jobId);
	abortVmafDownloads(jobId);
}
