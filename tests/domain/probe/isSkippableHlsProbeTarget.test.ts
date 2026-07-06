import { describe, expect, it } from "vitest";

import { isSkippableHlsProbeTarget } from "@worker/domain/probe/isSkippableHlsProbeTarget.js";

describe("isSkippableHlsProbeTarget", function () {
	it("detects m3u8 url", function () {
		expect(
			isSkippableHlsProbeTarget({
				url: "https://cdn.shopify.com/master.m3u8",
			}),
		).toBe(true);
	});

	it("detects m3u8 label prefix from Shopify drafts", function () {
		expect(
			isSkippableHlsProbeTarget({
				url: "https://cdn.shopify.com/videos/c/vp/playlist",
				label: "m3u8 · 1920×1080",
			}),
		).toBe(true);
	});

	it("detects formatHint and mimeType", function () {
		expect(
			isSkippableHlsProbeTarget({
				url: "https://cdn.shopify.com/stream",
				formatHint: "hls",
				mimeType: "application/vnd.apple.mpegurl",
			}),
		).toBe(true);
	});

	it("does not skip mp4 renditions", function () {
		expect(
			isSkippableHlsProbeTarget({
				url: "https://cdn.shopify.com/video.mp4",
				label: "mp4 · 1920×1080",
			}),
		).toBe(false);
	});
});
