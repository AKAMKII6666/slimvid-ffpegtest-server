/**
 * 模块名称：VMAF ffmpeg 通用滤镜执行
 * 模块说明：对完整 -lavfi 滤镜跑 libvmaf；支持 CPU 与 CUDA hwaccel。
 */

import { spawn } from "node:child_process";

import type { TVmafExecutionMode } from "../ffmpeg/probeRuntimeCapabilities.js";
import { registerVmafFfmpegProcess } from "../ffmpeg/vmafProcessRegistry.memory.js";
import { buildVmafFfmpegCudaGlobalArgs } from "./buildVmafFfmpegHwaccelArgs.js";

/** VMAF ffmpeg stderr 累积上限 */
export const VMAF_FFMPEG_STDERR_MAX_BYTES = 256 * 1024;

/** 默认 VMAF ffmpeg 超时 */
export const DEFAULT_VMAF_FFMPEG_TIMEOUT_MS = 600_000;

export interface IRunVmafFfmpegWithFullFilterInput {
	distortedFilePath: string;
	referenceFilePath: string;
	fullFilter: string;
	maxDurationSeconds?: number;
	jobId?: string;
	shouldAbort?: () => boolean;
	ffmpegCwd?: string;
	ffmpegPath?: string;
	ffmpegTimeoutMs?: number;
	vmafExecutionMode?: TVmafExecutionMode;
	gpuDeviceId?: number;
}

export interface IRunVmafFfmpegWithFullFilterResult {
	exitCode: number;
	stderr: string;
}

export type TRunVmafFfmpegWithFullFilterSpawner = (
	command: string,
	args: string[],
	options?: {
		jobId?: string;
		shouldAbort?: () => boolean;
		timeoutMs?: number;
		cwd?: string;
	},
) => Promise<{ exitCode: number; stderr: string }>;

let runVmafFfmpegWithFullFilterSpawnerOverride: TRunVmafFfmpegWithFullFilterSpawner | null = null;

export function setRunVmafFfmpegWithFullFilterSpawnerForTests(
	spawner: TRunVmafFfmpegWithFullFilterSpawner | null,
): void {
	runVmafFfmpegWithFullFilterSpawnerOverride = spawner;
}

async function defaultRunVmafFfmpegWithFullFilterSpawner(
	command: string,
	args: string[],
	options?: {
		jobId?: string;
		shouldAbort?: () => boolean;
		timeoutMs?: number;
		cwd?: string;
	},
): Promise<{ exitCode: number; stderr: string }> {
	if (options?.shouldAbort?.()) {
		return { exitCode: 1, stderr: "aborted" };
	}

	return new Promise(function (resolve, reject): void {
		const child = spawn(command, args, {
			stdio: ["ignore", "ignore", "pipe"],
			cwd: options?.cwd,
		});

		if (options?.jobId) {
			registerVmafFfmpegProcess(options.jobId, child);
		}

		if (options?.shouldAbort?.()) {
			child.kill("SIGKILL");
		}

		let stderr = "";
		const timeoutMs = options?.timeoutMs ?? DEFAULT_VMAF_FFMPEG_TIMEOUT_MS;
		const timeoutId = setTimeout(function (): void {
			child.kill("SIGKILL");
		}, timeoutMs);

		child.stderr.on("data", function (chunk: Buffer): void {
			if (stderr.length >= VMAF_FFMPEG_STDERR_MAX_BYTES) {
				return;
			}
			stderr += chunk.toString("utf8");
			if (stderr.length > VMAF_FFMPEG_STDERR_MAX_BYTES) {
				stderr = stderr.slice(0, VMAF_FFMPEG_STDERR_MAX_BYTES);
			}
		});

		child.on("error", function (err: Error): void {
			clearTimeout(timeoutId);
			reject(err);
		});

		child.on("close", function (code: number | null): void {
			clearTimeout(timeoutId);
			resolve({
				exitCode: code ?? 1,
				stderr: stderr,
			});
		});
	});
}

/**
 * 使用完整 lavfi 滤镜对一对本地文件运行 VMAF。
 */
export async function runVmafFfmpegWithFullFilter(
	input: IRunVmafFfmpegWithFullFilterInput,
): Promise<IRunVmafFfmpegWithFullFilterResult> {
	if (input.shouldAbort?.()) {
		return { exitCode: 1, stderr: "aborted" };
	}

	const ffmpegPath = input.ffmpegPath ?? "ffmpeg";
	const vmafExecutionMode = input.vmafExecutionMode ?? "cpu";
	const gpuDeviceId = input.gpuDeviceId ?? 0;
	const args: string[] = ["-hide_banner", "-loglevel", "error"];

	if (vmafExecutionMode === "cuda") {
		args.push(...buildVmafFfmpegCudaGlobalArgs(gpuDeviceId));
	}

	if (
		typeof input.maxDurationSeconds === "number" &&
		Number.isFinite(input.maxDurationSeconds) &&
		input.maxDurationSeconds > 0
	) {
		args.push("-t", String(input.maxDurationSeconds));
	}

	args.push("-i", input.distortedFilePath);

	args.push("-i", input.referenceFilePath);

	args.push("-lavfi", input.fullFilter, "-f", "null", "-");

	const spawner =
		runVmafFfmpegWithFullFilterSpawnerOverride ?? defaultRunVmafFfmpegWithFullFilterSpawner;

	try {
		return await spawner(ffmpegPath, args, {
			jobId: input.jobId,
			shouldAbort: input.shouldAbort,
			timeoutMs: input.ffmpegTimeoutMs ?? DEFAULT_VMAF_FFMPEG_TIMEOUT_MS,
			cwd: input.ffmpegCwd,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return { exitCode: 1, stderr: message };
	}
}
