import { writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { VMAF_FRAME_ANALYTICS_METHOD_NOTE } from "@worker/domain/vmaf/parseVmafFfmpegFrameAnalytics.js";
import { setCaptureVmafProbeFrameFfmpegSpawnerForTests } from "@worker/domain/screenshot/captureVmafProbeFrameWithFfmpeg.js";
import {
	enrichVmafFrameAnalyticsWithProbeScreenshots,
	VMAF_PROBE_SCREENSHOTS_SKIPPED_REASON_R2_NOT_CONFIGURED,
} from "@worker/domain/screenshot/enrichVmafFrameAnalyticsWithProbeScreenshots.js";
import { setPutProbeScreenshotR2UploaderForTests } from "@worker/domain/screenshot/putProbeScreenshotR2.js";
import type { IDevVideoVmafFrameAnalytics } from "@worker/types/devVideoVmaf.types.js";

const TEST_R2_CONFIG = {
	accountId: "acct",
	bucket: "bucket",
	accessKeyId: "access",
	secretAccessKey: "secret",
	objectKeyPrefix: null,
	publicBaseUrl: "https://cdn.example.com",
};

function buildAnalyticsWithSub75Segments(): IDevVideoVmafFrameAnalytics {
	return {
		methodNote: VMAF_FRAME_ANALYTICS_METHOD_NOTE,
		fps: 30,
		mean: 90,
		min: 65,
		p5: 88,
		thresholds: {
			90: { segmentCount: 0, totalDurationSec: 0, segments: [] },
			75: {
				segmentCount: 4,
				totalDurationSec: 2,
				segments: [
					{
						startSec: 1,
						endSec: 2,
						durationSec: 1,
						minVmaf: 70,
						worstFrameIndex: 30,
						worstSampleSec: 1,
					},
					{
						startSec: 5,
						endSec: 6,
						durationSec: 0.2,
						minVmaf: 60,
						worstFrameIndex: 150,
						worstSampleSec: 5,
					},
					{
						startSec: 8,
						endSec: 9,
						durationSec: 0.5,
						minVmaf: 68,
						worstFrameIndex: 240,
						worstSampleSec: 8,
					},
					{
						startSec: 12,
						endSec: 13,
						durationSec: 0.3,
						minVmaf: 65,
						worstFrameIndex: 360,
						worstSampleSec: 12,
					},
				],
			},
			50: { segmentCount: 0, totalDurationSec: 0, segments: [] },
		},
		screenshotPolicy: {
			threshold: 75,
			maxSegmentsWithScreenshots: 3,
			omittedScreenshotSegmentCount: 0,
		},
		screenshotsSkippedReason: null,
	};
}

afterEach(function (): void {
	setCaptureVmafProbeFrameFfmpegSpawnerForTests(null);
	setPutProbeScreenshotR2UploaderForTests(null);
});

describe("enrichVmafFrameAnalyticsWithProbeScreenshots", function () {
	it("degrades when R2 is not configured", async function (): Promise<void> {
		const result = await enrichVmafFrameAnalyticsWithProbeScreenshots({
			r2Config: null,
			shopDomain: "shop.myshopify.com",
			jobId: "job-1",
			vmafMode: "delivery",
			candidateLabel: "SlimVID (mapped)",
			referenceLabel: "Original source",
			referenceFilePath: "/tmp/ref.mp4",
			distortedFilePath: "/tmp/dist.mp4",
			frameAnalytics: buildAnalyticsWithSub75Segments(),
		});

		expect(result.screenshotsSkippedReason).toBe(
			VMAF_PROBE_SCREENSHOTS_SKIPPED_REASON_R2_NOT_CONFIGURED,
		);
		expect(result.thresholds[75].segments[0].screenshotOmitted).toBe(true);
		expect(result.screenshotPolicy.omittedScreenshotSegmentCount).toBe(1);
	});

	it("attaches screenshots for lowest minVmaf segment first", async function (): Promise<void> {
		setCaptureVmafProbeFrameFfmpegSpawnerForTests(async function (
			_command,
			args,
		): Promise<{ exitCode: number; stderr: string }> {
			const outputIndex = args.indexOf("-y");
			const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
			if (outputPath) {
				await writeFile(outputPath, "png");
			}
			return { exitCode: 0, stderr: "" };
		});
		setPutProbeScreenshotR2UploaderForTests(async function (): Promise<void> {
			return;
		});

		const result = await enrichVmafFrameAnalyticsWithProbeScreenshots({
			r2Config: TEST_R2_CONFIG,
			shopDomain: "shop.myshopify.com",
			jobId: "job-1",
			vmafMode: "delivery",
			candidateLabel: "SlimVID (mapped)",
			referenceLabel: "Original source",
			referenceFilePath: "/tmp/ref.mp4",
			distortedFilePath: "/tmp/dist.mp4",
			frameAnalytics: buildAnalyticsWithSub75Segments(),
		});

		const segments = result.thresholds[75].segments;
		expect(segments[1].screenshots).toHaveLength(2);
		expect(segments[3].screenshots).toHaveLength(2);
		expect(segments[0].screenshotOmitted).toBe(true);
		expect(result.screenshotsSkippedReason).toBeNull();
	});
});
