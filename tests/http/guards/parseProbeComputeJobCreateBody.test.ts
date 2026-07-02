import { describe, expect, it } from "vitest";

import { parseProbeComputeJobCreateBody } from "@worker/http/guards/parseProbeComputeJobCreateBody.js";
import {
	VALID_COMPARE_JOB_BODY,
	VALID_UNIFIED_JOB_BODY,
	VALID_VMAF_JOB_BODY,
} from "../../fixtures/jobApi.fixtures.js";

describe("parseProbeComputeJobCreateBody", function () {
	it("parses valid compare job", function () {
		const result = parseProbeComputeJobCreateBody(VALID_COMPARE_JOB_BODY);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.body.jobKind).toBe("compare");
			expect(result.body.caller.shopDomain).toBe("shop.myshopify.com");
		}
	});

	it("parses valid vmaf job", function () {
		const result = parseProbeComputeJobCreateBody(VALID_VMAF_JOB_BODY);
		expect(result.ok).toBe(true);
	});

	it("parses valid unified job", function () {
		const result = parseProbeComputeJobCreateBody(VALID_UNIFIED_JOB_BODY);
		expect(result.ok).toBe(true);
	});

	it("rejects unsupported schemaVersion", function () {
		const result = parseProbeComputeJobCreateBody({
			...VALID_COMPARE_JOB_BODY,
			schemaVersion: 2,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("unsupported_schema");
		}
	});

	it("rejects invalid_body for missing compare on compare job", function () {
		const result = parseProbeComputeJobCreateBody({
			schemaVersion: 1,
			jobKind: "compare",
			caller: VALID_COMPARE_JOB_BODY.caller,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("invalid_body");
		}
	});

	it("rejects non-https URL with invalid_url_scheme", function () {
		const result = parseProbeComputeJobCreateBody({
			...VALID_COMPARE_JOB_BODY,
			compare: {
				...VALID_COMPARE_JOB_BODY.compare,
				renditions: [
					{
						group: "shopify",
						label: "bad",
						url: "http://cdn.example.com/insecure.mp4",
					},
				],
			},
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("invalid_url_scheme");
		}
	});

	it("rejects invalid vmafModel in vmaf options", function () {
		const result = parseProbeComputeJobCreateBody({
			...VALID_VMAF_JOB_BODY,
			vmaf: {
				...VALID_VMAF_JOB_BODY.vmaf,
				options: {
					vmafModel: "vmaf_v0.6.1:log_path=/tmp/evil",
				},
			},
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("invalid_body");
		}
	});
});
