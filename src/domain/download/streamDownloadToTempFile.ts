/**
 * 模块名称：流式下载至临时文件
 * 模块说明：将远程 https URL pipeline 写入磁盘；支持 timeout / abort / maxBytes。
 */

import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { cancelFetchResponseBodyQuietly } from "../http/cancelFetchResponseBodyQuietly.js";
import { createMaxBytesMonitorTransform } from "../http/createMaxBytesMonitorTransform.js";
import { mergeAbortSignals } from "../http/mergeAbortSignals.js";

/** 默认下载超时（毫秒） */
export const STREAM_DOWNLOAD_DEFAULT_TIMEOUT_MS = 5 * 60_000;

/** 默认下载字节上限（500 MiB） */
export const STREAM_DOWNLOAD_DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

export interface IStreamDownloadToTempFileOk {
	ok: true;
	filePath: string;
	fileSize: number;
	downloadContentType: string | null;
	downloadContentDispositionFilename: string | null;
	cleanup: () => Promise<void>;
}

export interface IStreamDownloadToTempFileFail {
	ok: false;
	error: string;
}

export type TStreamDownloadToTempFileResult = IStreamDownloadToTempFileOk | IStreamDownloadToTempFileFail;

export interface IStreamDownloadToTempFileOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
	maxBytes?: number;
	fetchFn?: typeof fetch;
}

function resolveStreamDownloadAbortSignal(options?: IStreamDownloadToTempFileOptions): {
	signal: AbortSignal;
	clearTimeout: () => void;
} {
	const timeoutMs =
		typeof options?.timeoutMs === "number" && options.timeoutMs > 0
			? options.timeoutMs
			: STREAM_DOWNLOAD_DEFAULT_TIMEOUT_MS;
	const timeoutController = new AbortController();
	const timeoutId = setTimeout(function (): void {
		timeoutController.abort();
	}, timeoutMs);
	const signals: AbortSignal[] = [timeoutController.signal];
	if (options?.signal !== undefined) {
		signals.push(options.signal);
	}
	return {
		signal: mergeAbortSignals(signals),
		clearTimeout: function (): void {
			clearTimeout(timeoutId);
		},
	};
}

export function parseFilenameFromContentDisposition(header: string | null): string | null {
	if (header === null || header.trim() === "") {
		return null;
	}

	const filenameStarMatch = /filename\*\s*=\s*([^;]+)/i.exec(header);
	if (filenameStarMatch !== null) {
		const rawValue = filenameStarMatch[1].trim().replace(/^"|"$/g, "");
		const utf8PrefixMatch = /^UTF-8''(.+)$/i.exec(rawValue);
		if (utf8PrefixMatch !== null) {
			try {
				const decoded = decodeURIComponent(utf8PrefixMatch[1]);
				if (decoded.trim() !== "") {
					return decoded.trim();
				}
			} catch {
				// 回退 filename=
			}
		}
	}

	const filenameMatch = /filename\s*=\s*("([^"]+)"|([^;\s]+))/i.exec(header);
	if (filenameMatch !== null) {
		const parsed = (filenameMatch[2] ?? filenameMatch[3])?.trim();
		if (parsed !== undefined && parsed !== "") {
			return parsed;
		}
	}

	return null;
}

export async function streamDownloadToTempFile(
	downloadUrl: string,
	options?: IStreamDownloadToTempFileOptions,
): Promise<TStreamDownloadToTempFileResult> {
	let tempDir: string;
	try {
		tempDir = await mkdtemp(join(tmpdir(), "slimvid-probe-worker-"));
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: "Failed to create temp dir: " + message };
	}

	const filePath = join(tempDir, "artifact");
	const maxBytes =
		typeof options?.maxBytes === "number" && options.maxBytes > 0
			? options.maxBytes
			: STREAM_DOWNLOAD_DEFAULT_MAX_BYTES;
	const abort = resolveStreamDownloadAbortSignal(options);
	const fetchFn = options?.fetchFn ?? fetch;

	let response: Response;
	try {
		response = await fetchFn(downloadUrl, {
			signal: abort.signal,
		});
	} catch (err: unknown) {
		abort.clearTimeout();
		await rm(tempDir, { recursive: true, force: true });
		const message = err instanceof Error ? err.message : String(err);
		if (abort.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
			return { ok: false, error: "Download aborted" };
		}
		return { ok: false, error: "Download failed: " + message };
	}

	if (!response.ok) {
		abort.clearTimeout();
		await cancelFetchResponseBodyQuietly(response);
		await rm(tempDir, { recursive: true, force: true });
		return { ok: false, error: "Download failed with status " + String(response.status) };
	}

	if (!response.body) {
		abort.clearTimeout();
		await rm(tempDir, { recursive: true, force: true });
		return { ok: false, error: "Download response has no body" };
	}

	let nodeReadable: Readable | null = null;
	try {
		nodeReadable = Readable.fromWeb(response.body as import("stream/web").ReadableStream);
		const byteMonitor = createMaxBytesMonitorTransform(maxBytes);
		await pipeline(nodeReadable, byteMonitor, createWriteStream(filePath));
	} catch (err: unknown) {
		if (nodeReadable !== null) {
			nodeReadable.destroy();
		}
		await cancelFetchResponseBodyQuietly(response);
		abort.clearTimeout();
		await rm(tempDir, { recursive: true, force: true });
		const message = err instanceof Error ? err.message : String(err);
		if (abort.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
			return { ok: false, error: "Download aborted" };
		}
		if (message === "Download body too large") {
			return { ok: false, error: "Download body too large" };
		}
		return { ok: false, error: "Download stream failed: " + message };
	}

	abort.clearTimeout();

	let fileSize = 0;
	try {
		const fileStat = await stat(filePath);
		fileSize = fileStat.size;
	} catch (err: unknown) {
		await rm(tempDir, { recursive: true, force: true });
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: "Failed to stat temp file: " + message };
	}

	if (fileSize === 0) {
		await rm(tempDir, { recursive: true, force: true });
		return { ok: false, error: "Download returned empty body" };
	}

	const contentDispositionHeader = response.headers.get("content-disposition");
	const downloadContentType = response.headers.get("content-type");
	const downloadContentDispositionFilename =
		parseFilenameFromContentDisposition(contentDispositionHeader);

	return {
		ok: true,
		filePath: filePath,
		fileSize: fileSize,
		downloadContentType: downloadContentType,
		downloadContentDispositionFilename: downloadContentDispositionFilename,
		cleanup: async function (): Promise<void> {
			await rm(tempDir, { recursive: true, force: true });
		},
	};
}
