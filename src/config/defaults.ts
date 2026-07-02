/**
 * 模块名称：Probe Worker 配置默认值
 * 模块说明：与 config/probe-worker.example.json 对齐的内置默认。
 */

import type { IProbeWorkerConfigFile } from "./probeWorkerConfig.types.js";
import { PROBE_WORKER_CONFIG_SCHEMA_VERSION } from "./probeWorkerConfig.types.js";

/** 内置默认配置（未指定 PROBE_WORKER_CONFIG 时使用） */
export const PROBE_WORKER_DEFAULT_CONFIG: IProbeWorkerConfigFile = {
	schemaVersion: PROBE_WORKER_CONFIG_SCHEMA_VERSION,
	server: {
		host: "0.0.0.0",
		port: 3099,
	},
	auth: {
		tokenEnv: "PROBE_WORKER_AUTH_TOKEN",
	},
	concurrency: {
		maxVmafJobs: 1,
		maxFfprobeParallel: 4,
		maxVmafCandidatesParallel: 2,
	},
	vmaf: {
		useGpu: false,
		gpuDeviceId: 0,
		model: "vmaf_v0.6.1",
		ffmpegTimeoutMs: 600_000,
		gpuUnavailablePolicy: "fallback_cpu",
		nThreads: 0,
	},
	screenshots: {
		enabled: true,
		threshold: 75,
		maxSegmentsPerMode: 3,
		keySegment: "dev-vmaf-probe",
	},
	probe: {
		ffprobeTimeoutMs: 45_000,
		downloadTimeoutMs: 300_000,
	},
	ffmpeg: {
		ffmpegPath: "ffmpeg",
		ffprobePath: "ffprobe",
	},
	job: {
		clientJobTtlMs: 600_000,
		terminalRetainMs: 600_000,
		maxRuntimeMs: 1_800_000,
	},
};
