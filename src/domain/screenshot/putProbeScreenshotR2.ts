/**
 * 模块名称：VMAF 探针截图 R2 上传
 * 模块说明：PutObject 小 PNG；公开 URL 或 7 天 presigned GET。
 */

import { readFile } from "node:fs/promises";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import type { IProbeWorkerR2Config } from "../../config/probeWorkerConfig.types.js";
import { getProbeWorkerR2S3Client } from "../r2/createProbeWorkerR2S3Client.js";
import {
	presignProbeWorkerR2Get,
	resolveProbeWorkerR2PublicUrl,
} from "../r2/presignProbeWorkerR2Get.js";

export const PROBE_SCREENSHOT_PRESIGN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const PROBE_SCREENSHOT_CONTENT_TYPE = "image/png";

export interface IPutProbeScreenshotR2Params {
	r2Config: IProbeWorkerR2Config;
	shopDomain: string;
	objectKey: string;
	pngFilePath: string;
}

export interface IPutProbeScreenshotR2Result {
	url: string;
	urlExpiresAtIso: string | null;
	objectKey: string;
}

export type TPutProbeScreenshotR2Uploader = (params: {
	bucket: string;
	objectKey: string;
	body: Buffer;
	contentType: string;
}) => Promise<void>;

let putProbeScreenshotR2UploaderOverride: TPutProbeScreenshotR2Uploader | null = null;

export function setPutProbeScreenshotR2UploaderForTests(
	uploader: TPutProbeScreenshotR2Uploader | null,
): void {
	putProbeScreenshotR2UploaderOverride = uploader;
}

async function defaultPutProbeScreenshotR2Uploader(
	r2Config: IProbeWorkerR2Config,
	params: {
		bucket: string;
		objectKey: string;
		body: Buffer;
		contentType: string;
	},
): Promise<void> {
	const client = getProbeWorkerR2S3Client(r2Config);
	await client.send(
		new PutObjectCommand({
			Bucket: params.bucket,
			Key: params.objectKey,
			Body: params.body,
			ContentType: params.contentType,
		}),
	);
}

export async function putProbeScreenshotR2(
	params: IPutProbeScreenshotR2Params,
): Promise<IPutProbeScreenshotR2Result> {
	const objectKey = params.objectKey.trim();
	if (objectKey === "") {
		throw new Error("objectKey is required");
	}

	const pngBytes = await readFile(params.pngFilePath);

	if (putProbeScreenshotR2UploaderOverride) {
		await putProbeScreenshotR2UploaderOverride({
			bucket: params.r2Config.bucket,
			objectKey: objectKey,
			body: pngBytes,
			contentType: PROBE_SCREENSHOT_CONTENT_TYPE,
		});
	} else {
		await defaultPutProbeScreenshotR2Uploader(params.r2Config, {
			bucket: params.r2Config.bucket,
			objectKey: objectKey,
			body: pngBytes,
			contentType: PROBE_SCREENSHOT_CONTENT_TYPE,
		});
	}

	const publicUrl = resolveProbeWorkerR2PublicUrl(params.r2Config, objectKey);
	if (publicUrl) {
		return {
			url: publicUrl,
			urlExpiresAtIso: null,
			objectKey: objectKey,
		};
	}

	const presigned = await presignProbeWorkerR2Get({
		r2Config: params.r2Config,
		objectKey: objectKey,
		expiresInSeconds: PROBE_SCREENSHOT_PRESIGN_TTL_SECONDS,
	});

	return {
		url: presigned.presignedUrl,
		urlExpiresAtIso: new Date(presigned.expiresAtMs).toISOString(),
		objectKey: objectKey,
	};
}
