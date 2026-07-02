/**
 * 模块名称：pino 落盘日志保留天数
 * 模块说明：从 PROBE_WORKER_PINO_LOG_RETENTION_DAYS 解析；非法或未设时默认 12。
 */

/** 默认保留天数 */
export const DEFAULT_PROBE_WORKER_PINO_LOG_RETENTION_DAYS = 12;

/**
 * 解析 pino 落盘日志保留天数。
 */
export function resolveProbeWorkerPinoLogRetentionDays(): number {
	const raw = process.env.PROBE_WORKER_PINO_LOG_RETENTION_DAYS;
	if (typeof raw !== "string" || raw.trim() === "") {
		return DEFAULT_PROBE_WORKER_PINO_LOG_RETENTION_DAYS;
	}
	const parsed = Number.parseInt(raw.trim(), 10);
	if (!Number.isFinite(parsed) || parsed < 1) {
		return DEFAULT_PROBE_WORKER_PINO_LOG_RETENTION_DAYS;
	}
	return parsed;
}
