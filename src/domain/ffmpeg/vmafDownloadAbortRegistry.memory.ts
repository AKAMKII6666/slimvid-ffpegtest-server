/**
 * 模块名称：VMAF 下载 AbortSignal registry（内存）
 * 模块说明：jobId → AbortController；cancel 时 abort 在途 streamDownload。
 */

const downloadAbortByJobId = new Map<string, AbortController>();

export function registerVmafDownloadAbort(jobId: string, controller: AbortController): void {
	const key = jobId.trim();
	if (key === "") {
		return;
	}

	const existing = downloadAbortByJobId.get(key);
	if (existing && existing !== controller && !existing.signal.aborted) {
		existing.abort();
	}

	downloadAbortByJobId.set(key, controller);
}

export function unregisterVmafDownloadAbort(jobId: string): void {
	const key = jobId.trim();
	if (key === "") {
		return;
	}

	downloadAbortByJobId.delete(key);
}

export function abortVmafDownloads(jobId: string): boolean {
	const key = jobId.trim();
	const controller = downloadAbortByJobId.get(key);
	if (!controller || controller.signal.aborted) {
		return false;
	}

	controller.abort();
	return true;
}

export function resetVmafDownloadAbortRegistryForTests(): void {
	downloadAbortByJobId.clear();
}
