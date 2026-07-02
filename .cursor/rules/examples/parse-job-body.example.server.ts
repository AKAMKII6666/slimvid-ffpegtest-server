/**
 * 模块名称：Job spec 运行时校验示例
 * 模块说明：HTTP handler 禁止仅依赖 TypeScript 断言；须逐字段 typeof/枚举校验。
 */

/** 解析成功的示例 job 创建 body */
export interface IExampleCreateJobBody {
	/** compare | vmaf | unified */
	jobKind: "compare" | "vmaf" | "unified";
	/** 关联主 app 的 product GID（opaque，worker 不校验 Shopify 归属） */
	productId: string;
	/** Video GID */
	videoId: string;
}

/**
 * 从 unknown 解析 POST /jobs body；失败返回 null。
 *
 * @param raw — `request.json()` 结果
 */
export function parseExampleCreateJobBody(raw: unknown): IExampleCreateJobBody | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const body = raw as Record<string, unknown>;
	const jobKind = body.jobKind;
	const productId = body.productId;
	const videoId = body.videoId;
	if (jobKind !== "compare" && jobKind !== "vmaf" && jobKind !== "unified") {
		return null;
	}
	if (typeof productId !== "string" || productId.trim() === "") {
		return null;
	}
	if (typeof videoId !== "string" || videoId.trim() === "") {
		return null;
	}
	return {
		jobKind: jobKind,
		productId: productId.trim(),
		videoId: videoId.trim(),
	};
}
