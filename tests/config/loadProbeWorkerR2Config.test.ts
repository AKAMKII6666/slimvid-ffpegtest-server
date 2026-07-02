import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	isProbeWorkerR2Configured,
	loadProbeWorkerR2Config,
} from "@worker/config/loadProbeWorkerR2Config.js";

const R2_ENV_KEYS = [
	"PROBE_WORKER_R2_ACCOUNT_ID",
	"PROBE_WORKER_R2_BUCKET",
	"PROBE_WORKER_R2_ACCESS_KEY_ID",
	"PROBE_WORKER_R2_SECRET_ACCESS_KEY",
	"PROBE_WORKER_R2_OBJECT_KEY_PREFIX",
	"PROBE_WORKER_R2_PUBLIC_BASE_URL",
] as const;

describe("loadProbeWorkerR2Config", function () {
	const envSnapshot: Partial<Record<(typeof R2_ENV_KEYS)[number], string | undefined>> = {};

	beforeEach(function (): void {
		for (const key of R2_ENV_KEYS) {
			envSnapshot[key] = process.env[key];
		}
	});

	afterEach(function (): void {
		for (const key of R2_ENV_KEYS) {
			const previous = envSnapshot[key];
			if (previous === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = previous;
			}
		}
	});

	it("returns null when required env is missing", function (): void {
		delete process.env.PROBE_WORKER_R2_BUCKET;
		expect(loadProbeWorkerR2Config(process.env)).toBeNull();
		expect(isProbeWorkerR2Configured(process.env)).toBe(false);
	});

	it("loads full config with optional prefix and public base url", function (): void {
		process.env.PROBE_WORKER_R2_ACCOUNT_ID = "acct";
		process.env.PROBE_WORKER_R2_BUCKET = "bucket";
		process.env.PROBE_WORKER_R2_ACCESS_KEY_ID = "access";
		process.env.PROBE_WORKER_R2_SECRET_ACCESS_KEY = "secret";
		process.env.PROBE_WORKER_R2_OBJECT_KEY_PREFIX = "replacement-uploads/dev";
		process.env.PROBE_WORKER_R2_PUBLIC_BASE_URL = "https://cdn.example.com";

		const config = loadProbeWorkerR2Config(process.env);
		expect(config).toEqual({
			accountId: "acct",
			bucket: "bucket",
			accessKeyId: "access",
			secretAccessKey: "secret",
			objectKeyPrefix: "replacement-uploads/dev",
			publicBaseUrl: "https://cdn.example.com",
		});
		expect(isProbeWorkerR2Configured(process.env)).toBe(true);
	});
});
