/**
 * 模块名称：VMAF 行逐帧分析组装
 * 模块说明：将 delivery / display1080p ffmpeg 结果映射为 row vmafFrameAnalytics。
 */

import type { IRunVmafPairWithFfmpegResult } from "./runVmafPairWithFfmpeg.js";
import type { IDevVideoCompressCompareVmafRowFrameAnalyticsByMode } from "../../types/devVideoVmaf.types.js";

export function buildVmafRowFrameAnalytics(
	deliveryResult: IRunVmafPairWithFfmpegResult,
	displayResult: IRunVmafPairWithFfmpegResult,
): IDevVideoCompressCompareVmafRowFrameAnalyticsByMode | undefined {
	if (!deliveryResult.frameAnalytics && !displayResult.frameAnalytics) {
		return undefined;
	}

	return {
		delivery: deliveryResult.frameAnalytics,
		display1080p: displayResult.frameAnalytics,
	};
}
