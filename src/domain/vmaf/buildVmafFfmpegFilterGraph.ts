/**
 * 模块名称：VMAF ffmpeg 滤镜图构建
 * 模块说明：metadata2go 对齐：distorted upscale @ reference resolution；支持 CPU libvmaf 与 CUDA libvmaf_cuda。
 */

import type { TVmafExecutionMode } from "../ffmpeg/probeRuntimeCapabilities.js";

/** VMAF 对比模式 */
export type TVmafFfmpegMode = "metadata2goBicubicUpscale";

/** VMAF 探针截图 R2 key 段（与 ffmpeg mode 解耦） */
export type TVmafProbeScreenshotMode = "referenceResolution";

export interface IBuildVmafFfmpegFilterGraphInput {
	mode: TVmafFfmpegMode;
	referenceWidth: number;
	referenceHeight: number;
	executionMode?: TVmafExecutionMode;
}

export const VMAF_FFMPEG_FILTER_CPU = "libvmaf";
export const VMAF_FFMPEG_FILTER_CUDA = "libvmaf_cuda";

function resolveVmafFilterName(executionMode: TVmafExecutionMode): string {
	return executionMode === "cuda" ? VMAF_FFMPEG_FILTER_CUDA : VMAF_FFMPEG_FILTER_CPU;
}

function buildMetadata2goBicubicUpscaleCpuFilterGraph(
	referenceWidth: number,
	referenceHeight: number,
	vmafFilter: string,
): string {
	const width = Math.round(referenceWidth);
	const height = Math.round(referenceHeight);

	return (
		"[0:v]scale=" +
		String(width) +
		":" +
		String(height) +
		":flags=bicubic,setpts=PTS-STARTPTS[dist];" +
		"[1:v]setpts=PTS-STARTPTS[ref];" +
		"[dist][ref]" +
		vmafFilter
	);
}

function buildMetadata2goBicubicUpscaleCudaFilterGraph(
	referenceWidth: number,
	referenceHeight: number,
	vmafFilter: string,
): string {
	const width = Math.round(referenceWidth);
	const height = Math.round(referenceHeight);

	return (
		"[0:v]scale=" +
		String(width) +
		":" +
		String(height) +
		":flags=bicubic,format=yuv420p,hwupload_cuda[dist];" +
		"[1:v]format=yuv420p,hwupload_cuda[ref];" +
		"[dist][ref]" +
		vmafFilter
	);
}

/**
 * 构建 libvmaf 前置 scale 滤镜链（不含 libvmaf 与 log_path）。
 *
 * 输入约定：`-i distorted -i reference` → `[0:v]` candidate，`[1:v]` reference。
 */
export function buildVmafFfmpegFilterGraph(input: IBuildVmafFfmpegFilterGraphInput): string {
	const executionMode = input.executionMode ?? "cpu";
	const vmafFilter = resolveVmafFilterName(executionMode);
	const referenceWidth = input.referenceWidth;
	const referenceHeight = input.referenceHeight;

	if (
		typeof referenceWidth !== "number" ||
		typeof referenceHeight !== "number" ||
		!Number.isFinite(referenceWidth) ||
		!Number.isFinite(referenceHeight) ||
		referenceWidth <= 0 ||
		referenceHeight <= 0
	) {
		throw new Error("VMAF requires positive referenceWidth and referenceHeight");
	}

	if (executionMode === "cuda") {
		return buildMetadata2goBicubicUpscaleCudaFilterGraph(
			referenceWidth,
			referenceHeight,
			vmafFilter,
		);
	}

	return buildMetadata2goBicubicUpscaleCpuFilterGraph(
		referenceWidth,
		referenceHeight,
		vmafFilter,
	);
}

/**
 * libvmaf log_path 在 ffmpeg -lavfi 中的转义。
 * 推荐仅传相对文件名（无 `:`）；绝对路径仍做 / 与冒号转义以兼容 Unix。
 */
export function escapeLibvmafFfmpegLogPath(logPath: string): string {
	const trimmed = logPath.trim();
	if (trimmed === "") {
		return trimmed;
	}
	if (!trimmed.includes(":") && !trimmed.includes("\\") && !trimmed.includes("/")) {
		return trimmed;
	}
	const normalized = trimmed.replace(/\\/g, "/");
	return normalized.replace(/:/g, "\\:");
}

export interface IBuildVmafFfmpegFullFilterOptions {
	nThreads?: number;
}

export function buildVmafFfmpegFullFilter(
	input: IBuildVmafFfmpegFilterGraphInput,
	logPath: string,
	vmafModel: string,
	options?: IBuildVmafFfmpegFullFilterOptions,
): string {
	const base = buildVmafFfmpegFilterGraph(input);
	const escapedLogPath = escapeLibvmafFfmpegLogPath(logPath);
	let suffix = "=model=version=" + vmafModel;
	const nThreads = options?.nThreads;
	if (typeof nThreads === "number" && Number.isFinite(nThreads) && nThreads >= 0) {
		suffix += ":n_threads=" + String(Math.floor(nThreads));
	}
	suffix += ":log_fmt=json:log_path=" + escapedLogPath;
	return base + suffix;
}
