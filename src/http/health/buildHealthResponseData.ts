/**
 * 模块名称：Health 响应构建
 * 模块说明：组装 GET /health data 字段，对齐 api-v1.md。
 */

import type { IProbeWorkerEffectiveConfig } from "../../config/probeWorkerConfig.types.js";
import {
	PROBE_WORKER_API_SCHEMA_VERSION,
	PROBE_WORKER_CONFIG_SCHEMA_VERSION,
	PROBE_WORKER_SERVICE_NAME,
} from "../../config/probeWorkerConfig.types.js";
import { isProbeWorkerR2Configured } from "../../config/loadProbeWorkerR2Config.js";
import type { IProbeRuntimeCapabilities } from "../../domain/ffmpeg/probeRuntimeCapabilities.js";

export interface IHealthResponseData {
	service: typeof PROBE_WORKER_SERVICE_NAME;
	configSchemaVersion: typeof PROBE_WORKER_CONFIG_SCHEMA_VERSION;
	server: { port: number };
	ffmpegAvailable: boolean;
	ffprobeAvailable: boolean;
	libvmafAvailable: boolean;
	libvmafCudaAvailable: boolean;
	vmafExecutionMode: IProbeRuntimeCapabilities["vmafExecutionMode"];
	r2Configured: boolean;
	screenshotsEnabled: boolean;
	concurrency: {
		maxVmafJobs: number;
		maxFfprobeParallel: number;
		maxVmafCandidatesParallel: number;
	};
	apiSchemaVersion: typeof PROBE_WORKER_API_SCHEMA_VERSION;
}

export interface IBuildHealthResponseDataOptions {
	config: IProbeWorkerEffectiveConfig;
	capabilities: IProbeRuntimeCapabilities;
	env?: NodeJS.ProcessEnv;
}

/**
 * 构建 /health 响应 data；HTTP 状态由 isProbeWorkerRuntimeHealthy 决定。
 */
export function buildHealthResponseData(
	options: IBuildHealthResponseDataOptions,
): IHealthResponseData {
	const env = options.env ?? process.env;
	const { config, capabilities } = options;

	return {
		service: PROBE_WORKER_SERVICE_NAME,
		configSchemaVersion: PROBE_WORKER_CONFIG_SCHEMA_VERSION,
		server: { port: config.server.port },
		ffmpegAvailable: capabilities.ffmpegAvailable,
		ffprobeAvailable: capabilities.ffprobeAvailable,
		libvmafAvailable: capabilities.libvmafAvailable,
		libvmafCudaAvailable: capabilities.libvmafCudaAvailable,
		vmafExecutionMode: capabilities.vmafExecutionMode,
		r2Configured: isProbeWorkerR2Configured(env),
		screenshotsEnabled: config.screenshots.enabled,
		concurrency: {
			maxVmafJobs: config.concurrency.maxVmafJobs,
			maxFfprobeParallel: config.concurrency.maxFfprobeParallel,
			maxVmafCandidatesParallel: config.concurrency.maxVmafCandidatesParallel,
		},
		apiSchemaVersion: PROBE_WORKER_API_SCHEMA_VERSION,
	};
}
