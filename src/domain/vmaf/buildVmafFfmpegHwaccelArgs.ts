/**
 * 模块名称：VMAF CUDA hwaccel 参数
 * 模块说明：为 libvmaf_cuda 管线组装 -init_hw_device / per-input -hwaccel 参数。
 */

const VMAF_CUDA_HW_DEVICE_NAME = "cuda";

/**
 * 全局 CUDA 设备初始化（每个 ffmpeg 命令一次）。
 */
export function buildVmafFfmpegCudaGlobalArgs(gpuDeviceId: number): string[] {
	return [
		"-init_hw_device",
		VMAF_CUDA_HW_DEVICE_NAME + "=" + VMAF_CUDA_HW_DEVICE_NAME + ":" + String(gpuDeviceId),
		"-filter_hw_device",
		VMAF_CUDA_HW_DEVICE_NAME,
	];
}

/**
 * 单个 `-i` 输入前的 CUDA hwaccel 参数。
 */
export function buildVmafFfmpegCudaPerInputArgs(gpuDeviceId: number): string[] {
	return [
		"-hwaccel",
		"cuda",
		"-hwaccel_device",
		String(gpuDeviceId),
		"-hwaccel_output_format",
		"cuda",
	];
}
