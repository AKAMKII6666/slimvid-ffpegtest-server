/**
 * 模块名称：VMAF ffmpeg 滤镜图构建
 * 模块说明：delivery（reference downscale）与 display1080p；支持 CPU libvmaf 与 CUDA libvmaf_cuda。
 */

import type { TVmafExecutionMode } from "../ffmpeg/probeRuntimeCapabilities.js";

export type TVmafFfmpegMode = "delivery" | "display1080p";

export interface IBuildVmafFfmpegFilterGraphInput {
	mode: TVmafFfmpegMode;
	deliveryWidth?: number;
	deliveryHeight?: number;
	executionMode?: TVmafExecutionMode;
}

export const VMAF_DISPLAY_CANVAS_WIDTH = 1920;
export const VMAF_DISPLAY_CANVAS_HEIGHT = 1080;

export const VMAF_FFMPEG_FILTER_CPU = "libvmaf";
export const VMAF_FFMPEG_FILTER_CUDA = "libvmaf_cuda";

function resolveVmafFilterName(executionMode: TVmafExecutionMode): string {
	return executionMode === "cuda" ? VMAF_FFMPEG_FILTER_CUDA : VMAF_FFMPEG_FILTER_CPU;
}

function buildDisplayNormalizeChain(
	executionMode: TVmafExecutionMode,
	width: number,
	height: number,
): string {
	if (executionMode === "cuda") {
		return (
			"scale_cuda=" +
			String(width) +
			":" +
			String(height) +
			":force_original_aspect_ratio=decrease:force_divisible_by=2:format=yuv420p," +
			"pad_cuda=" +
			String(width) +
			":" +
			String(height) +
			":(ow-iw)/2:(oh-ih)/2:color=black"
		);
	}

	return (
		"scale=" +
		String(width) +
		":" +
		String(height) +
		":force_original_aspect_ratio=decrease," +
		"pad=" +
		String(width) +
		":" +
		String(height) +
		":(ow-iw)/2:(oh-ih)/2:black"
	);
}

function buildDeliveryReferenceScaleChain(
	executionMode: TVmafExecutionMode,
	deliveryWidth: number,
	deliveryHeight: number,
): string {
	const width = Math.round(deliveryWidth);
	const height = Math.round(deliveryHeight);

	if (executionMode === "cuda") {
		return "scale_cuda=" + String(width) + ":" + String(height) + ":format=yuv420p";
	}

	return "scale=" + String(width) + ":" + String(height) + ":flags=bicubic";
}

function buildDistortedDeliveryChain(executionMode: TVmafExecutionMode): string {
	if (executionMode === "cuda") {
		return "[0:v]scale_cuda=format=yuv420p,setpts=PTS-STARTPTS[dist];";
	}

	return "[0:v]setpts=PTS-STARTPTS[dist];";
}

export function buildVmafFfmpegFilterGraph(input: IBuildVmafFfmpegFilterGraphInput): string {
	const executionMode = input.executionMode ?? "cpu";
	const vmafFilter = resolveVmafFilterName(executionMode);

	if (input.mode === "display1080p") {
		const width = VMAF_DISPLAY_CANVAS_WIDTH;
		const height = VMAF_DISPLAY_CANVAS_HEIGHT;
		const normalize = buildDisplayNormalizeChain(executionMode, width, height);
		return (
			"[0:v]" +
			normalize +
			",setpts=PTS-STARTPTS[dist];" +
			"[1:v]" +
			normalize +
			",setpts=PTS-STARTPTS[ref];" +
			"[dist][ref]" +
			vmafFilter
		);
	}

	const deliveryWidth = input.deliveryWidth;
	const deliveryHeight = input.deliveryHeight;
	if (
		typeof deliveryWidth !== "number" ||
		typeof deliveryHeight !== "number" ||
		!Number.isFinite(deliveryWidth) ||
		!Number.isFinite(deliveryHeight) ||
		deliveryWidth <= 0 ||
		deliveryHeight <= 0
	) {
		throw new Error("delivery VMAF requires positive deliveryWidth and deliveryHeight");
	}

	const refScale = buildDeliveryReferenceScaleChain(executionMode, deliveryWidth, deliveryHeight);
	const distChain = buildDistortedDeliveryChain(executionMode);

	return (
		"[1:v]" +
		refScale +
		",setpts=PTS-STARTPTS[ref];" +
		distChain +
		"[dist][ref]" +
		vmafFilter
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
