import { describe, expect, it } from "vitest";

import {
	parseVmafFfmpegJsonMean,
	parseVmafFfmpegJsonMin,
} from "@worker/domain/vmaf/parseVmafFfmpegJson.js";

describe("parseVmafFfmpegJson", function () {
	it("parses pooled_metrics vmaf mean and min", function () {
		const json = JSON.stringify({
			pooled_metrics: {
				vmaf: {
					mean: 94.567891,
					min: 88.123456,
				},
			},
		});

		expect(parseVmafFfmpegJsonMean(json)).toBe(94.57);
		expect(parseVmafFfmpegJsonMin(json)).toBe(88.12);
	});

	it("returns null for invalid json", function () {
		expect(parseVmafFfmpegJsonMean("not-json")).toBeNull();
		expect(parseVmafFfmpegJsonMean("{}")).toBeNull();
	});
});
