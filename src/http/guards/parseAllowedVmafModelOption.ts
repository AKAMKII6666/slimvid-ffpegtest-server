/**
 * 模块名称：VMAF model 选项解析
 * 模块说明：job spec options.vmafModel 白名单，防止注入 ffmpeg 滤镜参数。
 */

/** libvmaf model version 允许字符（如 vmaf_v0.6.1） */
const ALLOWED_VMAF_MODEL_PATTERN = /^vmaf_v[\d.]+$/;

function parseNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed === "") {
		return null;
	}
	return trimmed;
}

/**
 * 解析 options.vmafModel。
 *
 * @returns `undefined` — 未提供，由运行时默认；`null` — 非法值
 */
export function parseAllowedVmafModelOption(value: unknown): string | undefined | null {
	if (value === undefined || value === null) {
		return undefined;
	}
	const parsed = parseNonEmptyString(value);
	if (!parsed) {
		return null;
	}
	if (!ALLOWED_VMAF_MODEL_PATTERN.test(parsed)) {
		return null;
	}
	return parsed;
}
