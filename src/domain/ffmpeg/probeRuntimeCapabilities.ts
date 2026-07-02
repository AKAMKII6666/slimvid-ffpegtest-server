/**
 * 模块名称：运行时能力探测
 * 模块说明：探测 ffmpeg / ffprobe / libvmaf（及可选 libvmaf_cuda）是否可用。
 */

import type { IProbeWorkerEffectiveConfig } from "../../config/probeWorkerConfig.types.js";
import {
	createNodeFfmpegSpawner,
	type IFfmpegSpawnResult,
	type TFfmpegSpawner,
} from "./ffmpegSpawner.types.js";

export type TVmafExecutionMode = "cpu" | "cuda";

export interface IProbeRuntimeCapabilities {
	ffmpegAvailable: boolean;
	ffprobeAvailable: boolean;
	libvmafAvailable: boolean;
	libvmafCudaAvailable: boolean;
	vmafExecutionMode: TVmafExecutionMode;
}

export interface IProbeRuntimeCapabilitiesOptions {
	config: IProbeWorkerEffectiveConfig;
	spawner?: TFfmpegSpawner;
}

function runSpawnCollectStdout(
	spawner: TFfmpegSpawner,
	command: string,
	args: string[],
): Promise<string> {
	return new Promise(function (resolve): void {
		let child: IFfmpegSpawnResult;
		try {
			child = spawner(command, args);
		} catch {
			resolve("");
			return;
		}

		let stdout = "";
		child.stdout.on("data", function (chunk: Buffer): void {
			stdout += chunk.toString("utf8");
		});

		child.on("error", function (): void {
			resolve("");
		});

		child.on("close", function (): void {
			resolve(stdout);
		});
	});
}

async function isBinaryRunnable(
	spawner: TFfmpegSpawner,
	binaryPath: string,
): Promise<boolean> {
	const output = await runSpawnCollectStdout(spawner, binaryPath, [
		"-hide_banner",
		"-version",
	]);
	return output.length > 0;
}

async function ffmpegFiltersInclude(
	spawner: TFfmpegSpawner,
	ffmpegPath: string,
	needle: string,
): Promise<boolean> {
	const output = await runSpawnCollectStdout(spawner, ffmpegPath, [
		"-hide_banner",
		"-filters",
	]);
	return output.includes(needle);
}

/**
 * 探测本机 ffmpeg 运行时能力；任一核心项失败时 /health 应返回 503。
 */
export async function probeRuntimeCapabilities(
	options: IProbeRuntimeCapabilitiesOptions,
): Promise<IProbeRuntimeCapabilities> {
	const spawner = options.spawner ?? createNodeFfmpegSpawner();
	const { ffmpegPath, ffprobePath } = options.config.ffmpeg;
	const { useGpu } = options.config.vmaf;

	const [ffmpegAvailable, ffprobeAvailable, libvmafAvailable, libvmafCudaAvailable] =
		await Promise.all([
			isBinaryRunnable(spawner, ffmpegPath),
			isBinaryRunnable(spawner, ffprobePath),
			ffmpegFiltersInclude(spawner, ffmpegPath, "libvmaf"),
			ffmpegFiltersInclude(spawner, ffmpegPath, "libvmaf_cuda"),
		]);

	let vmafExecutionMode: TVmafExecutionMode = "cpu";
	if (useGpu && libvmafCudaAvailable) {
		vmafExecutionMode = "cuda";
	}

	return {
		ffmpegAvailable,
		ffprobeAvailable,
		libvmafAvailable,
		libvmafCudaAvailable,
		vmafExecutionMode,
	};
}

/** 核心二进制是否全部可用（决定 /health HTTP 200 vs 503） */
export function isCoreRuntimeHealthy(capabilities: IProbeRuntimeCapabilities): boolean {
	return (
		capabilities.ffmpegAvailable &&
		capabilities.ffprobeAvailable &&
		capabilities.libvmafAvailable
	);
}

/**
 * Worker 整体运行时健康：含 GPU fail 策略（useGpu + fail + 无 libvmaf_cuda → 503）。
 */
export function isProbeWorkerRuntimeHealthy(
	capabilities: IProbeRuntimeCapabilities,
	config: IProbeWorkerEffectiveConfig,
): boolean {
	if (!isCoreRuntimeHealthy(capabilities)) {
		return false;
	}

	if (
		config.vmaf.useGpu &&
		!capabilities.libvmafCudaAvailable &&
		config.vmaf.gpuUnavailablePolicy === "fail"
	) {
		return false;
	}

	return true;
}
