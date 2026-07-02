/**
 * 模块名称：VMAF 逐帧分数分析
 * 模块说明：将逐帧 VMAF 合并为三档阈值 segment 统计（90 / 75 / 50）。
 */

export const VMAF_FRAME_ANALYTICS_THRESHOLDS = [90, 75, 50] as const;

export type TVmafFrameAnalyticsThreshold = (typeof VMAF_FRAME_ANALYTICS_THRESHOLDS)[number];

export interface IVmafFrameScoreInput {
	frameIndex: number;
	vmaf: number;
}

export interface IVmafFrameSegment {
	startSec: number;
	endSec: number;
	durationSec: number;
	minVmaf: number;
	worstFrameIndex: number;
	worstSampleSec: number;
}

export interface IVmafFrameThresholdAnalytics {
	segmentCount: number;
	totalDurationSec: number;
	segments: IVmafFrameSegment[];
}

export interface IVmafFrameScoreAnalytics {
	fps: number;
	mean: number;
	min: number;
	p5: number;
	thresholds: Record<TVmafFrameAnalyticsThreshold, IVmafFrameThresholdAnalytics>;
}

function roundVmafAnalyticsNumber(value: number): number {
	return Math.round(value * 100) / 100;
}

function frameIndexToSec(frameIndex: number, fps: number): number {
	return roundVmafAnalyticsNumber(frameIndex / fps);
}

function computePercentileFromSorted(sortedAsc: number[], percentile: number): number {
	if (sortedAsc.length === 0) {
		return 0;
	}
	if (sortedAsc.length === 1) {
		return roundVmafAnalyticsNumber(sortedAsc[0]);
	}

	const rank = (percentile / 100) * (sortedAsc.length - 1);
	const lowerIndex = Math.floor(rank);
	const upperIndex = Math.ceil(rank);
	if (lowerIndex === upperIndex) {
		return roundVmafAnalyticsNumber(sortedAsc[lowerIndex]);
	}

	const weight = rank - lowerIndex;
	const interpolated =
		sortedAsc[lowerIndex] * (1 - weight) + sortedAsc[upperIndex] * weight;
	return roundVmafAnalyticsNumber(interpolated);
}

function buildVmafFrameSegment(
	segmentFrames: IVmafFrameScoreInput[],
	fps: number,
): IVmafFrameSegment {
	const firstFrame = segmentFrames[0];
	const lastFrame = segmentFrames[segmentFrames.length - 1];

	let worstFrame = segmentFrames[0];
	for (const frame of segmentFrames) {
		if (frame.vmaf < worstFrame.vmaf) {
			worstFrame = frame;
		}
	}

	const startSec = frameIndexToSec(firstFrame.frameIndex, fps);
	const endSec = frameIndexToSec(lastFrame.frameIndex + 1, fps);
	const durationSec = roundVmafAnalyticsNumber(segmentFrames.length / fps);

	return {
		startSec: startSec,
		endSec: endSec,
		durationSec: durationSec,
		minVmaf: roundVmafAnalyticsNumber(worstFrame.vmaf),
		worstFrameIndex: worstFrame.frameIndex,
		worstSampleSec: frameIndexToSec(worstFrame.frameIndex, fps),
	};
}

export function mergeVmafFramesBelowThreshold(
	frames: IVmafFrameScoreInput[],
	threshold: number,
	fps: number,
): IVmafFrameThresholdAnalytics {
	const segments: IVmafFrameSegment[] = [];
	let openSegmentFrames: IVmafFrameScoreInput[] = [];

	for (const frame of frames) {
		if (frame.vmaf < threshold) {
			openSegmentFrames.push(frame);
			continue;
		}

		if (openSegmentFrames.length > 0) {
			segments.push(buildVmafFrameSegment(openSegmentFrames, fps));
			openSegmentFrames = [];
		}
	}

	if (openSegmentFrames.length > 0) {
		segments.push(buildVmafFrameSegment(openSegmentFrames, fps));
	}

	let totalDurationSec = 0;
	for (const segment of segments) {
		totalDurationSec += segment.durationSec;
	}

	return {
		segmentCount: segments.length,
		totalDurationSec: roundVmafAnalyticsNumber(totalDurationSec),
		segments: segments,
	};
}

export function analyzeVmafFrameScores(
	frames: IVmafFrameScoreInput[],
	fps: number,
): IVmafFrameScoreAnalytics | null {
	if (!Number.isFinite(fps) || fps <= 0) {
		return null;
	}

	const validFrames: IVmafFrameScoreInput[] = [];
	for (const frame of frames) {
		if (
			typeof frame.frameIndex === "number" &&
			Number.isFinite(frame.frameIndex) &&
			frame.frameIndex >= 0 &&
			typeof frame.vmaf === "number" &&
			Number.isFinite(frame.vmaf)
		) {
			validFrames.push(frame);
		}
	}

	if (validFrames.length === 0) {
		return null;
	}

	validFrames.sort(function (a, b): number {
		return a.frameIndex - b.frameIndex;
	});

	const vmafValues = validFrames.map(function (frame): number {
		return frame.vmaf;
	});
	const sortedAsc = [...vmafValues].sort(function (a, b): number {
		return a - b;
	});

	let sum = 0;
	for (const value of vmafValues) {
		sum += value;
	}

	const mean = roundVmafAnalyticsNumber(sum / vmafValues.length);
	const min = roundVmafAnalyticsNumber(sortedAsc[0]);
	const p5 = computePercentileFromSorted(sortedAsc, 5);

	const thresholds = {
		90: mergeVmafFramesBelowThreshold(validFrames, 90, fps),
		75: mergeVmafFramesBelowThreshold(validFrames, 75, fps),
		50: mergeVmafFramesBelowThreshold(validFrames, 50, fps),
	} as Record<TVmafFrameAnalyticsThreshold, IVmafFrameThresholdAnalytics>;

	return {
		fps: fps,
		mean: mean,
		min: min,
		p5: p5,
		thresholds: thresholds,
	};
}
