> **文档层级：** AI与人类
> **状态：** 已对齐
> **记录于：** 2026-07-02
> **读者：** 工程 | 运维
> **关联：** [integration.md](./integration.md) · [api-v1.md](./api-v1.md) · [decisions.md](./decisions.md) · [implementation-plan.md](./implementation-plan.md)

# Worker 配置（配置文件 + 环境变量）

本服务采用 **「JSON 配置文件 + 环境变量覆盖」**。机器相关项放配置文件；**密钥与 R2 凭证仅环境变量**。

## 技术前提

- **Node >= 20**
- **ESM**（`"type": "module"`）
- 部署建议：**HTTPS 终止**在反向代理或 Tailscale；进程内监听 `server.host` / `server.port`

## 加载优先级

```text
内置默认值 → JSON 配置文件 → 环境变量（最高）
```

实现入口（规划）：`src/config/loadProbeWorkerConfig.ts` — 启动时读配置、探测 ffmpeg/R2 能力、产出 **effective config**。

---

## 文件布局

```text
slimvid-ffpegtest-server/
├── config/
│   ├── probe-worker.example.json
│   └── probe-worker.local.json     # gitignore
├── .env.example
└── .env                            # gitignore
```

### 启动示例

```bash
cp config/probe-worker.example.json config/probe-worker.local.json

export PROBE_WORKER_AUTH_TOKEN='your-shared-secret'
export PROBE_WORKER_CONFIG='./config/probe-worker.local.json'
# R2（VMAF 截图，见下表）
export PROBE_WORKER_R2_ACCOUNT_ID='...'
export PROBE_WORKER_R2_BUCKET='...'
export PROBE_WORKER_R2_ACCESS_KEY_ID='...'
export PROBE_WORKER_R2_SECRET_ACCESS_KEY='...'
export PROBE_WORKER_R2_PUBLIC_BASE_URL='https://...'  # 可选

npm start
```

---

## 配置文件 schema（`schemaVersion: 1`）

示例见 [`config/probe-worker.example.json`](../../config/probe-worker.example.json)。

| 路径 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `schemaVersion` | `1` | `1` | 配置格式版本 |
| `server.host` | string | `"0.0.0.0"` | 监听地址 |
| `server.port` | number | `3099` | HTTP 端口 |
| `auth.tokenEnv` | string | `"PROBE_WORKER_AUTH_TOKEN"` | Bearer token 来源 env 名 |
| `concurrency.maxVmafJobs` | number | `1` | 同时运行 libvmaf 路数 |
| `concurrency.maxFfprobeParallel` | number | `4` | compare 并行 ffprobe |
| `vmaf.useGpu` | boolean | `false` | 是否请求 GPU |
| `vmaf.gpuDeviceId` | number | `0` | CUDA 设备序号 |
| `vmaf.model` | string | `"vmaf_v0.6.1"` | 与主 app 一致 |
| `vmaf.ffmpegTimeoutMs` | number | `600000` | 单次 libvmaf 超时 |
| `vmaf.gpuUnavailablePolicy` | `"fallback_cpu"` \| `"fail"` | `"fallback_cpu"` | GPU 不可用策略 |
| `screenshots.enabled` | boolean | `true` | V1 默认开启 sub-75 R2 截图 |
| `screenshots.threshold` | number | `75` | 与主 app 一致 |
| `screenshots.maxSegmentsPerMode` | number | `3` | cap |
| `screenshots.keySegment` | string | `"dev-vmaf-probe"` | R2 key 路径段 |
| `probe.ffprobeTimeoutMs` | number | `45000` | 单 URL ffprobe |
| `probe.downloadTimeoutMs` | number | `300000` | 单文件下载（**无默认字节上限**；dev worker 不设 `maxBytes`） |
| `ffmpeg.ffmpegPath` | string | `"ffmpeg"` | 可执行文件 |
| `ffmpeg.ffprobePath` | string | `"ffprobe"` | 可执行文件 |
| `job.clientJobTtlMs` | number | `600000` | 幂等 TTL |
| `job.terminalRetainMs` | number | `600000` | 终态 retain（10min） |
| `job.maxRuntimeMs` | number | `1800000` | running 上限（30min） |

---

## 环境变量

### 配置文件路径

| 变量 | 说明 |
|------|------|
| `PROBE_WORKER_CONFIG` | JSON 路径；未设置则用内置默认 |

### 鉴权（必填，不进 JSON）

| 变量 | 说明 |
|------|------|
| `PROBE_WORKER_AUTH_TOKEN` | Bearer；与主 app `SLIMVID_DEV_PROBE_WORKER_TOKEN` 相同 |

### R2（VMAF 截图，env only，对齐主 app 风格）

| 变量 | 必填 | 说明 |
|------|------|------|
| `PROBE_WORKER_R2_ACCOUNT_ID` | 截图时 | Cloudflare Account ID |
| `PROBE_WORKER_R2_BUCKET` | 截图时 | Bucket 名 |
| `PROBE_WORKER_R2_ACCESS_KEY_ID` | 截图时 | Access key |
| `PROBE_WORKER_R2_SECRET_ACCESS_KEY` | 截图时 | Secret |
| `PROBE_WORKER_R2_OBJECT_KEY_PREFIX` | 否 | 如 `replacement-uploads/company` |
| `PROBE_WORKER_R2_PUBLIC_BASE_URL` | 否 | 公开根 URL（无尾斜杠）；有则优先 public URL，否则 presigned 7 天 |

未配置 R2 且 `screenshots.enabled=true` → VMAF 仍成功，`screenshotsSkippedReason: "r2_not_configured"`。

### 覆盖 JSON（可选）

| 变量 | 覆盖 |
|------|------|
| `PROBE_WORKER_PORT` | `server.port` |
| `PROBE_WORKER_HOST` | `server.host` |
| `PROBE_WORKER_MAX_VMAF_CONCURRENCY` | `concurrency.maxVmafJobs` |
| `PROBE_WORKER_MAX_FFPROBE_PARALLEL` | `concurrency.maxFfprobeParallel` |
| `PROBE_WORKER_VMAF_USE_GPU` | `vmaf.useGpu` |
| `PROBE_WORKER_VMAF_GPU_UNAVAILABLE_POLICY` | `vmaf.gpuUnavailablePolicy` |
| `PROBE_WORKER_FFMPEG_PATH` | `ffmpeg.ffmpegPath` |
| `PROBE_WORKER_FFPROBE_PATH` | `ffmpeg.ffprobePath` |
| `PROBE_WORKER_CLIENT_JOB_TTL_MS` | `job.clientJobTtlMs` |
| `PROBE_WORKER_SCREENSHOTS_ENABLED` | `screenshots.enabled` |
| `LOG_LEVEL` | pino 级别（默认 `info`） |
| `PROBE_WORKER_PINO_LOG_RETENTION_DAYS` | 落盘日志保留天数（默认 `12`） |

### 落盘日志

- 路径：`.probeWorkerPinoLogs/app/YYYY-MM-DD.log`（相对进程 cwd）
- 控制台与落盘 **同内容**；HTTP access log 与 job phase log 均落盘
- VMAF ffmpeg 失败时 log 含 `ffmpegStderrExcerpt`（截断）；compare ffprobe 失败时 log 含 `exitCode` / stderr 摘要（`phase: compare_probe_rendition`）；**禁止** log 完整 CDN URL

---

## GPU（`vmaf.useGpu`）

| `useGpu` | `libvmaf_cuda` | 行为 |
|----------|----------------|------|
| `false` | — | CPU |
| `true` | 是 | CUDA 模式 |
| `true` | 否 + `fallback_cpu` | warn，CPU；`/health` **200** |
| `true` | 否 + `fail` | 启动失败或 health 异常 |

**任一核心二进制不可用**（`ffmpeg` / `ffprobe` / CPU `libvmaf`）→ `/health` 返回 **503**（主 app fallback 本机）。  
仅 `r2Configured: false` 或 GPU 不可用且 `fallback_cpu` 时仍为 **200**。

---

## GET /health

### 200（服务可用）

`ffmpegAvailable`、`ffprobeAvailable`、`libvmafAvailable` 均为 `true`；GPU 可 fallback 到 CPU 仍返回 200。  
`r2Configured: false` 不导致 503。

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

### 503（不可用）

`ffmpegAvailable`、`ffprobeAvailable`、`libvmafAvailable` **任一为 `false`**（核心路径不可用）。

---

## 主 app 侧

| 变量 | 说明 |
|------|------|
| `SLIMVID_DEV_PROBE_WORKER_URL` | 如 `https://probe-worker.example.com` |
| `SLIMVID_DEV_PROBE_WORKER_TOKEN` | 同 worker token |

主 app `GET /health`：`ok:false` 或 503 → fallback 本机。
