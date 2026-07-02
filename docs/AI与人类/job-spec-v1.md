> **文档层级：** AI与人类
> **状态：** 已对齐（协议 v1）
> **读者：** 工程 | 联调
> **关联：** [api-v1.md](./api-v1.md) · [decisions.md](./decisions.md)

# Job Spec v1 — POST /v1/jobs

## 顶层请求体

```typescript
interface IProbeComputeJobCreateRequest {
  schemaVersion: 1;
  jobKind: "compare" | "vmaf" | "unified";

  /** 主 app 幂等键，建议 `${shopDomain}:${videoId}:${batchId?}` */
  clientJobId?: string;

  /** opaque 追踪；worker 不验证 Shopify 资源归属 */
  caller: {
    shopDomain: string;
    productId: string;
    videoId: string;
    batchId?: string;
  };

  compare?: IProbeComputeCompareSpec;
  vmaf?: IProbeComputeVmafSpec;
}
```

### jobKind 与必填段

| jobKind | 必填 |
|---------|------|
| `compare` | `compare` |
| `vmaf` | `vmaf` |
| `unified` | `compare` + `vmaf` |

### 运行时 guard

- 所有 string 字段 `trim()` 后非空（`batchId` 可选除外）。
- 所有 URL 须为 **`https:`** 合法 URL；拒绝 `http:`、`file:` 等（见 [decisions.md](./decisions.md) D12）。
- `schemaVersion !== 1` → `unsupported_schema`。

---

## Compare spec

主 app 在 BFF 内完成 GraphQL + 业务后端，将 **待 ffprobe 的 URL 列表** 传给 worker。

```typescript
interface IProbeComputeCompareSpec {
  productName: string;
  linkedCompressTaskId?: string;
  renditions: Array<{
    group: "shopify" | "slimvid";
    label: string;
    url: string;
  }>;
}
```

### Worker 产出（V1）

Worker 在 job 完成 compare 阶段后返回 **probe 后的 rendition 元数据**（对齐主 app `IDevVideoCompressCompareRendition` 字段）：

- `group`, `label`, `url`, `width`, `height`, `frameRateFps`, `bitrateKbps`, `codec`, `format`, `container`, `durationSeconds`, `sizeBytes`

**不在 worker 计算：** `comparisons[]`、`notes[]` — 由主 app 用现有 `computeDevVideoCompressCompareDerived` 组装完整 `IDevVideoCompressCompareReport`（见 [decisions.md](./decisions.md)）。

任一 rendition ffprobe 失败 → 整个 compare 阶段 `failed`（与主 app compare BFF「全有或全失败」一致）。

---

## VMAF spec

主 app 组装 reference + candidates（对齐 `buildDevVideoCompressVmafCandidates`），**worker 不再拉 GraphQL**。

```typescript
interface IProbeComputeVmafSpec {
  reference: {
    label: string; // 固定 "Original source"
    url: string;
  };
  candidates: Array<{
    label: string;
    group: "shopify" | "slimvid";
    url: string;
    width: number;  // GraphQL；0 表示 worker ffprobe 补齐
    height: number;
    formatHint: string;
    mimeType: string;
  }>;
  options?: {
    vmafModel?: string; // 默认 "vmaf_v0.6.1"
    durationMismatchThresholdSec?: number; // 默认 2
    includeFrameAnalytics?: boolean; // 默认 true
    includeScreenshots?: boolean; // 默认 true；R2 未配置时不 fail job
  };
}
```

### R2 截图（V1 默认开启）

当 `includeScreenshots !== false` 且 worker R2 env 已配置：

- 阈值 **&lt;75**；每 candidate × mode 最多 **3** 段
- 段内 **reference + distorted** 各一帧 PNG → R2
- key 含 `dev-vmaf-probe/`（见 [configuration.md](./configuration.md)）

R2 未配置 → `frameAnalytics` 仍有 segment 统计；`screenshotsSkippedReason: "r2_not_configured"`。

### Skip 规则（与主 app 一致）

| 条件 | skipReason |
|------|------------|
| HLS / m3u8 | `hls` |
| ffprobe 不完整 | `ffprobe_incomplete` |
| 与 reference 时长差 > threshold | `duration_mismatch` |
| 下载失败 | `download_failed` |
| 两 mode VMAF 均 null | `vmaf_failed` |

单 candidate skip **不**导致整 job failed（与主 app VMAF worker 一致）。

---

## 示例：`unified` 批跑单条

```json
{
  "schemaVersion": 1,
  "jobKind": "unified",
  "clientJobId": "myshop.myshopify.com:gid://shopify/Video/123:batch-abc",
  "caller": {
    "shopDomain": "myshop.myshopify.com",
    "productId": "gid://shopify/Product/1",
    "videoId": "gid://shopify/Video/123",
    "batchId": "batch-abc"
  },
  "compare": {
    "productName": "Demo Product",
    "renditions": [
      {
        "group": "shopify",
        "label": "Original source",
        "url": "https://cdn.shopify.com/videos/..."
      },
      {
        "group": "shopify",
        "label": "720p",
        "url": "https://cdn.shopify.com/videos/..."
      },
      {
        "group": "slimvid",
        "label": "SlimVID (mapped)",
        "url": "https://files.example.com/compressed.mp4"
      }
    ]
  },
  "vmaf": {
    "reference": {
      "label": "Original source",
      "url": "https://cdn.shopify.com/videos/..."
    },
    "candidates": [
      {
        "label": "720p",
        "group": "shopify",
        "url": "https://cdn.shopify.com/videos/...",
        "width": 1280,
        "height": 720,
        "formatHint": "mp4",
        "mimeType": "video/mp4"
      },
      {
        "label": "SlimVID (mapped)",
        "group": "slimvid",
        "url": "https://files.example.com/compressed.mp4",
        "width": 0,
        "height": 0,
        "formatHint": "mp4",
        "mimeType": "video/mp4"
      }
    ],
    "options": {
      "includeFrameAnalytics": true,
      "includeScreenshots": true
    }
  }
}
```

---

## 主 app Wire 类型对照

| Worker 段 | 主 app 类型（只读参考） |
|-----------|-------------------------|
| compare renditions 产出 | `IDevVideoCompressCompareRendition` |
| vmaf report 产出 | `IDevVideoCompressCompareVmafReport` |
| vmaf row | `IDevVideoCompressCompareVmafRow` |
| frame analytics | `IDevVideoCompressCompareVmafRowFrameAnalyticsByMode` |

路径：`slimvid-shopify-app/app/types/backEnd/xhr/dashboard/devVideoCompressCompare*.types.ts`（**只读对照**；worker 在 `src/types/` mirror 复写，不 import）。
