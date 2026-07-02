/**
 * 模块名称：clientJobId 幂等索引
 * 模块说明：TTL 内相同 clientJobId → 同一 jobId。
 */

interface IClientJobIdIndexEntry {
	jobId: string;
	expiresAtMs: number;
}

const indexByClientJobId = new Map<string, IClientJobIdIndexEntry>();

export function purgeExpiredClientJobIdIndex(nowMs: number): void {
	for (const [clientJobId, entry] of indexByClientJobId.entries()) {
		if (entry.expiresAtMs <= nowMs) {
			indexByClientJobId.delete(clientJobId);
		}
	}
}

/**
 * 查找仍有效的 clientJobId 映射。
 */
export function findJobIdByClientJobId(
	clientJobId: string,
	nowMs: number,
): string | null {
	purgeExpiredClientJobIdIndex(nowMs);
	const entry = indexByClientJobId.get(clientJobId);
	if (!entry) {
		return null;
	}
	if (entry.expiresAtMs <= nowMs) {
		indexByClientJobId.delete(clientJobId);
		return null;
	}
	return entry.jobId;
}

/**
 * 登记 clientJobId → jobId。
 */
export function registerClientJobIdMapping(
	clientJobId: string,
	jobId: string,
	ttlMs: number,
	nowMs: number,
): void {
	indexByClientJobId.set(clientJobId, {
		jobId,
		expiresAtMs: nowMs + ttlMs,
	});
}

/** 单测清理 */
export function resetClientJobIdIndexForTests(): void {
	indexByClientJobId.clear();
}
