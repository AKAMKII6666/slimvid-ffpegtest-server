/**
 * 模块名称：Domain 层编排函数示例
 * 模块说明：接收已通过 guard 的 job 上下文，封装可单测的领域逻辑。
 */

/** 已通过鉴权与 body 解析的 job 上下文 */
export interface IExampleTrustedJobContext {
	/** Worker 内 job id */
	jobId: string;
	/** 调用方 opaque 标识（如 shopDomain，worker 不验证 Shopify 归属） */
	callerScope: string;
}

/**
 * 执行示例 domain 步骤（占位）。
 *
 * @param ctx — 可信 job 上下文
 */
export async function runExampleDomainStep(
	ctx: IExampleTrustedJobContext,
): Promise<{ jobId: string; phase: string }> {
	return {
		jobId: ctx.jobId,
		phase: "example_done",
	};
}
