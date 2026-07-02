import { describe, expect, it } from "vitest";

import {
	parseVmafFfmpegJsonHarmonicMean,
	parseVmafFfmpegJsonMean,
	parseVmafFfmpegJsonMin,
} from "@worker/domain/vmaf/parseVmafFfmpegJson.js";

describe("parseVmafFfmpegJson", function () {
	it("parses pooled_metrics vmaf mean, harmonic mean and min", function () {
		const json = JSON.stringify({
			pooled_metrics: {
				vmaf: {
					mean: 94.567891,
					harmonic_mean: 93.1234567,
					min: 88.123456,
				},
			},
		});

		expect(parseVmafFfmpegJsonMean(json)).toBe(94.57);
		expect(parseVmafFfmpegJsonHarmonicMean(json)).toBe(93.123457);
		expect(parseVmafFfmpegJsonMin(json)).toBe(88.12);
	});

	it("returns null for invalid json", function () {
		expect(parseVmafFfmpegJsonMean("not-json")).toBeNull();
		expect(parseVmafFfmpegJsonMean("{}")).toBeNull();
	});
});
