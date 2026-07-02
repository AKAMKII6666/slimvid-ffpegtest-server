import { afterEach, describe, expect, it, vi } from "vitest";

import {
	parseFilenameFromContentDisposition,
	streamDownloadToTempFile,
} from "@worker/domain/download/streamDownloadToTempFile.js";

describe("parseFilenameFromContentDisposition", function () {
	it("parses quoted filename", function () {
		expect(
			parseFilenameFromContentDisposition('attachment; filename="product-demo_compressed.mp4"'),
		).toBe("product-demo_compressed.mp4");
	});

	it("returns null when header missing", function () {
		expect(parseFilenameFromContentDisposition(null)).toBeNull();
	});
});

describe("streamDownloadToTempFile", function () {
	afterEach(function (): void {
		vi.unstubAllGlobals();
	});

	it("captures download response filename and content type", async function () {
		const body = "video-binary-content";
		vi.stubGlobal(
			"fetch",
			vi.fn(async function (): Promise<Response> {
				return new Response(body, {
					status: 200,
					headers: {
						"Content-Type": "video/mp4",
						"Content-Disposition": 'attachment; filename="product-demo_compressed.mp4"',
					},
				});
			}),
		);

		const result = await streamDownloadToTempFile("https://cdn.example.com/video.mp4", {
			timeoutMs: 30_000,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.downloadContentType).toBe("video/mp4");
			expect(result.downloadContentDispositionFilename).toBe("product-demo_compressed.mp4");
			await result.cleanup();
		}
	});

	it("aborts when external signal aborts", async function () {
		const controller = new AbortController();
		vi.stubGlobal(
			"fetch",
			vi.fn(async function (_url, init?: RequestInit): Promise<Response> {
				if (init?.signal?.aborted) {
					throw new DOMException("Aborted", "AbortError");
				}
				controller.abort();
				throw new DOMException("Aborted", "AbortError");
			}),
		);

		const result = await streamDownloadToTempFile("https://cdn.example.com/video.mp4", {
			signal: controller.signal,
			timeoutMs: 30_000,
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/aborted/i);
		}
	});
});
