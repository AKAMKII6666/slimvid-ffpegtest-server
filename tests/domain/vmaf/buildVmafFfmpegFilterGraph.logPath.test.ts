import { describe, expect, it } from "vitest";

import {
	buildVmafFfmpegFullFilter,
	escapeLibvmafFfmpegLogPath,
} from "@worker/domain/vmaf/buildVmafFfmpegFilterGraph.js";

describe("buildVmafFfmpegFullFilter log_path", function () {
	it("uses relative log filename without escaping", function () {
		const fileName = "slimvid-vmaf-abc.json";
		expect(escapeLibvmafFfmpegLogPath(fileName)).toBe(fileName);

		const full = buildVmafFfmpegFullFilter(
			{ mode: "delivery", deliveryWidth: 640, deliveryHeight: 360, executionMode: "cpu" },
			fileName,
			"vmaf_v0.6.1",
		);
		expect(full).toContain("log_path=slimvid-vmaf-abc.json");
	});

	it("appends n_threads when configured", function () {
		const full = buildVmafFfmpegFullFilter(
			{ mode: "display1080p", executionMode: "cpu" },
			"out.json",
			"vmaf_v0.6.1",
			{ nThreads: 4 },
		);
		expect(full).toContain(":n_threads=4:");
		expect(full).toContain("log_path=out.json");
	});

	it("still escapes absolute Unix paths", function () {
		expect(escapeLibvmafFfmpegLogPath("/tmp/vmaf.json")).toBe("/tmp/vmaf.json");
	});
});
