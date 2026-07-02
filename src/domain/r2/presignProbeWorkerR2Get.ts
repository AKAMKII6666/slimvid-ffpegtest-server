/**
 * 模块名称：Probe Worker R2 presigned GET
 * 模块说明：签发 7 天 presigned GET URL。
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { IProbeWorkerR2Config } from "../../config/probeWorkerConfig.types.js";
import { getProbeWorkerR2S3Client } from "./createProbeWorkerR2S3Client.js";

export interface IPresignProbeWorkerR2GetParams {
	r2Config: IProbeWorkerR2Config;
	objectKey: string;
	expiresInSeconds: number;
}

export interface IPresignProbeWorkerR2GetResult {
	presignedUrl: string;
	expiresAtMs: number;
}

export async function presignProbeWorkerR2Get(
	params: IPresignProbeWorkerR2GetParams,
): Promise<IPresignProbeWorkerR2GetResult> {
	const client = getProbeWorkerR2S3Client(params.r2Config);
	const expiresInSeconds = Math.max(60, Math.floor(params.expiresInSeconds));

	const command = new GetObjectCommand({
		Bucket: params.r2Config.bucket,
		Key: params.objectKey,
	});

	const presignedUrl = await getSignedUrl(client, command, {
		expiresIn: expiresInSeconds,
	});

	return {
		presignedUrl: presignedUrl,
		expiresAtMs: Date.now() + expiresInSeconds * 1000,
	};
}

export function resolveProbeWorkerR2PublicUrl(
	r2Config: IProbeWorkerR2Config,
	objectKey: string,
): string | null {
	const rawBase = r2Config.publicBaseUrl;
	if (!rawBase || rawBase.trim() === "") {
		return null;
	}
	const base = rawBase.trim().replace(/\/+$/, "");
	const key = objectKey.trim().replace(/^\/+/, "");
	if (key === "") {
		return null;
	}
	return base + "/" + key;
}
