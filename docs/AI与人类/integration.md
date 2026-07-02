> **文档层级：** AI与人类
> **状态：** 已对齐（协议 v1）
> **读者：** 工程 | 联调
> **关联：** [api-v1.md](./api-v1.md) · [configuration.md](./configuration.md) · 主 app [dev-video-compress-compare.md](../../../slimvid-shopify-app/docs/AI与人类/工程/前端/dev-video-compress-compare.md)

# 主 app 集成与 fallback

## 数据流

```text
Browser (Dashboard dev)
  → xhr → slimvid-shopify-app BFF
            ├─ 组装 job spec（GraphQL + business backend）
            ├─ if SLIMVID_DEV_PROBE_WORKER_URL:
            │     Authorization: Bearer → HTTPS worker /v1/jobs…
            │     mapWorkerResponse → 现有 Wire DTO
            └─ else / on failure:
                  现有本机 buildDevVideoCompressCompareReport / runDevVideoCompressVmafJob
```

**浏览器不直连 worker。**

---

## Worker 配置

**真源：** [configuration.md](./configuration.md)

- 机器项 → `config/probe-worker.local.json`
- 鉴权 token + R2 密钥 → `.env`
- Worker 建议绑 **HTTPS** 域名；主 app `SLIMVID_DEV_PROBE_WORKER_URL` 使用 `https://…`

---

## 环境变量

### Worker

| 变量 | 必填 | 说明 |
|------|------|------|
| `PROBE_WORKER_AUTH_TOKEN` | 是 | Bearer；不进 JSON |
| `PROBE_WORKER_CONFIG` | 否 | JSON 路径 |
| `PROBE_WORKER_R2_*` | 截图时 | 见 [configuration.md](./configuration.md) |

### 主 app

| 变量 | 说明 |
|------|------|
| `SLIMVID_DEV_PROBE_WORKER_URL` | 如 `https://probe.example.com` |
| `SLIMVID_DEV_PROBE_WORKER_TOKEN` | 同 worker token |

仅 `SLIMVID_APP_ENV=development` 时生效。

---

## BFF adapter（主 app 待实现）

1. **buildJobSpec** — GraphQL + backend + candidates
2. **createRemoteJob** — `POST /v1/jobs`（`jobKind: unified` 用于 batch）
3. **pollRemoteJob** — 直至终态；兼容 worker 初始 `pending`
4. **cancelRemoteJob** — 含 `pending` job
5. **mapToBffResponse** — renditions + 本机 derived → compare report；vmafReport 透传

### jobId 映射

| ID | 持有者 |
|----|--------|
| `bffJobId` | 浏览器 poll |
| `workerJobId` | worker UUID |

### Dedup

保留 shop + videoId running dedup；远程模式不重复 POST worker。

---

## Fallback

| 条件 | 行为 |
|------|------|
| URL 未配置 | 本机 |
| `GET /health` **503**（`ffmpeg` / `ffprobe` / CPU `libvmaf` 任一不可用） | 本机 |
| 网络错误、超时、5xx | 本机（warn） |
| worker 404（重启丢 job） | 本机（warn） |
| `invalid_url_scheme`（非 https spec） | **不 fallback**；BFF 报错 |

超时：创建 5s；poll 30s。

---

## 批跑

- 单条视频：`jobKind: "unified"`
- `clientJobId` 含 `batchId`
- cancel 转发 worker（含 pending）

---

## 网络

- Worker：Tailscale / 反代 HTTPS；Bearer 鉴权
- Worker 须能 **出站 HTTPS** 下载 job spec 中的视频 URL
- 主 app 服务器只须能 **出站 HTTPS** 到 worker 域名

---

## 主 app 文档回链

已补：[dev-video-compress-compare.md §4.5 Remote compute worker](../../../slimvid-shopify-app/docs/AI与人类/工程/前端/dev-video-compress-compare.md)（env、fallback、协议索引）。
