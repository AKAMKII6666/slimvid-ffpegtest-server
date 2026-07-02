/**
 * 模块名称：Probe 测试夹具
 * 模块说明：mock ffprobe 元数据，避免集成测真跑子进程。
 */

import type { IProbedVideoUrlMetadata } from "@worker/domain/probe/ffprobeParse.helpers.js";
import type { IProbeVideoUrlMetadataOptions } from "@worker/domain/probe/probeVideoUrlMetadata.js";

export const SAMPLE_PROBED_METADATA: IProbedVideoUrlMetadata = {
	url: "https://cdn.example.com/original.mp4",
	width: 1280,
	height: 720,
	frameRateFps: 30,
	bitrateKbps: 2000,
	codec: "h264",
	format: "mp4",
	container: "mp4",
	durationSeconds: 10,
	sizeBytes: 1_000_000,
};

export function createMockProbeVideoUrlMetadata(
	impl?: (url: string) => IProbedVideoUrlMetadata | Promise<IProbedVideoUrlMetadata>,
): (
	url: string,
	_options?: IProbeVideoUrlMetadataOptions,
) => Promise<IProbedVideoUrlMetadata> {
	return async function mockProbeVideoUrlMetadata(url: string): Promise<IProbedVideoUrlMetadata> {
		if (impl) {
			return impl(url);
		}
		return {
			...SAMPLE_PROBED_METADATA,
			url,
		};
	};
}
