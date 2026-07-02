import { describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import type { IFfmpegSpawnResult, TFfmpegSpawner } from "@worker/domain/ffmpeg/ffmpegSpawner.types.js";
import {
	isCoreRuntimeHealthy,
	isProbeWorkerRuntimeHealthy,
	probeRuntimeCapabilities,
} from "@worker/domain/ffmpeg/probeRuntimeCapabilities.js";

function createMockSpawner(handlers: {
	versionOk?: boolean;
	filtersOutput?: string;
}): TFfmpegSpawner {
	return function mockSpawn(command: string, args: string[]): IFfmpegSpawnResult {
		const isFilters = args.includes("-filters");

		const stdoutPayload = isFilters
			? (handlers.filtersOutput ?? "")
			: handlers.versionOk === false
				? ""
				: "ffmpeg version mock";

		const listeners: {
			data: Array<(chunk: Buffer) => void>;
			error: Array<(error: Error) => void>;
			close: Array<(code: number | null) => void>;
		} = {
			data: [],
			error: [],
			close: [],
		};

		const child: IFfmpegSpawnResult = {
			stdout: {
				on(event: "data", listener: (chunk: Buffer) => void): void {
					if (event === "data") {
						listeners.data.push(listener);
					}
				},
			},
			on(event: "error" | "close", listener: (arg: Error | number | null) => void): void {
				if (event === "error") {
					listeners.error.push(listener as (error: Error) => void);
				}
				if (event === "close") {
					listeners.close.push(listener as (code: number | null) => void);
				}
			},
		};

		queueMicrotask(function emit(): void {
			if (handlers.versionOk === false && !isFilters) {
				listeners.error.forEach(function call(fn): void {
					fn(new Error("spawn failed"));
				});
				listeners.close.forEach(function call(fn): void {
					fn(1);
				});
				return;
			}

			listeners.data.forEach(function call(fn): void {
				fn(Buffer.from(stdoutPayload, "utf8"));
			});
			listeners.close.forEach(function call(fn): void {
				fn(0);
			});
		});

		void command;
		return child;
	};
}

describe("probeRuntimeCapabilities", function () {
	it("reports all core binaries available when ffmpeg lists libvmaf", async function () {
		const capabilities = await probeRuntimeCapabilities({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			spawner: createMockSpawner({
				filtersOutput: " ... libvmaf ... libvmaf_cuda ... ",
			}),
		});

		expect(capabilities.ffmpegAvailable).toBe(true);
		expect(capabilities.ffprobeAvailable).toBe(true);
		expect(capabilities.libvmafAvailable).toBe(true);
		expect(isCoreRuntimeHealthy(capabilities)).toBe(true);
	});

	it("marks unhealthy when libvmaf filter missing", async function () {
		const capabilities = await probeRuntimeCapabilities({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			spawner: createMockSpawner({
				filtersOutput: "scale",
			}),
		});

		expect(capabilities.libvmafAvailable).toBe(false);
		expect(isCoreRuntimeHealthy(capabilities)).toBe(false);
	});

	it("selects cuda execution mode when useGpu and libvmaf_cuda are available", async function () {
		const capabilities = await probeRuntimeCapabilities({
			config: {
				...PROBE_WORKER_DEFAULT_CONFIG,
				vmaf: { ...PROBE_WORKER_DEFAULT_CONFIG.vmaf, useGpu: true },
			},
			spawner: createMockSpawner({
				filtersOutput: " ... libvmaf ... libvmaf_cuda ... ",
			}),
		});

		expect(capabilities.libvmafCudaAvailable).toBe(true);
		expect(capabilities.vmafExecutionMode).toBe("cuda");
	});

	it("marks runtime unhealthy when GPU required but unavailable with fail policy", function () {
		const capabilities = {
			ffmpegAvailable: true,
			ffprobeAvailable: true,
			libvmafAvailable: true,
			libvmafCudaAvailable: false,
			vmafExecutionMode: "cpu" as const,
		};

		expect(
			isProbeWorkerRuntimeHealthy(
				capabilities,
				{
					...PROBE_WORKER_DEFAULT_CONFIG,
					vmaf: {
						...PROBE_WORKER_DEFAULT_CONFIG.vmaf,
						useGpu: true,
						gpuUnavailablePolicy: "fail",
					},
				},
			),
		).toBe(false);
		expect(isCoreRuntimeHealthy(capabilities)).toBe(true);
	});

	it("marks ffmpeg unavailable when spawn errors", async function () {
		const capabilities = await probeRuntimeCapabilities({
			config: PROBE_WORKER_DEFAULT_CONFIG,
			spawner: createMockSpawner({
				versionOk: false,
				filtersOutput: "libvmaf",
			}),
		});

		expect(capabilities.ffmpegAvailable).toBe(false);
		expect(isCoreRuntimeHealthy(capabilities)).toBe(false);
	});
});
