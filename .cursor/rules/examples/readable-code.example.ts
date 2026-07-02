/**
 * 简单、无副作用的表达允许保持紧凑。
 */
export function formatActiveLabel(active: boolean): string {
	return active ? "Active" : "Inactive";
}

/**
 * 多分支业务状态显式展开，便于阅读、断点调试和后续扩展。
 */
export function resolveTaskLabel(status: string, progress: number): string {
	if (status === "failed") {
		return "Failed";
	}
	if (status === "done") {
		return "Optimized";
	}
	if (progress > 0) {
		return "Optimizing";
	}
	return "Queued";
}

/**
 * 简短纯转换允许箭头函数；不得在回调中隐藏副作用。
 */
export function collectReadyIds(rows: Array<{ id: string; ready: boolean }>): string[] {
	return rows.filter((row) => row.ready).map((row) => row.id);
}
