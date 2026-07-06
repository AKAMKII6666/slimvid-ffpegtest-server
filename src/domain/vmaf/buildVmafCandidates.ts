/**
 * 模块名称：VMAF candidate 筛选与校验
 * 模块说明：从 Shopify drafts + SlimVID URL 构建列表；HLS skip 等运行时规则。
 */

import { isSkippableHlsProbeTarget } from "../probe/isSkippableHlsProbeTarget.js";
import type { TDevVideoCompressCompareRenditionGroup } from "../../types/devVideoCompare.types.js";

export interface IVmafCandidateDraft {
	label: string;
	group: TDevVideoCompressCompareRenditionGroup;
	url: string;
	width: number;
	height: number;
	formatHint: string;
	mimeType: string;
}

export interface IVmafReferenceDraft {
	label: string;
	url: string;
}

export interface IBuildVmafCandidatesResult {
	reference: IVmafReferenceDraft | null;
	candidates: IVmafCandidateDraft[];
}

export interface IVmafShopifyRenditionInput {
	label: string;
	url: string;
	width: number;
	height: number;
	formatHint: string;
	mimeType: string;
	isOriginalSource: boolean;
}

export const VMAF_REFERENCE_LABEL = "Original source";

export function isVmafCandidateSkippableAsHls(
	draft: Pick<IVmafCandidateDraft, "url" | "formatHint" | "mimeType">,
): boolean {
	return isSkippableHlsProbeTarget(draft);
}

export function buildVmafCandidates(
	shopifyRenditions: IVmafShopifyRenditionInput[],
	slimvidMappedUrl: string | null,
): IBuildVmafCandidatesResult {
	let reference: IVmafReferenceDraft | null = null;
	const candidates: IVmafCandidateDraft[] = [];

	for (let index = 0; index < shopifyRenditions.length; index++) {
		const row = shopifyRenditions[index];
		if (row.isOriginalSource || row.label === VMAF_REFERENCE_LABEL) {
			if (row.url.trim() !== "") {
				reference = {
					label: VMAF_REFERENCE_LABEL,
					url: row.url.trim(),
				};
			}
			continue;
		}

		const draft: IVmafCandidateDraft = {
			label: row.label,
			group: "shopify",
			url: row.url.trim(),
			width: row.width,
			height: row.height,
			formatHint: row.formatHint,
			mimeType: row.mimeType,
		};
		if (draft.url === "") {
			continue;
		}
		candidates.push(draft);
	}

	const slimvidUrl = typeof slimvidMappedUrl === "string" ? slimvidMappedUrl.trim() : "";
	if (slimvidUrl !== "") {
		candidates.push({
			label: "SlimVID (mapped)",
			group: "slimvid",
			url: slimvidUrl,
			width: 0,
			height: 0,
			formatHint: "mp4",
			mimeType: "video/mp4",
		});
	}

	return {
		reference: reference,
		candidates: candidates,
	};
}
