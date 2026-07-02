/**
 * 模块名称：有限并发 map
 * 模块说明：compare / vmaf 阶段复用。
 */

/**
 * 以固定并发度映射异步任务，结果顺序与输入一致。
 */
export async function mapWithConcurrency<TItem, TResult>(
	items: TItem[],
	concurrency: number,
	mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
	const results: TResult[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= items.length) {
				return;
			}
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	}

	const workerCount = Math.max(1, Math.min(concurrency, items.length));
	const workers: Array<Promise<void>> = [];
	for (let index = 0; index < workerCount; index += 1) {
		workers.push(worker());
	}
	await Promise.all(workers);
	return results;
}
