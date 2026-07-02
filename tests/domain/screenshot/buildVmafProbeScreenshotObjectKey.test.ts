import { describe, expect, it } from "vitest";

import {
	buildVmafProbeScreenshotObjectKey,
	VMAF_PROBE_SCREENSHOT_KEY_SEGMENT,
	verifyVmafProbeScreenshotObjectKeyBelongsToJob,
} from "@worker/domain/screenshot/buildVmafProbeScreenshotObjectKey.js";

const TEST_R2_CONFIG = {
	accountId: "acct",
	bucket: "bucket",
	accessKeyId: "access",
	secretAccessKey: "secret",
	objectKeyPrefix: "replacement-uploads/dev",
	publicBaseUrl: null,
};

describe("buildVmafProbeScreenshotObjectKey", function () {
	it("includes dev-vmaf-probe segment and deterministic png name", function (): void {
		const jobId = "job-abc-123";
		const key = buildVmafProbeScreenshotObjectKey({
			r2Config: TEST_R2_CONFIG,
			shopDomain: "shop.example.myshopify.com",
			jobId: jobId,
			vmafMode: "referenceResolution",
			candidateLabel: "SlimVID (mapped)",
			role: "reference",
			segmentIndex: 0,
			frameIndex: 942,
		});

		expect(key).toContain(VMAF_PROBE_SCREENSHOT_KEY_SEGMENT);
		expect(key).toContain("replacement-uploads/dev");
		expect(key).toContain(jobId);
		expect(key).toContain("reference-seg0-frame942.png");
	});

	it("verifyVmafProbeScreenshotObjectKeyBelongsToJob accepts matching job", function (): void {
		const jobId = "job-xyz";
		const key = buildVmafProbeScreenshotObjectKey({
			r2Config: TEST_R2_CONFIG,
			shopDomain: "a.myshopify.com",
			jobId: jobId,
			vmafMode: "referenceResolution",
			candidateLabel: "mp4 · 854×480",
			role: "distorted",
			segmentIndex: 2,
			frameIndex: 10,
		});

		expect(verifyVmafProbeScreenshotObjectKeyBelongsToJob(key, jobId)).toBe(true);
		expect(verifyVmafProbeScreenshotObjectKeyBelongsToJob(key, "other-job")).toBe(false);
	});
});
