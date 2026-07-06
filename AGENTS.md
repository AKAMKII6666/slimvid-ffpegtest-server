# Agent 指引（SlimVID Dev Probe Compute Worker）

面向 Cursor / Codex 等编码 Agent 的仓库入口。人类维护者同样可读。

**关联主应用：** [`slimvid-shopify-app`](../slimvid-shopify-app) — Dashboard dev 探针 BFF 发 job spec、poll 结果；本 worker 不可达或失败时 fallback 本机 ffmpeg。

## 定位

- **development-only** 远程计算：ffprobe + libvmaf + **R2 截图**。
- **Fastify · ESM · Node 20+ · Vitest · pino**（见 [implementation-plan.md](./docs/AI与人类/implementation-plan.md)）。
- 仓库 **完全独立**，不 import 主 app。

## 编码铁律

| 文件 | 用途 |
|------|------|
| `.cursor/rules/codingRole.mdc` | 分层、HTTP 边界、禁止 barrel |
| `.cursor/rules/testing-and-quality.mdc` | typecheck / lint / test |
| `.cursor/rules/规则制定原则.mdc` | 歧义时先澄清再写码 |

领域规则按路径注入：`worker-boundaries.mdc`、`probe-compute-contract.mdc`、`ffmpeg-runtime.mdc`、`security-and-trust.mdc`。

## Job 契约（概要）

**字段级真源：** [docs/AI与人类/README.md](./docs/AI与人类/README.md)（协议 v1）。Cursor 速查：`.cursor/rules/probe-compute-contract.mdc`。

| 操作 | 说明 |
|------|------|
| 创建 job | POST body 含 URL 列表与 job 类型（compare / vmaf / unified） |
| Poll | GET status；running 可返回 partial rows |
| Compare | HLS 跳过；ffprobe 失败可重试后 skip 单档；缺 SlimVID 或 0 条成功 → compare failed |
| Cancel | 不可逆；SIGKILL ffmpeg + abort 下载；已有分数可写 partial report |

**Cancel 契约：** `cancelled: true` 后 worker 不得 commit 终态为 ready、不得复活 job。

## 安全

- **HTTPS + Bearer** 鉴权；禁止无鉴权公网暴露。
- job spec URL 仅 **`https:`**（不做 CDN 域名白名单）。
- R2 密钥与 token 仅 env。

## 质量门禁

```shell
npm run typecheck   # 改 TS 后
npm run lint        # 改 ESLint 范围源码后
npm run test        # 改解析器、job 状态机、ffmpeg 编排后
```

（`package.json` 脚本落地后按上表执行；Agent 不得声称已通过未运行的检查。）

## 实施前最小阅读

| 任务 | 先读 |
|------|------|
| 协议 / API / job spec | [docs/AI与人类/README.md](./docs/AI与人类/README.md) |
| **开工 / 分轮计划** | [docs/AI与人类/implementation-plan.md](./docs/AI与人类/implementation-plan.md) |
| 新增/改 HTTP API | `worker-boundaries.mdc` · `probe-compute-contract.mdc` · `security-and-trust.mdc` |
| ffprobe / VMAF / 并发 | `ffmpeg-runtime.mdc` · 主 app `app/server/dashboard/dev/` 对照实现 |
| 与主 app 字段对齐 | 主 app `types/backEnd/xhr/dashboard/devVideoCompressCompare*.types.ts` |
| 主 app 接线 | [docs/AI与人类/integration.md](./docs/AI与人类/integration.md) · 主 app [dev-video-compress-compare.md](../slimvid-shopify-app/docs/AI与人类/工程/前端/dev-video-compress-compare.md) |
| 部署 / 配置 | [docs/AI与人类/configuration.md](./docs/AI与人类/configuration.md) |

## 配置

**真源：** [docs/AI与人类/configuration.md](./docs/AI与人类/configuration.md)

| 来源 | 内容 |
|------|------|
| `config/probe-worker.local.json` | 端口、并行、GPU、screenshots、job TTL |
| `.env` | `PROBE_WORKER_AUTH_TOKEN`、`PROBE_WORKER_R2_*`；`npm run dev` / `start` 经 `node --env-file=.env` 加载 |
| env override | 如 `PROBE_WORKER_PORT` 覆盖 JSON |

## 环境变量（摘要）

| 变量 | 说明 |
|------|------|
| `PROBE_WORKER_AUTH_TOKEN` | 必填；主 app 调用 worker 的共享密钥 |
| `PROBE_WORKER_CONFIG` | 可选；JSON 配置文件路径 |

完整表见 [configuration.md](./docs/AI与人类/configuration.md)。

主 app 侧：`SLIMVID_DEV_PROBE_WORKER_URL` / `SLIMVID_DEV_PROBE_WORKER_TOKEN` — 见 [integration.md](./docs/AI与人类/integration.md)。
