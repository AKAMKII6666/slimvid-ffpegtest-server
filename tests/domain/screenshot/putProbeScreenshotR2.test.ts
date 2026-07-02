import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

import { resetProbeWorkerR2S3ClientForTests } from "@worker/domain/r2/createProbeWorkerR2S3Client.js";

vi.mock("node:fs/promises", async function (importOriginal): Promise<typeof import("node:fs/promises")> {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		readFile: vi.fn(),
	};
});

const { getSignedUrlMock } = vi.hoisted(function (): { getSignedUrlMock: ReturnType<typeof vi.fn> } {
	return {
		getSignedUrlMock: vi.fn(),
	};
});

vi.mock("@aws-sdk/s3-request-presigner", function (): { getSignedUrl: typeof getSignedUrlMock } {
	return {
		getSignedUrl: getSignedUrlMock,
	};
});

vi.mock("@aws-sdk/client-s3", function (): Record<string, unknown> {
	return {
		S3Client: class MockS3Client {},
		PutObjectCommand: class MockPutObjectCommand {
			input: unknown;
			constructor(input: unknown) {
				this.input = input;
			}
		},
		GetObjectCommand: class MockGetObjectCommand {
			input: unknown;
			constructor(input: unknown) {
				this.input = input;
			}
		},
	};
});

import {
	PROBE_SCREENSHOT_PRESIGN_TTL_SECONDS,
	putProbeScreenshotR2,
	setPutProbeScreenshotR2UploaderForTests,
} from "@worker/domain/screenshot/putProbeScreenshotR2.js";

const TEST_R2_CONFIG = {
	accountId: "acct",
	bucket: "bucket",
	accessKeyId: "access",
	secretAccessKey: "secret",
	objectKeyPrefix: null,
	publicBaseUrl: null,
};

describe("putProbeScreenshotR2", function () {
	let uploadedBody: Buffer | null = null;

	beforeEach(function (): void {
		uploadedBody = null;
		getSignedUrlMock.mockResolvedValue("https://signed.example/get");
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
		setPutProbeScreenshotR2UploaderForTests(async function (params): Promise<void> {
			uploadedBody = params.body;
		});
		vi.mocked(readFile).mockResolvedValue(Buffer.from("png-bytes"));
	});

	afterEach(function (): void {
		resetProbeWorkerR2S3ClientForTests();
		setPutProbeScreenshotR2UploaderForTests(null);
		getSignedUrlMock.mockReset();
		vi.mocked(readFile).mockReset();
		vi.useRealTimers();
	});

	it("uploads png and returns presigned url when public base is unset", async function (): Promise<void> {
		const objectKey = "dev-vmaf-probe/shop/job/delivery/cand/reference-seg0-frame1.png";
		const result = await putProbeScreenshotR2({
			r2Config: TEST_R2_CONFIG,
			shopDomain: "shop.myshopify.com",
			objectKey: objectKey,
			pngFilePath: "/tmp/frame.png",
		});

		expect(uploadedBody?.toString()).toBe("png-bytes");
		expect(result.url).toBe("https://signed.example/get");
		expect(result.urlExpiresAtIso).toBe(
			new Date(
				Date.parse("2026-07-01T00:00:00.000Z") + PROBE_SCREENSHOT_PRESIGN_TTL_SECONDS * 1000,
			).toISOString(),
		);
		expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
	});

	it("returns public url when publicBaseUrl is set", async function (): Promise<void> {
		const objectKey = "dev-vmaf-probe/shop/job/frame.png";
		const result = await putProbeScreenshotR2({
			r2Config: {
				...TEST_R2_CONFIG,
				publicBaseUrl: "https://cdn.example.com",
			},
			shopDomain: "shop.myshopify.com",
			objectKey: objectKey,
			pngFilePath: "/tmp/frame.png",
		});

		expect(result.url).toBe("https://cdn.example.com/dev-vmaf-probe/shop/job/frame.png");
		expect(result.urlExpiresAtIso).toBeNull();
		expect(getSignedUrlMock).not.toHaveBeenCalled();
	});
});
