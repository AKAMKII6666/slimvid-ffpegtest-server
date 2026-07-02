import { describe, expect, it } from "vitest";

import {
	buildVmafFfmpegCudaGlobalArgs,
	buildVmafFfmpegCudaPerInputArgs,
} from "@worker/domain/vmaf/buildVmafFfmpegHwaccelArgs.js";

describe("buildVmafFfmpegHwaccelArgs", function () {
	it("builds global cuda device args", function () {
		expect(buildVmafFfmpegCudaGlobalArgs(1)).toEqual([
			"-init_hw_device",
			"cuda=cuda:1",
			"-filter_hw_device",
			"cuda",
		]);
	});

	it("builds per-input hwaccel args", function () {
		expect(buildVmafFfmpegCudaPerInputArgs(0)).toEqual([
			"-hwaccel",
			"cuda",
			"-hwaccel_device",
			"0",
			"-hwaccel_output_format",
			"cuda",
		]);
	});
});
