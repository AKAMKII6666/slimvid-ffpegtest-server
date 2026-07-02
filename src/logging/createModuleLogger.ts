/**
 * 模块名称：模块 Logger 工厂
 * 模块说明：pino 结构化日志；stdout + `.probeWorkerPinoLogs/app/` 按日落盘。
 */

import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import createPino, {
	destination,
	multistream,
	type DestinationStream,
	type Logger,
} from "pino";

import { PROBE_WORKER_SERVICE_NAME } from "../config/probeWorkerConfig.types.js";
import { resolveProbeWorkerPinoLogRetentionDays } from "./resolvePinoLogRetentionDays.js";

/** 落盘日志根目录名（相对 process.cwd()） */
export const PROBE_WORKER_LOG_DIR_NAME = ".probeWorkerPinoLogs";

/** 落盘 category */
export const PROBE_WORKER_LOG_CATEGORY = "app";

/** 过期日志清理间隔（1 小时） */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export interface ICreateModuleLoggerOptions {
	/** 子模块名，如 job.executor */
	module: string;
}

let rootLogger: Logger | null = null;
let pruneScheduled = false;

function resolveLogLevel(): string {
	const raw = process.env.LOG_LEVEL;
	if (typeof raw === "string" && raw.trim() !== "") {
		return raw.trim();
	}
	return "info";
}

/**
 * 落盘日志根目录绝对路径。
 */
export function resolveProbeWorkerLogDir(): string {
	return path.join(process.cwd(), PROBE_WORKER_LOG_DIR_NAME);
}

function formatLogDateUtc(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function resolveCategoryLogFilePath(logDir: string, dateStr: string): string {
	return path.join(logDir, PROBE_WORKER_LOG_CATEGORY, `${dateStr}.log`);
}

function shouldDeleteExpiredLogFile(
	filePath: string,
	name: string,
	datePattern: RegExp,
	cutoffMs: number,
): boolean {
	let fileTimeMs: number | null = null;
	const match = datePattern.exec(name);
	if (match) {
		const parsed = Date.parse(`${match[1]}T00:00:00.000Z`);
		if (!Number.isNaN(parsed)) {
			fileTimeMs = parsed;
		}
	}
	if (fileTimeMs === null) {
		try {
			fileTimeMs = statSync(filePath).mtimeMs;
		} catch {
			return false;
		}
	}
	return fileTimeMs < cutoffMs;
}

function tryDeleteLogFile(filePath: string): void {
	try {
		unlinkSync(filePath);
	} catch {
		// 清理失败不阻塞启动
	}
}

function pruneExpiredLogFiles(logDir: string): void {
	const retentionDays = resolveProbeWorkerPinoLogRetentionDays();
	const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
	const datePattern = /^(\d{4}-\d{2}-\d{2})\.log$/;
	const categoryDir = path.join(logDir, PROBE_WORKER_LOG_CATEGORY);

	let entries: string[];
	try {
		entries = readdirSync(categoryDir);
	} catch {
		return;
	}

	for (const name of entries) {
		if (!name.endsWith(".log")) {
			continue;
		}
		const filePath = path.join(categoryDir, name);
		if (shouldDeleteExpiredLogFile(filePath, name, datePattern, cutoffMs)) {
			tryDeleteLogFile(filePath);
		}
	}
}

function createCategoryFileDestination(logDir: string): DestinationStream {
	const categoryDir = path.join(logDir, PROBE_WORKER_LOG_CATEGORY);
	mkdirSync(categoryDir, { recursive: true });
	const dateStr = formatLogDateUtc(new Date());
	const logFile = resolveCategoryLogFilePath(logDir, dateStr);
	return destination({
		dest: logFile,
		mkdir: true,
		append: true,
		sync: false,
	});
}

function scheduleLogPrune(logDir: string): void {
	if (pruneScheduled) {
		return;
	}
	pruneScheduled = true;
	pruneExpiredLogFiles(logDir);
	const timer = setInterval(function (): void {
		pruneExpiredLogFiles(logDir);
	}, PRUNE_INTERVAL_MS);
	timer.unref();
}

function isProbeWorkerFileLoggingEnabled(): boolean {
	if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
		return false;
	}
	return true;
}

/**
 * 获取 worker 根 logger（stdout + 落盘）；懒初始化。
 */
export function getProbeWorkerRootLogger(): Logger {
	if (rootLogger) {
		return rootLogger;
	}

	const logDir = resolveProbeWorkerLogDir();
	const level = resolveLogLevel();

	if (!isProbeWorkerFileLoggingEnabled()) {
		rootLogger = createPino({
			level: level,
			base: {
				service: PROBE_WORKER_SERVICE_NAME,
			},
		});
		return rootLogger;
	}

	mkdirSync(logDir, { recursive: true });
	scheduleLogPrune(logDir);

	const fileDestination = createCategoryFileDestination(logDir);
	rootLogger = createPino(
		{
			level: level,
			base: {
				service: PROBE_WORKER_SERVICE_NAME,
			},
		},
		multistream([
			{ stream: process.stdout },
			{ stream: fileDestination },
		]),
	);

	return rootLogger;
}

/**
 * Fastify 使用的 logger 实例（与业务 log 同落盘）。
 */
export function createFastifyLoggerInstance(): Logger {
	return getProbeWorkerRootLogger().child({ module: "http.app" });
}

/**
 * 创建带 service + module 字段的 logger。
 */
export function createModuleLogger(options: ICreateModuleLoggerOptions): Logger {
	return getProbeWorkerRootLogger().child({ module: options.module });
}
