import { afterEach, describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import { setPutProbeScreenshotR2UploaderForTests } from "@worker/domain/screenshot/putProbeScreenshotR2.js";
import { runVmafPhaseForJob } from "@worker/job/runVmafPhaseForJob.js";
import {
	createProbeComputeJob,
	getProbeComputeJobMutableEntry,
	getProbeComputeJobSnapshot,
	markProbeComputeJobRunning,
	requestProbeComputeJobCancel,
	resetProbeComputeJobStoreForTests,
} from "@worker/job/probeComputeJobStore.memory.js";
import { PROBE_COMPUTE_JOB_SCHEMA_VERSION } from "@worker/types/probeComputeJob.types.js";
import {
	createMockRunVmafPair,
	createMockVmafDownload,
	createMockVmafProbeMetadata,
	createSampleVmafFrameAnalytics,
	MOCK_VMAF_DEPS_BASE,
} from "../fixtures/vmaf.fixtures.js";

const TEST_JOB_ID = "vmaf-job-1";

function seedVmafJob(
	candidateCount = 1,
	options?: { includeScreenshots?: boolean },
): void {
	createProbeComputeJob({
		jobId: TEST_JOB_ID,
		nowMs: Date.now(),
		request: {
			schemaVersion: PROBE_COMPUTE_JOB_SCHEMA_VERSION,
			jobKind: "vmaf",
			caller: {
				shopDomain: "shop.myshopify.com",
				productId: "gid://shopify/Product/1",
				videoId: "gid://shopify/Video/1",
			},
			vmaf: {
				reference: {
					label: "Original source",
					url: "https://cdn.example.com/original.mp4",
				},
				candidates: Array.from({ length: candidateCount }, function buildCandidate(_v, index) {
					return {
						label: `Candidate ${index + 1}`,
						group: "shopify" as const,
						url: `https://cdn.example.com/candidate-${index + 1}.mp4`,
						width: 1280,
						height: 720,
						formatHint: "mp4",
						mimeType: "video/mp4",
					};
				}),
				options: options,
			},
		},
	});
	markProbeComputeJobRunning(TEST_JOB_ID, "vmaf", Date.now());
}

afterEach(function cleanup(): void {
	setPutProbeScreenshotR2UploaderForTests(null);
	resetProbeComputeJobStoreForTests();
});

describe("runVmafPhaseForJob", function () {
	it("appends vmaf rows incrementally for multiple candidates", async function () {
		seedVmafJob(2);

		const report = await runVmafPhaseForJob(
			TEST_JOB_ID,
			Date.now(),
			{
				config: PROBE_WORKER_DEFAULT_CONFIG,
				...MOCK_VMAF_DEPS_BASE,
				probeVideoUrlMetadataFn: createMockVmafProbeMetadata(),
				streamDownloadToTempFileFn: createMockVmafDownload(),
				runVmafPairWithFfmpegFn: createMockRunVmafPair(96),
			},
			Date.now,
		);

		expect(report?.rows).toHaveLength(2);
		expect(report?.rows[0].skipped).toBe(false);
		expect(report?.rows[0].vmafAtDelivery).toBe(96);

		const snapshot = getProbeComputeJobSnapshot(
			TEST_JOB_ID,
			PROBE_WORKER_DEFAULT_CONFIG,
			Date.now(),
		);
		expect(snapshot?.vmafCompletedCandidates).toBe(2);
	});

	it("fails entire job when reference download fails", async function () {
		seedVmafJob(1);

		await expect(
			runVmafPhaseForJob(
				TEST_JOB_ID,
				Date.now(),
				{
					config: PROBE_WORKER_DEFAULT_CONFIG,
					...MOCK_VMAF_DEPS_BASE,
					probeVideoUrlMetadataFn: createMockVmafProbeMetadata(),
					streamDownloadToTempFileFn: createMockVmafDownload({
						failUrlIncludes: "original.mp4",
					}),
				},
				Date.now,
			),
		).rejects.toThrow(/download original source/i);
	});

	it("skips single candidate on download_failed without failing job", async function () {
		seedVmafJob(1);

		const report = await runVmafPhaseForJob(
			TEST_JOB_ID,
			Date.now(),
			{
				config: PROBE_WORKER_DEFAULT_CONFIG,
				...MOCK_VMAF_DEPS_BASE,
				probeVideoUrlMetadataFn: createMockVmafProbeMetadata(),
				streamDownloadToTempFileFn: createMockVmafDownload({
					failUrlIncludes: "candidate-1",
				}),
			},
			Date.now,
		);

		expect(report?.rows).toHaveLength(1);
		expect(report?.rows[0].skipped).toBe(true);
		expect(report?.rows[0].skipReason).toBe("download_failed");
	});

	it("preserves partial rows when cancelled mid-phase", async function () {
		seedVmafJob(1);

		const runPromise = runVmafPhaseForJob(
			TEST_JOB_ID,
			Date.now(),
			{
				config: PROBE_WORKER_DEFAULT_CONFIG,
				...MOCK_VMAF_DEPS_BASE,
				probeVideoUrlMetadataFn: createMockVmafProbeMetadata(),
				streamDownloadToTempFileFn: createMockVmafDownload({ delayMs: 100 }),
				runVmafPairWithFfmpegFn: createMockRunVmafPair(91),
			},
			Date.now,
		);

		await new Promise(function wait(resolve): void {
			setTimeout(resolve, 10);
		});
		requestProbeComputeJobCancel(TEST_JOB_ID, Date.now());

		const report = await runPromise;
		expect(report).toBeNull();

		const entry = getProbeComputeJobMutableEntry(TEST_JOB_ID);
		expect(entry?.status).toBe("cancelled");
	});

	it("skips screenshot upload when includeScreenshots is false", async function () {
		setPutProbeScreenshotR2UploaderForTests(async function (): Promise<void> {
			throw new Error("screenshot upload should not run");
		});

		const frameAnalytics = createSampleVmafFrameAnalytics();
		seedVmafJob(1, { includeScreenshots: false });

		const report = await runVmafPhaseForJob(
			TEST_JOB_ID,
			Date.now(),
			{
				config: PROBE_WORKER_DEFAULT_CONFIG,
				...MOCK_VMAF_DEPS_BASE,
				probeVideoUrlMetadataFn: createMockVmafProbeMetadata(),
				streamDownloadToTempFileFn: createMockVmafDownload(),
				runVmafPairWithFfmpegFn: createMockRunVmafPair(92, frameAnalytics),
				r2Config: {
					accountId: "acct",
					bucket: "bucket",
					accessKeyId: "access",
					secretAccessKey: "secret",
					objectKeyPrefix: null,
					publicBaseUrl: "https://cdn.example.com",
				},
			},
			Date.now,
		);

		expect(report?.rows).toHaveLength(1);
		const deliveryAnalytics = report?.rows[0].vmafFrameAnalytics?.delivery;
		expect(deliveryAnalytics?.thresholds[75].segments[0].screenshots).toBeUndefined();
		expect(deliveryAnalytics?.screenshotsSkippedReason).toBeNull();
	});
});
