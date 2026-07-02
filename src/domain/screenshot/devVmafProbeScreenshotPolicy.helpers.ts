/**
 * 模块名称：VMAF 探针截图策略
 * 模块说明：<75 segment 截图 cap 与段选择纯函数。
 */

import type { IDevVideoVmafFrameSegment } from "../../types/devVideoVmaf.types.js";

export const VMAF_PROBE_SCREENSHOT_THRESHOLD = 75;
export const VMAF_PROBE_MAX_SCREENSHOT_SEGMENTS_PER_MODE = 3;

export interface IVmafProbeScreenshotSegmentCapPlan {
	selectedIndexes: number[];
	omittedScreenshotSegmentCount: number;
}

export function buildVmafProbeScreenshotSegmentCapPlan(
	segments: IDevVideoVmafFrameSegment[],
	maxSegments: number = VMAF_PROBE_MAX_SCREENSHOT_SEGMENTS_PER_MODE,
): IVmafProbeScreenshotSegmentCapPlan {
	if (segments.length === 0 || maxSegments <= 0) {
		return {
			selectedIndexes: [],
			omittedScreenshotSegmentCount: segments.length,
		};
	}

	const ranked = segments
		.map(function (segment, index): { index: number; minVmaf: number } {
			return {
				index: index,
				minVmaf: segment.minVmaf,
			};
		})
		.sort(function (a, b): number {
			if (a.minVmaf !== b.minVmaf) {
				return a.minVmaf - b.minVmaf;
			}
			return a.index - b.index;
		});

	const selectedIndexes = ranked.slice(0, maxSegments).map(function (item): number {
		return item.index;
	});
	selectedIndexes.sort(function (a, b): number {
		return a - b;
	});

	return {
		selectedIndexes: selectedIndexes,
		omittedScreenshotSegmentCount: Math.max(0, segments.length - selectedIndexes.length),
	};
}

export function shouldContinueVmafProbeScreenshotLoop(shouldAbort?: () => boolean): boolean {
	if (!shouldAbort) {
		return true;
	}
	return !shouldAbort();
}
