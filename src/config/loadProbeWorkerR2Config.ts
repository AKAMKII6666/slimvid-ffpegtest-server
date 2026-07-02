/**
 * 模块名称：Probe Worker R2 配置加载
 * 模块说明：从环境变量读取 R2 凭证；仅 env，不进 JSON。
 */

import type { IProbeWorkerR2Config } from "./probeWorkerConfig.types.js";

function readOptionalEnv(name: string, env: NodeJS.ProcessEnv): string | null {
	const value = env[name]?.trim();
	if (!value) {
		return null;
	}
	return value;
}

/**
 * 加载 R2 配置；必填项缺失时返回 null（health 中 r2Configured: false）。
 */
export function loadProbeWorkerR2Config(
	env: NodeJS.ProcessEnv = process.env,
): IProbeWorkerR2Config | null {
	const accountId = readOptionalEnv("PROBE_WORKER_R2_ACCOUNT_ID", env);
	const bucket = readOptionalEnv("PROBE_WORKER_R2_BUCKET", env);
	const accessKeyId = readOptionalEnv("PROBE_WORKER_R2_ACCESS_KEY_ID", env);
	const secretAccessKey = readOptionalEnv("PROBE_WORKER_R2_SECRET_ACCESS_KEY", env);

	if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
		return null;
	}

	return {
		accountId,
		bucket,
		accessKeyId,
		secretAccessKey,
		objectKeyPrefix: readOptionalEnv("PROBE_WORKER_R2_OBJECT_KEY_PREFIX", env),
		publicBaseUrl: readOptionalEnv("PROBE_WORKER_R2_PUBLIC_BASE_URL", env),
	};
}

/** R2 必填 env 是否齐全 */
export function isProbeWorkerR2Configured(env: NodeJS.ProcessEnv = process.env): boolean {
	return loadProbeWorkerR2Config(env) !== null;
}
