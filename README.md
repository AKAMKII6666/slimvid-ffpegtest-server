# SlimVID Dev Probe Compute Worker

development-only 远程 ffprobe + libvmaf 计算服务，供主 app Dashboard dev 探针 offload。

- **Agent 入口：** [AGENTS.md](./AGENTS.md)
- **协议文档：** [docs/AI与人类/README.md](./docs/AI与人类/README.md)
- **实现计划：** [docs/AI与人类/implementation-plan.md](./docs/AI与人类/implementation-plan.md)
- **配置：** [docs/AI与人类/configuration.md](./docs/AI与人类/configuration.md)
- **主 app 接线：** [integration.md](./docs/AI与人类/integration.md) · [slimvid-shopify-app](../slimvid-shopify-app)

---

## Windows 10 安装与启动

以下在 **PowerShell** 中操作。默认 **CPU libvmaf**、`maxVmafJobs: 1`（单路 VMAF）。

### 1. 前置依赖

| 依赖 | 要求 |
|------|------|
| **Node.js** | **≥ 20.6**（`node --env-file` 读 `.env` 需要 20.6+） |
| **ffmpeg + ffprobe** | 须带 **`libvmaf`** 滤镜（CPU VMAF） |

检查 Node：

```powershell
node -v
```

### 2. 安装 ffmpeg（无 winget 时手动）

1. 打开 [https://www.gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/)
2. 下载 **`ffmpeg-release-essentials.zip`**（Essentials 含 libvmaf）
3. 解压到例如 `C:\ffmpeg\`，确认存在 `C:\ffmpeg\bin\ffmpeg.exe`
4. 将 `C:\ffmpeg\bin` 加入用户 **Path** 环境变量，**新开 PowerShell**
5. 验证：

```powershell
ffmpeg -version
ffmpeg -hide_banner -filters 2>&1 | findstr libvmaf
```

`findstr libvmaf` 应能看到 **`libvmaf`**。若 ffmpeg 不在 Path，可在 `.env` 里指定完整路径（见下文）。

### 3. 克隆并安装 npm 依赖

```powershell
cd F:\path\to\slimvid-ffpegtest-server
npm install
npm run build
```

### 4. 配置 `.env`（启动时自动加载）

`npm run dev` / `npm start` 会通过 **`node --env-file=.env`** 读取项目根目录的 `.env`，**无需**每次手动 `$env:...`。

```powershell
Copy-Item .env.example .env
notepad .env
```

必填与推荐项：

```env
# 必填；与主 app SLIMVID_DEV_PROBE_WORKER_TOKEN 相同
PROBE_WORKER_AUTH_TOKEN=your-shared-secret

# 推荐：本地 JSON 配置（端口、并发、CPU/GPU 等）
PROBE_WORKER_CONFIG=./config/probe-worker.local.json

# VMAF sub-75 截图（四件套齐全后 health 才 r2Configured: true）
# 注意：变量名是 PROBE_WORKER_R2_*，不是主 app 的 SLIMVID_R2_*
PROBE_WORKER_R2_ACCOUNT_ID=
PROBE_WORKER_R2_BUCKET=
PROBE_WORKER_R2_ACCESS_KEY_ID=
PROBE_WORKER_R2_SECRET_ACCESS_KEY=
# PROBE_WORKER_R2_OBJECT_KEY_PREFIX=replacement-uploads/company
# PROBE_WORKER_R2_PUBLIC_BASE_URL=https://your-cdn.example.com

# ffmpeg 不在 Path 时取消注释并填完整路径
# PROBE_WORKER_FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
# PROBE_WORKER_FFPROBE_PATH=C:\ffmpeg\bin\ffprobe.exe
```

**常见错误：** 不要把 token **值**写进 `config/probe-worker.local.json` 的 `auth.tokenEnv`。JSON 里应固定为：

```json
"auth": {
  "tokenEnv": "PROBE_WORKER_AUTH_TOKEN"
}
```

token **值**只放在 `.env` 的 `PROBE_WORKER_AUTH_TOKEN`。

### 5. 可选：本地 JSON 配置

```powershell
Copy-Item config\probe-worker.example.json config\probe-worker.local.json
```

默认已是 CPU、`maxVmafJobs: 1`。改端口示例：编辑 `server.port` 或 `.env` 里 `PROBE_WORKER_PORT=9562`。

### 6. 启动

开发（热重载）：

```powershell
npm run dev
```

生产式（先 build）：

```powershell
npm run build
npm start
```

成功日志含 **`probe worker listening`**。默认监听 **`0.0.0.0:3099`**（或你在 JSON / env 里改的端口）。

### 7. 验证

本机：

```powershell
curl.exe http://127.0.0.1:3099/health
```

期望 HTTP **200**，且大致包含：

```json
{
  "ok": true,
  "data": {
    "ffmpegAvailable": true,
    "ffprobeAvailable": true,
    "libvmafAvailable": true,
    "vmafExecutionMode": "cpu",
    "r2Configured": true,
    "concurrency": { "maxVmafJobs": 1 }
  }
}
```

- `r2Configured: false`：四个 `PROBE_WORKER_R2_*` 未齐，或 `.env` 未被加载（确认根目录有 `.env` 且已重启进程）
- HTTP **503**：ffmpeg / ffprobe / libvmaf 不可用

### 8. 反代 HTTPS（可选）

对外域名示例：`https://your-worker.example.com/health`。主 app 后续 R6 集成时使用：

- `SLIMVID_DEV_PROBE_WORKER_URL=https://your-worker.example.com`
- `SLIMVID_DEV_PROBE_WORKER_TOKEN` = 与 `.env` 中 `PROBE_WORKER_AUTH_TOKEN` 相同

Worker 进程仍需能 **出站 HTTPS** 下载 job 里的视频 URL。

---

## 日志（落盘 + 细粒度 phase）

启动后日志同时输出到 **控制台** 与 **落盘文件**：

```text
.probeWorkerPinoLogs/app/YYYY-MM-DD.log
```

启动 log 会打印 `logDir` 绝对路径。VMAF / compare 执行阶段会写 `phase` 字段（如 `vmaf_reference_download`、`vmaf_ffmpeg`、`vmaf_candidate_skipped`）；ffmpeg 失败时含 `ffmpegStderrExcerpt`（截断，不含完整 URL）。

**Windows 查日志：**

```powershell
Get-Content .probeWorkerPinoLogs\app\$(Get-Date -Format yyyy-MM-dd).log -Wait |
  Select-String -Pattern 'vmaf_|compare_|job_'
```

**环境变量：**

| 变量 | 说明 |
|------|------|
| `LOG_LEVEL` | pino 级别，默认 `info` |
| `PROBE_WORKER_PINO_LOG_RETENTION_DAYS` | 落盘保留天数，默认 `12` |

---

## 开发命令

```powershell
npm run typecheck
npm run test
npm run lint
```

---

## 与主 app 的关系

Worker 冒烟通过后，Dashboard 不会自动走远程——主 app 仍需 **R6 BFF adapter**（见 [implementation-plan.md § R6](./docs/AI与人类/implementation-plan.md)）。浏览器 **不直连** worker，只 xhr 主 app BFF。

---

## 故障排查（Windows）

| 现象 | 处理 |
|------|------|
| `Missing auth token env: PROBE_WORKER_AUTH_TOKEN` | `.env` 未创建或未填 token；或 JSON 里误把 token 值写进 `auth.tokenEnv` |
| `Missing auth token env: 112233...` | `auth.tokenEnv` 被改成了数字；改回 `PROBE_WORKER_AUTH_TOKEN` |
| health `r2Configured: false` | 配齐 `PROBE_WORKER_R2_*` 四变量；不要用 `SLIMVID_R2_*` |
| `--env-file` 报错 | 升级 Node 到 **20.6+**；确认项目根有 `.env` 文件 |
| npm warn `Unknown user config "//"` | 用户级 `~/.npmrc` 有无效项，与 worker 无关，可清理 `.npmrc` |
