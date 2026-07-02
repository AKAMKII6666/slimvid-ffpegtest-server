/**
 * 模块名称：ffprobe JSON 解析辅助
 * 模块说明：从主 app probeVideoUrlMetadata 移植；worker 不做 CDN 域名白名单。
 */

/** ffprobe JSON 最小形态 */
export interface IFfprobeJsonPayload {
	streams?: Array<{
		codec_type?: string;
		codec_name?: string;
		width?: number;
		height?: number;
		bit_rate?: string;
		r_frame_rate?: string;
		avg_frame_rate?: string;
	}>;
	format?: {
		format_name?: string;
		duration?: string;
		bit_rate?: string;
		size?: string;
		tags?: Record<string, string>;
	};
}

/** 探测成功元数据 */
export interface IProbedVideoUrlMetadata {
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

/** HEAD 探针可用的响应头提示 */
export interface IDevVideoProbeHeadHints {
	sizeBytes: number;
	contentType: string;
	contentDisposition: string;
}

export interface IResolveDevVideoProbeContainerLabelInput {
	url: string;
	formatName: string;
	majorBrand?: string;
	contentType?: string;
	contentDisposition?: string;
}

const FFPROBE_MP4_MAJOR_BRAND_PREFIXES: readonly string[] = [
	"isom",
	"iso2",
	"mp41",
	"mp42",
	"m4v",
	"avc1",
	"dash",
	"cmfc",
	"f4v",
];

export function parseFfprobeFrameRate(raw: string): number {
	const trimmed = raw.trim();
	if (trimmed === "" || trimmed === "0/0") {
		return 0;
	}
	const parts = trimmed.split("/");
	if (parts.length === 2) {
		const numerator = Number(parts[0]);
		const denominator = Number(parts[1]);
		if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
			return numerator / denominator;
		}
	}
	const asNumber = Number(trimmed);
	if (Number.isFinite(asNumber) && asNumber > 0) {
		return asNumber;
	}
	return 0;
}

export function convertBpsToKbps(bps: number): number {
	if (!Number.isFinite(bps) || bps <= 0) {
		return 0;
	}
	return Math.round((bps / 1000) * 10) / 10;
}

function tokenizeFfprobeFormatName(formatName: string): string[] {
	const tokens: string[] = [];
	const parts = formatName.split(",");
	for (let index = 0; index < parts.length; index++) {
		const token = parts[index].trim().toLowerCase();
		if (token !== "") {
			tokens.push(token);
		}
	}
	return tokens;
}

function urlPathSuggestsMp4(url: string): boolean {
	try {
		const pathname = new URL(url).pathname.toLowerCase();
		return pathname.endsWith(".mp4");
	} catch {
		return false;
	}
}

function contentDispositionSuggestsMp4(contentDisposition: string): boolean {
	const trimmed = contentDisposition.trim();
	if (trimmed === "") {
		return false;
	}
	const filenameMatch = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(trimmed);
	if (filenameMatch) {
		const filename = filenameMatch[1].trim().replace(/^"|"$/g, "").toLowerCase();
		return filename.endsWith(".mp4");
	}
	return trimmed.toLowerCase().includes(".mp4");
}

function contentTypeSuggestsMp4(contentType: string): boolean {
	const mime = contentType.trim().toLowerCase().split(";")[0].trim();
	return mime === "video/mp4" || mime === "application/mp4";
}

function normalizeFfprobeMajorBrand(majorBrand: string): string {
	return majorBrand.trim().toLowerCase().replace(/\0/g, "").trim();
}

function majorBrandSuggestsMp4(majorBrand: string): boolean {
	const normalized = normalizeFfprobeMajorBrand(majorBrand);
	if (normalized === "") {
		return false;
	}
	for (let index = 0; index < FFPROBE_MP4_MAJOR_BRAND_PREFIXES.length; index++) {
		const prefix = FFPROBE_MP4_MAJOR_BRAND_PREFIXES[index];
		if (normalized === prefix || normalized.startsWith(prefix)) {
			return true;
		}
	}
	return false;
}

function ffprobeSuggestsMp4(tokens: string[], majorBrand: string): boolean {
	return tokens.includes("mp4") || majorBrandSuggestsMp4(majorBrand);
}

function majorBrandSuggestsQuickTime(majorBrand: string): boolean {
	const normalized = normalizeFfprobeMajorBrand(majorBrand);
	return normalized === "qt" || normalized.startsWith("qt");
}

export function resolveDevVideoProbeContainerLabel(
	input: IResolveDevVideoProbeContainerLabelInput,
): string {
	const formatName = input.formatName.trim();
	const tokens = tokenizeFfprobeFormatName(formatName);
	const contentType = typeof input.contentType === "string" ? input.contentType : "";
	const contentDisposition =
		typeof input.contentDisposition === "string" ? input.contentDisposition : "";
	const majorBrand = typeof input.majorBrand === "string" ? input.majorBrand : "";

	if (tokens.includes("hls")) {
		return "hls";
	}

	if (ffprobeSuggestsMp4(tokens, majorBrand)) {
		return "mp4";
	}

	if (majorBrandSuggestsQuickTime(majorBrand)) {
		return "mov";
	}

	if (
		contentTypeSuggestsMp4(contentType) ||
		contentDispositionSuggestsMp4(contentDisposition) ||
		urlPathSuggestsMp4(input.url)
	) {
		return "mp4";
	}

	if (tokens.length > 0) {
		return tokens[0];
	}

	return "unknown";
}

export function parseFfprobeJsonToMetadata(
	url: string,
	payload: IFfprobeJsonPayload,
	sizeBytes: number,
	headHints?: Pick<IDevVideoProbeHeadHints, "contentType" | "contentDisposition">,
): IProbedVideoUrlMetadata | null {
	const streams = payload.streams ?? [];
	let videoStream: (typeof streams)[number] | null = null;
	for (let index = 0; index < streams.length; index++) {
		if (streams[index].codec_type === "video") {
			videoStream = streams[index];
			break;
		}
	}
	if (!videoStream) {
		return null;
	}

	const format = payload.format ?? {};
	const width =
		typeof videoStream.width === "number" && Number.isFinite(videoStream.width) && videoStream.width > 0
			? videoStream.width
			: 0;
	const height =
		typeof videoStream.height === "number" &&
		Number.isFinite(videoStream.height) &&
		videoStream.height > 0
			? videoStream.height
			: 0;

	const frameRateRaw =
		typeof videoStream.avg_frame_rate === "string" && videoStream.avg_frame_rate.trim() !== ""
			? videoStream.avg_frame_rate
			: typeof videoStream.r_frame_rate === "string"
				? videoStream.r_frame_rate
				: "";
	const frameRateFps = parseFfprobeFrameRate(frameRateRaw);

	let bitrateBps = 0;
	if (typeof videoStream.bit_rate === "string" && videoStream.bit_rate.trim() !== "") {
		bitrateBps = Number(videoStream.bit_rate);
	}
	if (!Number.isFinite(bitrateBps) || bitrateBps <= 0) {
		if (typeof format.bit_rate === "string" && format.bit_rate.trim() !== "") {
			bitrateBps = Number(format.bit_rate);
		}
	}
	const bitrateKbps = convertBpsToKbps(bitrateBps);

	const codec =
		typeof videoStream.codec_name === "string" && videoStream.codec_name.trim() !== ""
			? videoStream.codec_name.trim()
			: "unknown";

	const formatName =
		typeof format.format_name === "string" && format.format_name.trim() !== ""
			? format.format_name.trim()
			: "";
	const majorBrand =
		typeof format.tags?.major_brand === "string" ? format.tags.major_brand : undefined;
	const container = resolveDevVideoProbeContainerLabel({
		url,
		formatName,
		majorBrand,
		contentType: headHints?.contentType,
		contentDisposition: headHints?.contentDisposition,
	});
	const formatLabel = container !== "unknown" ? container : codec;

	let durationSeconds = 0;
	if (typeof format.duration === "string" && format.duration.trim() !== "") {
		const parsedDuration = Number(format.duration);
		if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
			durationSeconds = parsedDuration;
		}
	}

	let resolvedSizeBytes = sizeBytes;
	if (resolvedSizeBytes <= 0 && typeof format.size === "string" && format.size.trim() !== "") {
		const parsedSize = Number(format.size);
		if (Number.isFinite(parsedSize) && parsedSize > 0) {
			resolvedSizeBytes = parsedSize;
		}
	}

	if (
		width <= 0 ||
		height <= 0 ||
		frameRateFps <= 0 ||
		bitrateKbps <= 0 ||
		durationSeconds <= 0 ||
		resolvedSizeBytes <= 0
	) {
		return null;
	}

	return {
		url,
		width,
		height,
		frameRateFps: Math.round(frameRateFps * 100) / 100,
		bitrateKbps,
		codec,
		format: formatLabel,
		container,
		durationSeconds: Math.round(durationSeconds * 100) / 100,
		sizeBytes: Math.round(resolvedSizeBytes),
	};
}
