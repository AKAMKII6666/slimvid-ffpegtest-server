/**
 * 模块名称：VMAF 探针截图 R2 Object Key
 * 模块说明：development VMAF <75 截图专用 key。
 */

import type { IProbeWorkerR2Config } from "../../config/probeWorkerConfig.types.js";
import type { TVmafProbeScreenshotMode } from "../vmaf/buildVmafFfmpegFilterGraph.js";

export const VMAF_PROBE_SCREENSHOT_KEY_SEGMENT = "dev-vmaf-probe";

function sanitizeVmafProbeObjectKeySegment(segment: string): string {
	const trimmed = segment.trim();
	if (trimmed === "") {
		return "unknown";
	}
	const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
	return sanitized !== "" ? sanitized : "unknown";
}

export interface IBuildVmafProbeScreenshotObjectKeyParams {
	r2Config: IProbeWorkerR2Config;
	shopDomain: string;
	jobId: string;
	vmafMode: TVmafProbeScreenshotMode;
	candidateLabel: string;
	role: "reference" | "distorted";
	segmentIndex: number;
	frameIndex: number;
	keySegment?: string;
}

export function buildVmafProbeScreenshotObjectKey(
	params: IBuildVmafProbeScreenshotObjectKeyParams,
): string {
	const shopSegment = sanitizeVmafProbeObjectKeySegment(params.shopDomain);
	const jobSegment = sanitizeVmafProbeObjectKeySegment(params.jobId);
	const modeSegment = sanitizeVmafProbeObjectKeySegment(params.vmafMode);
	const candidateSegment = sanitizeVmafProbeObjectKeySegment(params.candidateLabel);
	const roleSegment = sanitizeVmafProbeObjectKeySegment(params.role);
	const keySegment = params.keySegment ?? VMAF_PROBE_SCREENSHOT_KEY_SEGMENT;
	const fileName =
		roleSegment +
		"-seg" +
		String(params.segmentIndex) +
		"-frame" +
		String(params.frameIndex) +
		".png";

	const segments: string[] = [];
	if (params.r2Config.objectKeyPrefix) {
		segments.push(params.r2Config.objectKeyPrefix);
	}
	segments.push(
		keySegment,
		shopSegment,
		jobSegment,
		modeSegment,
		candidateSegment,
		fileName,
	);

	return segments.join("/");
}

export function verifyVmafProbeScreenshotObjectKeyBelongsToJob(
	objectKey: string,
	jobId: string,
): boolean {
	const jobSegment = sanitizeVmafProbeObjectKeySegment(jobId);
	const key = objectKey.trim();
	if (key === "" || jobSegment === "") {
		return false;
	}
	if (!key.includes("/" + VMAF_PROBE_SCREENSHOT_KEY_SEGMENT + "/")) {
		return false;
	}
	return key.includes("/" + jobSegment + "/");
}
