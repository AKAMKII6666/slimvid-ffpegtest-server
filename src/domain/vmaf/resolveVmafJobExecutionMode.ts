/**
 * 模块名称：VMAF 执行模式解析
 * 模块说明：根据配置与运行时探测决定 CPU libvmaf 或 CUDA libvmaf_cuda。
 */

import type { IProbeWorkerEffectiveConfig } from "../../config/probeWorkerConfig.types.js";
import type {
	IProbeRuntimeCapabilities,
	TVmafExecutionMode,
} from "../ffmpeg/probeRuntimeCapabilities.js";

export class VmafGpuUnavailableError extends Error {
	constructor() {
		super(
			"libvmaf_cuda is not available but vmaf.useGpu is true and gpuUnavailablePolicy is fail",
		);
		this.name = "VmafGpuUnavailableError";
	}
}

/**
 * 解析单次 VMAF job 应使用的 ffmpeg 滤镜后端。
 */
export function resolveVmafJobExecutionMode(
	config: Pick<IProbeWorkerEffectiveConfig, "vmaf">,
	capabilities: Pick<IProbeRuntimeCapabilities, "libvmafCudaAvailable">,
): TVmafExecutionMode {
	if (!config.vmaf.useGpu) {
		return "cpu";
	}

	if (capabilities.libvmafCudaAvailable) {
		return "cuda";
	}

	if (config.vmaf.gpuUnavailablePolicy === "fail") {
		throw new VmafGpuUnavailableError();
	}

	return "cpu";
}

/**
 * 解析单 job 内 candidate libvmaf 并行度；CPU / CUDA 共用 concurrency.maxVmafCandidatesParallel。
 */
export function resolveVmafCandidateParallelism(
	config: Pick<IProbeWorkerEffectiveConfig, "concurrency">,
): number {
	const configured = config.concurrency.maxVmafCandidatesParallel;
	if (typeof configured === "number" && configured >= 1) {
		return Math.floor(configured);
	}

	return 1;
}
