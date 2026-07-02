/**
 * 模块名称：Probe Worker R2 S3 Client
 * 模块说明：Cloudflare R2 兼容 S3 client 单例。
 */

import { S3Client } from "@aws-sdk/client-s3";

import type { IProbeWorkerR2Config } from "../../config/probeWorkerConfig.types.js";

let cachedClient: S3Client | null = null;
let cachedConfigKey: string | null = null;

function buildConfigKey(config: IProbeWorkerR2Config): string {
	return [config.accountId, config.bucket, config.accessKeyId].join(":");
}

export function getProbeWorkerR2S3Client(config: IProbeWorkerR2Config): S3Client {
	const configKey = buildConfigKey(config);
	if (cachedClient && cachedConfigKey === configKey) {
		return cachedClient;
	}

	cachedClient = new S3Client({
		region: "auto",
		endpoint: "https://" + config.accountId + ".r2.cloudflarestorage.com",
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
	});
	cachedConfigKey = configKey;
	return cachedClient;
}

export function resetProbeWorkerR2S3ClientForTests(): void {
	cachedClient = null;
	cachedConfigKey = null;
}
