/**
 * 模块名称：日志文本截断
 * 模块说明：限制 stderr 等长文本写入 pino 字段的长度。
 */

/** 默认最大字符数 */
export const DEFAULT_LOG_TEXT_TRUNCATE_LENGTH = 2000;

/**
 * 截断日志文本，避免单条 log 过大。
 *
 * @param text — 原始文本
 * @param maxLength — 最大长度
 */
export function truncateLogText(text: string, maxLength = DEFAULT_LOG_TEXT_TRUNCATE_LENGTH): string {
	if (text.length <= maxLength) {
		return text;
	}
	return text.slice(0, maxLength) + "...[truncated]";
}
