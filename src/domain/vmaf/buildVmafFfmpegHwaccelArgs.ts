/**
 * 模块名称：VMAF CUDA hwaccel 参数
 * 模块说明：为 CPU decode + hwupload_cuda 的 libvmaf_cuda 管线组装 CUDA 设备参数。
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
