/**
 * 模块名称：单次 VMAF ffmpeg 执行
 * 模块说明：本地 distorted + reference 文件跑 libvmaf；可注入 spawn 供单测。
 */

import { readFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import type { IProbeWorkerEffectiveConfig } from "../../config/probeWorkerConfig.types.js";
import type { TVmafExecutionMode } from "../ffmpeg/probeRuntimeCapabilities.js";
import {
	buildVmafFfmpegFullFilter,
	type TVmafFfmpegMode,
} from "./buildVmafFfmpegFilterGraph.js";
import {
	buildVmafFfmpegCudaGlobalArgs,
	buildVmafFfmpegCudaPerInputArgs,
} from "./buildVmafFfmpegHwaccelArgs.js";
import { parseVmafFfmpegJsonMean } from "./parseVmafFfmpegJson.js";
import { parseVmafFfmpegFrameAnalytics } from "./parseVmafFfmpegFrameAnalytics.js";
import { registerVmafFfmpegProcess } from "../ffmpeg/vmafProcessRegistry.memory.js";
import type { IDevVideoVmafFrameAnalytics } from "../../types/devVideoVmaf.types.js";

export const DEFAULT_VMAF_MODEL_VERSION = "vmaf_v0.6.1";

export interface IRunVmafPairWithFfmpegInput {
	distortedFilePath: string;
	referenceFilePath: string;
	mode: TVmafFfmpegMode;
	deliveryWidth?: number;
	deliveryHeight?: number;
	maxDurationSeconds?: number;
	frameRateFps?: number;
	jobId?: string;
	shouldAbort?: () => boolean;
	ffmpegPath?: string;
	ffmpegTimeoutMs?: number;
	vmafModel?: string;
	vmafExecutionMode?: TVmafExecutionMode;
}

export interface IRunVmafPairWithFfmpegResult {
	mean: number | null;
	frameAnalytics: IDevVideoVmafFrameAnalytics | null;
}

export type TRunVmafPairFfmpegSpawner = (
	command: string,
	args: string[],
	options?: {
		jobId?: string;
		shouldAbort?: () => boolean;
		timeoutMs?: number;
	},
) => Promise<{ exitCode: number; stderr: string }>;

async function defaultRunVmafPairFfmpegSpawner(
	command: string,
	args: string[],
	options?: {
		jobId?: string;
		shouldAbort?: () => boolean;
		timeoutMs?: number;
	},
): Promise<{ exitCode: number; stderr: string }> {
	if (options?.shouldAbort?.()) {
		return { exitCode: 1, stderr: "aborted" };
	}

	return new Promise(function (resolve, reject): void {
		const child = spawn(command, args, {
			stdio: ["ignore", "ignore", "pipe"],
		});

		if (options?.jobId) {
			registerVmafFfmpegProcess(options.jobId, child);
		}

		if (options?.shouldAbort?.()) {
			child.kill("SIGKILL");
		}

		let stderr = "";
		const timeoutMs = options?.timeoutMs ?? 600_000;
		const timeoutId = setTimeout(function (): void {
			child.kill("SIGKILL");
		}, timeoutMs);

		child.stderr.on("data", function (chunk: Buffer): void {
			if (stderr.length >= 256 * 1024) {
				return;
			}
			stderr += chunk.toString("utf8");
			if (stderr.length > 256 * 1024) {
				stderr = stderr.slice(0, 256 * 1024);
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

let runVmafPairFfmpegSpawnerOverride: TRunVmafPairFfmpegSpawner | null = null;

export function setRunVmafPairFfmpegSpawnerForTests(
	spawner: TRunVmafPairFfmpegSpawner | null,
): void {
	runVmafPairFfmpegSpawnerOverride = spawner;
}

export async function runVmafPairWithFfmpeg(
	input: IRunVmafPairWithFfmpegInput,
	config?: Pick<IProbeWorkerEffectiveConfig, "ffmpeg" | "vmaf">,
): Promise<IRunVmafPairWithFfmpegResult> {
	if (input.shouldAbort?.()) {
		return {
			mean: null,
			frameAnalytics: null,
		};
	}

	const ffmpegPath = input.ffmpegPath ?? config?.ffmpeg.ffmpegPath ?? "ffmpeg";
	const ffmpegTimeoutMs = input.ffmpegTimeoutMs ?? config?.vmaf.ffmpegTimeoutMs ?? 600_000;
	const vmafModel = input.vmafModel ?? config?.vmaf.model ?? DEFAULT_VMAF_MODEL_VERSION;
	const vmafExecutionMode = input.vmafExecutionMode ?? "cpu";
	const gpuDeviceId = config?.vmaf.gpuDeviceId ?? 0;
	const logPath = join(tmpdir(), "slimvid-vmaf-" + randomUUID() + ".json");

	const filter = buildVmafFfmpegFullFilter(
		{
			mode: input.mode,
			deliveryWidth: input.deliveryWidth,
			deliveryHeight: input.deliveryHeight,
			executionMode: vmafExecutionMode,
		},
		logPath,
		vmafModel,
	);

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

	if (vmafExecutionMode === "cuda") {
		args.push(...buildVmafFfmpegCudaPerInputArgs(gpuDeviceId));
	}
	args.push("-i", input.distortedFilePath);

	if (vmafExecutionMode === "cuda") {
		args.push(...buildVmafFfmpegCudaPerInputArgs(gpuDeviceId));
	}
	args.push("-i", input.referenceFilePath);

	args.push("-lavfi", filter, "-f", "null", "-");

	const spawner = runVmafPairFfmpegSpawnerOverride ?? defaultRunVmafPairFfmpegSpawner;

	try {
		const result = await spawner(ffmpegPath, args, {
			jobId: input.jobId,
			shouldAbort: input.shouldAbort,
			timeoutMs: ffmpegTimeoutMs,
		});
		if (result.exitCode !== 0) {
			return {
				mean: null,
				frameAnalytics: null,
			};
		}

		const jsonText = await readFile(logPath, "utf8");
		const mean = parseVmafFfmpegJsonMean(jsonText);
		let frameAnalytics: IDevVideoVmafFrameAnalytics | null = null;

		if (
			typeof input.frameRateFps === "number" &&
			Number.isFinite(input.frameRateFps) &&
			input.frameRateFps > 0
		) {
			frameAnalytics = parseVmafFfmpegFrameAnalytics(jsonText, input.frameRateFps);
		}

		return {
			mean: mean,
			frameAnalytics: frameAnalytics,
		};
	} catch {
		return {
			mean: null,
			frameAnalytics: null,
		};
	} finally {
		await unlink(logPath).catch(function (): void {
			// 忽略清理失败
		});
	}
}
