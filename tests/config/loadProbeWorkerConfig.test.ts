import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import { loadProbeWorkerConfig } from "@worker/config/loadProbeWorkerConfig.js";

const originalEnv = { ...process.env };

afterEach(function restoreEnv(): void {
	process.env = { ...originalEnv };
});

describe("loadProbeWorkerConfig", function () {
	it("returns built-in defaults when no file or env overrides", async function () {
		const config = await loadProbeWorkerConfig({
			env: {},
			configPath: null,
		});

		expect(config.server.port).toBe(PROBE_WORKER_DEFAULT_CONFIG.server.port);
		expect(config.ffmpeg.ffmpegPath).toBe("ffmpeg");
	});

	it("applies env overrides on top of defaults", async function () {
		const config = await loadProbeWorkerConfig({
			env: {
				PROBE_WORKER_PORT: "4001",
				PROBE_WORKER_FFMPEG_PATH: "/custom/ffmpeg",
				PROBE_WORKER_SCREENSHOTS_ENABLED: "0",
			},
			configPath: null,
		});

		expect(config.server.port).toBe(4001);
		expect(config.ffmpeg.ffmpegPath).toBe("/custom/ffmpeg");
		expect(config.screenshots.enabled).toBe(false);
	});

	it("loads JSON file then applies env overrides", async function () {
		const dir = await mkdtemp(path.join(os.tmpdir(), "probe-worker-config-"));
		const filePath = path.join(dir, "probe-worker.local.json");
		await writeFile(
			filePath,
			JSON.stringify({
				...PROBE_WORKER_DEFAULT_CONFIG,
				server: { host: "127.0.0.1", port: 3100 },
			}),
			"utf8",
		);

		const config = await loadProbeWorkerConfig({
			env: { PROBE_WORKER_PORT: "3101" },
			configPath: filePath,
		});

		expect(config.server.host).toBe("127.0.0.1");
		expect(config.server.port).toBe(3101);
	});
});
