import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
	captureVmafProbeFrameWithFfmpeg,
	setCaptureVmafProbeFrameFfmpegSpawnerForTests,
} from "@worker/domain/screenshot/captureVmafProbeFrameWithFfmpeg.js";

describe("captureVmafProbeFrameWithFfmpeg", function () {
	it("captures frame via injected ffmpeg spawner", async function (): Promise<void> {
		setCaptureVmafProbeFrameFfmpegSpawnerForTests(async function (
			command,
			args,
		): Promise<{ exitCode: number; stderr: string }> {
			expect(command).toBe("ffmpeg");
			expect(args).toContain("-ss");
			expect(args).toContain("1.5");
			const outputIndex = args.indexOf("-y");
			const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
			if (outputPath) {
				await writeFile(outputPath, "png");
			}
			return { exitCode: 0, stderr: "" };
		});

		const result = await captureVmafProbeFrameWithFfmpeg({
			inputFilePath: "/tmp/video.mp4",
			sampleSec: 1.5,
			outputFilePath: "/tmp/frame.png",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.filePath).toBe("/tmp/frame.png");
		}

		setCaptureVmafProbeFrameFfmpegSpawnerForTests(null);
	});

	it("returns failure for invalid sampleSec", async function (): Promise<void> {
		const result = await captureVmafProbeFrameWithFfmpeg({
			inputFilePath: "/tmp/video.mp4",
			sampleSec: -1,
		});
		expect(result.ok).toBe(false);
	});
});
