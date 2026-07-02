import { describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import {
	buildVmafFfmpegFilterGraph,
	buildVmafFfmpegFullFilter,
	VMAF_FFMPEG_FILTER_CUDA,
	VMAF_FFMPEG_FILTER_CPU,
} from "@worker/domain/vmaf/buildVmafFfmpegFilterGraph.js";
import {
	resolveVmafJobExecutionMode,
	VmafGpuUnavailableError,
} from "@worker/domain/vmaf/resolveVmafJobExecutionMode.js";

describe("buildVmafFfmpegFilterGraph", function () {
	it("builds CPU delivery filter graph", function () {
		const graph = buildVmafFfmpegFilterGraph({
			mode: "delivery",
			deliveryWidth: 1280,
			deliveryHeight: 720,
			executionMode: "cpu",
		});

		expect(graph).toContain("scale=1280:720:flags=bicubic");
		expect(graph).toContain("[0:v]setpts=PTS-STARTPTS[dist]");
		expect(graph).not.toContain("[0:v],setpts");
		expect(graph).toContain("[dist][ref]" + VMAF_FFMPEG_FILTER_CPU);
		expect(graph).not.toContain("libvmaf_cuda");
	});

	it("builds CUDA delivery filter graph with scale_cuda", function () {
		const graph = buildVmafFfmpegFilterGraph({
			mode: "delivery",
			deliveryWidth: 1280,
			deliveryHeight: 720,
			executionMode: "cuda",
		});

		expect(graph).toContain("scale_cuda=1280:720:format=yuv420p");
		expect(graph).toContain("[0:v]scale_cuda=format=yuv420p,setpts=PTS-STARTPTS[dist]");
		expect(graph).not.toContain("[0:v],setpts");
		expect(graph).toContain("[dist][ref]" + VMAF_FFMPEG_FILTER_CUDA);
	});

	it("builds CUDA display1080p filter graph with pad_cuda", function () {
		const graph = buildVmafFfmpegFilterGraph({
			mode: "display1080p",
			executionMode: "cuda",
		});

		expect(graph).toContain("scale_cuda=1920:1080:force_original_aspect_ratio=decrease");
		expect(graph).toContain("pad_cuda=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black");
		expect(graph).toContain(VMAF_FFMPEG_FILTER_CUDA);
	});

	it("appends model and log_path in full filter", function () {
		const full = buildVmafFfmpegFullFilter(
			{ mode: "display1080p", executionMode: "cpu" },
			"/tmp/vmaf.json",
			"vmaf_v0.6.1",
		);

		expect(full).toContain("=model=version=vmaf_v0.6.1:log_fmt=json:log_path=/tmp/vmaf.json");
	});

	it("uses relative log filename without drive-letter escaping", function () {
		const fileName = "slimvid-vmaf-abc.json";
		const full = buildVmafFfmpegFullFilter(
			{ mode: "delivery", deliveryWidth: 270, deliveryHeight: 480, executionMode: "cpu" },
			fileName,
			"vmaf_v0.6.1",
		);
		expect(full).toContain("log_path=slimvid-vmaf-abc.json");
		expect(full).not.toContain("C\\:");
	});
});

describe("resolveVmafJobExecutionMode", function () {
	it("returns cpu when useGpu is false", function () {
		expect(
			resolveVmafJobExecutionMode(PROBE_WORKER_DEFAULT_CONFIG, {
				libvmafCudaAvailable: true,
			}),
		).toBe("cpu");
	});

	it("returns cuda when useGpu and libvmaf_cuda are available", function () {
		expect(
			resolveVmafJobExecutionMode(
				{
					...PROBE_WORKER_DEFAULT_CONFIG,
					vmaf: { ...PROBE_WORKER_DEFAULT_CONFIG.vmaf, useGpu: true },
				},
				{ libvmafCudaAvailable: true },
			),
		).toBe("cuda");
	});

	it("falls back to cpu when cuda unavailable and policy is fallback_cpu", function () {
		expect(
			resolveVmafJobExecutionMode(
				{
					...PROBE_WORKER_DEFAULT_CONFIG,
					vmaf: {
						...PROBE_WORKER_DEFAULT_CONFIG.vmaf,
						useGpu: true,
						gpuUnavailablePolicy: "fallback_cpu",
					},
				},
				{ libvmafCudaAvailable: false },
			),
		).toBe("cpu");
	});

	it("throws when cuda unavailable and policy is fail", function () {
		expect(function (): void {
			resolveVmafJobExecutionMode(
				{
					...PROBE_WORKER_DEFAULT_CONFIG,
					vmaf: {
						...PROBE_WORKER_DEFAULT_CONFIG.vmaf,
						useGpu: true,
						gpuUnavailablePolicy: "fail",
					},
				},
				{ libvmafCudaAvailable: false },
			);
		}).toThrow(VmafGpuUnavailableError);
	});
});
