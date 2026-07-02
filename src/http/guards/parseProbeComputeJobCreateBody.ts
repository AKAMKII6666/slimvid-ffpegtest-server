/**
 * 模块名称：Job 创建 body 运行时 guard
 * 模块说明：POST /v1/jobs 请求体解析；禁止仅 as 断言。
 */

import { assertHttpsJobUrls } from "./assertHttpsJobUrls.js";
import { parseAllowedVmafModelOption } from "./parseAllowedVmafModelOption.js";
import {
	PROBE_COMPUTE_JOB_SCHEMA_VERSION,
	type IProbeComputeCompareSpecInput,
	type IProbeComputeJobCreateRequest,
	type IProbeComputeVmafSpecInput,
	type TProbeComputeJobKind,
	type TProbeComputeParseResult,
} from "../../types/probeComputeJob.types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed === "") {
		return null;
	}
	return trimmed;
}

function parseOptionalString(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const parsed = parseNonEmptyString(value);
	return parsed ?? undefined;
}

function parseJobKind(value: unknown): TProbeComputeJobKind | null {
	if (value === "compare" || value === "vmaf" || value === "unified") {
		return value;
	}
	return null;
}

function parseRenditionGroup(value: unknown): "shopify" | "slimvid" | null {
	if (value === "shopify" || value === "slimvid") {
		return value;
	}
	return null;
}

function parseCompareSpec(raw: unknown): IProbeComputeCompareSpecInput | null {
	if (!isRecord(raw)) {
		return null;
	}

	const productName = parseNonEmptyString(raw.productName);
	if (!productName) {
		return null;
	}

	if (!Array.isArray(raw.renditions) || raw.renditions.length === 0) {
		return null;
	}

	const renditions: IProbeComputeCompareSpecInput["renditions"] = [];
	for (const item of raw.renditions) {
		if (!isRecord(item)) {
			return null;
		}
		const group = parseRenditionGroup(item.group);
		const label = parseNonEmptyString(item.label);
		const url = parseNonEmptyString(item.url);
		if (!group || !label || !url) {
			return null;
		}
		renditions.push({ group, label, url });
	}

	return {
		productName,
		linkedCompressTaskId: parseOptionalString(raw.linkedCompressTaskId),
		renditions,
	};
}

function parseNumberField(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	return value;
}

function parseVmafSpec(raw: unknown): IProbeComputeVmafSpecInput | null {
	if (!isRecord(raw)) {
		return null;
	}

	if (!isRecord(raw.reference)) {
		return null;
	}

	const referenceLabel = parseNonEmptyString(raw.reference.label);
	const referenceUrl = parseNonEmptyString(raw.reference.url);
	if (!referenceLabel || !referenceUrl) {
		return null;
	}

	if (!Array.isArray(raw.candidates) || raw.candidates.length === 0) {
		return null;
	}

	const candidates: IProbeComputeVmafSpecInput["candidates"] = [];
	for (const item of raw.candidates) {
		if (!isRecord(item)) {
			return null;
		}
		const group = parseRenditionGroup(item.group);
		const label = parseNonEmptyString(item.label);
		const url = parseNonEmptyString(item.url);
		const width = parseNumberField(item.width);
		const height = parseNumberField(item.height);
		const formatHint = parseNonEmptyString(item.formatHint);
		const mimeType = parseNonEmptyString(item.mimeType);
		if (
			!group ||
			!label ||
			!url ||
			width === null ||
			height === null ||
			!formatHint ||
			!mimeType
		) {
			return null;
		}
		candidates.push({
			label,
			group,
			url,
			width,
			height,
			formatHint,
			mimeType,
		});
	}

	let options: IProbeComputeVmafSpecInput["options"];
	if (raw.options !== undefined) {
		if (!isRecord(raw.options)) {
			return null;
		}
		const vmafModel = parseAllowedVmafModelOption(raw.options.vmafModel);
		if (raw.options.vmafModel !== undefined && vmafModel === null) {
			return null;
		}
		options = {
			vmafModel: vmafModel === null ? undefined : vmafModel,
			durationMismatchThresholdSec:
				raw.options.durationMismatchThresholdSec === undefined
					? undefined
					: (parseNumberField(raw.options.durationMismatchThresholdSec) ?? undefined),
			includeFrameAnalytics:
				typeof raw.options.includeFrameAnalytics === "boolean"
					? raw.options.includeFrameAnalytics
					: undefined,
			includeScreenshots:
				typeof raw.options.includeScreenshots === "boolean"
					? raw.options.includeScreenshots
					: undefined,
		};
	}

	return {
		reference: {
			label: referenceLabel,
			url: referenceUrl,
		},
		candidates,
		options,
	};
}

function parseCaller(raw: unknown): IProbeComputeJobCreateRequest["caller"] | null {
	if (!isRecord(raw)) {
		return null;
	}

	const shopDomain = parseNonEmptyString(raw.shopDomain);
	const productId = parseNonEmptyString(raw.productId);
	const videoId = parseNonEmptyString(raw.videoId);
	if (!shopDomain || !productId || !videoId) {
		return null;
	}

	return {
		shopDomain,
		productId,
		videoId,
		batchId: parseOptionalString(raw.batchId),
	};
}

/**
 * 从 unknown 解析 POST /v1/jobs body。
 */
export function parseProbeComputeJobCreateBody(raw: unknown): TProbeComputeParseResult {
	if (!isRecord(raw)) {
		return { ok: false, code: "invalid_body", error: "Request body must be a JSON object" };
	}

	if (raw.schemaVersion !== PROBE_COMPUTE_JOB_SCHEMA_VERSION) {
		return {
			ok: false,
			code: "unsupported_schema",
			error: `Unsupported schemaVersion: ${String(raw.schemaVersion)}`,
		};
	}

	const jobKind = parseJobKind(raw.jobKind);
	if (!jobKind) {
		return { ok: false, code: "invalid_body", error: "Invalid jobKind" };
	}

	const caller = parseCaller(raw.caller);
	if (!caller) {
		return { ok: false, code: "invalid_body", error: "Invalid caller" };
	}

	const clientJobId = parseOptionalString(raw.clientJobId);

	let compare: IProbeComputeCompareSpecInput | undefined;
	let vmaf: IProbeComputeVmafSpecInput | undefined;

	if (raw.compare !== undefined) {
		const parsedCompare = parseCompareSpec(raw.compare);
		if (!parsedCompare) {
			return { ok: false, code: "invalid_body", error: "Invalid compare spec" };
		}
		compare = parsedCompare;
	}

	if (raw.vmaf !== undefined) {
		const parsedVmaf = parseVmafSpec(raw.vmaf);
		if (!parsedVmaf) {
			return { ok: false, code: "invalid_body", error: "Invalid vmaf spec" };
		}
		vmaf = parsedVmaf;
	}

	if (jobKind === "compare" && !compare) {
		return { ok: false, code: "invalid_body", error: "compare spec required for jobKind compare" };
	}
	if (jobKind === "vmaf" && !vmaf) {
		return { ok: false, code: "invalid_body", error: "vmaf spec required for jobKind vmaf" };
	}
	if (jobKind === "unified" && (!compare || !vmaf)) {
		return {
			ok: false,
			code: "invalid_body",
			error: "compare and vmaf specs required for jobKind unified",
		};
	}

	const body: IProbeComputeJobCreateRequest = {
		schemaVersion: PROBE_COMPUTE_JOB_SCHEMA_VERSION,
		jobKind,
		caller,
		compare,
		vmaf,
		clientJobId,
	};

	if (!assertHttpsJobUrls(body)) {
		return {
			ok: false,
			code: "invalid_url_scheme",
			error: "All video URLs must use https: scheme",
		};
	}

	return { ok: true, body };
}
