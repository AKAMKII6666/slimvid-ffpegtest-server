/**
 * 模块名称：Probe Worker 配置类型
 * 模块说明：JSON 配置文件与 effective config 的类型定义。
 */

/** 配置 schema 版本（与 probe-worker.example.json 对齐） */
export const PROBE_WORKER_CONFIG_SCHEMA_VERSION = 1 as const;

/** API schema 版本（HTTP /health 与 /v1 响应） */
export const PROBE_WORKER_API_SCHEMA_VERSION = 1 as const;

/** 服务标识（/health data.service） */
export const PROBE_WORKER_SERVICE_NAME = "slimvid-probe-worker" as const;

export type TProbeWorkerGpuUnavailablePolicy = "fallback_cpu" | "fail";

export interface IProbeWorkerServerConfig {
	host: string;
	port: number;
}

export interface IProbeWorkerAuthConfig {
	tokenEnv: string;
}

export interface IProbeWorkerConcurrencyConfig {
	maxVmafJobs: number;
	maxFfprobeParallel: number;
	maxVmafCandidatesParallel: number;
}

export interface IProbeWorkerVmafConfig {
	useGpu: boolean;
	gpuDeviceId: number;
	model: string;
	ffmpegTimeoutMs: number;
	gpuUnavailablePolicy: TProbeWorkerGpuUnavailablePolicy;
	nThreads: number;
}

export interface IProbeWorkerScreenshotsConfig {
	enabled: boolean;
	threshold: number;
	maxSegmentsPerMode: number;
	keySegment: string;
}

export interface IProbeWorkerProbeConfig {
	ffprobeTimeoutMs: number;
	downloadTimeoutMs: number;
}

export interface IProbeWorkerFfmpegPathsConfig {
	ffmpegPath: string;
	ffprobePath: string;
}

export interface IProbeWorkerJobConfig {
	clientJobTtlMs: number;
	terminalRetainMs: number;
	maxRuntimeMs: number;
}

/** 从 JSON 文件加载的完整配置形状 */
export interface IProbeWorkerConfigFile {
	schemaVersion: typeof PROBE_WORKER_CONFIG_SCHEMA_VERSION;
	server: IProbeWorkerServerConfig;
	auth: IProbeWorkerAuthConfig;
	concurrency: IProbeWorkerConcurrencyConfig;
	vmaf: IProbeWorkerVmafConfig;
	screenshots: IProbeWorkerScreenshotsConfig;
	probe: IProbeWorkerProbeConfig;
	ffmpeg: IProbeWorkerFfmpegPathsConfig;
	job: IProbeWorkerJobConfig;
}

/** 启动后生效的配置（env 覆盖已应用） */
export type IProbeWorkerEffectiveConfig = IProbeWorkerConfigFile;

export interface IProbeWorkerR2Config {
	accountId: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	objectKeyPrefix: string | null;
	publicBaseUrl: string | null;
}
