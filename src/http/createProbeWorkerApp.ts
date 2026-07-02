/**
 * 模块名称：Fastify 应用工厂
 * 模块说明：组装 HTTP 服务；route handler 保持薄。
 */

import Fastify, { type FastifyBaseLogger } from "fastify";

import type { IProbeWorkerEffectiveConfig } from "../config/probeWorkerConfig.types.js";
import { createFastifyLoggerInstance } from "../logging/createModuleLogger.js";
import type { TFfmpegSpawner } from "../domain/ffmpeg/ffmpegSpawner.types.js";
import {
	createProbeComputeJobScheduler,
	type IProbeComputeJobScheduler,
} from "../job/probeComputeJobScheduler.js";
import type { IRunComparePhaseDeps } from "../job/runComparePhaseForJob.js";
import type { IRunVmafPhaseDeps } from "../job/runVmafPhaseForJob.js";
import { registerHealthRoute } from "./routes/healthRoute.js";
import { registerJobsRoutes } from "./routes/jobsRoutes.js";

export interface ICreateProbeWorkerAppOptions {
	config: IProbeWorkerEffectiveConfig;
	spawner?: TFfmpegSpawner;
	env?: NodeJS.ProcessEnv;
	authToken?: string;
	scheduler?: IProbeComputeJobScheduler;
	compareDeps?: IRunComparePhaseDeps;
	vmafDeps?: IRunVmafPhaseDeps;
	nowMs?: () => number;
}

function resolveAuthToken(
	config: IProbeWorkerEffectiveConfig,
	env: NodeJS.ProcessEnv,
	override?: string,
): string {
	if (override !== undefined) {
		return override;
	}
	const token = env[config.auth.tokenEnv]?.trim();
	if (!token) {
		throw new Error(`Missing auth token env: ${config.auth.tokenEnv}`);
	}
	return token;
}

/**
 * 创建已注册路由的 Fastify 实例。
 */
export async function createProbeWorkerApp(options: ICreateProbeWorkerAppOptions) {
	const env = options.env ?? process.env;
	const nowMs = options.nowMs ?? Date.now;
	const authToken = resolveAuthToken(options.config, env, options.authToken);
	const scheduler =
		options.scheduler ??
		createProbeComputeJobScheduler({
			config: options.config,
			nowMs,
			compareDeps: options.compareDeps,
			vmafDeps: options.vmafDeps,
		});

	const app = Fastify({
		loggerInstance: createFastifyLoggerInstance() as unknown as FastifyBaseLogger,
	});

	await registerHealthRoute(app, {
		config: options.config,
		spawner: options.spawner,
		env,
	});

	await registerJobsRoutes(app, {
		config: options.config,
		authToken,
		scheduler,
		nowMs,
	});

	return app;
}
