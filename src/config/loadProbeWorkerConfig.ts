/**
 * 模块名称：Probe Worker 配置加载
 * 模块说明：内置默认 → JSON 文件 → 环境变量覆盖。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PROBE_WORKER_DEFAULT_CONFIG } from "./defaults.js";
import type {
	IProbeWorkerConfigFile,
	IProbeWorkerEffectiveConfig,
} from "./probeWorkerConfig.types.js";
import { PROBE_WORKER_CONFIG_SCHEMA_VERSION } from "./probeWorkerConfig.types.js";

export interface ILoadProbeWorkerConfigOptions {
	/** 覆盖 process.env（单测用） */
	env?: NodeJS.ProcessEnv;
	/** 覆盖配置文件路径 */
	configPath?: string | null;
}

function deepCloneConfig(config: IProbeWorkerConfigFile): IProbeWorkerConfigFile {
	return structuredClone(config);
}

function parsePositiveInt(raw: string | undefined): number | null {
	if (!raw) {
		return null;
	}
	const trimmed = raw.trim();
	if (!trimmed) {
		return null;
	}
	const value = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(value) || value < 0) {
		return null;
	}
	return value;
}

function parseBooleanEnv(raw: string | undefined): boolean | null {
	if (!raw) {
		return null;
	}
	const normalized = raw.trim().toLowerCase();
	if (normalized === "1" || normalized === "true" || normalized === "yes") {
		return true;
	}
	if (normalized === "0" || normalized === "false" || normalized === "no") {
		return false;
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertConfigFileShape(raw: unknown): IProbeWorkerConfigFile {
	if (!isRecord(raw)) {
		throw new Error("PROBE_WORKER_CONFIG: root must be an object");
	}
	if (raw.schemaVersion !== PROBE_WORKER_CONFIG_SCHEMA_VERSION) {
		throw new Error(
			`PROBE_WORKER_CONFIG: unsupported schemaVersion ${String(raw.schemaVersion)}`,
		);
	}
	return raw as unknown as IProbeWorkerConfigFile;
}

async function readConfigFile(filePath: string): Promise<IProbeWorkerConfigFile> {
	const absolutePath = path.isAbsolute(filePath)
		? filePath
		: path.resolve(process.cwd(), filePath);
	const text = await readFile(absolutePath, "utf8");
	const parsed: unknown = JSON.parse(text);
	return assertConfigFileShape(parsed);
}

function applyEnvOverrides(
	config: IProbeWorkerConfigFile,
	env: NodeJS.ProcessEnv,
): IProbeWorkerEffectiveConfig {
	const host = env.PROBE_WORKER_HOST?.trim();
	if (host) {
		config.server.host = host;
	}

	const port = parsePositiveInt(env.PROBE_WORKER_PORT);
	if (port !== null) {
		config.server.port = port;
	}

	const maxVmaf = parsePositiveInt(env.PROBE_WORKER_MAX_VMAF_CONCURRENCY);
	if (maxVmaf !== null) {
		config.concurrency.maxVmafJobs = maxVmaf;
	}

	const maxFfprobe = parsePositiveInt(env.PROBE_WORKER_MAX_FFPROBE_PARALLEL);
	if (maxFfprobe !== null) {
		config.concurrency.maxFfprobeParallel = maxFfprobe;
	}

	const maxVmafCandidates = parsePositiveInt(env.PROBE_WORKER_MAX_VMAF_CANDIDATES_PARALLEL);
	if (maxVmafCandidates !== null) {
		config.concurrency.maxVmafCandidatesParallel = maxVmafCandidates;
	}

	const vmafNThreads = parsePositiveInt(env.PROBE_WORKER_VMAF_N_THREADS);
	if (vmafNThreads !== null) {
		config.vmaf.nThreads = vmafNThreads;
	}

	const useGpu = parseBooleanEnv(env.PROBE_WORKER_VMAF_USE_GPU);
	if (useGpu !== null) {
		config.vmaf.useGpu = useGpu;
	}

	const gpuPolicy = env.PROBE_WORKER_VMAF_GPU_UNAVAILABLE_POLICY?.trim();
	if (gpuPolicy === "fallback_cpu" || gpuPolicy === "fail") {
		config.vmaf.gpuUnavailablePolicy = gpuPolicy;
	}

	const ffmpegPath = env.PROBE_WORKER_FFMPEG_PATH?.trim();
	if (ffmpegPath) {
		config.ffmpeg.ffmpegPath = ffmpegPath;
	}

	const ffprobePath = env.PROBE_WORKER_FFPROBE_PATH?.trim();
	if (ffprobePath) {
		config.ffmpeg.ffprobePath = ffprobePath;
	}

	const clientJobTtl = parsePositiveInt(env.PROBE_WORKER_CLIENT_JOB_TTL_MS);
	if (clientJobTtl !== null) {
		config.job.clientJobTtlMs = clientJobTtl;
	}

	const screenshotsEnabled = parseBooleanEnv(env.PROBE_WORKER_SCREENSHOTS_ENABLED);
	if (screenshotsEnabled !== null) {
		config.screenshots.enabled = screenshotsEnabled;
	}

	return config;
}

/**
 * 加载 effective 配置：默认 → JSON → env。
 * @param options 单测可注入 env / configPath
 */
export async function loadProbeWorkerConfig(
	options: ILoadProbeWorkerConfigOptions = {},
): Promise<IProbeWorkerEffectiveConfig> {
	const env = options.env ?? process.env;
	let config = deepCloneConfig(PROBE_WORKER_DEFAULT_CONFIG);

	const configPath =
		options.configPath !== undefined
			? options.configPath
			: env.PROBE_WORKER_CONFIG?.trim() || null;

	if (configPath) {
		const fromFile = await readConfigFile(configPath);
		config = deepCloneConfig(fromFile);
	}

	return applyEnvOverrides(config, env);
}
