import { describe, expect, it } from "vitest";

import {
	buildVmafFfmpegFullFilter,
	escapeLibvmafFfmpegLogPath,
} from "@worker/domain/vmaf/buildVmafFfmpegFilterGraph.js";

describe("buildVmafFfmpegFullFilter log_path", function () {
	it("escapes absolute unix paths in log_path", function () {
		const escaped = escapeLibvmafFfmpegLogPath("/tmp/vmaf-out.json");
		expect(escaped).toBe("/tmp/vmaf-out.json");

		const full = buildVmafFfmpegFullFilter(
			{ mode: "metadata2goBicubicUpscale", referenceWidth: 640, referenceHeight: 360, executionMode: "cpu" },
			"/tmp/vmaf-out.json",
			"vmaf_v0.6.1",
		);
		expect(full).toContain("log_path=/tmp/vmaf-out.json");
	});

	it("keeps relative log filename unescaped", function () {
		const full = buildVmafFfmpegFullFilter(
			{ mode: "metadata2goBicubicUpscale", referenceWidth: 1920, referenceHeight: 1080, executionMode: "cpu" },
			"slimvid-vmaf-test.json",
			"vmaf_v0.6.1",
		);
		expect(full).toContain("log_path=slimvid-vmaf-test.json");
	});
});
