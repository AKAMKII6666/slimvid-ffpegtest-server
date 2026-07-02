import { describe, expect, it } from "vitest";

import { PROBE_WORKER_DEFAULT_CONFIG } from "@worker/config/defaults.js";
import {
	buildVmafFfmpegFilterGraph,
	buildVmafFfmpegFullFilter,
	VMAF_FFMPEG_FILTER_CUDA,
	VMAF_FFMPEG_FILTER_CPU,
} from "@worker/domain/vmaf/buildVmafFfmpegFilterGraph.js";
import {
	resolveVmafCandidateParallelism,
	resolveVmafJobExecutionMode,
	VmafGpuUnavailableError,
} from "@worker/domain/vmaf/resolveVmafJobExecutionMode.js";

describe("buildVmafFfmpegFilterGraph", function () {
	it("builds CPU metadata2go bicubic upscale chain", function () {
		const graph = buildVmafFfmpegFilterGraph({
			mode: "metadata2goBicubicUpscale",
			referenceWidth: 1920,
			referenceHeight: 1080,
			executionMode: "cpu",
		});

		expect(graph).toContain("[0:v]scale=1920:1080:flags=bicubic");
		expect(graph).toContain("setpts=PTS-STARTPTS[dist]");
		expect(graph).toContain("[1:v]setpts=PTS-STARTPTS[ref]");
		expect(graph).toContain("[dist][ref]" + VMAF_FFMPEG_FILTER_CPU);
		expect(graph).not.toContain("libvmaf_cuda");
	});

	it("builds CUDA metadata2go upscale chain with scale_cuda", function () {
		const graph = buildVmafFfmpegFilterGraph({
			mode: "metadata2goBicubicUpscale",
			referenceWidth: 1280,
			referenceHeight: 720,
			executionMode: "cuda",
		});

		expect(graph).toContain("scale_cuda=1280:720:format=yuv420p");
		expect(graph).toContain("[0:v]scale_cuda=1280:720:format=yuv420p[dist]");
		expect(graph).toContain("[1:v]scale_cuda=format=yuv420p[ref]");
		expect(graph).not.toContain("setpts");
		expect(graph).toContain("[dist][ref]" + VMAF_FFMPEG_FILTER_CUDA);
	});

	it("throws when reference dimensions missing", function () {
		expect(function (): void {
			buildVmafFfmpegFilterGraph({
				mode: "metadata2goBicubicUpscale",
				referenceWidth: 0,
				referenceHeight: 1080,
				executionMode: "cpu",
			});
		}).toThrow(/referenceWidth/);
	});

	it("appends model and log_path in full filter", function () {
		const full = buildVmafFfmpegFullFilter(
			{ mode: "metadata2goBicubicUpscale", referenceWidth: 640, referenceHeight: 360, executionMode: "cpu" },
			"/tmp/vmaf.json",
			"vmaf_v0.6.1",
		);

		expect(full).toContain("=model=version=vmaf_v0.6.1:log_fmt=json:log_path=/tmp/vmaf.json");
	});

	it("uses relative log filename without drive-letter escaping", function () {
		const fileName = "slimvid-vmaf-abc.json";
		const full = buildVmafFfmpegFullFilter(
			{
				mode: "metadata2goBicubicUpscale",
				referenceWidth: 270,
				referenceHeight: 480,
				executionMode: "cpu",
			},
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

describe("resolveVmafCandidateParallelism", function () {
	it("forces serial candidate runs when execution mode is cuda", function () {
		expect(
			resolveVmafCandidateParallelism(
				{
					...PROBE_WORKER_DEFAULT_CONFIG,
					concurrency: {
						...PROBE_WORKER_DEFAULT_CONFIG.concurrency,
						maxVmafCandidatesParallel: 4,
					},
				},
				"cuda",
			),
		).toBe(1);
	});

	it("uses configured maxVmafCandidatesParallel for cpu mode", function () {
		expect(
			resolveVmafCandidateParallelism(
				{
					...PROBE_WORKER_DEFAULT_CONFIG,
					concurrency: {
						...PROBE_WORKER_DEFAULT_CONFIG.concurrency,
						maxVmafCandidatesParallel: 3,
					},
				},
				"cpu",
			),
		).toBe(3);
	});
});
