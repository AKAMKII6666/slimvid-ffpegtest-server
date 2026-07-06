> **文档层级：** AI与人类
> **状态：** 实施中
> **读者：** 工程
> **记录于：** 2026-07-02
> **关联：** [implementation-plan.md](./implementation-plan.md) · [api-v1.md](./api-v1.md)
>
> **范围：** 仅 `slimvid-ffpegtest-server`（R1.1–R5.8）；**不含 R6**（主 app adapter）。

# Worker 实施批处理清单

由 [implementation-plan.md](./implementation-plan.md) 细分步骤导出，供 `@batch-execute` 使用。

**约束：** 禁止修改 `slimvid-shopify-app`；主 app `app/server/dashboard/dev/` 仅只读对照；遵守本仓 `.cursor/rules/`。

```yaml
---
batch_size: 3
stop_on_fail: true
max_rounds: 10
verify_commands:
  - npm run typecheck
  - npm run test
working_directory: /Users/bolbiao/workspace/SmartData/slimvid-ffpegtest-server
---
```

---

## 里程碑总览

| 状态 | ID | 里程碑 | verify |
|------|-----|--------|--------|
| ✅ | R1 | 脚手架与 `/health` | `npm run typecheck` · `npm run test` · 手动 `GET /health` |
| ✅ | R2 | Job API 骨架（mock） | `npm run typecheck` · `npm run test` |
| ✅ | R3 | Compare / ffprobe | `npm run typecheck` · `npm run test` |
| ✅ | R4 | VMAF + 逐帧分析 | `npm run typecheck` · `npm run test` |
| ✅ | R5 | R2 截图（sub-75） | `npm run typecheck` · `npm run test` |

GPU（`libvmaf_cuda`）单独里程碑，不挡上表：✅

---

## R1 — 脚手架与 `/health`

| 状态 | ID | 任务 | verify |
|------|-----|------|--------|
| ✅ | R1.1 | `package.json`：`"type":"module"`、`engines.node>=20`、依赖（fastify/pino/tsx/typescript/vitest） | `npm install` |
| ✅ | R1.2 | `tsconfig.json`（`module: NodeNext`）+ ESLint 最小配置 | `npm run typecheck` |
| ✅ | R1.3 | scripts：`dev` / `build` / `start` / `typecheck` / `test` / `lint` | 各 script 可执行 |
| ✅ | R1.4 | `src/config/loadProbeWorkerConfig.ts`（默认 → JSON → env） | `npm run test -- tests/config/loadProbeWorkerConfig.test.ts` |
| ✅ | R1.5 | `src/logging/createModuleLogger.ts` | 启动 log 含 `service` 字段 |
| ✅ | R1.6 | `src/domain/ffmpeg/probeRuntimeCapabilities.ts`（ffmpeg / ffprobe / libvmaf 探测） | `npm run test -- tests/domain/ffmpeg/probeRuntimeCapabilities.test.ts` |
| ✅ | R1.7 | `src/main.ts` + Fastify 注册 | `npm run dev` 监听配置端口 |
| ✅ | R1.8 | `GET /health`：全核心二进制可用 → **200**；任一不可用 → **503** | `npm run test -- tests/http/healthRoute.test.ts` |
| ✅ | R1.9 | health 透出 `r2Configured`、`screenshotsEnabled`、`concurrency`、`apiSchemaVersion` | 字段与 [api-v1.md](./api-v1.md) 一致 |

**R1 批末：** `npm run typecheck` · `npm run test` · ffmpeg+libvmaf 齐全时 `/health` → 200；改错 `PROBE_WORKER_FFMPEG_PATH` → 503。

---

## R2 — Job API 骨架（mock 执行，无真实 ffmpeg）

| 状态 | ID | 任务 | verify |
|------|-----|------|--------|
| ✅ | R2.1 | `src/types/probeComputeJob.types.ts`（create / status / cancel 响应） | `npm run typecheck` |
| ✅ | R2.2 | `parseProbeComputeJobCreateBody` + runtime guard | `npm run test -- tests/http/guards/parseProbeComputeJobCreateBody.test.ts` |
| ✅ | R2.3 | `assertHttpsJobUrls`（job spec 内 URL 仅 `https:`） | `npm run test -- tests/http/guards/assertHttpsJobUrls.test.ts` |
| ✅ | R2.4 | Fastify Bearer 鉴权（`/v1/*`）；`X-Probe-Schema-Version: 1` | `npm run test -- tests/http/auth/assertBearerAuth.test.ts` |
| ✅ | R2.5 | `src/job/probeComputeJobStore.memory.ts`（create / get / cancel / 终态 retain / maxRuntime） | `npm run test -- tests/job/probeComputeJobStore.test.ts` |
| ✅ | R2.6 | `clientJobId` 幂等映射（TTL 内重复 POST → 同一 `jobId`） | `npm run test -- tests/job/probeComputeJobClientIdIndex.test.ts` |
| ✅ | R2.7 | 进程内队列：`pending` 入队 → 槽位空时 `running`（**无** `worker_busy`） | `npm run test -- tests/job/probeComputeJobQueue.test.ts` |
| ✅ | R2.8 | `pending` cancel → 直接 `cancelled`（不 spawn） | `npm run test -- tests/job/probeComputeJobStore.test.ts` |
| ✅ | R2.9 | `POST /v1/jobs` · `GET /v1/jobs/:jobId` · `POST /v1/jobs/:jobId/cancel` | `npm run test -- tests/http/jobsRoutes.test.ts` |
| ✅ | R2.10 | mock executor：按 `jobKind` 延时后写 stub `compareResult` / `vmafReport` | 手动 poll 见终态 |
| ✅ | R2.11 | poll 响应形状对齐 [job-status-v1.md](./job-status-v1.md)（含 `phase`） | `npm run test -- tests/http/jobsRoutes.test.ts` |

**R2 批末：** 不装 ffmpeg 也能跑通三端点 + 状态机 + cancel + clientJobId 幂等；`npm run test`。

---

## R3 — Compare / ffprobe 阶段

| 状态 | ID | 任务 | verify |
|------|-----|------|--------|
| ✅ | R3.1 | `src/types/devVideoCompare.types.ts` mirror | `npm run typecheck` |
| ✅ | R3.2 | 移植 `probeVideoUrlMetadata`（对照主 app `probeVideoUrlMetadata.server.ts`） | `npm run test -- tests/domain/probe/probeVideoUrlMetadata.test.ts` |
| ✅ | R3.3 | compare executor：并行 ffprobe（`maxFfprobeParallel`） | `npm run test -- tests/job/runComparePhaseForJob.test.ts` |
| ✅ | R3.4 | compare：HLS 跳过；ffprobe 重试；单档失败 skip；0 条/缺 SlimVID → failed | `npm run test -- tests/job/runComparePhaseForJob.test.ts` |
| ✅ | R3.5 | running poll：`compare.completedRenditions` / `totalRenditions` 递增（含 skip） | `npm run test -- tests/http/jobsRoutes.test.ts` |
| ✅ | R3.6 | 终态 `compareResult`（仅 `renditions[]`，**无** comparisons/notes） | 字段对齐 [job-spec-v1.md](./job-spec-v1.md) |
| ✅ | R3.7 | 接入 `jobKind: compare`；`unified` 仅跑 compare 段（vmaf 仍 mock 或 skip） | 手动 unified poll `phase` |
| ✅ | R3.8 | ffprobe 超时 / 执行失败 → 重试后 skip 或 compare failed | `npm run test -- tests/domain/probe/probeVideoUrlMetadata.test.ts` |
| ⬜ | R3.9 | 集成冒烟：对公网 `https:` 短视频 URL ffprobe（可选，CI 可 skip） | 手动 |
| ✅ | R3.10 | ffprobe 结构化错误；VMAF 下载无默认字节上限 | `npm run test -- tests/domain/probe/runFfprobeOnVideoUrl.test.ts` |

**R3 批末：** `jobKind: compare` 真实 ffprobe 可 `ready`；单档可 skip；全失败或缺 SlimVID 时 compare `failed`。

---

## R4 — VMAF + 逐帧分析

| 状态 | ID | 任务 | verify |
|------|-----|------|--------|
| ✅ | R4.1 | `src/types/devVideoVmaf.types.ts` mirror（含 frame analytics） | `npm run typecheck` |
| ✅ | R4.2 | 移植 `streamDownloadToTempFile` + 下载超时 / abort signal | `npm run test -- tests/domain/download/streamDownloadToTempFile.test.ts` |
| ✅ | R4.3 | 移植 `buildVmafCandidates` 等价校验（HLS skip 等） | `npm run test -- tests/domain/vmaf/buildVmafCandidates.test.ts` |
| ✅ | R4.4 | 移植 `runVmafPairWithFfmpeg`（delivery + display1080p） | 对照主 app filter graph |
| ✅ | R4.5 | 移植 `parseVmafFfmpegJson` · `parseVmafFfmpegFrameAnalytics` · `analyzeVmafFrameScores` | `npm run test -- tests/domain/vmaf/` |
| ✅ | R4.6 | ffmpeg 子进程登记 + cancel 时 SIGKILL + abort 在途下载 | `npm run test -- tests/domain/ffmpeg/ffmpegProcessRegistry.test.ts` |
| ✅ | R4.7 | vmaf executor：reference 下载 → candidates **串行** libvmaf | 手动长视频冒烟（单测 mock 已覆盖） |
| ✅ | R4.8 | running poll：增量 `vmaf.rows[]` | `npm run test -- tests/job/runVmafPhaseForJob.test.ts` |
| ✅ | R4.9 | skip 规则表（hls / duration_mismatch / download_failed / vmaf_failed） | `npm run test -- tests/domain/vmaf/buildVmafCandidates.test.ts` |
| ✅ | R4.10 | reference 下载失败 → 整 job `failed`；单 candidate skip 不 fail job | `npm run test -- tests/job/runVmafPhaseForJob.test.ts` |
| ✅ | R4.11 | cancel partial：`cancelled` + 已有分数的 rows 保留 | `npm run test -- tests/job/runVmafPhaseForJob.test.ts` |
| ✅ | R4.12 | `unified`：compare 成功 → `phase: vmaf` → `ready`；compare 失败不进 vmaf | `npm run test -- tests/http/jobsRoutes.test.ts` |
| ✅ | R4.13 | `jobKind: vmaf` 单独路径接通 | `npm run test -- tests/job/runVmafPhaseForJob.test.ts` |

**R4 批末：** CPU libvmaf 端到端 `ready`；cancel partial 与主 app 行为一致。

---

## R5 — R2 截图（sub-75）

| 状态 | ID | 任务 | verify |
|------|-----|------|--------|
| ✅ | R5.1 | `loadProbeWorkerR2Config`（`PROBE_WORKER_R2_*` env） | `npm run test -- tests/config/loadProbeWorkerR2Config.test.ts` |
| ✅ | R5.2 | 移植 `putProbeScreenshotR2`（对照主 app `putDevVmafProbeScreenshotR2`） | `npm run test -- tests/domain/screenshot/putProbeScreenshotR2.test.ts` |
| ✅ | R5.3 | 段内最差帧截 PNG（reference + distorted） | `npm run test -- tests/domain/screenshot/captureVmafProbeFrameWithFfmpeg.test.ts` |
| ✅ | R5.4 | 仅 **&lt;75** 段；每 candidate × mode 最多 **3** 段 | `npm run test -- tests/domain/screenshot/devVmafProbeScreenshotPolicy.test.ts` |
| ✅ | R5.5 | key 含 `dev-vmaf-probe/` + 可选 `OBJECT_KEY_PREFIX` | `npm run test -- tests/domain/screenshot/buildVmafProbeScreenshotObjectKey.test.ts` |
| ✅ | R5.6 | R2 未配置 → `screenshotsSkippedReason: "r2_not_configured"`，job 仍 `ready` | `npm run test -- tests/domain/screenshot/enrichVmafFrameAnalyticsWithProbeScreenshots.test.ts` |
| ✅ | R5.7 | `includeScreenshots: false` 跳过上传 | `npm run test -- tests/job/runVmafPhaseForJob.test.ts` |
| ✅ | R5.8 | presigned 7d 或 `PUBLIC_BASE_URL` 公开链 | `npm run test -- tests/domain/screenshot/putProbeScreenshotR2.test.ts`（浏览器手动可选） |

**R5 批末：** 有 R2 env 时 sub-75 截图 URL 可访问；无 R2 时 analytics 仍有、skipReason 正确。

---

## 变更记录

| 日期 | 轮次 | 已完成 ID | 备注 |
|------|------|-----------|------|
| 2026-07-06 | R3+ | compare 韧性 | HLS skip、ffprobe 重试/skip、结构化错误、VMAF 下载无字节上限；文档 D14 修订 |
| 2026-07-02 | GPU | libvmaf_cuda | filter graph + hwaccel + health fail 策略、82 tests |
| 2026-07-02 | R5 | R5.1–R5.8 | R2 截图 sub-75、enrich 接线、75 tests |
| 2026-07-02 | R4 | R4.1–R4.13 | 真实 VMAF 阶段、61 tests |
| 2026-07-02 | R3 | R3.1–R3.8 | 真实 compare ffprobe、executor 接线、43 tests |
| 2026-07-02 | R2 | R2.1–R2.11 | Job API mock、32 tests |
| 2026-07-02 | R1 | R1.1–R1.9 | 脚手架、/health 200/503、8 tests |

---

## 常用 @batch-execute 命令

```text
# Batch 1（R1）
@batch-execute /Users/bolbiao/workspace/SmartData/slimvid-ffpegtest-server/docs/AI与人类/worker-implementation-batch.md from=R1.1 batch_size=3 stop_on_fail=true max_rounds=3

# Batch 2（R2）
@batch-execute .../worker-implementation-batch.md from=R2.1 batch_size=3 stop_on_fail=true max_rounds=4

# Batch 3（R3）
@batch-execute .../worker-implementation-batch.md from=R3.1 batch_size=3 stop_on_fail=true max_rounds=3

# Batch 4（R4）
@batch-execute .../worker-implementation-batch.md from=R4.1 batch_size=3 stop_on_fail=true max_rounds=5

# Batch 5（R5）
@batch-execute .../worker-implementation-batch.md from=R5.1 batch_size=3 stop_on_fail=true max_rounds=3
```
