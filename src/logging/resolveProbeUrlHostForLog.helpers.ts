/**
 * 模块名称：探针 URL host 解析（日志用）
 * 模块说明：禁止 log 完整 CDN URL（含 signed query）。
 */

/**
 * 从 URL 提取 host；失败时返回占位符。
 *
 * @param url — 视频 URL
 */
export function resolveProbeUrlHostForLog(url: string): string {
	const trimmed = url.trim();
	if (trimmed === "") {
		return "empty-url";
	}
	try {
		return new URL(trimmed).host;
	} catch {
		return "invalid-url";
	}
}
