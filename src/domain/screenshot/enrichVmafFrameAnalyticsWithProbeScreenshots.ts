/**
 * 模块名称：VMAF 逐帧分析截图 enrichment
 * 模块说明：为 <75 segments 截帧上传 R2 并写回 wire DTO。
 */

import { unlink } from "node:fs/promises";

import type { IProbeWorkerR2Config } from "../../config/probeWorkerConfig.types.js";
import type { TVmafFfmpegMode } from "../vmaf/buildVmafFfmpegFilterGraph.js";
import type {
	IDevVideoVmafFrameAnalytics,
	IDevVideoVmafFrameSegment,
	IDevVideoVmafFrameSegmentScreenshot,
} from "../../types/devVideoVmaf.types.js";
import { buildVmafProbeScreenshotObjectKey } from "./buildVmafProbeScreenshotObjectKey.js";
import { captureVmafProbeFrameWithFfmpeg } from "./captureVmafProbeFrameWithFfmpeg.js";
import {
	buildVmafProbeScreenshotSegmentCapPlan,
	shouldContinueVmafProbeScreenshotLoop,
	VMAF_PROBE_MAX_SCREENSHOT_SEGMENTS_PER_MODE,
	VMAF_PROBE_SCREENSHOT_THRESHOLD,
} from "./devVmafProbeScreenshotPolicy.helpers.js";
import { putProbeScreenshotR2 } from "./putProbeScreenshotR2.js";

export const VMAF_PROBE_SCREENSHOTS_SKIPPED_REASON_R2_NOT_CONFIGURED = "r2_not_configured";

export interface IEnrichVmafFrameAnalyticsWithProbeScreenshotsInput {
	r2Config: IProbeWorkerR2Config | null;
	shopDomain: string;
	jobId: string;
	vmafMode: TVmafFfmpegMode;
	candidateLabel: string;
	referenceLabel: string;
	referenceFilePath: string;
	distortedFilePath: string;
	frameAnalytics: IDevVideoVmafFrameAnalytics;
	shouldAbort?: () => boolean;
	ffmpegPath?: string;
	keySegment?: string;
	maxSegmentsPerMode?: number;
}

async function cleanupVmafProbeTempPng(filePath: string): Promise<void> {
	await unlink(filePath).catch(function (): void {
		// 忽略清理失败
	});
}

async function uploadVmafProbeSegmentScreenshot(params: {
	r2Config: IProbeWorkerR2Config;
	shopDomain: string;
	jobId: string;
	vmafMode: TVmafFfmpegMode;
	candidateLabel: string;
	role: "reference" | "distorted";
	label: string;
	segmentIndex: number;
	frameIndex: number;
	sampleSec: number;
	inputFilePath: string;
	ffmpegPath?: string;
	keySegment?: string;
}): Promise<IDevVideoVmafFrameSegmentScreenshot | null> {
	const captureResult = await captureVmafProbeFrameWithFfmpeg({
		inputFilePath: params.inputFilePath,
		sampleSec: params.sampleSec,
		ffmpegPath: params.ffmpegPath,
	});
	if (!captureResult.ok) {
		return null;
	}

	try {
		const objectKey = buildVmafProbeScreenshotObjectKey({
			r2Config: params.r2Config,
			shopDomain: params.shopDomain,
			jobId: params.jobId,
			vmafMode: params.vmafMode,
			candidateLabel: params.candidateLabel,
			role: params.role,
			segmentIndex: params.segmentIndex,
			frameIndex: params.frameIndex,
			keySegment: params.keySegment,
		});
		const uploaded = await putProbeScreenshotR2({
			r2Config: params.r2Config,
			shopDomain: params.shopDomain,
			objectKey: objectKey,
			pngFilePath: captureResult.filePath,
		});
		return {
			role: params.role,
			label: params.label,
			url: uploaded.url,
			urlExpiresAtIso: uploaded.urlExpiresAtIso,
			sampleSec: params.sampleSec,
			frameIndex: params.frameIndex,
		};
	} finally {
		await cleanupVmafProbeTempPng(captureResult.filePath);
	}
}

async function enrichVmafProbeSegmentWithScreenshots(params: {
	r2Config: IProbeWorkerR2Config;
	shopDomain: string;
	jobId: string;
	vmafMode: TVmafFfmpegMode;
	candidateLabel: string;
	referenceLabel: string;
	referenceFilePath: string;
	distortedFilePath: string;
	segment: IDevVideoVmafFrameSegment;
	segmentIndex: number;
	ffmpegPath?: string;
	keySegment?: string;
}): Promise<IDevVideoVmafFrameSegment> {
	const screenshots: IDevVideoVmafFrameSegmentScreenshot[] = [];

	const referenceScreenshot = await uploadVmafProbeSegmentScreenshot({
		r2Config: params.r2Config,
		shopDomain: params.shopDomain,
		jobId: params.jobId,
		vmafMode: params.vmafMode,
		candidateLabel: params.candidateLabel,
		role: "reference",
		label: params.referenceLabel,
		segmentIndex: params.segmentIndex,
		frameIndex: params.segment.worstFrameIndex,
		sampleSec: params.segment.worstSampleSec,
		inputFilePath: params.referenceFilePath,
		ffmpegPath: params.ffmpegPath,
		keySegment: params.keySegment,
	});
	if (referenceScreenshot) {
		screenshots.push(referenceScreenshot);
	}

	const distortedScreenshot = await uploadVmafProbeSegmentScreenshot({
		r2Config: params.r2Config,
		shopDomain: params.shopDomain,
		jobId: params.jobId,
		vmafMode: params.vmafMode,
		candidateLabel: params.candidateLabel,
		role: "distorted",
		label: params.candidateLabel,
		segmentIndex: params.segmentIndex,
		frameIndex: params.segment.worstFrameIndex,
		sampleSec: params.segment.worstSampleSec,
		inputFilePath: params.distortedFilePath,
		ffmpegPath: params.ffmpegPath,
		keySegment: params.keySegment,
	});
	if (distortedScreenshot) {
		screenshots.push(distortedScreenshot);
	}

	if (screenshots.length !== 2) {
		return {
			...params.segment,
			screenshotOmitted: true,
		};
	}

	return {
		...params.segment,
		screenshots: screenshots,
	};
}

function markVmafProbeCapOmittedSegments(
	segments: IDevVideoVmafFrameSegment[],
	selectedIndexSet: Set<number>,
): IDevVideoVmafFrameSegment[] {
	const marked: IDevVideoVmafFrameSegment[] = [];
	for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
		const segment = segments[segmentIndex];
		if (!selectedIndexSet.has(segmentIndex)) {
			marked.push({
				...segment,
				screenshotOmitted: true,
			});
			continue;
		}
		marked.push(segment);
	}
	return marked;
}

function buildVmafFrameAnalyticsWithoutR2Screenshots(
	frameAnalytics: IDevVideoVmafFrameAnalytics,
	capPlan: ReturnType<typeof buildVmafProbeScreenshotSegmentCapPlan>,
	selectedIndexSet: Set<number>,
	maxSegmentsPerMode: number,
): IDevVideoVmafFrameAnalytics {
	const sub75Segments = frameAnalytics.thresholds[75].segments;
	const segmentsWithCapFlags = markVmafProbeCapOmittedSegments(sub75Segments, selectedIndexSet);
	const segmentsWithoutUpload = segmentsWithCapFlags.map(function (
		segment,
		segmentIndex,
	): IDevVideoVmafFrameSegment {
		if (!selectedIndexSet.has(segmentIndex)) {
			return segment;
		}
		return {
			...segment,
			screenshotOmitted: true,
		};
	});

	return {
		...frameAnalytics,
		thresholds: {
			...frameAnalytics.thresholds,
			75: {
				...frameAnalytics.thresholds[75],
				segments: segmentsWithoutUpload,
			},
		},
		screenshotPolicy: {
			threshold: 75 as const,
			maxSegmentsWithScreenshots: maxSegmentsPerMode as 3,
			omittedScreenshotSegmentCount: capPlan.omittedScreenshotSegmentCount,
		},
		screenshotsSkippedReason: VMAF_PROBE_SCREENSHOTS_SKIPPED_REASON_R2_NOT_CONFIGURED,
	};
}

export async function enrichVmafFrameAnalyticsWithProbeScreenshots(
	input: IEnrichVmafFrameAnalyticsWithProbeScreenshotsInput,
): Promise<IDevVideoVmafFrameAnalytics> {
	const maxSegmentsPerMode =
		input.maxSegmentsPerMode ?? VMAF_PROBE_MAX_SCREENSHOT_SEGMENTS_PER_MODE;
	const sub75Segments = input.frameAnalytics.thresholds[75].segments;
	const capPlan = buildVmafProbeScreenshotSegmentCapPlan(sub75Segments, maxSegmentsPerMode);
	const selectedIndexSet = new Set<number>(capPlan.selectedIndexes);

	if (!input.r2Config) {
		return buildVmafFrameAnalyticsWithoutR2Screenshots(
			input.frameAnalytics,
			capPlan,
			selectedIndexSet,
			maxSegmentsPerMode,
		);
	}

	const enrichedSub75Segments: IDevVideoVmafFrameSegment[] = [];

	for (let segmentIndex = 0; segmentIndex < sub75Segments.length; segmentIndex++) {
		const segment = sub75Segments[segmentIndex];

		if (!selectedIndexSet.has(segmentIndex)) {
			enrichedSub75Segments.push({
				...segment,
				screenshotOmitted: true,
			});
			continue;
		}

		if (!shouldContinueVmafProbeScreenshotLoop(input.shouldAbort)) {
			enrichedSub75Segments.push({
				...segment,
				screenshotOmitted: true,
			});
			continue;
		}

		const enrichedSegment = await enrichVmafProbeSegmentWithScreenshots({
			r2Config: input.r2Config,
			shopDomain: input.shopDomain,
			jobId: input.jobId,
			vmafMode: input.vmafMode,
			candidateLabel: input.candidateLabel,
			referenceLabel: input.referenceLabel,
			referenceFilePath: input.referenceFilePath,
			distortedFilePath: input.distortedFilePath,
			segment: segment,
			segmentIndex: segmentIndex,
			ffmpegPath: input.ffmpegPath,
			keySegment: input.keySegment,
		});
		enrichedSub75Segments.push(enrichedSegment);
	}

	return {
		...input.frameAnalytics,
		thresholds: {
			...input.frameAnalytics.thresholds,
			75: {
				...input.frameAnalytics.thresholds[75],
				segments: enrichedSub75Segments,
			},
		},
		screenshotPolicy: {
			threshold: 75 as const,
			maxSegmentsWithScreenshots: maxSegmentsPerMode as 3,
			omittedScreenshotSegmentCount: capPlan.omittedScreenshotSegmentCount,
		},
		screenshotsSkippedReason: null,
	};
}
