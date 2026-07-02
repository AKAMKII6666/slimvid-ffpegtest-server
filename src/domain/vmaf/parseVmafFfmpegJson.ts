/**
 * 模块名称：VMAF ffmpeg JSON 解析
 * 模块说明：解析 libvmaf log_fmt=json 输出为 mean / harmonic_mean / min。
 */

export interface IVmafFfmpegJsonPayload {
	pooled_metrics?: {
		vmaf?: {
			mean?: number;
			min?: number;
			harmonic_mean?: number;
		};
	};
}

export function parseVmafFfmpegJsonMean(jsonText: string): number | null {
	const trimmed = jsonText.trim();
	if (trimmed === "") {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed) as IVmafFfmpegJsonPayload;
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== "object") {
		return null;
	}

	const payload = parsed as IVmafFfmpegJsonPayload;
	const mean = payload.pooled_metrics?.vmaf?.mean;
	if (typeof mean !== "number" || !Number.isFinite(mean)) {
		return null;
	}

	return Math.round(mean * 100) / 100;
}

export function parseVmafFfmpegJsonHarmonicMean(jsonText: string): number | null {
	const trimmed = jsonText.trim();
	if (trimmed === "") {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed) as IVmafFfmpegJsonPayload;
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== "object") {
		return null;
	}

	const payload = parsed as IVmafFfmpegJsonPayload;
	const harmonicMean = payload.pooled_metrics?.vmaf?.harmonic_mean;
	if (typeof harmonicMean !== "number" || !Number.isFinite(harmonicMean)) {
		return null;
	}

	return Math.round(harmonicMean * 1_000_000) / 1_000_000;
}

export function parseVmafFfmpegJsonMin(jsonText: string): number | null {
	const trimmed = jsonText.trim();
	if (trimmed === "") {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed) as IVmafFfmpegJsonPayload;
	} catch {
		return null;
	}

	const payload = parsed as IVmafFfmpegJsonPayload;
	const min = payload.pooled_metrics?.vmaf?.min;
	if (typeof min !== "number" || !Number.isFinite(min)) {
		return null;
	}

	return Math.round(min * 100) / 100;
}
