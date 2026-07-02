/**
 * 模块名称：VMAF 测试夹具
 * 模块说明：mock 下载 / ffprobe / libvmaf，避免集成测真跑子进程。
 */

import type { IProbedVideoUrlMetadata } from "@worker/domain/probe/ffprobeParse.helpers.js";
import type { IRunVmafPairWithFfmpegResult } from "@worker/domain/vmaf/runVmafPairWithFfmpeg.js";
import { VMAF_FRAME_ANALYTICS_METHOD_NOTE } from "@worker/domain/vmaf/parseVmafFfmpegFrameAnalytics.js";
import type { TStreamDownloadToTempFileResult } from "@worker/domain/download/streamDownloadToTempFile.js";
import type { IDevVideoVmafFrameAnalytics } from "@worker/types/devVideoVmaf.types.js";

export const SAMPLE_VMAF_PROBE_METADATA: IProbedVideoUrlMetadata = {
	url: "https://cdn.example.com/video.mp4",
	width: 1280,
	height: 720,
	frameRateFps: 30,
	bitrateKbps: 2000,
	codec: "h264",
	format: "mp4",
	container: "mp4",
	durationSeconds: 10,
	sizeBytes: 1_000_000,
};

export function createMockVmafProbeMetadata(
	overrides?: Partial<IProbedVideoUrlMetadata>,
): (url: string) => Promise<IProbedVideoUrlMetadata> {
	return async function mockProbe(url: string): Promise<IProbedVideoUrlMetadata> {
		return {
			...SAMPLE_VMAF_PROBE_METADATA,
			url,
			...overrides,
		};
	};
}

export function createMockVmafDownload(
	options?: { failUrlIncludes?: string; delayMs?: number },
): (url: string) => Promise<TStreamDownloadToTempFileResult> {
	return async function mockDownload(url: string): Promise<TStreamDownloadToTempFileResult> {
		if (options?.delayMs) {
			await new Promise(function wait(resolve): void {
				setTimeout(resolve, options.delayMs);
			});
		}
		if (options?.failUrlIncludes && url.includes(options.failUrlIncludes)) {
			return { ok: false, error: "Download failed with status 500" };
		}
		return {
			ok: true,
			filePath: "/tmp/mock-vmaf-" + encodeURIComponent(url),
			fileSize: 1_000_000,
			downloadContentType: "video/mp4",
			downloadContentDispositionFilename: null,
			cleanup: async function cleanup(): Promise<void> {
				return;
			},
		};
	};
}

export function createSampleVmafFrameAnalytics(): IDevVideoVmafFrameAnalytics {
	return {
		methodNote: VMAF_FRAME_ANALYTICS_METHOD_NOTE,
		fps: 30,
		mean: 90,
		min: 70,
		p5: 88,
		thresholds: {
			90: { segmentCount: 0, totalDurationSec: 0, segments: [] },
			75: {
				segmentCount: 1,
				totalDurationSec: 1,
				segments: [
					{
						startSec: 1,
						endSec: 2,
						durationSec: 1,
						minVmaf: 70,
						worstFrameIndex: 30,
						worstSampleSec: 1,
					},
				],
			},
			50: { segmentCount: 0, totalDurationSec: 0, segments: [] },
		},
		screenshotPolicy: {
			threshold: 75,
			maxSegmentsWithScreenshots: 3,
			omittedScreenshotSegmentCount: 0,
		},
		screenshotsSkippedReason: null,
	};
}

export function createMockRunVmafPair(
	score = 95.5,
	frameAnalytics: IDevVideoVmafFrameAnalytics | null = null,
	harmonicMean = 94.2,
): (
	_input: Parameters<typeof import("@worker/domain/vmaf/runVmafPairWithFfmpeg.js").runVmafPairWithFfmpeg>[0],
) => Promise<IRunVmafPairWithFfmpegResult> {
	return async function mockRunVmaf(): Promise<IRunVmafPairWithFfmpegResult> {
		return {
			mean: score,
			harmonicMean: harmonicMean,
			frameAnalytics: frameAnalytics,
		};
	};
}

export const MOCK_VMAF_DEPS_BASE = {
	isLibvmafAvailableFn: async function mockLibvmaf(): Promise<boolean> {
		return true;
	},
	probeRuntimeCapabilitiesFn: async function mockRuntimeCapabilities() {
		return {
			ffmpegAvailable: true,
			ffprobeAvailable: true,
			libvmafAvailable: true,
			libvmafCudaAvailable: false,
			vmafExecutionMode: "cpu" as const,
		};
	},
};
