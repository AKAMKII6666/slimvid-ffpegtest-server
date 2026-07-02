import { afterEach, describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import { createProbeComputeJobScheduler } from "@worker/job/probeComputeJobScheduler.js";
import { resetProbeComputeJobStoreForTests } from "@worker/job/probeComputeJobStore.memory.js";
import { createProbeComputeJob } from "@worker/job/probeComputeJobStore.memory.js";
import { PROBE_COMPUTE_JOB_SCHEMA_VERSION } from "@worker/types/probeComputeJob.types.js";

const vmafOnlyConfig = {
	...PROBE_WORKER_DEFAULT_CONFIG,
	concurrency: {
		maxVmafJobs: 1,
		maxFfprobeParallel: 4,
		maxVmafCandidatesParallel: 2,
	},
};

function createVmafJob(jobId: string): void {
	createProbeComputeJob({
		jobId,
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
}

afterEach(function cleanup(): void {
	resetProbeComputeJobStoreForTests();
});

describe("probeComputeJobQueue", function () {
	it("keeps second job pending when vmaf slot is full", function () {
		const scheduler = createProbeComputeJobScheduler({
			config: vmafOnlyConfig,
			nowMs: Date.now,
		});

		createVmafJob("job-1");
		createVmafJob("job-2");

		scheduler.enqueue("job-1");
		scheduler.enqueue("job-2");

		expect(scheduler.getRunningVmafJobs()).toBe(1);
		expect(scheduler.getPendingJobIds()).toContain("job-2");
	});
});
