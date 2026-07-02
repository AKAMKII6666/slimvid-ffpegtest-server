> **文档层级：** AI与人类
> **状态：** 已对齐（协议 v1）
> **读者：** 工程 | 联调
> **记录于：** 2026-07-02
> **关联主应用：** [slimvid-shopify-app](../../../slimvid-shopify-app) · [dev-video-compress-compare.md](../../../slimvid-shopify-app/docs/AI与人类/工程/前端/dev-video-compress-compare.md)

# Dev Probe Compute Worker — 文档索引

本目录为 **协议与联调真源**（worker 仓库内）。Cursor harness 摘要见 [`.cursor/rules/probe-compute-contract.mdc`](../../.cursor/rules/probe-compute-contract.mdc)。

## 协议 v1（`schemaVersion: 1`）

| 文档 | 内容 |
|------|------|
| [api-v1.md](./api-v1.md) | HTTP 端点、鉴权、错误码、响应包络 |
| [job-spec-v1.md](./job-spec-v1.md) | `POST /v1/jobs` 请求体、compare/vmaf spec、校验与幂等 |
| [job-status-v1.md](./job-status-v1.md) | Poll 响应、状态机、partial / cancel 终态 |
| [integration.md](./integration.md) | 主 app env、BFF adapter、fallback、jobId 映射 |
| [configuration.md](./configuration.md) | JSON 配置、env、R2、端口/并行/GPU |
| [implementation-plan.md](./implementation-plan.md) | 技术栈、目录、分轮实施 |
| [decisions.md](./decisions.md) | 已拍板决策 |

## 职责边界

| 组件 | 职责 |
|------|------|
| **主 app BFF** | Shopify Session、GraphQL rendition、业务后端 URL、组装 job spec、浏览器 xhr |
| **本 worker** | https URL 校验、ffprobe、下载、libvmaf、R2 截图、逐帧解析 |
| **浏览器** | 不直连 worker |

## 变更流程

1. 先改本目录文档并 bump `schemaVersion`（breaking 时）。
2. 同步主 app `dev-video-compress-compare.md` 接线节（链到本目录，不重复字段表）。
3. 更新 `.cursor/rules/probe-compute-contract.mdc` 索引行。
