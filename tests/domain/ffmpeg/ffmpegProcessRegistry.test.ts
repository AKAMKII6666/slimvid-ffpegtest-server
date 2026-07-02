import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

import {
	getVmafFfmpegProcessCount,
	killVmafFfmpegProcesses,
	registerVmafFfmpegProcess,
	resetVmafFfmpegProcessRegistryForTests,
} from "@worker/domain/ffmpeg/vmafProcessRegistry.memory.js";
import {
	abortVmafDownloads,
	registerVmafDownloadAbort,
	resetVmafDownloadAbortRegistryForTests,
} from "@worker/domain/ffmpeg/vmafDownloadAbortRegistry.memory.js";

function buildMockChildProcess(): EventEmitter & { kill: ReturnType<typeof vi.fn> } {
	const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
	child.kill = vi.fn();
	return child;
}

describe("vmafProcessRegistry", function () {
	beforeEach(function (): void {
		resetVmafFfmpegProcessRegistryForTests();
	});

	it("tracks and kills registered ffmpeg children", function () {
		const child = buildMockChildProcess();
		registerVmafFfmpegProcess("job-1", child as never);

		expect(getVmafFfmpegProcessCount("job-1")).toBe(1);
		expect(killVmafFfmpegProcesses("job-1")).toBe(true);
		expect(child.kill).toHaveBeenCalledWith("SIGKILL");
	});
});

describe("vmafDownloadAbortRegistry", function () {
	beforeEach(function (): void {
		resetVmafDownloadAbortRegistryForTests();
	});

	it("aborts registered download controller on cancel", function () {
		const controller = new AbortController();
		registerVmafDownloadAbort("job-1", controller);

		expect(abortVmafDownloads("job-1")).toBe(true);
		expect(controller.signal.aborted).toBe(true);
	});
});
