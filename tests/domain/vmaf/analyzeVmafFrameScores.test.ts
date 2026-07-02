import { describe, expect, it } from "vitest";

import {
	analyzeVmafFrameScores,
	mergeVmafFramesBelowThreshold,
	type IVmafFrameScoreInput,
} from "@worker/domain/vmaf/analyzeVmafFrameScores.helpers.js";

describe("analyzeVmafFrameScores", function () {
	const fps = 10;

	it("merges consecutive low frames into one segment per threshold", function () {
		const frames: IVmafFrameScoreInput[] = [
			{ frameIndex: 0, vmaf: 95 },
			{ frameIndex: 1, vmaf: 88 },
			{ frameIndex: 2, vmaf: 86 },
			{ frameIndex: 3, vmaf: 95 },
			{ frameIndex: 4, vmaf: 70 },
			{ frameIndex: 5, vmaf: 68 },
			{ frameIndex: 6, vmaf: 40 },
		];

		const result = analyzeVmafFrameScores(frames, fps);
		expect(result).not.toBeNull();
		expect(result?.thresholds[90].segmentCount).toBe(2);
		expect(result?.thresholds[75].segmentCount).toBe(1);
	});

	it("returns null when fps is invalid", function () {
		expect(analyzeVmafFrameScores([{ frameIndex: 0, vmaf: 90 }], 0)).toBeNull();
	});
});

describe("mergeVmafFramesBelowThreshold", function () {
	it("returns empty segments when all frames pass threshold", function () {
		const result = mergeVmafFramesBelowThreshold(
			[
				{ frameIndex: 0, vmaf: 95 },
				{ frameIndex: 1, vmaf: 96 },
			],
			90,
			10,
		);
		expect(result.segmentCount).toBe(0);
	});
});
