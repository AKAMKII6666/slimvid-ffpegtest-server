/**
 * 模块名称：AbortSignal 合并
 * 模块说明：任一 signal abort 则合成 signal abort。
 */

export function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
	const activeSignals = signals.filter(function (signal): boolean {
		return signal !== undefined && signal !== null;
	});
	if (activeSignals.length === 0) {
		return new AbortController().signal;
	}
	if (activeSignals.length === 1) {
		return activeSignals[0];
	}

	const controller = new AbortController();
	for (let index = 0; index < activeSignals.length; index++) {
		const signal = activeSignals[index];
		if (signal.aborted) {
			controller.abort();
			break;
		}
		signal.addEventListener(
			"abort",
			function (): void {
				controller.abort();
			},
			{ once: true },
		);
	}
	return controller.signal;
}
