/**
 * 模块名称：视频 URL HEAD 探针
 * 模块说明：读取 Content-Length 与类型提示；失败返回空 hints。
 */

import type { IDevVideoProbeHeadHints } from "./ffprobeParse.helpers.js";

export const PROBE_VIDEO_HEAD_TIMEOUT_MS = 15_000;

export const PROBE_ABORTED_ERROR = "Video probe aborted";

export function assertProbeNotAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new Error(PROBE_ABORTED_ERROR);
	}
}

async function cancelResponseBodyQuietly(response: Response): Promise<void> {
	try {
		await response.body?.cancel();
	} catch {
		// ignore
	}
}

/**
 * HEAD 请求读取体积与 Content-Type / Disposition 提示。
 */
export async function fetchVideoUrlHeadHints(
	url: string,
	timeoutMs: number,
	externalSignal?: AbortSignal,
): Promise<IDevVideoProbeHeadHints> {
	const emptyHints: IDevVideoProbeHeadHints = {
		sizeBytes: 0,
		contentType: "",
		contentDisposition: "",
	};

	assertProbeNotAborted(externalSignal);

	const controller = new AbortController();
	const timer = setTimeout(function (): void {
		controller.abort();
	}, timeoutMs);

	function onExternalAbort(): void {
		controller.abort();
	}

	if (externalSignal) {
		externalSignal.addEventListener("abort", onExternalAbort, { once: true });
	}

	try {
		const response = await fetch(url, {
			method: "HEAD",
			signal: controller.signal,
			redirect: "follow",
		});
		if (!response.ok) {
			await cancelResponseBodyQuietly(response);
			return emptyHints;
		}

		let sizeBytes = 0;
		const lengthHeader = response.headers.get("content-length");
		if (lengthHeader !== null && lengthHeader.trim() !== "") {
			const parsed = Number(lengthHeader);
			if (Number.isFinite(parsed) && parsed > 0) {
				sizeBytes = Math.round(parsed);
			}
		}

		const contentTypeHeader = response.headers.get("content-type");
		const contentDispositionHeader = response.headers.get("content-disposition");

		await cancelResponseBodyQuietly(response);

		return {
			sizeBytes,
			contentType: contentTypeHeader !== null ? contentTypeHeader.trim() : "",
			contentDisposition:
				contentDispositionHeader !== null ? contentDispositionHeader.trim() : "",
		};
	} catch {
		assertProbeNotAborted(externalSignal);
		return emptyHints;
	} finally {
		if (externalSignal) {
			externalSignal.removeEventListener("abort", onExternalAbort);
		}
		clearTimeout(timer);
	}
}
