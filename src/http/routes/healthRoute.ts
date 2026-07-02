/**
 * 模块名称：GET /health 路由
 * 模块说明：探测运行时能力；任一核心二进制不可用 → HTTP 503。
 */

import type { FastifyInstance } from "fastify";

import type { IProbeWorkerEffectiveConfig } from "../../config/probeWorkerConfig.types.js";
import type { TFfmpegSpawner } from "../../domain/ffmpeg/ffmpegSpawner.types.js";
import {
	isProbeWorkerRuntimeHealthy,
	probeRuntimeCapabilities,
} from "../../domain/ffmpeg/probeRuntimeCapabilities.js";
import { buildOkResponse } from "../responses/buildApiResponse.js";
import { buildHealthResponseData } from "../health/buildHealthResponseData.js";

export interface IRegisterHealthRouteOptions {
	config: IProbeWorkerEffectiveConfig;
	spawner?: TFfmpegSpawner;
	env?: NodeJS.ProcessEnv;
}

/**
 * 注册 GET /health（无需 Bearer）。
 */
export async function registerHealthRoute(
	app: FastifyInstance,
	options: IRegisterHealthRouteOptions,
): Promise<void> {
	app.get("/health", async function handleHealth(_request, reply) {
		const capabilities = await probeRuntimeCapabilities({
			config: options.config,
			spawner: options.spawner,
		});

		const data = buildHealthResponseData({
			config: options.config,
			capabilities,
			env: options.env,
		});

		const statusCode = isProbeWorkerRuntimeHealthy(capabilities, options.config) ? 200 : 503;
		return reply.status(statusCode).send(buildOkResponse(data));
	});
}
