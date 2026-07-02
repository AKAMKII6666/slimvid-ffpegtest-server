import { afterEach, describe, expect, it } from "vitest";

import { resolveProbeWorkerPinoLogRetentionDays } from "@worker/logging/resolvePinoLogRetentionDays.js";

describe("resolveProbeWorkerPinoLogRetentionDays", function (): void {
	const original = process.env.PROBE_WORKER_PINO_LOG_RETENTION_DAYS;

	afterEach(function (): void {
		if (original === undefined) {
			delete process.env.PROBE_WORKER_PINO_LOG_RETENTION_DAYS;
		} else {
			process.env.PROBE_WORKER_PINO_LOG_RETENTION_DAYS = original;
		}
	});

	it("defaults to 12 when unset", function (): void {
		delete process.env.PROBE_WORKER_PINO_LOG_RETENTION_DAYS;
		expect(resolveProbeWorkerPinoLogRetentionDays()).toBe(12);
	});

	it("parses valid positive integer", function (): void {
		process.env.PROBE_WORKER_PINO_LOG_RETENTION_DAYS = "30";
		expect(resolveProbeWorkerPinoLogRetentionDays()).toBe(30);
	});

	it("falls back when invalid", function (): void {
		process.env.PROBE_WORKER_PINO_LOG_RETENTION_DAYS = "0";
		expect(resolveProbeWorkerPinoLogRetentionDays()).toBe(12);
	});
});
