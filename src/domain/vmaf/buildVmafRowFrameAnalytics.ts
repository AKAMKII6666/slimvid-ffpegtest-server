/**
 * 模块名称：VMAF 行逐帧分析组装
 * 模块说明：将单次 ffmpeg 结果映射为 row vmafFrameAnalytics。
 */

import type { IRunVmafPairWithFfmpegResult } from "./runVmafPairWithFfmpeg.js";
import type { IDevVideoVmafFrameAnalytics } from "../../types/devVideoVmaf.types.js";

export function buildVmafRowFrameAnalytics(
	vmafResult: IRunVmafPairWithFfmpegResult,
): IDevVideoVmafFrameAnalytics | undefined {
	return vmafResult.frameAnalytics ?? undefined;
}
