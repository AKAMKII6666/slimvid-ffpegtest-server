import { describe, expect, it } from "vitest";

import { assertHttpsJobUrls } from "@worker/http/guards/assertHttpsJobUrls.js";
import type { IProbeComputeJobCreateRequest } from "@worker/types/probeComputeJob.types.js";
import { PROBE_COMPUTE_JOB_SCHEMA_VERSION } from "@worker/types/probeComputeJob.types.js";

function buildRequest(url: string): IProbeComputeJobCreateRequest {
	return {
		schemaVersion: PROBE_COMPUTE_JOB_SCHEMA_VERSION,
		jobKind: "compare",
		caller: {
			shopDomain: "shop.myshopify.com",
			productId: "gid://shopify/Product/1",
			videoId: "gid://shopify/Video/1",
		},
		compare: {
			productName: "Demo",
			renditions: [
				{
					group: "shopify",
					label: "Original",
					url,
				},
			],
		},
	};
}

describe("assertHttpsJobUrls", function () {
	it("accepts https URLs", function () {
		expect(assertHttpsJobUrls(buildRequest("https://cdn.example.com/video.mp4"))).toBe(true);
	});

	it("rejects http URLs", function () {
		expect(assertHttpsJobUrls(buildRequest("http://cdn.example.com/video.mp4"))).toBe(false);
	});

	it("rejects file URLs", function () {
		expect(assertHttpsJobUrls(buildRequest("file:///tmp/video.mp4"))).toBe(false);
	});
});
