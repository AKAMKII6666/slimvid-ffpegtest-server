/**
 * 模块名称：静默取消 Fetch 响应体
 * 模块说明：非 2xx 或 pipeline 失败时释放 body 读锁。
 */

export async function cancelFetchResponseBodyQuietly(response: Response): Promise<void> {
	if (!response.body) {
		return;
	}
	try {
		await response.body.cancel();
	} catch {
		// 忽略 cancel 失败
	}
}
