/**
 * 模块名称：单 URL 视频元数据探测
 * 模块说明：HTTPS HEAD + ffprobe；BFF 已校验 https，此处不复检 CDN 白名单。
 */

import {
	fetchVideoUrlHeadHints,
	PROBE_VIDEO_HEAD_TIMEOUT_MS,
	assertProbeNotAborted,
} from "./fetchVideoUrlHeadHints.js";
import {
	parseFfprobeJsonToMetadata,
	type IProbedVideoUrlMetadata,
} from "./ffprobeParse.helpers.js";
import {
	formatFfprobeProbeErrorMessage,
	type TFfprobeRunResult,
} from "./ffprobeRunResult.types.js";
import {
	runFfprobeOnVideoUrl,
	type TExecFileAsync,
} from "./runFfprobeOnVideoUrl.js";

export interface IProbeVideoUrlMetadataOptions {
	signal?: AbortSignal;
	ffprobePath?: string;
	ffprobeTimeoutMs?: number;
	headTimeoutMs?: number;
	execFileAsync?: TExecFileAsync;
	fetchHead?: typeof fetchVideoUrlHeadHints;
	runFfprobe?: typeof runFfprobeOnVideoUrl;
}

function assertHttpsProbeUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("Video URL is not a valid https URL");
	}
	if (parsed.protocol !== "https:") {
		throw new Error("Video URL must use https: scheme");
	}
}

/**
 * 探测单个视频 URL 的完整元数据；失败抛错。
 */
export async function probeVideoUrlMetadata(
	url: string,
	options: IProbeVideoUrlMetadataOptions = {},
): Promise<IProbedVideoUrlMetadata> {
	const trimmedUrl = url.trim();
	assertHttpsProbeUrl(trimmedUrl);

	const signal = options.signal;
	assertProbeNotAborted(signal);

	const fetchHead = options.fetchHead ?? fetchVideoUrlHeadHints;
	const runFfprobe = options.runFfprobe ?? runFfprobeOnVideoUrl;

	const headHints = await fetchHead(
		trimmedUrl,
		options.headTimeoutMs ?? PROBE_VIDEO_HEAD_TIMEOUT_MS,
		signal,
	);
	assertProbeNotAborted(signal);

	const ffprobeResult: TFfprobeRunResult = await runFfprobe(trimmedUrl, {
		ffprobePath: options.ffprobePath,
		timeoutMs: options.ffprobeTimeoutMs ?? 45_000,
		signal,
		execFileAsync: options.execFileAsync,
	});
	if (!ffprobeResult.ok) {
		throw new Error(formatFfprobeProbeErrorMessage(ffprobeResult));
	}

	const metadata = parseFfprobeJsonToMetadata(
		trimmedUrl,
		ffprobeResult.payload,
		headHints.sizeBytes,
		headHints,
	);
	if (!metadata) {
		throw new Error("ffprobe returned incomplete video metadata");
	}

	return metadata;
}
