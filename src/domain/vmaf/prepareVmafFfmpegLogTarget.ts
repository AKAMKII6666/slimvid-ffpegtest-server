/**
 * 模块名称：VMAF ffmpeg log 路径准备
 * 模块说明：滤镜内使用无盘符相对文件名 + spawn cwd，避免 Windows log_path 转义问题。
 */

import { mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

/** VMAF JSON log 工作目录（相对进程 cwd） */
export const VMAF_FFMPEG_LOG_DIR_NAME = ".probe-vmaf-logs";

/** 单次 VMAF ffmpeg 的 log 目标 */
export interface IVmafFfmpegLogTarget {
	/** 写入 -lavfi 滤镜的 log_path（仅文件名） */
	logPathForFilter: string;
	/** 读回 JSON 的绝对路径 */
	absoluteLogPath: string;
	/** ffmpeg 子进程 cwd */
	ffmpegCwd: string;
	/** 删除 log 文件 */
	cleanup: () => Promise<void>;
}

/**
 * 准备 libvmaf log 输出：目录 + 唯一文件名。
 */
export async function prepareVmafFfmpegLogTarget(): Promise<IVmafFfmpegLogTarget> {
	const ffmpegCwd = join(process.cwd(), VMAF_FFMPEG_LOG_DIR_NAME);
	await mkdir(ffmpegCwd, { recursive: true });

	const logPathForFilter = "slimvid-vmaf-" + randomUUID() + ".json";
	const absoluteLogPath = join(ffmpegCwd, logPathForFilter);

	return {
		logPathForFilter: logPathForFilter,
		absoluteLogPath: absoluteLogPath,
		ffmpegCwd: ffmpegCwd,
		cleanup: async function cleanupVmafFfmpegLogTarget(): Promise<void> {
			await unlink(absoluteLogPath).catch(function (): void {
				// 忽略清理失败
			});
		},
	};
}
