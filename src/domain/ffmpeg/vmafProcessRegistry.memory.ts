/**
 * 模块名称：VMAF ffmpeg 子进程 registry（内存）
 * 模块说明：jobId → ChildProcess；cancel 时 SIGKILL。
 */

import type { ChildProcess } from "node:child_process";

const processesByJobId = new Map<string, Set<ChildProcess>>();

export function registerVmafFfmpegProcess(jobId: string, child: ChildProcess): void {
	const key = jobId.trim();
	if (key === "") {
		return;
	}

	let bucket = processesByJobId.get(key);
	if (!bucket) {
		bucket = new Set<ChildProcess>();
		processesByJobId.set(key, bucket);
	}

	bucket.add(child);

	child.once("close", function (): void {
		const current = processesByJobId.get(key);
		if (!current) {
			return;
		}
		current.delete(child);
		if (current.size === 0) {
			processesByJobId.delete(key);
		}
	});
}

export function killVmafFfmpegProcesses(jobId: string): boolean {
	const key = jobId.trim();
	const bucket = processesByJobId.get(key);
	if (!bucket || bucket.size === 0) {
		return false;
	}

	for (const child of bucket) {
		child.kill("SIGKILL");
	}

	return true;
}

export function getVmafFfmpegProcessCount(jobId: string): number {
	const bucket = processesByJobId.get(jobId.trim());
	if (!bucket) {
		return 0;
	}
	return bucket.size;
}

export function resetVmafFfmpegProcessRegistryForTests(): void {
	processesByJobId.clear();
}
