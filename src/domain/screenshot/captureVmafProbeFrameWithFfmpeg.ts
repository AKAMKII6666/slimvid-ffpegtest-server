/**
 * 模块名称：VMAF 探针单帧截图
 * 模块说明：从本地视频在指定时刻截取一帧 PNG（ffmpeg）；可注入 spawn 供单测。
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const VMAF_PROBE_FRAME_CAPTURE_TIMEOUT_MS = 120_000;

export interface ICaptureVmafProbeFrameInput {
	inputFilePath: string;
	sampleSec: number;
	outputFilePath?: string;
	ffmpegPath?: string;
}

export interface ICaptureVmafProbeFrameOk {
	ok: true;
	filePath: string;
}

export interface ICaptureVmafProbeFrameFailed {
	ok: false;
	error: string;
}

export type TCaptureVmafProbeFrameResult = ICaptureVmafProbeFrameOk | ICaptureVmafProbeFrameFailed;

export type TCaptureVmafProbeFrameFfmpegSpawner = (
	command: string,
	args: string[],
) => Promise<{ exitCode: number; stderr: string }>;

async function defaultCaptureVmafProbeFrameFfmpegSpawner(
	command: string,
	args: string[],
): Promise<{ exitCode: number; stderr: string }> {
	return new Promise(function (resolve, reject): void {
		const child = spawn(command, args, {
			stdio: ["ignore", "ignore", "pipe"],
		});

		let stderr = "";
		const timeoutId = setTimeout(function (): void {
			child.kill("SIGKILL");
		}, VMAF_PROBE_FRAME_CAPTURE_TIMEOUT_MS);

		child.stderr.on("data", function (chunk: Buffer): void {
			stderr += chunk.toString("utf8");
		});

		child.on("error", function (err: Error): void {
			clearTimeout(timeoutId);
			reject(err);
		});

		child.on("close", function (code: number | null): void {
			clearTimeout(timeoutId);
			resolve({
				exitCode: code ?? 1,
				stderr: stderr,
			});
		});
	});
}

let captureVmafProbeFrameFfmpegSpawnerOverride: TCaptureVmafProbeFrameFfmpegSpawner | null =
	null;

export function setCaptureVmafProbeFrameFfmpegSpawnerForTests(
	spawner: TCaptureVmafProbeFrameFfmpegSpawner | null,
): void {
	captureVmafProbeFrameFfmpegSpawnerOverride = spawner;
}

export async function captureVmafProbeFrameWithFfmpeg(
	input: ICaptureVmafProbeFrameInput,
): Promise<TCaptureVmafProbeFrameResult> {
	if (
		typeof input.sampleSec !== "number" ||
		!Number.isFinite(input.sampleSec) ||
		input.sampleSec < 0
	) {
		return {
			ok: false,
			error: "Invalid sampleSec",
		};
	}

	const outputFilePath =
		input.outputFilePath ?? join(tmpdir(), "slimvid-vmaf-frame-" + randomUUID() + ".png");
	const ffmpegPath = input.ffmpegPath ?? "ffmpeg";

	const args = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-ss",
		String(input.sampleSec),
		"-i",
		input.inputFilePath,
		"-frames:v",
		"1",
		"-y",
		outputFilePath,
	];

	const spawner =
		captureVmafProbeFrameFfmpegSpawnerOverride ?? defaultCaptureVmafProbeFrameFfmpegSpawner;

	try {
		const result = await spawner(ffmpegPath, args);
		if (result.exitCode !== 0) {
			return {
				ok: false,
				error: "ffmpeg frame capture failed",
			};
		}

		await access(outputFilePath);
		return {
			ok: true,
			filePath: outputFilePath,
		};
	} catch {
		return {
			ok: false,
			error: "ffmpeg frame capture failed",
		};
	}
}
