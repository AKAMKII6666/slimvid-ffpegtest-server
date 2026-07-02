import { describe, expect, it } from "vitest";

import {
	parseFfprobeFrameRate,
	parseFfprobeJsonToMetadata,
	resolveDevVideoProbeContainerLabel,
	type IFfprobeJsonPayload,
} from "@worker/domain/probe/ffprobeParse.helpers.js";
import { probeVideoUrlMetadata } from "@worker/domain/probe/probeVideoUrlMetadata.js";

const COMPLETE_FFPROBE_PAYLOAD: IFfprobeJsonPayload = {
	streams: [
		{
			codec_type: "video",
			codec_name: "h264",
			width: 1280,
			height: 720,
			bit_rate: "1200000",
			avg_frame_rate: "30/1",
		},
	],
	format: {
		format_name: "mov,mp4,m4a,3gp,3g2,mj2",
		duration: "120.5",
		bit_rate: "1300000",
		size: "10485760",
	},
};

describe("parseFfprobeFrameRate", function () {
	it("parses fractional frame rates", function () {
		const fps = parseFfprobeFrameRate("30000/1001");
		expect(fps).toBeGreaterThan(29.9);
		expect(fps).toBeLessThan(30);
	});
});

describe("parseFfprobeJsonToMetadata", function () {
	it("maps ffprobe JSON into complete metadata", function () {
		const metadata = parseFfprobeJsonToMetadata(
			"https://cdn.shopify.com/videos/test.mp4",
			COMPLETE_FFPROBE_PAYLOAD,
			10_485_760,
		);

		expect(metadata).not.toBeNull();
		expect(metadata?.width).toBe(1280);
		expect(metadata?.height).toBe(720);
		expect(metadata?.frameRateFps).toBe(30);
		expect(metadata?.bitrateKbps).toBe(1200);
		expect(metadata?.codec).toBe("h264");
		expect(metadata?.format).toBe("mp4");
		expect(metadata?.container).toBe("mp4");
		expect(metadata?.sizeBytes).toBe(10_485_760);
	});

	it("labels ISO BMFF mp4 as mp4 when major_brand is isom", function () {
		const payload: IFfprobeJsonPayload = {
			streams: [
				{
					codec_type: "video",
					codec_name: "h264",
					width: 348,
					height: 640,
					bit_rate: "565900",
					avg_frame_rate: "24000/1001",
				},
			],
			format: {
				format_name: "mov,mp4,m4a,3gp,3g2,mj2",
				duration: "28.0",
				bit_rate: "565900",
				size: "2400000",
				tags: {
					major_brand: "isom",
				},
			},
		};

		const metadata = parseFfprobeJsonToMetadata(
			"https://cdn.shopify.com/videos/c/o/v/sample",
			payload,
			2_400_000,
			{ contentType: "video/mp4", contentDisposition: "" },
		);

		expect(metadata?.container).toBe("mp4");
		expect(metadata?.format).toBe("mp4");
	});
});

describe("resolveDevVideoProbeContainerLabel", function () {
	it("prefers mp4 when format_name lists mov before mp4", function () {
		expect(
			resolveDevVideoProbeContainerLabel({
				url: "https://cdn.shopify.com/videos/test.mp4",
				formatName: "mov,mp4,m4a,3gp,3g2,mj2",
			}),
		).toBe("mp4");
	});
});

describe("probeVideoUrlMetadata", function () {
	it("rejects non-https URLs", async function () {
		await expect(probeVideoUrlMetadata("http://cdn.example.com/a.mp4")).rejects.toThrow(
			/https/i,
		);
	});

	it("composes HEAD hints and ffprobe JSON", async function () {
		const metadata = await probeVideoUrlMetadata("https://cdn.example.com/video.mp4", {
			fetchHead: async function mockHead() {
				return {
					sizeBytes: 10_485_760,
					contentType: "video/mp4",
					contentDisposition: "",
				};
			},
			runFfprobe: async function mockFfprobe() {
				return COMPLETE_FFPROBE_PAYLOAD;
			},
		});

		expect(metadata.width).toBe(1280);
		expect(metadata.container).toBe("mp4");
	});

	it("throws when ffprobe times out", async function () {
		await expect(
			probeVideoUrlMetadata("https://cdn.example.com/video.mp4", {
				ffprobeTimeoutMs: 50,
				fetchHead: async function mockHead() {
					return {
						sizeBytes: 10_485_760,
						contentType: "video/mp4",
						contentDisposition: "",
					};
				},
				runFfprobe: async function mockFfprobe(_url, options) {
					throw new Error(`ffprobe timed out after ${options.timeoutMs}ms`);
				},
			}),
		).rejects.toThrow(/timed out/i);
	});
});
