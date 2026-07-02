/**
 * 模块名称：流式下载字节监控
 * 模块说明：pipeline 中累计字节并在超限时失败。
 */

import { Transform } from "node:stream";

export function createMaxBytesMonitorTransform(maxBytes: number): Transform {
	let receivedBytes = 0;
	return new Transform({
		transform: function (
			chunk: Buffer,
			_encoding: BufferEncoding,
			callback: (error?: Error | null) => void,
		): void {
			receivedBytes += chunk.length;
			if (receivedBytes > maxBytes) {
				callback(new Error("Download body too large"));
				return;
			}
			this.push(chunk);
			callback();
		},
	});
}
