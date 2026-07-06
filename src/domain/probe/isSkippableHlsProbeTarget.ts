/**
 * 模块名称：HLS / m3u8 探针跳过判定
 * 模块说明：compare ffprobe 与 VMAF candidate 共用；HLS 播放列表无法产出完整字节对比元数据。
 */

export interface ISkippableHlsProbeTarget {
	url: string;
	label?: string;
	formatHint?: string;
	mimeType?: string;
}

/**
 * 是否应跳过对该 URL 的 ffprobe / VMAF（HLS 播放列表）。
 */
export function isSkippableHlsProbeTarget(target: ISkippableHlsProbeTarget): boolean {
	const urlLower = target.url.trim().toLowerCase();
	if (urlLower.includes(".m3u8")) {
		return true;
	}

	const labelLower = (target.label ?? "").trim().toLowerCase();
	if (labelLower.startsWith("m3u8") || labelLower.startsWith("hls")) {
		return true;
	}

	const formatLower = (target.formatHint ?? "").trim().toLowerCase();
	if (formatLower === "m3u8" || formatLower === "hls") {
		return true;
	}

	const mimeLower = (target.mimeType ?? "").trim().toLowerCase();
	if (mimeLower.includes("mpegurl") || mimeLower.includes("x-mpegurl")) {
		return true;
	}

	return false;
}
