import { afterEach, describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import {
	createProbeComputeJob,
	getProbeComputeJobSnapshot,
	markProbeComputeJobFailed,
	requestProbeComputeJobCancel,
	resetProbeComputeJobStoreForTests,
} from "@worker/job/probeComputeJobStore.memory.js";
import { PROBE_COMPUTE_JOB_SCHEMA_VERSION } from "@worker/types/probeComputeJob.types.js";

const config = PROBE_WORKER_DEFAULT_CONFIG;

afterEach(function cleanup(): void {
	resetProbeComputeJobStoreForTests();
});

describe("probeComputeJobStore", function () {
	it("creates pending job and retrieves snapshot", function () {
		const snapshot = createProbeComputeJob({
			jobId: "job-1",
			nowMs: 1_000,
			request: {
				schemaVersion: PROBE_COMPUTE_JOB_SCHEMA_VERSION,
				jobKind: "compare",
				caller: {
					shopDomain: "shop.myshopify.com",
					productId: "gid://shopify/Product/1",
					videoId: "gid://shopify/Video/1",
				},
				compare: {
					productName: "Demo",
					renditions: [
						{
							group: "shopify",
							label: "Original",
							url: "https://cdn.example.com/a.mp4",
						},
					],
				},
			},
		});

		expect(snapshot.status).toBe("pending");
		expect(getProbeComputeJobSnapshot("job-1", config, 2_000)?.jobId).toBe("job-1");
	});

	it("cancels pending job immediately", function () {
		createProbeComputeJob({
			jobId: "job-cancel",
			nowMs: 1_000,
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
						url: "https://cdn.example.com/ref.mp4",
					},
					candidates: [
						{
							label: "720p",
							group: "shopify",
							url: "https://cdn.example.com/720p.mp4",
							width: 1280,
							height: 720,
							formatHint: "mp4",
							mimeType: "video/mp4",
						},
					],
				},
			},
		});

		const cancelled = requestProbeComputeJobCancel("job-cancel", 1_500);
		expect(cancelled?.status).toBe("cancelled");
	});

	it("purges terminal job after terminalRetainMs", function () {
		createProbeComputeJob({
			jobId: "job-expire",
			nowMs: 0,
			request: {
				schemaVersion: PROBE_COMPUTE_JOB_SCHEMA_VERSION,
				jobKind: "compare",
				caller: {
					shopDomain: "shop.myshopify.com",
					productId: "gid://shopify/Product/1",
					videoId: "gid://shopify/Video/1",
				},
				compare: {
					productName: "Demo",
					renditions: [
						{
							group: "shopify",
							label: "Original",
							url: "https://cdn.example.com/a.mp4",
						},
					],
				},
			},
		});

		markProbeComputeJobFailed("job-expire", "boom", 100);
		const expiredAt = 100 + config.job.terminalRetainMs + 1;
		expect(getProbeComputeJobSnapshot("job-expire", config, expiredAt)).toBeNull();
	});
});
