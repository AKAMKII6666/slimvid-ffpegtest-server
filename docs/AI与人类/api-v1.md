> **文档层级：** AI与人类
> **状态：** 已对齐（协议 v1）
> **读者：** 工程 | 联调
> **关联：** [job-spec-v1.md](./job-spec-v1.md) · [job-status-v1.md](./job-status-v1.md)

# HTTP API v1

Base path：`/v1`（health 在根路径）。部署建议 **HTTPS**（反向代理或 Tailscale）；鉴权见下。

## 通用约定

### 鉴权

所有 `/v1/*` 请求须带：

```http
Authorization: Bearer <PROBE_WORKER_AUTH_TOKEN>
X-Probe-Schema-Version: 1
```

| 结果 | HTTP | 说明 |
|------|------|------|
| 缺失 / 错误 token | 401 | 不泄露 job 是否存在 |
| job spec 中 URL 非 `https:` | 400 | `code: invalid_url_scheme` |

**安全边界**为 Bearer token + HTTPS 部署；**不做** CDN 域名白名单。

### 响应包络

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": "human readable message", "code": "invalid_body" }
```

### 错误码（`code` 字段，非穷举）

| code | 典型 HTTP | 说明 |
|------|-----------|------|
| `invalid_body` | 400 | JSON / 字段 guard 失败 |
| `invalid_url_scheme` | 400 | URL 非 https |
| `unsupported_schema` | 400 | `schemaVersion` 不支持 |
| `unauthorized` | 401 | token 无效 |
| `job_not_found` | 404 | 未知 jobId |
| `job_not_cancellable` | 409 | 已终态 |
| `libvmaf_unavailable` | 503 | 创建 vmaf job 时 CPU libvmaf 不可用 |

V1 **不**使用 `worker_busy`：POST 永远入队 `pending`（见 [decisions.md](./decisions.md) D13）。

---

## GET /health

无需 Bearer（建议仅内网/HTTPS 暴露）。

### 200 — 服务可用

**全部核心二进制可用**：`ffmpegAvailable`、`ffprobeAvailable`、`libvmafAvailable`（CPU）均为 `true`。  
GPU 请求但 fallback 到 CPU 仍为 **200**，`vmafExecutionMode` 标明实际模式。  
`r2Configured: false` **不**导致 503（截图跳过，VMAF/compare 仍可跑）。

```json
{
  "ok": true,
  "data": {
    "service": "slimvid-probe-worker",
    "configSchemaVersion": 1,
    "server": { "port": 3099 },
    "ffmpegAvailable": true,
    "ffprobeAvailable": true,
    "libvmafAvailable": true,
    "libvmafCudaAvailable": false,
    "vmafExecutionMode": "cpu",
    "r2Configured": true,
    "screenshotsEnabled": true,
    "concurrency": {
      "maxVmafJobs": 1,
      "maxFfprobeParallel": 4
    },
    "apiSchemaVersion": 1
  }
}
```

### 503 — 不可用

**任一核心二进制不可用**即返回 503（响应体仍含各 `*Available` 字段，标明具体缺失项）：

| 字段 | 为 `false` 时 |
|------|----------------|
| `ffmpegAvailable` | `ffmpeg` 不可执行或未找到 |
| `ffprobeAvailable` | `ffprobe` 不可执行或未找到 |
| `libvmafAvailable` | CPU `libvmaf` filter 不可用 |

主 app **fallback 本机**。

字段说明见 [configuration.md](./configuration.md)。

---

## POST /v1/jobs

创建异步 job，**立即入队**。

- 请求体：见 [job-spec-v1.md](./job-spec-v1.md)
- 响应 `data`：

```typescript
interface IProbeComputeJobCreateResponse {
  jobId: string;
  status: "pending" | "running";
  clientJobId?: string;
  totalCandidates?: number;
}
```

初始通常为 **`pending`**；worker 有空槽后变 `running`。  
**幂等：** 相同 `clientJobId` 在 TTL 内重复 POST → 同一 `jobId`。

---

## GET /v1/jobs/:jobId

Poll；见 [job-status-v1.md](./job-status-v1.md)。建议间隔 2–5s。

---

## POST /v1/jobs/:jobId/cancel

```json
{ "reason": "batch_cancel" }
```

```typescript
interface IProbeComputeJobCancelResponse {
  jobId: string;
  status: "cancelled" | "already_cancelled";
}
```

`pending` job cancel → 直接 `cancelled`，不 spawn ffmpeg。

---

## 非目标

- Shopify GraphQL / 业务后端
- 浏览器直连
- Webhook（V1 仅 poll）
