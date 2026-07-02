/**
 * 模块名称：Dev Compare Wire DTO mirror
 * 模块说明：对齐主 app devVideoCompressCompare.types.ts（只读对照，禁止 import 主 app）。
 */

export type TDevVideoCompressCompareRenditionGroup = "shopify" | "slimvid";

/** 单条 rendition 探针结果 */
export interface IDevVideoCompressCompareRendition {
	group: TDevVideoCompressCompareRenditionGroup;
	label: string;
	url: string;
	width: number;
	height: number;
	frameRateFps: number;
	bitrateKbps: number;
	codec: string;
	format: string;
	container: string;
	durationSeconds: number;
	sizeBytes: number;
}

/** compare 阶段终态（V1 不含 comparisons/notes） */
export interface IProbeComputeCompareResult {
	productName: string;
	videoId: string;
	linkedCompressTaskId?: string;
	probedAtIso: string;
	renditions: IDevVideoCompressCompareRendition[];
}
