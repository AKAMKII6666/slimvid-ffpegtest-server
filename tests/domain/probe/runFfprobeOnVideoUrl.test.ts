import { describe, expect, it } from "vitest";

import {
	extractFfprobeExecFailureDetails,
	formatFfprobeProbeErrorMessage,
} from "@worker/domain/probe/ffprobeRunResult.types.js";
import { runFfprobeOnVideoUrl } from "@worker/domain/probe/runFfprobeOnVideoUrl.js";

describe("formatFfprobeProbeErrorMessage", function () {
	it("includes exit code and stderr excerpt for exec failures", function () {
		const message = formatFfprobeProbeErrorMessage({
			ok: false,
			reason: "exec_failed",
			exitCode: 1,
			stderrExcerpt: "Connection reset by peer",
		});
		expect(message).toContain("exit 1");
		expect(message).toContain("Connection reset by peer");
	});

	it("describes missing ffprobe binary", function () {
		const message = formatFfprobeProbeErrorMessage({
			ok: false,
			reason: "ffprobe_not_found",
		});
		expect(message).toMatch(/not installed|PATH/i);
	});
});

describe("extractFfprobeExecFailureDetails", function () {
	it("detects ENOENT as ffprobe not found", function () {
		const error = Object.assign(new Error("spawn ffprobe ENOENT"), { code: "ENOENT" });
		expect(extractFfprobeExecFailureDetails(error).isNotFound).toBe(true);
	});
});

describe("runFfprobeOnVideoUrl", function () {
	it("returns structured failure when execFile rejects", async function () {
		const result = await runFfprobeOnVideoUrl("https://cdn.example.com/video.mp4", {
			timeoutMs: 5_000,
			execFileAsync: async function mockExecFailed(): Promise<never> {
				const error = Object.assign(new Error("Command failed: ffprobe\nServer returned 403"), {
					status: 1,
				});
				throw error;
			},
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("exec_failed");
			expect(result.exitCode).toBe(1);
			expect(result.stderrExcerpt).toMatch(/403/);
		}
	});

	it("returns payload on success", async function () {
		const result = await runFfprobeOnVideoUrl("https://cdn.example.com/video.mp4", {
			timeoutMs: 5_000,
			execFileAsync: async function mockExecOk() {
				return {
					stdout: JSON.stringify({
						streams: [{ codec_type: "video", codec_name: "h264", width: 640, height: 360 }],
						format: { duration: "10" },
					}),
					stderr: "",
				};
			},
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.payload.streams?.[0]?.width).toBe(640);
		}
	});

	it("throws on timeout", async function () {
		await expect(
			runFfprobeOnVideoUrl("https://cdn.example.com/video.mp4", {
				timeoutMs: 50,
				execFileAsync: async function mockTimeout(): Promise<never> {
					throw new Error("spawnSync ffprobe ETIMEDOUT");
				},
			}),
		).rejects.toThrow(/timed out/i);
	});
});
