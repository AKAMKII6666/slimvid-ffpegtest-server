import { afterEach, describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import {
	runVmafPairWithFfmpeg,
	setRunVmafPairFfmpegSpawnerForTests,
} from "@worker/domain/vmaf/runVmafPairWithFfmpeg.js";

afterEach(function (): void {
	setRunVmafPairFfmpegSpawnerForTests(null);
});

describe("runVmafPairWithFfmpeg", function () {
	it("passes CUDA hwaccel args and libvmaf_cuda filter when execution mode is cuda", async function () {
		let capturedArgs: string[] = [];

		setRunVmafPairFfmpegSpawnerForTests(async function (
			_command,
			args,
		): Promise<{ exitCode: number; stderr: string }> {
			capturedArgs = args;
			return { exitCode: 1, stderr: "mock" };
		});

		await runVmafPairWithFfmpeg(
			{
				distortedFilePath: "/tmp/dist.mp4",
				referenceFilePath: "/tmp/ref.mp4",
				mode: "delivery",
				deliveryWidth: 1280,
				deliveryHeight: 720,
				vmafExecutionMode: "cuda",
			},
			{
				...PROBE_WORKER_DEFAULT_CONFIG,
				vmaf: { ...PROBE_WORKER_DEFAULT_CONFIG.vmaf, gpuDeviceId: 2 },
			},
		);

		expect(capturedArgs).toContain("-init_hw_device");
		expect(capturedArgs).toContain("cuda=cuda:2");
		expect(capturedArgs).toContain("-filter_hw_device");
		expect(capturedArgs).toContain("cuda");
		expect(capturedArgs.filter(function (arg): boolean {
			return arg === "-hwaccel";
		})).toHaveLength(2);
		expect(capturedArgs).toContain("-hwaccel_device");
		expect(capturedArgs).toContain("2");

		const lavfiIndex = capturedArgs.indexOf("-lavfi");
		const filter = lavfiIndex >= 0 ? capturedArgs[lavfiIndex + 1] : "";
		expect(filter).toContain("libvmaf_cuda");
		expect(filter).toContain("scale_cuda=1280:720:format=yuv420p");
	});

	it("uses CPU libvmaf filter without hwaccel args by default", async function () {
		let capturedArgs: string[] = [];

		setRunVmafPairFfmpegSpawnerForTests(async function (
			_command,
			args,
		): Promise<{ exitCode: number; stderr: string }> {
			capturedArgs = args;
			return { exitCode: 1, stderr: "mock" };
		});

		await runVmafPairWithFfmpeg(
			{
				distortedFilePath: "/tmp/dist.mp4",
				referenceFilePath: "/tmp/ref.mp4",
				mode: "delivery",
				deliveryWidth: 640,
				deliveryHeight: 360,
			},
			PROBE_WORKER_DEFAULT_CONFIG,
		);

		expect(capturedArgs).not.toContain("-init_hw_device");
		expect(capturedArgs).not.toContain("-hwaccel");

		const lavfiIndex = capturedArgs.indexOf("-lavfi");
		const filter = lavfiIndex >= 0 ? capturedArgs[lavfiIndex + 1] : "";
		expect(filter).toContain("[dist][ref]libvmaf");
		expect(filter).not.toContain("libvmaf_cuda");
	});
});
