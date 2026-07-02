> **文档层级：** AI与人类
> **状态：** 已对齐
> **读者：** 工程
> **记录于：** 2026-07-02
> **关联：** [decisions.md](./decisions.md) · [configuration.md](./configuration.md)

# 实现计划（V1）

## 技术栈

| 项 | 选择 |
|----|------|
| Node | **>= 20**（`engines.node`） |
| HTTP | **Fastify** |
| 模块 | **ESM**（`package.json` `"type": "module"`；TS `module: NodeNext`） |
| 测试 | **Vitest**（用例在仓库根 `tests/`） |
| 日志 | **pino**（经 Fastify 或独立 `createModuleLogger`） |
| R2 | `@aws-sdk/client-s3` + presigner（VMAF sub-75 截图） |

**禁止** import 主 app 任何源码或类型；Wire 形状在本仓 `src/types/` mirror 复写。

---

## 目录结构（规划）

```text
slimvid-ffpegtest-server/
├── config/
├── src/
│   ├── main.ts                 # 启动 Fastify
│   ├── config/                 # loadProbeWorkerConfig
│   ├── http/                   # routes: health, jobs
│   ├── job/                    # 内存 store + 队列
│   ├── domain/
│   │   ├── probe/              # ffprobe
│   │   ├── vmaf/               # libvmaf 编排
│   │   ├── screenshot/         # 截帧 + R2
│   │   └── ffmpeg/             # spawn、filter graph
│   ├── types/                  # mirror Wire DTO
│   └── logging/
├── tests/
└── docs/AI与人类/
```

---

## Job Store 参数（对齐主 app VMAF store）

| 参数 | 值 | 说明 |
|------|-----|------|
| `terminalRetainMs` | `600_000`（10min） | 终态 job 保留，供 poll |
| `maxRuntimeMs` | `1_800_000`（30min） | running 超时 → failed |
| `clientJobTtlMs` | 配置默认 `600_000` | 幂等 `clientJobId` |

worker 重启后 job 丢失 → 主 app poll 404 → **fallback 本机**（log warn）。

---

## 队列语义（V1）

- `POST /v1/jobs` **永远入队**，初始 `status: pending`。
- **不**返回 `worker_busy` 503；槽满时在队列内等待。
- `pending` job 可被 cancel → 直接 `cancelled`。
- `compare` 占 ffprobe 池；`vmaf` 占 libvmaf 池（配置项分开）。

---

## 分轮实施

| 轮次 | 内容 | verify |
|------|------|--------|
| **R1** | Fastify + config loader + pino + `/health`（ffmpeg/ffprobe/libvmaf/R2 探测；任一核心二进制不可用 → 503） | `npm run typecheck` · 手动 GET /health |
| **R2** | Job store + `POST/GET/cancel /v1/jobs`（mock worker，无 ffmpeg） | Vitest 状态机 / cancel |
| **R3** | ffprobe compare 阶段 | Vitest parse + 集成冒烟 |
| **R4** | CPU libvmaf + frame analytics | Vitest JSON 解析 · 对照主 app 样本 |
| **R5** | R2 截图（sub-75，cap 3 段 × 2 角色） | Vitest object key · 手动 R2 |
| **R6** | 主 app BFF adapter + fallback | 主 app dev 联调 |

GPU（`libvmaf_cuda`）可在 R4 之后单独里程碑，不挡 R1–R6。

---

## 细分任务清单（R1–R6）

各轮 **完成标准** 写在轮末；步骤可并行处已注明。主 app 对照实现目录：`slimvid-shopify-app/app/server/dashboard/dev/`。

### R1 — 脚手架与 `/health`

| 步骤 | 交付物 | verify |
|------|--------|--------|
| R1.1 | `package.json`：`"type":"module"`、`engines.node>=20`、依赖（fastify/pino/tsx/typescript/vitest） | `npm install` |
| R1.2 | `tsconfig.json`（`module: NodeNext`）+ ESLint 最小配置 | `npm run typecheck` |
| R1.3 | scripts：`dev` / `build` / `start` / `typecheck` / `test` / `lint` | 各 script 可执行 |
| R1.4 | `src/config/loadProbeWorkerConfig.ts`（默认 → JSON → env） | Vitest 默认 / override |
| R1.5 | `src/logging/createModuleLogger.ts` | 启动有 `service` 字段 |
| R1.6 | `src/domain/ffmpeg/probeRuntimeCapabilities.ts`（ffmpeg / ffprobe / libvmaf 探测） | Vitest mock spawn |
| R1.7 | `src/main.ts` + Fastify 注册 | `npm run dev` 监听配置端口 |
| R1.8 | `GET /health`：全核心二进制可用 → **200**；任一不可用 → **503** | curl；Vitest 200/503 |
| R1.9 | health 透出 `r2Configured`、`screenshotsEnabled`、`concurrency`、`apiSchemaVersion` | 字段与 [api-v1.md](./api-v1.md) 一致 |

**R1 完成标准：** `npm run typecheck` + `npm run test` 通过；ffmpeg+libvmaf 齐全时 `/health` → 200；故意改错 `PROBE_WORKER_FFMPEG_PATH` → 503。

---

### R2 — Job API 骨架（mock 执行，无真实 ffmpeg）

| 步骤 | 交付物 | verify |
|------|--------|--------|
| R2.1 | `src/types/probeComputeJob.types.ts`（create / status / cancel 响应） | typecheck |
| R2.2 | `parseProbeComputeJobCreateBody` + runtime guard | Vitest invalid_body |
| R2.3 | `assertHttpsJobUrls`（job spec 内 URL 仅 `https:`） | Vitest `invalid_url_scheme` |
| R2.4 | Fastify `onRequest` Bearer 鉴权（`/v1/*`）；`X-Probe-Schema-Version: 1` | Vitest 401 |
| R2.5 | `src/job/probeComputeJobStore.memory.ts`（create / get / cancel / 终态 retain / maxRuntime） | Vitest TTL |
| R2.6 | `clientJobId` 幂等映射（TTL 内重复 POST → 同一 `jobId`） | Vitest dedup |
| R2.7 | 进程内队列：`pending` 入队 → 槽位空时 `running`（**无** `worker_busy`） | Vitest 槽满仍 pending |
| R2.8 | `pending` cancel → 直接 `cancelled`（不 spawn） | Vitest |
| R2.9 | `POST /v1/jobs` · `GET /v1/jobs/:jobId` · `POST /v1/jobs/:jobId/cancel` | Vitest 三端点 |
| R2.10 | mock executor：按 `jobKind` 延时后写 stub `compareResult` / `vmafReport` | 手动 poll 见终态 |
| R2.11 | poll 响应形状对齐 [job-status-v1.md](./job-status-v1.md)（含 `phase`） | Vitest 快照或字段断言 |

**R2 完成标准：** 不装 ffmpeg 也能跑通三端点 + 状态机 + cancel + clientJobId 幂等；`npm run test` 覆盖上述契约。

---

### R3 — Compare / ffprobe 阶段

| 步骤 | 交付物 | verify |
|------|--------|--------|
| R3.1 | `src/types/devVideoCompare.types.ts` mirror | typecheck |
| R3.2 | 移植 `probeVideoUrlMetadata`（对照 `probeVideoUrlMetadata.server.ts`） | Vitest 样本 JSON |
| R3.3 | compare executor：并行 ffprobe（`maxFfprobeParallel`） | Vitest 并发上限 |
| R3.4 | **任一** rendition ffprobe 失败 → compare `failed`（整 job failed） | Vitest |
| R3.5 | running poll：`compare.completedRenditions` / `totalRenditions` 递增 | Vitest |
| R3.6 | 终态 `compareResult`（仅 `renditions[]`，**无** comparisons/notes） | 字段对齐 [job-spec-v1.md](./job-spec-v1.md) |
| R3.7 | 接入 `jobKind: compare`；`unified` 仅跑 compare 段（vmaf 仍 mock 或 skip） | 手动 unified poll `phase` |
| R3.8 | ffprobe 超时（`probe.ffprobeTimeoutMs`）→ failed | Vitest |
| R3.9 | 集成冒烟：对公网 `https:` 短视频 URL ffprobe（可选，CI 可 skip） | 手动 |

**R3 完成标准：** `jobKind: compare` 真实 ffprobe 可 `ready`；单 URL 失败整 job `failed`；poll 进度字段正确。

---

### R4 — VMAF + 逐帧分析

| 步骤 | 交付物 | verify |
|------|--------|--------|
| R4.1 | `src/types/devVideoVmaf.types.ts` mirror（含 frame analytics） | typecheck |
| R4.2 | 移植 `streamDownloadToTempFile` + 下载超时 / abort signal | Vitest mock |
| R4.3 | 移植 `buildDevVideoCompressVmafCandidates` 等价校验（HLS skip 等） | Vitest skipReason |
| R4.4 | 移植 `runVmafPairWithFfmpeg`（delivery + display1080p） | 对照主 app filter graph |
| R4.5 | 移植 `parseVmafFfmpegJson` · `parseVmafFfmpegFrameAnalytics` · `analyzeVmafFrameScores` | Vitest 主 app 样本 JSON |
| R4.6 | ffmpeg 子进程登记 + cancel 时 SIGKILL + abort 在途下载 | Vitest cancel |
| R4.7 | vmaf executor：reference 下载 → candidates **串行** libvmaf | 手动长视频冒烟 |
| R4.8 | running poll：增量 `vmaf.rows[]`（对齐 `appendDevVideoCompressVmafJobRow`） | Vitest |
| R4.9 | skip 规则表（hls / duration_mismatch / download_failed / vmaf_failed） | Vitest 各分支 |
| R4.10 | reference 下载失败 → 整 job `failed`；单 candidate skip 不 fail job | Vitest |
| R4.11 | cancel partial：`cancelled` + 已有分数的 rows 保留 | Vitest；对齐 [job-status-v1.md](./job-status-v1.md) |
| R4.12 | `unified`：compare 成功 → `phase: vmaf` → `ready`；compare 失败不进 vmaf | Vitest |
| R4.13 | `jobKind: vmaf` 单独路径接通 | 手动 |

**R4 完成标准：** CPU libvmaf 端到端 `ready`；cancel partial 与主 app 行为一致；`npm run test` 覆盖 JSON 解析与 skip/cancel。

---

### R5 — R2 截图（sub-75）

| 步骤 | 交付物 | verify |
|------|--------|--------|
| R5.1 | `loadProbeWorkerR2Config`（`PROBE_WORKER_R2_*` env） | Vitest 缺 env → `r2Configured: false` |
| R5.2 | 移植 `putDevVmafProbeScreenshotR2` → worker `putProbeScreenshotR2` | Vitest object key |
| R5.3 | 段内最差帧截 PNG（reference + distorted） | 手动 ffmpeg 帧 |
| R5.4 | 仅 **&lt;75** 段；每 candidate × mode 最多 **3** 段 | Vitest cap |
| R5.5 | key 含 `dev-vmaf-probe/` + 可选 `OBJECT_KEY_PREFIX` | Vitest key 格式 |
| R5.6 | R2 未配置 → `screenshotsSkippedReason: "r2_not_configured"`，job 仍 `ready` | Vitest |
| R5.7 | `includeScreenshots: false` 跳过上传 | Vitest |
| R5.8 | presigned 7d 或 `PUBLIC_BASE_URL` 公开链 | 手动浏览器打开 |

**R5 完成标准：** 有 R2 env 时 sub-75 截图 URL 可访问；无 R2 时 analytics 仍有、skipReason 正确。

---

### R6 — 主 app BFF adapter + fallback

> 落点在 **slimvid-shopify-app**；worker 仓库 R6 仅联调验收。

| 步骤 | 交付物 | verify |
|------|--------|--------|
| R6.1 | 主 app env：`SLIMVID_DEV_PROBE_WORKER_URL` / `TOKEN`（`.env.example`） | development 可读 |
| R6.2 | `probeWorkerHealthCheck.server.ts`（GET /health；503 → fallback） | Vitest mock fetch |
| R6.3 | `buildProbeComputeJobSpec.server.ts`（GraphQL + backend → job spec） | Vitest spec 形状 |
| R6.4 | `probeWorkerClient.server.ts`：create / poll / cancel（Bearer + 超时 5s/30s） | Vitest mock |
| R6.5 | `bffJobId ↔ workerJobId` 内存映射 + shop+video dedup | Vitest |
| R6.6 | compare BFF：`buildDevVideoCompressCompareReport` 远程分支 + `computeDevVideoCompressCompareDerived` | 单条 Modal §1–§3 |
| R6.7 | vmaf BFF：`runDevVideoCompressVmafJob` 或等价远程 poll 映射 | 单条 Modal §4 |
| R6.8 | batch：`jobKind: unified` + cancel 转发（含 pending） | Batch probe 一条 |
| R6.9 | fallback 矩阵（[integration.md](./integration.md)）；`invalid_url_scheme` **不** fallback | Vitest 各分支 |
| R6.10 | worker 404（重启）→ warn + 本机 | 手动杀 worker 复现 |
| R6.11 | 主 app dev 全链路：Modal + Batch JSON 与纯本机对比 | 手动 QA checklist |

**R6 完成标准：** 配 worker URL 时批跑/单条走远程；worker down 时无感 fallback 本机；浏览器仍只 xhr BFF。

---

## 总进度勾选（实施时更新）

```text
R1  脚手架与 /health          ⬜
R2  Job API 骨架（mock）      ⬜
R3  Compare / ffprobe         ⬜
R4  VMAF + 逐帧分析           ⬜
R5  R2 截图                   ⬜
R6  主 app adapter + 联调     ⬜
```

GPU（`libvmaf_cuda`）单独里程碑：⬜（不挡上表）

---

## `package.json` scripts（规划）

```json
{
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint ."
  }
}
```

---

## 类型 mirror（本仓）

| 文件（规划） | 对齐主 app 形状（只读参考，不 import） |
|--------------|----------------------------------------|
| `src/types/devVideoCompare.types.ts` | compare rendition / report 片段 |
| `src/types/devVideoVmaf.types.ts` | vmaf report / row / frame analytics |
| `src/types/probeComputeJob.types.ts` | job spec / status API |
