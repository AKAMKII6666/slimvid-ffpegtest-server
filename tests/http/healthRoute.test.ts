import { describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import {
	PROBE_WORKER_API_SCHEMA_VERSION,
	PROBE_WORKER_CONFIG_SCHEMA_VERSION,
	PROBE_WORKER_SERVICE_NAME,
} from "@worker/config/probeWorkerConfig.types.js";
import type { IFfmpegSpawnResult, TFfmpegSpawner } from "@worker/domain/ffmpeg/ffmpegSpawner.types.js";
import { createProbeWorkerApp } from "@worker/http/createProbeWorkerApp.js";

function createHealthySpawner(): TFfmpegSpawner {
	return function mockSpawn(_command: string, args: string[]): IFfmpegSpawnResult {
		const isFilters = args.includes("-filters");
		const payload = isFilters ? "libvmaf libvmaf_cuda" : "ffmpeg version mock";

		const dataListeners: Array<(chunk: Buffer) => void> = [];
		const closeListeners: Array<(code: number | null) => void> = [];

		const child: IFfmpegSpawnResult = {
			stdout: {
				on(event: "data", listener: (chunk: Buffer) => void): void {
					if (event === "data") {
						dataListeners.push(listener);
					}
				},
			},
			on(event: "error" | "close", listener: (arg: Error | number | null) => void): void {
				if (event === "close") {
					closeListeners.push(listener as (code: number | null) => void);
				}
				void listener;
			},
		};

		queueMicrotask(function emit(): void {
			dataListeners.forEach(function call(fn): void {
				fn(Buffer.from(payload, "utf8"));
			});
			closeListeners.forEach(function call(fn): void {
				fn(0);
			});
		});

		return child;
	};
}

function createUnhealthySpawner(): TFfmpegSpawner {
	return function mockSpawn(_command: string, args: string[]): IFfmpegSpawnResult {
		const isFilters = args.includes("-filters");
		const payload = isFilters ? "scale" : "";

		const dataListeners: Array<(chunk: Buffer) => void> = [];
		const closeListeners: Array<(code: number | null) => void> = [];

		const child: IFfmpegSpawnResult = {
			stdout: {
				on(event: "data", listener: (chunk: Buffer) => void): void {
					if (event === "data") {
						dataListeners.push(listener);
					}
				},
			},
			on(event: "error" | "close", listener: (arg: Error | number | null) => void): void {
				if (event === "close") {
					closeListeners.push(listener as (code: number | null) => void);
				}
				void listener;
			},
		};

		queueMicrotask(function emit(): void {
			dataListeners.forEach(function call(fn): void {
				fn(Buffer.from(payload, "utf8"));
			});
			closeListeners.forEach(function call(fn): void {
				fn(0);
			});
		});

		return child;
	};
}

describe("GET /health", function () {
	it("returns 200 when all core binaries are available", async function () {
		const app = await createProbeWorkerApp({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			spawner: createHealthySpawner(),
			env: {},
			authToken: "test-token",
		});

		const response = await app.inject({
			method: "GET",
			url: "/health",
		});

		expect(response.statusCode).toBe(200);

		const body = response.json() as {
			ok: boolean;
			data: {
				service: string;
				configSchemaVersion: number;
				apiSchemaVersion: number;
				ffmpegAvailable: boolean;
				ffprobeAvailable: boolean;
				libvmafAvailable: boolean;
				r2Configured: boolean;
				screenshotsEnabled: boolean;
				concurrency: { maxVmafJobs: number; maxFfprobeParallel: number; maxVmafCandidatesParallel: number };
			};
		};

		expect(body.ok).toBe(true);
		expect(body.data.service).toBe(PROBE_WORKER_SERVICE_NAME);
		expect(body.data.configSchemaVersion).toBe(PROBE_WORKER_CONFIG_SCHEMA_VERSION);
		expect(body.data.apiSchemaVersion).toBe(PROBE_WORKER_API_SCHEMA_VERSION);
		expect(body.data.ffmpegAvailable).toBe(true);
		expect(body.data.ffprobeAvailable).toBe(true);
		expect(body.data.libvmafAvailable).toBe(true);
		expect(body.data.r2Configured).toBe(false);
		expect(body.data.screenshotsEnabled).toBe(true);
		expect(body.data.concurrency.maxVmafJobs).toBe(1);
		expect(body.data.concurrency.maxFfprobeParallel).toBe(4);
		expect(body.data.concurrency.maxVmafCandidatesParallel).toBe(2);

		await app.close();
	});

	it("returns 503 when libvmaf is unavailable", async function () {
		const app = await createProbeWorkerApp({
			config: {
				...PROBE_WORKER_DEFAULT_CONFIG,
				ffmpeg: {
					ffmpegPath: "/bad/ffmpeg",
					ffprobePath: "ffprobe",
				},
			},
			spawner: createUnhealthySpawner(),
			env: {},
			authToken: "test-token",
		});

		const response = await app.inject({
			method: "GET",
			url: "/health",
		});

		expect(response.statusCode).toBe(503);

		const body = response.json() as {
			ok: boolean;
			data: { libvmafAvailable: boolean; ffmpegAvailable: boolean };
		};

		expect(body.ok).toBe(true);
		expect(body.data.libvmafAvailable).toBe(false);

		await app.close();
	});

	it("returns 503 when GPU is required but libvmaf_cuda is unavailable", async function () {
		const app = await createProbeWorkerApp({
			config: {
				...PROBE_WORKER_DEFAULT_CONFIG,
				vmaf: {
					...PROBE_WORKER_DEFAULT_CONFIG.vmaf,
					useGpu: true,
					gpuUnavailablePolicy: "fail",
				},
			},
			spawner: createHealthySpawnerWithoutCuda(),
			env: {},
			authToken: "test-token",
		});

		const response = await app.inject({
			method: "GET",
			url: "/health",
		});

		expect(response.statusCode).toBe(503);

		const body = response.json() as {
			data: { libvmafCudaAvailable: boolean; vmafExecutionMode: string };
		};
		expect(body.data.libvmafCudaAvailable).toBe(false);
		expect(body.data.vmafExecutionMode).toBe("cpu");

		await app.close();
	});
});

function createHealthySpawnerWithoutCuda(): TFfmpegSpawner {
	return function mockSpawn(_command: string, args: string[]): IFfmpegSpawnResult {
		const isFilters = args.includes("-filters");
		const payload = isFilters ? "libvmaf scale" : "ffmpeg version mock";

		const dataListeners: Array<(chunk: Buffer) => void> = [];
		const closeListeners: Array<(code: number | null) => void> = [];

		const child: IFfmpegSpawnResult = {
			stdout: {
				on(event: "data", listener: (chunk: Buffer) => void): void {
					if (event === "data") {
						dataListeners.push(listener);
					}
				},
			},
			on(event: "error" | "close", listener: (arg: Error | number | null) => void): void {
				if (event === "close") {
					closeListeners.push(listener as (code: number | null) => void);
				}
				void listener;
			},
		};

		queueMicrotask(function emit(): void {
			dataListeners.forEach(function call(fn): void {
				fn(Buffer.from(payload, "utf8"));
			});
			closeListeners.forEach(function call(fn): void {
				fn(0);
			});
		});

		return child;
	};
}
