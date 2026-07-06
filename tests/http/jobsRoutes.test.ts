import { afterEach, describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import { createProbeWorkerApp } from "@worker/http/createProbeWorkerApp.js";
import { resetClientJobIdIndexForTests } from "@worker/job/probeComputeJobClientIdIndex.memory.js";
import {
	createProbeComputeJobScheduler,
	resetProbeComputeJobSchedulerForTests,
} from "@worker/job/probeComputeJobScheduler.js";
import { resetProbeComputeJobStoreForTests } from "@worker/job/probeComputeJobStore.memory.js";
import {
	AUTH_HEADERS,
	VALID_COMPARE_JOB_BODY,
	VALID_UNIFIED_JOB_BODY,
	VALID_VMAF_JOB_BODY,
} from "../fixtures/jobApi.fixtures.js";
import { createMockProbeVideoUrlMetadata } from "../fixtures/probe.fixtures.js";
import {
	createMockRunVmafPair,
	createMockVmafDownload,
	createMockVmafProbeMetadata,
	MOCK_VMAF_DEPS_BASE,
} from "../fixtures/vmaf.fixtures.js";

const TEST_TOKEN = "test-token";

function buildMockVmafDeps(downloadDelayMs?: number) {
	return {
		config: PROBE_WORKER_DEFAULT_CONFIG,
		...MOCK_VMAF_DEPS_BASE,
		probeVideoUrlMetadataFn: createMockVmafProbeMetadata(),
		streamDownloadToTempFileFn: createMockVmafDownload({ delayMs: downloadDelayMs }),
		runVmafPairWithFfmpegFn: createMockRunVmafPair(95.5),
	};
}

async function createTestApp() {
	const mockProbe = createMockProbeVideoUrlMetadata();
	const vmafDeps = buildMockVmafDeps();
	const scheduler = createProbeComputeJobScheduler({
		config: PROBE_WORKER_DEFAULT_CONFIG,
		nowMs: Date.now,
		compareDeps: {
			config: PROBE_WORKER_DEFAULT_CONFIG,
			probeVideoUrlMetadataFn: mockProbe,
		},
		vmafDeps,
	});
	return createProbeWorkerApp({
		config: PROBE_WORKER_DEFAULT_CONFIG,
		authToken: TEST_TOKEN,
		scheduler,
		compareDeps: {
			config: PROBE_WORKER_DEFAULT_CONFIG,
			probeVideoUrlMetadataFn: mockProbe,
		},
		vmafDeps,
	});
}

afterEach(function cleanup(): void {
	resetProbeComputeJobStoreForTests();
	resetClientJobIdIndexForTests();
	resetProbeComputeJobSchedulerForTests();
});

describe("jobs routes", function () {
	it("POST /v1/jobs creates pending job", async function () {
		const app = await createTestApp();

		const response = await app.inject({
			method: "POST",
			url: "/v1/jobs",
			headers: AUTH_HEADERS,
			payload: VALID_COMPARE_JOB_BODY,
		});

		expect(response.statusCode).toBe(200);
		const body = response.json() as {
			ok: boolean;
			data: { jobId: string; status: string };
		};
		expect(body.ok).toBe(true);
		expect(body.data.status).toBe("pending");
		expect(body.data.jobId).toBeTruthy();

		await app.close();
	});

	it("GET /v1/jobs/:jobId returns 404 for unknown job", async function () {
		const app = await createTestApp();

		const response = await app.inject({
			method: "GET",
			url: "/v1/jobs/unknown-job",
			headers: AUTH_HEADERS,
		});

		expect(response.statusCode).toBe(404);
		await app.close();
	});

	it("deduplicates clientJobId within TTL", async function () {
		const app = await createTestApp();

		const first = await app.inject({
			method: "POST",
			url: "/v1/jobs",
			headers: AUTH_HEADERS,
			payload: VALID_VMAF_JOB_BODY,
		});
		const second = await app.inject({
			method: "POST",
			url: "/v1/jobs",
			headers: AUTH_HEADERS,
			payload: VALID_VMAF_JOB_BODY,
		});

		const firstBody = first.json() as { data: { jobId: string } };
		const secondBody = second.json() as { data: { jobId: string } };
		expect(secondBody.data.jobId).toBe(firstBody.data.jobId);

		await app.close();
	});

	it("POST cancel on pending job returns cancelled", async function () {
		const scheduler = createProbeComputeJobScheduler({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			nowMs: Date.now,
			vmafDeps: buildMockVmafDeps(500),
		});
		const app = await createProbeWorkerApp({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			authToken: TEST_TOKEN,
			scheduler,
		});

		const created = await app.inject({
			method: "POST",
			url: "/v1/jobs",
			headers: AUTH_HEADERS,
			payload: VALID_VMAF_JOB_BODY,
		});
		const createdBody = created.json() as { data: { jobId: string } };

		const cancelled = await app.inject({
			method: "POST",
			url: `/v1/jobs/${createdBody.data.jobId}/cancel`,
			headers: AUTH_HEADERS,
			payload: { reason: "batch_cancel" },
		});

		expect(cancelled.statusCode).toBe(200);
		const cancelBody = cancelled.json() as { data: { status: string } };
		expect(cancelBody.data.status).toBe("cancelled");

		await app.close();
	});

	it("poll exposes compare progress while running", async function () {
		const serialCompareConfig = {
			...PROBE_WORKER_DEFAULT_CONFIG,
			concurrency: {
				...PROBE_WORKER_DEFAULT_CONFIG.concurrency,
				maxFfprobeParallel: 1,
			},
		};
		const mockProbe = createMockProbeVideoUrlMetadata(async function slowProbe(url) {
			await new Promise(function wait(resolve): void {
				setTimeout(resolve, 80);
			});
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
		});
		const scheduler = createProbeComputeJobScheduler({
			config: serialCompareConfig,
			nowMs: Date.now,
			compareDeps: {
				config: serialCompareConfig,
				probeVideoUrlMetadataFn: mockProbe,
			},
		});
		const app = await createProbeWorkerApp({
			config: serialCompareConfig,
			authToken: TEST_TOKEN,
			scheduler,
		});

		const created = await app.inject({
			method: "POST",
			url: "/v1/jobs",
			headers: AUTH_HEADERS,
			payload: {
				...VALID_COMPARE_JOB_BODY,
				compare: {
					...VALID_COMPARE_JOB_BODY.compare,
					renditions: [
						VALID_COMPARE_JOB_BODY.compare.renditions[0],
						{
							group: "slimvid",
							label: "Compressed",
							url: "https://cdn.example.com/compressed.mp4",
						},
					],
				},
			},
		});
		const createdBody = created.json() as { data: { jobId: string } };

		let sawPartialProgress = false;
		for (let attempt = 0; attempt < 30; attempt += 1) {
			await new Promise(function wait(resolve): void {
				setTimeout(resolve, 5);
			});
			const polled = await app.inject({
				method: "GET",
				url: `/v1/jobs/${createdBody.data.jobId}`,
				headers: AUTH_HEADERS,
			});
			const pollBody = polled.json() as {
				data: {
					status: string;
					compare?: { completedRenditions: number; totalRenditions: number };
				};
			};
			if (
				pollBody.data.status === "running" &&
				pollBody.data.compare &&
				pollBody.data.compare.completedRenditions > 0 &&
				pollBody.data.compare.completedRenditions < pollBody.data.compare.totalRenditions
			) {
				sawPartialProgress = true;
				break;
			}
			if (pollBody.data.status === "ready" || pollBody.data.status === "failed") {
				break;
			}
		}

		expect(sawPartialProgress).toBe(true);
		await app.close();
	});

	it("poll reaches ready with compareResult and vmafReport for unified job", async function () {
		const app = await createTestApp();

		const created = await app.inject({
			method: "POST",
			url: "/v1/jobs",
			headers: AUTH_HEADERS,
			payload: VALID_UNIFIED_JOB_BODY,
		});
		const createdBody = created.json() as { data: { jobId: string } };

		let finalStatus = "pending";
		let pollBody: {
			ok: boolean;
			data: {
				status: string;
				phase?: string;
				compareResult?: { renditions: unknown[] };
				vmafReport?: { rows: unknown[] };
			};
		} = { ok: false, data: { status: "pending" } };

		for (let attempt = 0; attempt < 80; attempt += 1) {
			await new Promise(function wait(resolve): void {
				setTimeout(resolve, 25);
			});
			const polled = await app.inject({
				method: "GET",
				url: `/v1/jobs/${createdBody.data.jobId}`,
				headers: AUTH_HEADERS,
			});
			pollBody = polled.json();
			finalStatus = pollBody.data.status;
			if (finalStatus === "ready" || finalStatus === "failed" || finalStatus === "cancelled") {
				break;
			}
		}

		expect(finalStatus).toBe("ready");
		expect(pollBody.data.compareResult?.renditions.length).toBeGreaterThan(0);
		expect(pollBody.data.vmafReport?.rows.length).toBeGreaterThan(0);

		await app.close();
	});

	it("marks compare job failed when every rendition probe fails", async function () {
		const failingProbe = createMockProbeVideoUrlMetadata(async function failProbe() {
			throw new Error("ffprobe failed");
		});
		const scheduler = createProbeComputeJobScheduler({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			nowMs: Date.now,
			compareDeps: {
				config: PROBE_WORKER_DEFAULT_CONFIG,
				probeVideoUrlMetadataFn: failingProbe,
			},
		});
		const app = await createProbeWorkerApp({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			authToken: TEST_TOKEN,
			scheduler,
		});

		const created = await app.inject({
			method: "POST",
			url: "/v1/jobs",
			headers: AUTH_HEADERS,
			payload: VALID_COMPARE_JOB_BODY,
		});
		const createdBody = created.json() as { data: { jobId: string } };

		let finalStatus = "pending";
		let errorMessage = "";
		for (let attempt = 0; attempt < 80; attempt += 1) {
			await new Promise(function wait(resolve): void {
				setTimeout(resolve, 25);
			});
			const polled = await app.inject({
				method: "GET",
				url: `/v1/jobs/${createdBody.data.jobId}`,
				headers: AUTH_HEADERS,
			});
			const body = polled.json() as { data: { status: string; errorMessage?: string } };
			finalStatus = body.data.status;
			errorMessage = body.data.errorMessage ?? "";
			if (finalStatus === "failed") {
				break;
			}
		}

		expect(finalStatus).toBe("failed");
		expect(errorMessage).toMatch(/probed zero renditions/i);
		await app.close();
	});

	it("unified job does not run vmaf when compare phase fails", async function () {
		const failingProbe = createMockProbeVideoUrlMetadata(async function failProbe() {
			throw new Error("ffprobe failed");
		});
		const scheduler = createProbeComputeJobScheduler({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			nowMs: Date.now,
			compareDeps: {
				config: PROBE_WORKER_DEFAULT_CONFIG,
				probeVideoUrlMetadataFn: failingProbe,
			},
			vmafDeps: buildMockVmafDeps(),
		});
		const app = await createProbeWorkerApp({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			authToken: TEST_TOKEN,
			scheduler,
		});

		const created = await app.inject({
			method: "POST",
			url: "/v1/jobs",
			headers: AUTH_HEADERS,
			payload: VALID_UNIFIED_JOB_BODY,
		});
		const createdBody = created.json() as { data: { jobId: string } };

		let pollBody: {
			data: {
				status: string;
				phase?: string;
				vmafReport?: { rows: unknown[] };
				vmaf?: { completedCandidates: number };
			};
		} = { data: { status: "pending" } };

		for (let attempt = 0; attempt < 80; attempt += 1) {
			await new Promise(function wait(resolve): void {
				setTimeout(resolve, 25);
			});
			const polled = await app.inject({
				method: "GET",
				url: `/v1/jobs/${createdBody.data.jobId}`,
				headers: AUTH_HEADERS,
			});
			pollBody = polled.json();
			if (
				pollBody.data.status === "failed" ||
				pollBody.data.status === "ready" ||
				pollBody.data.status === "cancelled"
			) {
				break;
			}
		}

		expect(pollBody.data.status).toBe("failed");
		expect(pollBody.data.vmafReport).toBeUndefined();
		expect(pollBody.data.vmaf?.completedCandidates ?? 0).toBe(0);

		await app.close();
	});
});
