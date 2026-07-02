/**
 * 模块名称：单次 VMAF ffmpeg 执行
 * 模块说明：distorted upscale @ reference resolution；可注入 spawn 供单测。
 */

import { readFile } from "node:fs/promises";

import type { IProbeWorkerEffectiveConfig } from "../../config/probeWorkerConfig.types.js";
import type { TVmafExecutionMode } from "../ffmpeg/probeRuntimeCapabilities.js";
import { createModuleLogger } from "../../logging/createModuleLogger.js";
import { truncateLogText } from "../../logging/truncateLogText.helpers.js";
import { buildVmafFfmpegFullFilter } from "./buildVmafFfmpegFilterGraph.js";
import { prepareVmafFfmpegLogTarget } from "./prepareVmafFfmpegLogTarget.js";
import {
	parseVmafFfmpegJsonHarmonicMean,
	parseVmafFfmpegJsonMean,
} from "./parseVmafFfmpegJson.js";
import { parseVmafFfmpegFrameAnalytics } from "./parseVmafFfmpegFrameAnalytics.js";
import {
	runVmafFfmpegWithFullFilter,
	setRunVmafFfmpegWithFullFilterSpawnerForTests,
	type TRunVmafFfmpegWithFullFilterSpawner,
} from "./runVmafFfmpegWithFullFilter.js";
import type { IDevVideoVmafFrameAnalytics } from "../../types/devVideoVmaf.types.js";

const log = createModuleLogger({ module: "domain.vmaf.ffmpeg" });

export const DEFAULT_VMAF_MODEL_VERSION = "vmaf_v0.6.1";

export interface IRunVmafPairWithFfmpegInput {
	distortedFilePath: string;
	referenceFilePath: string;
	referenceWidth: number;
	referenceHeight: number;
	maxDurationSeconds?: number;
	frameRateFps?: number;
	jobId?: string;
	shouldAbort?: () => boolean;
	ffmpegPath?: string;
	ffmpegTimeoutMs?: number;
	vmafModel?: string;
	vmafExecutionMode?: TVmafExecutionMode;
}

/** VMAF ffmpeg 失败原因（诊断用，不写 Wire DTO） */
export type TVmafFfmpegFailureReason =
	| "aborted"
	| "exit_non_zero"
	| "spawn_error"
	| "vmaf_log_read_failed"
	| "vmaf_log_parse_empty";

export interface IRunVmafPairWithFfmpegResult {
	mean: number | null;
	harmonicMean: number | null;
	frameAnalytics: IDevVideoVmafFrameAnalytics | null;
	ffmpegExitCode?: number | null;
	ffmpegStderrExcerpt?: string;
	failureReason?: TVmafFfmpegFailureReason;
}

export type TRunVmafPairFfmpegSpawner = TRunVmafFfmpegWithFullFilterSpawner;

function buildVmafFfmpegFailureResult(params: {
	exitCode?: number | null;
	stderr?: string;
	failureReason: TVmafFfmpegFailureReason;
	input: IRunVmafPairWithFfmpegInput;
}): IRunVmafPairWithFfmpegResult {
	const stderrExcerpt =
		typeof params.stderr === "string" && params.stderr.trim() !== ""
			? truncateLogText(params.stderr.trim())
			: undefined;

	log.warn(
		{
			jobId: params.input.jobId,
			phase: "vmaf_ffmpeg",
			vmafExecutionMode: params.input.vmafExecutionMode ?? "cpu",
			ffmpegExitCode: params.exitCode ?? null,
			failureReason: params.failureReason,
			ffmpegStderrExcerpt: stderrExcerpt,
		},
		"vmaf ffmpeg failed",
	);

	return {
		mean: null,
		harmonicMean: null,
		frameAnalytics: null,
		ffmpegExitCode: params.exitCode ?? null,
		ffmpegStderrExcerpt: stderrExcerpt,
		failureReason: params.failureReason,
	};
}

export function setRunVmafPairFfmpegSpawnerForTests(
	spawner: TRunVmafPairFfmpegSpawner | null,
): void {
	setRunVmafFfmpegWithFullFilterSpawnerForTests(spawner);
}

export async function runVmafPairWithFfmpeg(
	input: IRunVmafPairWithFfmpegInput,
	config?: Pick<IProbeWorkerEffectiveConfig, "ffmpeg" | "vmaf">,
): Promise<IRunVmafPairWithFfmpegResult> {
	if (input.shouldAbort?.()) {
		return buildVmafFfmpegFailureResult({
			failureReason: "aborted",
			input: input,
		});
	}

	const ffmpegPath = input.ffmpegPath ?? config?.ffmpeg.ffmpegPath ?? "ffmpeg";
	const ffmpegTimeoutMs = input.ffmpegTimeoutMs ?? config?.vmaf.ffmpegTimeoutMs ?? 600_000;
	const vmafModel = input.vmafModel ?? config?.vmaf.model ?? DEFAULT_VMAF_MODEL_VERSION;
	const vmafExecutionMode = input.vmafExecutionMode ?? "cpu";
	const gpuDeviceId = config?.vmaf.gpuDeviceId ?? 0;
	const nThreads = vmafExecutionMode === "cuda" ? undefined : config?.vmaf.nThreads ?? 0;
	const logTarget = await prepareVmafFfmpegLogTarget();

	const filter = buildVmafFfmpegFullFilter(
		{
			mode: "metadata2goBicubicUpscale",
			referenceWidth: input.referenceWidth,
			referenceHeight: input.referenceHeight,
			executionMode: vmafExecutionMode,
		},
		logTarget.logPathForFilter,
		vmafModel,
		{ nThreads: nThreads },
	);

	log.info(
		{
			jobId: input.jobId,
			phase: "vmaf_ffmpeg_start",
			vmafExecutionMode: vmafExecutionMode,
			vmafModel: vmafModel,
			referenceWidth: input.referenceWidth,
			referenceHeight: input.referenceHeight,
			maxDurationSeconds: input.maxDurationSeconds,
		},
		"vmaf ffmpeg start",
	);

	try {
		const result = await runVmafFfmpegWithFullFilter({
			distortedFilePath: input.distortedFilePath,
			referenceFilePath: input.referenceFilePath,
			fullFilter: filter,
			maxDurationSeconds: input.maxDurationSeconds,
			jobId: input.jobId,
			shouldAbort: input.shouldAbort,
			ffmpegCwd: logTarget.ffmpegCwd,
			ffmpegPath: ffmpegPath,
			ffmpegTimeoutMs: ffmpegTimeoutMs,
			vmafExecutionMode: vmafExecutionMode,
			gpuDeviceId: gpuDeviceId,
		});
		if (result.exitCode !== 0) {
			return buildVmafFfmpegFailureResult({
				exitCode: result.exitCode,
				stderr: result.stderr,
				failureReason: "exit_non_zero",
				input: input,
			});
		}

		let jsonText: string;
		try {
			jsonText = await readFile(logTarget.absoluteLogPath, "utf8");
		} catch (readErr: unknown) {
			const message = readErr instanceof Error ? readErr.message : String(readErr);
			return buildVmafFfmpegFailureResult({
				exitCode: 0,
				stderr: message,
				failureReason: "vmaf_log_read_failed",
				input: input,
			});
		}

		const mean = parseVmafFfmpegJsonMean(jsonText);
		const harmonicMean = parseVmafFfmpegJsonHarmonicMean(jsonText);
		let frameAnalytics: IDevVideoVmafFrameAnalytics | null = null;

		if (
			typeof input.frameRateFps === "number" &&
			Number.isFinite(input.frameRateFps) &&
			input.frameRateFps > 0
		) {
			frameAnalytics = parseVmafFfmpegFrameAnalytics(jsonText, input.frameRateFps);
		}

		if (mean === null && harmonicMean === null) {
			return buildVmafFfmpegFailureResult({
				exitCode: 0,
				stderr: "vmaf json log parsed empty mean and harmonic mean",
				failureReason: "vmaf_log_parse_empty",
				input: input,
			});
		}

		log.info(
			{
				jobId: input.jobId,
				phase: "vmaf_ffmpeg_done",
				vmafExecutionMode: vmafExecutionMode,
				mean: mean,
				harmonicMean: harmonicMean,
			},
			"vmaf ffmpeg done",
		);

		return {
			mean: mean,
			harmonicMean: harmonicMean,
			frameAnalytics: frameAnalytics,
			ffmpegExitCode: 0,
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return buildVmafFfmpegFailureResult({
			stderr: message,
			failureReason: "spawn_error",
			input: input,
		});
	} finally {
		await logTarget.cleanup();
	}
}
