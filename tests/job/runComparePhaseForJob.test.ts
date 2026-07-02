import { afterEach, describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import { runComparePhaseForJob } from "@worker/job/runComparePhaseForJob.js";
import {
	createProbeComputeJob,
	getProbeComputeJobMutableEntry,
	getProbeComputeJobSnapshot,
	markProbeComputeJobRunning,
	resetProbeComputeJobStoreForTests,
} from "@worker/job/probeComputeJobStore.memory.js";
import { PROBE_COMPUTE_JOB_SCHEMA_VERSION } from "@worker/types/probeComputeJob.types.js";
import { createMockProbeVideoUrlMetadata } from "../fixtures/probe.fixtures.js";

const TEST_JOB_ID = "compare-job-1";

function seedCompareJob(renditionCount: number): void {
	createProbeComputeJob({
		jobId: TEST_JOB_ID,
		nowMs: Date.now(),
		request: {
			schemaVersion: PROBE_COMPUTE_JOB_SCHEMA_VERSION,
			jobKind: "compare",
			caller: {
				shopDomain: "shop.myshopify.com",
				productId: "gid://shopify/Product/1",
				videoId: "gid://shopify/Video/1",
			},
			compare: {
				productName: "Demo Product",
				renditions: Array.from({ length: renditionCount }, function buildRendition(_value, index) {
					return {
						group: "shopify" as const,
						label: `Rendition ${index + 1}`,
						url: `https://cdn.example.com/video-${index + 1}.mp4`,
					};
				}),
			},
		},
	});
	markProbeComputeJobRunning(TEST_JOB_ID, "compare", Date.now());
}

afterEach(function cleanup(): void {
	resetProbeComputeJobStoreForTests();
});

describe("runComparePhaseForJob", function () {
	it("probes renditions in parallel and increments completed count", async function () {
		seedCompareJob(2);
		let inFlight = 0;
		let maxInFlight = 0;

		const compareResult = await runComparePhaseForJob(TEST_JOB_ID, {
			config: PROBE_WORKER_DEFAULT_CONFIG,
			probeVideoUrlMetadataFn: createMockProbeVideoUrlMetadata(async function slowProbe(url) {
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await new Promise(function wait(resolve): void {
					setTimeout(resolve, 20);
				});
				inFlight -= 1;
				return {
					url,
					width: 1920,
					height: 1080,
					frameRateFps: 30,
					bitrateKbps: 3000,
					codec: "h264",
					format: "mp4",
					container: "mp4",
					durationSeconds: 12,
					sizeBytes: 2_000_000,
				};
			}),
		});

		expect(compareResult.renditions).toHaveLength(2);
		expect(maxInFlight).toBeGreaterThan(1);

		const snapshot = getProbeComputeJobSnapshot(
			TEST_JOB_ID,
			PROBE_WORKER_DEFAULT_CONFIG,
			Date.now(),
		);
		expect(snapshot?.compareCompletedRenditions).toBe(2);
		expect(snapshot?.compareResult?.renditions).toHaveLength(2);
		expect(snapshot?.compareResult?.productName).toBe("Demo Product");
		expect(snapshot?.compareResult).not.toHaveProperty("comparisons");
	});

	it("fails entire job when any rendition probe throws", async function () {
		seedCompareJob(2);

		await expect(
			runComparePhaseForJob(TEST_JOB_ID, {
				config: PROBE_WORKER_DEFAULT_CONFIG,
				probeVideoUrlMetadataFn: createMockProbeVideoUrlMetadata(async function failSecond(url) {
					if (url.includes("video-2")) {
						throw new Error("ffprobe unreachable");
					}
					return {
						url,
						width: 1280,
						height: 720,
						frameRateFps: 30,
						bitrateKbps: 2000,
						codec: "h264",
						format: "mp4",
						container: "mp4",
						durationSeconds: 10,
						sizeBytes: 1_000_000,
					};
				}),
			}),
		).rejects.toThrow(/unreachable/i);

		const entry = getProbeComputeJobMutableEntry(TEST_JOB_ID);
		expect(entry?.compareCompletedRenditions).toBeLessThan(2);
	});
});
