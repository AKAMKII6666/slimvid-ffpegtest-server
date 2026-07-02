/**
 * 模块名称：VMAF ffmpeg 逐帧 JSON 解析
 * 模块说明：从 libvmaf log_fmt=json 提取逐帧曲线并生成 segment 统计。
 */

import {
	analyzeVmafFrameScores,
	type IVmafFrameScoreInput,
} from "./analyzeVmafFrameScores.helpers.js";
import {
	parseVmafFfmpegJsonMean,
	parseVmafFfmpegJsonMin,
} from "./parseVmafFfmpegJson.js";
import type { IDevVideoVmafFrameAnalytics } from "../../types/devVideoVmaf.types.js";

interface IVmafFfmpegJsonFramePayload {
	frameNum?: number;
	metrics?: {
		vmaf?: number;
	};
}

interface IVmafFfmpegJsonAnalyticsPayload {
	frames?: IVmafFfmpegJsonFramePayload[];
	pooled_metrics?: {
		vmaf?: {
			mean?: number;
			min?: number;
		};
	};
}

export const VMAF_FRAME_ANALYTICS_METHOD_NOTE =
	"Per-frame VMAF merged into contiguous segments per threshold (90/75/50). segmentCount = number of segments; totalDurationSec = sum of segment durations. Screenshots only for sub-75 segments, one sample at the segment minimum-VMAF frame (reference + distorted on R2).";

export function extractVmafFrameScoresFromFfmpegJson(jsonText: string): IVmafFrameScoreInput[] {
	const trimmed = jsonText.trim();
	if (trimmed === "") {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed) as IVmafFfmpegJsonAnalyticsPayload;
	} catch {
		return [];
	}

	if (!parsed || typeof parsed !== "object") {
		return [];
	}

	const payload = parsed as IVmafFfmpegJsonAnalyticsPayload;
	if (!Array.isArray(payload.frames)) {
		return [];
	}

	const frames: IVmafFrameScoreInput[] = [];
	for (const frame of payload.frames) {
		if (!frame || typeof frame !== "object") {
			continue;
		}

		const frameNum = frame.frameNum;
		const vmaf = frame.metrics?.vmaf;
		if (
			typeof frameNum !== "number" ||
			!Number.isFinite(frameNum) ||
			frameNum < 0 ||
			typeof vmaf !== "number" ||
			!Number.isFinite(vmaf)
		) {
			continue;
		}

		frames.push({
			frameIndex: frameNum,
			vmaf: vmaf,
		});
	}

	return frames;
}

export function parseVmafFfmpegFrameAnalytics(
	jsonText: string,
	fps: number,
): IDevVideoVmafFrameAnalytics | null {
	const frameScores = extractVmafFrameScoresFromFfmpegJson(jsonText);
	const analyzed = analyzeVmafFrameScores(frameScores, fps);
	if (!analyzed) {
		return null;
	}

	const pooledMean = parseVmafFfmpegJsonMean(jsonText);
	const pooledMin = parseVmafFfmpegJsonMin(jsonText);

	return {
		methodNote: VMAF_FRAME_ANALYTICS_METHOD_NOTE,
		fps: analyzed.fps,
		mean: pooledMean ?? analyzed.mean,
		min: pooledMin ?? analyzed.min,
		p5: analyzed.p5,
		thresholds: analyzed.thresholds,
		screenshotPolicy: {
			threshold: 75,
			maxSegmentsWithScreenshots: 3,
			omittedScreenshotSegmentCount: 0,
		},
		screenshotsSkippedReason: null,
	};
}
