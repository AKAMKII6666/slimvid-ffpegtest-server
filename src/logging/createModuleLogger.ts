/**
 * 模块名称：模块 Logger 工厂
 * 模块说明：pino 结构化日志；禁止 ad-hoc console.log。
 */

import pino, { type Logger } from "pino";

import { PROBE_WORKER_SERVICE_NAME } from "../config/probeWorkerConfig.types.js";

export interface ICreateModuleLoggerOptions {
	/** 子模块名，如 http.health */
	module: string;
}

/**
 * 创建带 service + module 字段的 logger。
 */
export function createModuleLogger(options: ICreateModuleLoggerOptions): Logger {
	return pino({
		level: process.env.LOG_LEVEL ?? "info",
		base: {
			service: PROBE_WORKER_SERVICE_NAME,
			module: options.module,
		},
	});
}
