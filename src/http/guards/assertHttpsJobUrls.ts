/**
 * 模块名称：HTTPS URL 校验
 * 模块说明：job spec 内视频 URL 仅允许 https: scheme。
 */

import type { IProbeComputeJobCreateRequest } from "../../types/probeComputeJob.types.js";

function isHttpsUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * 校验 job 内所有 URL；首个非 https 失败时返回 false。
 */
export function assertHttpsJobUrls(request: IProbeComputeJobCreateRequest): boolean {
	const urls: string[] = [];

	if (request.compare) {
		for (const rendition of request.compare.renditions) {
			urls.push(rendition.url);
		}
	}

	if (request.vmaf) {
		urls.push(request.vmaf.reference.url);
		for (const candidate of request.vmaf.candidates) {
			urls.push(candidate.url);
		}
	}

	for (const url of urls) {
		if (!isHttpsUrl(url)) {
			return false;
		}
	}

	return true;
}
