/**
 * 模块名称：ffprobe 子进程执行
 * 模块说明：可注入 execFile；返回结构化成功/失败（含 stderr 摘要）。
 */

import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

import {
	extractFfprobeExecFailureDetails,
	type TFfprobeRunResult,
} from "./ffprobeRunResult.types.js";
import type { IFfprobeJsonPayload } from "./ffprobeParse.helpers.js";
import { assertProbeNotAborted, PROBE_ABORTED_ERROR } from "./fetchVideoUrlHeadHints.js";

const defaultExecFileAsync = promisify(nodeExecFile);

export type TExecFileAsync = (
	command: string,
	args: string[],
	options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

export interface IRunFfprobeOnVideoUrlOptions {
	ffprobePath?: string;
	timeoutMs: number;
	signal?: AbortSignal;
	execFileAsync?: TExecFileAsync;
}

/**
 * 运行 ffprobe 并解析 JSON 输出。
 */
export async function runFfprobeOnVideoUrl(
	url: string,
	options: IRunFfprobeOnVideoUrlOptions,
): Promise<TFfprobeRunResult> {
	assertProbeNotAborted(options.signal);

	const execFileAsync = options.execFileAsync ?? defaultExecFileAsync;
	const ffprobePath = options.ffprobePath ?? "ffprobe";

	try {
		const result = await execFileAsync(
			ffprobePath,
			[
				"-v",
				"quiet",
				"-probesize",
				"32M",
				"-analyzeduration",
				"5M",
				"-print_format",
				"json",
				"-show_format",
				"-show_streams",
				url,
			],
			{
				timeout: options.timeoutMs,
				maxBuffer: 2 * 1024 * 1024,
			},
		);
		const stdout = typeof result.stdout === "string" ? result.stdout : result.stdout.toString("utf8");
		if (stdout.trim() === "") {
			const stderrRaw =
				typeof result.stderr === "string" ? result.stderr : result.stderr.toString("utf8");
			return {
				ok: false,
				reason: "empty_output",
				stderrExcerpt: stderrRaw.trim() !== "" ? stderrRaw.trim().slice(0, 500) : undefined,
			};
		}

		let parsed: IFfprobeJsonPayload;
		try {
			parsed = JSON.parse(stdout) as IFfprobeJsonPayload;
		} catch {
			return {
				ok: false,
				reason: "invalid_json",
			};
		}

		return {
			ok: true,
			payload: parsed,
		};
	} catch (error: unknown) {
		assertProbeNotAborted(options.signal);
		if (error instanceof Error && error.message.includes("ETIMEDOUT")) {
			throw new Error(`ffprobe timed out after ${options.timeoutMs}ms`);
		}

		const details = extractFfprobeExecFailureDetails(error);
		return {
			ok: false,
			reason: details.isNotFound ? "ffprobe_not_found" : "exec_failed",
			exitCode: details.exitCode,
			stderrExcerpt: details.stderrExcerpt,
		};
	}
}

export { PROBE_ABORTED_ERROR };
