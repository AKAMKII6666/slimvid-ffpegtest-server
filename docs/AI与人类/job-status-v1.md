> **文档层级：** AI与人类
> **状态：** 已对齐（协议 v1）
> **读者：** 工程 | 联调
> **关联：** [api-v1.md](./api-v1.md) · 主 app [dev-video-compress-compare.md](../../../slimvid-shopify-app/docs/AI与人类/工程/前端/dev-video-compress-compare.md) §VMAF cancel

# Job Status v1 — GET /v1/jobs/:jobId

## 状态机

```text
pending → running → ready
                 → failed
                 → cancelled
```

| status | 说明 |
|--------|------|
| `pending` | 已入队，等待 ffprobe / libvmaf 槽位 |
| `running` | 执行中 |
| `ready` | 成功终态 |
| `failed` | 致命错误（如 reference 下载失败、libvmaf 不可用） |
| `cancelled` | 用户/主 app 请求取消 |

**Cancel 不可逆：** `cancelled` 后不得变为 `ready`，不得复活 job 或继续 spawn ffmpeg。

---

## Poll 响应 `data`

```typescript
interface IProbeComputeJobStatus {
  jobId: string;
  status: "pending" | "running" | "ready" | "failed" | "cancelled";

  /** unified：当前阶段 */
  phase?: "compare" | "vmaf";

  compare?: {
    completedRenditions: number;
    totalRenditions: number;
    /** compare 完成后填充；running 时可选 partial */
    renditions?: IDevVideoCompressCompareRendition[];
  };

  vmaf?: {
    completedCandidates: number;
    totalCandidates: number;
    /** running 时可增量追加（对齐主 app appendDevVideoCompressVmafJobRow） */
    rows?: IDevVideoCompressCompareVmafRow[];
  };

  /** 终态 compare：probe 后的 renditions（V1 不含 comparisons/notes） */
  compareResult?: {
    productName: string;
    videoId: string;
    linkedCompressTaskId?: string;
    probedAtIso: string;
    renditions: IDevVideoCompressCompareRendition[];
  };

  /** 终态 vmaf */
  vmafReport?: IDevVideoCompressCompareVmafReport;

  errorMessage?: string;
  totalDurationMs?: number;
}
```

类型名与主 app Wire DTO 字段对齐；实现时在 worker `src/types/` **mirror 复写**，禁止 import 主 app。

---

## 队列与 POST 语义

- V1 无 `worker_busy`；槽满时 job 保持 `pending` 直至被调度。
- `POST /v1/jobs` 创建后 poll 可能先见 `pending`，再变 `running`。

---

## unified job 阶段顺序

1. `phase: "compare"` — 并行 ffprobe 各 rendition（`maxFfprobeParallel`）；HLS 跳过；可重试后 skip 单档
2. `phase: "vmaf"` — reference 下载 → 各 candidate 串行（V1 默认串行 libvmaf）
3. `status: "ready"` — compare 产出满足最小条件且 vmaf 段成功

compare 阶段 **failed**（不进入 vmaf）当：终态 0 条成功探针，或缺少必需的 SlimVID mapped 行。单档 shopify ffprobe 失败**不**再单独导致整 job failed（见 [job-spec-v1.md](./job-spec-v1.md) Compare 跳过与重试）。

---

## Cancel 与 partial（与主 app 一致）

| 客户端 poll 行为 | 条件 | 说明 |
|------------------|------|------|
| 继续 poll | `status=cancelled` 且无可用的 `vmafReport` / rows | cancel API 已执行，worker 尚未 finalize |
| 终态 success（partial） | `status=cancelled` 且 `vmafReport` 或 `rows` 非空 | batch JSON 可写入当前条 `vmafReport` |
| 终态 error | 客户端 wait 超时仍无 report | 罕见；记 `vmaf_failed` 或 batch `cancelled` |

Cancel 中途若某 candidate 已有 delivery/display 分数，partial row **保留真实分数**，不写误导性 `vmaf_failed`。

---

## 终态 `vmafReport` 形状

对齐主 app `IDevVideoCompressCompareVmafReport`：

| 字段 | 说明 |
|------|------|
| `jobId` | worker jobId（主 app 映射后写入 batch 时可替换为 BFF jobId，文档化即可） |
| `videoId` | 来自 `caller.videoId` |
| `referenceLabel` | `"Original source"` |
| `vmafModel` | 默认 `vmaf_v0.6.1` |
| `probedAtIso` | 完成时刻 |
| `totalDurationMs` | worker 墙钟耗时 |
| `rows` | 各 candidate 结果 |

---

## failed 语义

| 场景 | compare | vmaf |
|------|---------|------|
| HLS / m3u8 rendition | 跳过，不计入 `compareResult.renditions` | — |
| 单 rendition ffprobe 失败（重试后） | 跳过该档；**job 仍可比继续** | — |
| 0 条成功探针 / 缺 SlimVID 行 | 整 job failed | — |
| reference 下载失败 | — | 整 job failed |
| 单 candidate skip | — | 该行 skipped，job 仍 ready |

`errorMessage` 面向人类可读，不含堆栈、完整 URL（含 query）。ffprobe 类错误可含 **exit code** 与 stderr 截断。
