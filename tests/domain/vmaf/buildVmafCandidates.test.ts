import { describe, expect, it } from "vitest";

import {
	buildVmafCandidates,
	isVmafCandidateSkippableAsHls,
	VMAF_REFERENCE_LABEL,
} from "@worker/domain/vmaf/buildVmafCandidates.js";

describe("buildVmafCandidates", function () {
	it("extracts reference and shopify candidates excluding original", function () {
		const built = buildVmafCandidates(
			[
				{
					label: VMAF_REFERENCE_LABEL,
					url: "https://cdn.shopify.com/original.mp4",
					width: 1920,
					height: 1080,
					formatHint: "mp4",
					mimeType: "video/mp4",
					isOriginalSource: true,
				},
				{
					label: "mp4 · 854×480",
					url: "https://cdn.shopify.com/480.mp4",
					width: 854,
					height: 480,
					formatHint: "mp4",
					mimeType: "video/mp4",
					isOriginalSource: false,
				},
			],
			"https://cdn.slimvid.example/optimized.mp4",
		);

		expect(built.reference?.url).toBe("https://cdn.shopify.com/original.mp4");
		expect(built.candidates).toHaveLength(2);
		expect(built.candidates[1].group).toBe("slimvid");
	});
});

describe("isVmafCandidateSkippableAsHls", function () {
	it("detects m3u8 url and mime", function () {
		expect(
			isVmafCandidateSkippableAsHls({
				url: "https://cdn.shopify.com/master.m3u8",
				formatHint: "mp4",
				mimeType: "video/mp4",
			}),
		).toBe(true);

		expect(
			isVmafCandidateSkippableAsHls({
				url: "https://cdn.shopify.com/video.mp4",
				formatHint: "hls",
				mimeType: "application/vnd.apple.mpegurl",
			}),
		).toBe(true);

		expect(
			isVmafCandidateSkippableAsHls({
				url: "https://cdn.shopify.com/video.mp4",
				formatHint: "mp4",
				mimeType: "video/mp4",
			}),
		).toBe(false);
	});
});
