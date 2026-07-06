/**
 * 模块名称：Compare rendition 探针常量
 * 模块说明：重试次数与间隔；应对 CDN 瞬时失败。
 */

/** 每 rendition 最大探针次数（含首次） */
export const COMPARE_PROBE_RENDITION_MAX_ATTEMPTS = 3;

/** 重试间隔（毫秒） */
export const COMPARE_PROBE_RENDITION_RETRY_DELAY_MS = 500;
