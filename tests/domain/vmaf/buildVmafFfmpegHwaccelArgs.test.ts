import { describe, expect, it } from "vitest";

import { buildVmafFfmpegCudaGlobalArgs } from "@worker/domain/vmaf/buildVmafFfmpegHwaccelArgs.js";

describe("buildVmafFfmpegHwaccelArgs", function () {
	it("builds global cuda device args", function () {
		expect(buildVmafFfmpegCudaGlobalArgs(1)).toEqual([
			"-init_hw_device",
			"cuda=cuda:1",
			"-filter_hw_device",
			"cuda",
		]);
	});
});
