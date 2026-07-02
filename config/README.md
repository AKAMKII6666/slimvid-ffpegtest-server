# Worker 配置文件

- **示例（可提交）：** [`probe-worker.example.json`](./probe-worker.example.json)
- **本机（勿提交）：** 复制为 `probe-worker.local.json` 并按机器修改
- **字段说明：** [`docs/AI与人类/configuration.md`](../docs/AI与人类/configuration.md)

```bash
cp probe-worker.example.json probe-worker.local.json
```

密钥与 R2 凭证放 `.env`（见 `.env.example`）；截图默认开启，需配置 `PROBE_WORKER_R2_*`。
