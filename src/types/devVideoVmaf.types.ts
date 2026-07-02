/**
 * 模块名称：Dev VMAF Wire DTO mirror
 * 模块说明：对齐主 app devVideoCompressCompareVmaf.types.ts（含 frame analytics）。
 */

/** VMAF skip 原因 */
export type TDevVideoCompressCompareVmafSkipReason =
	| "hls"
	| "download_failed"
	| "ffprobe_incomplete"
	| "duration_mismatch"
	| "vmaf_failed";

/** VMAF 逐帧分析阈值 */
export type TDevVideoVmafFrameAnalyticsThreshold = 90 | 75 | 50;

/** 单段低分区间 */
export interface IDevVideoVmafFrameSegment {
	startSec: number;
	endSec: number;
	durationSec: number;
	minVmaf: number;
	worstFrameIndex: number;
	worstSampleSec: number;
	screenshots?: IDevVideoVmafFrameSegmentScreenshot[];
	screenshotOmitted?: boolean;
}

/** 段内截图（R5 填充） */
export interface IDevVideoVmafFrameSegmentScreenshot {
	role: "reference" | "distorted";
	label: string;
	url: string;
	urlExpiresAtIso: string | null;
	sampleSec: number;
	frameIndex: number;
}

/** 单阈值汇总 */
export interface IDevVideoVmafFrameThresholdAnalytics {
	segmentCount: number;
	totalDurationSec: number;
	segments: IDevVideoVmafFrameSegment[];
}

/** VMAF 逐帧分析 wire */
export interface IDevVideoVmafFrameAnalytics {
	methodNote: string;
	fps: number;
	mean: number;
	min: number;
	p5: number;
	thresholds: Record<TDevVideoVmafFrameAnalyticsThreshold, IDevVideoVmafFrameThresholdAnalytics>;
	screenshotPolicy: {
		threshold: 75;
		maxSegmentsWithScreenshots: 3;
		omittedScreenshotSegmentCount: number;
	};
	screenshotsSkippedReason: string | null;
}

/** 单 candidate 各 mode 的逐帧分析 */
export interface IDevVideoCompressCompareVmafRowFrameAnalyticsByMode {
	delivery: IDevVideoVmafFrameAnalytics | null;
	display1080p: IDevVideoVmafFrameAnalytics | null;
}

/** 单 candidate VMAF 结果 */
export interface IDevVideoCompressCompareVmafRow {
	candidateLabel: string;
	candidateGroup: "shopify" | "slimvid";
	candidateUrl: string;
	deliveryWidth: number;
	deliveryHeight: number;
	vmafAtDelivery: number | null;
	vmafAtDisplay1080p: number | null;
	skipped: boolean;
	skipReason?: TDevVideoCompressCompareVmafSkipReason;
	vmafFrameAnalytics?: IDevVideoCompressCompareVmafRowFrameAnalyticsByMode;
}

/** VMAF 完整报告 */
export interface IDevVideoCompressCompareVmafReport {
	jobId: string;
	videoId: string;
	referenceLabel: string;
	vmafModel: string;
	probedAtIso: string;
	totalDurationMs: number;
	rows: IDevVideoCompressCompareVmafRow[];
}
