/**
 * 模块名称：FFmpeg 子进程 Spawner 类型
 * 模块说明：可注入 spawner，供 probeRuntimeCapabilities 单测 mock。
 */

import { spawn } from "node:child_process";

export interface IFfmpegSpawnResult {
	stdout: {
		on(event: "data", listener: (chunk: Buffer) => void): void;
	};
	stderr?: {
		on(event: "data", listener: (chunk: Buffer) => void): void;
	};
	on(event: "error", listener: (error: Error) => void): void;
	on(event: "close", listener: (code: number | null) => void): void;
}

export type TFfmpegSpawner = (
	command: string,
	args: string[],
) => IFfmpegSpawnResult;

/** 默认使用 node:child_process.spawn */
export function createNodeFfmpegSpawner(): TFfmpegSpawner {
	return function spawnCommand(command: string, args: string[]): IFfmpegSpawnResult {
		return spawn(command, args, {
			stdio: ["ignore", "pipe", "pipe"],
		}) as unknown as IFfmpegSpawnResult;
	};
}
