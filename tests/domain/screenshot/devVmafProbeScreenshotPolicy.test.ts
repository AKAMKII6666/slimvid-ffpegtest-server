import { describe, expect, it } from "vitest";

import {
	buildVmafProbeScreenshotSegmentCapPlan,
	shouldContinueVmafProbeScreenshotLoop,
	VMAF_PROBE_MAX_SCREENSHOT_SEGMENTS_PER_MODE,
} from "@worker/domain/screenshot/devVmafProbeScreenshotPolicy.helpers.js";
import type { IDevVideoVmafFrameSegment } from "@worker/types/devVideoVmaf.types.js";

function buildSegment(minVmaf: number): IDevVideoVmafFrameSegment {
	return {
		startSec: 0,
		endSec: 1,
		durationSec: 1,
		minVmaf: minVmaf,
		worstFrameIndex: 0,
		worstSampleSec: 0,
	};
}

describe("devVmafProbeScreenshotPolicy", function () {
	it("selects up to three lowest minVmaf segments", function (): void {
		const segments = [
			buildSegment(70),
			buildSegment(68),
			buildSegment(72),
			buildSegment(65),
			buildSegment(71),
		];

		const plan = buildVmafProbeScreenshotSegmentCapPlan(segments);
		expect(plan.selectedIndexes).toEqual([0, 1, 3]);
		expect(plan.omittedScreenshotSegmentCount).toBe(2);
	});

	it("uses default cap constant of three", function (): void {
		const segments = [buildSegment(80), buildSegment(79), buildSegment(78), buildSegment(77)];
		const plan = buildVmafProbeScreenshotSegmentCapPlan(segments);
		expect(plan.selectedIndexes).toHaveLength(VMAF_PROBE_MAX_SCREENSHOT_SEGMENTS_PER_MODE);
	});

	it("shouldContinueVmafProbeScreenshotLoop respects shouldAbort", function (): void {
		expect(shouldContinueVmafProbeScreenshotLoop()).toBe(true);
		expect(
			shouldContinueVmafProbeScreenshotLoop(function (): boolean {
				return true;
			}),
		).toBe(false);
	});
});
