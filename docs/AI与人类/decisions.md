> **文档层级：** AI与人类
> **状态：** 已对齐
> **读者：** 工程
> **记录于：** 2026-07-02

# 协议与实现决策

已拍板项；变更须更新本文与 [api-v1.md](./api-v1.md) / [job-spec-v1.md](./job-spec-v1.md)。

---

## D1 — 主 app 发 URL spec，worker 不拉 Shopify

Worker **不**持有 Admin token，**不**调用 GraphQL / 业务后端。  
BFF 负责 `productId` / `videoId` 上下文与 URL 列表组装。

---

## D2 — 三种 jobKind，一套 Job API

`compare` | `vmaf` | `unified` 共用 `POST/GET/cancel /v1/jobs`。  
批跑优先 `unified`。

---

## D3 — Compare derived 留在主 app（V1）

Worker 只产出 **probe 后的 `renditions[]`**。  
`comparisons[]`、`notes[]` 由主 app `computeDevVideoCompressCompareDerived` 计算。  
理由：diff 最小、与现有 Modal/batch JSON 行为一致。

---

## D4 — R2 截图 V1 开启

`vmaf.options.includeScreenshots` 默认 **`true`**。  
行为对齐主 app：仅 **&lt;75** 段、每 candidate × mode 最多 **3** 段、每段 **reference + distorted** 各一张 PNG。  
Object key 段 **`dev-vmaf-probe/`**（可叠 `PROBE_WORKER_R2_OBJECT_KEY_PREFIX`）。  
R2 凭证未配置 → **不 fail 整 job**；frame analytics 仍输出，`screenshotsSkippedReason: "r2_not_configured"`。  
R2 env 风格对齐主 app Cloudflare R2 变量（见 [configuration.md](./configuration.md)）。

---

## D5 — 全异步 Job（V1）

Compare 与 VMAF 均经 job poll，不提供同步 `POST /probe/compare`。  
单条 Modal 可在主 app 层并行等待 compare job 与 UI 骨架。

---

## D6 — DTO 形状对齐主 app，代码完全独立

字段语义与主 app Wire types **一致**，但 worker **禁止** import 主 app 源码/types。  
在本仓 `src/types/` **mirror 复写**；主 app 类型文件仅作人工对照参考。

---

## D7 — Cancel 语义对齐主 app VMAF

不可逆；SIGKILL ffmpeg；partial report 可写入 batch；poll 表见 [job-status-v1.md](./job-status-v1.md)。

---

## D8 — Fail-open fallback

Worker 不可达、`/health` **503**（`ffmpeg` / `ffprobe` / CPU `libvmaf` 任一不可用）、网络/5xx → 主 app 本机 ffmpeg。  
`invalid_url_scheme`（非 https）→ **不 fallback**，返回错误。

---

## D9 — 浏览器不直连 worker

所有 worker HTTP 由主 app BFF **服务端**发起；worker 可绑 HTTPS 域名 + Bearer 鉴权。

---

## D10 — VMAF 执行模式：CPU 默认，GPU 可配置

默认 CPU `libvmaf`。`vmaf.useGpu` 在配置文件中开启；须 ffmpeg 带 `libvmaf_cuda`。  
GPU 不可用 + `fallback_cpu` → `/health` **200**，`vmafExecutionMode: "cpu"`。  
`ffmpeg`、`ffprobe` 或 CPU `libvmaf` **任一不可用** → `/health` **503**。

---

## D11 — 配置文件 + 环境变量覆盖

端口、并行、GPU、ffmpeg 路径、超时 → **`config/probe-worker*.json`**。  
`PROBE_WORKER_AUTH_TOKEN` 与 R2 密钥 → **仅 env**。  
详见 [configuration.md](./configuration.md)。

---

## D12 — 安全：Bearer 鉴权 + https URL only

**主边界**为服务间 `Authorization: Bearer`（部署 HTTPS 域名）。  
job spec 内 URL 仅校验 **`https:` scheme** 与基本 URL 形态；**不做** Shopify CDN 域名白名单。  
禁止 worker 访问 `http:`、`file:` 等 scheme。

---

## D13 — 队列：POST 永远 pending 入队

不实现 `worker_busy` 503；并发槽满时在进程内队列等待。  
`POST /v1/jobs` 响应初始 `status: "pending"`（或已有 worker 时很快变 `running`）。

---

## D14 — Compare 失败粒度 V1 严格

任一 rendition ffprobe 失败 → compare 阶段 **failed**（与主 app 一致）。

---

## D15 — 技术栈

Node 20+ · Fastify · **ESM** · Vitest · pino。详见 [implementation-plan.md](./implementation-plan.md)。

---

## D16 — Job store TTL 对齐主 app

| 参数 | 值 |
|------|-----|
| 终态 retain | 10min |
| running max | 30min |
| clientJobId TTL | 10min（可配置） |

参考主 app `DEV_VIDEO_COMPRESS_VMAF_JOB_TERMINAL_RETAIN_MS` / `MAX_RUNTIME_MS`。

---

## 未决（后续迭代）

| 项 | 说明 |
|----|------|
| `maxVmafJobs` > 1 压测与 cancel race | 配置已支持，R4+ 验证 |
| GPU `libvmaf_cuda` 实现 | R4 之后里程碑 |
| 共享 npm 包抽 mirror types | 双仓稳定后再议 |
| JSON Schema 导出 | 可选 |
| unified 内 compare/vmaf 重复 ffprobe 缓存 | 性能优化，非 V1 |
