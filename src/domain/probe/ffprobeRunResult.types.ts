/**
 * 模块名称：ffprobe 执行结果类型
 * 模块说明：区分超时、exec 失败与空输出，供 probe 与 compare 日志使用。
 */

import type { IFfprobeJsonPayload } from "./ffprobeParse.helpers.js";
import { truncateLogText } from "../../logging/truncateLogText.helpers.js";

/** ffprobe 失败原因 */
export type TFfprobeRunFailureReason =
	| "empty_output"
	| "invalid_json"
	| "exec_failed"
	| "ffprobe_not_found";

export interface IFfprobeRunSuccess {
	ok: true;
	payload: IFfprobeJsonPayload;
}

export interface IFfprobeRunFailure {
	ok: false;
	reason: TFfprobeRunFailureReason;
	exitCode?: number;
	stderrExcerpt?: string;
}

export type TFfprobeRunResult = IFfprobeRunSuccess | IFfprobeRunFailure;

const FFPROBE_ERROR_STDERR_MAX_LENGTH = 500;

/**
 * 从 execFile 异常提取退出码与 stderr 摘要（不含 URL）。
 */
export function extractFfprobeExecFailureDetails(error: unknown): {
	exitCode?: number;
	stderrExcerpt: string;
	isNotFound: boolean;
} {
	if (!(error instanceof Error)) {
		return {
			stderrExcerpt: truncateLogText(String(error), FFPROBE_ERROR_STDERR_MAX_LENGTH),
			isNotFound: false,
		};
	}

	const err = error as Error & { code?: string | number; status?: number };
	const exitCode = typeof err.status === "number" ? err.status : undefined;
	const code = typeof err.code === "string" ? err.code : "";
	const isNotFound = code === "ENOENT" || exitCode === 127;
	const stderrExcerpt = truncateLogText(err.message, FFPROBE_ERROR_STDERR_MAX_LENGTH);

	return {
		exitCode: exitCode,
		stderrExcerpt: stderrExcerpt,
		isNotFound: isNotFound,
	};
}

/**
 * 将 ffprobe 失败转为可读 probe 错误（写入 job errorMessage / 抛错文案）。
 */
export function formatFfprobeProbeErrorMessage(failure: IFfprobeRunFailure): string {
	if (failure.reason === "ffprobe_not_found") {
		return "ffprobe is not installed or not on PATH";
	}
	if (failure.reason === "empty_output") {
		return "ffprobe returned empty output";
	}
	if (failure.reason === "invalid_json") {
		return "ffprobe returned invalid JSON";
	}

	const parts = ["ffprobe exited with an error"];
	if (typeof failure.exitCode === "number") {
		parts.push("(exit " + String(failure.exitCode) + ")");
	}
	if (failure.stderrExcerpt && failure.stderrExcerpt.trim() !== "") {
		parts.push(": " + failure.stderrExcerpt.trim());
	} else {
		parts.push(" — ensure the URL is reachable from the worker");
	}
	return parts.join(" ");
}
