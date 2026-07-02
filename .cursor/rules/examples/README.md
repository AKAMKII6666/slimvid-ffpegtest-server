# Dev Probe Worker 规则示例

这些文件只展示**可复用结构模式**，不是可直接复制的完整功能。

- `readable-code.example.ts`：简单表达允许简化，复杂分支显式展开。
- `parse-job-body.example.server.ts`：HTTP body 运行时 guard（非仅 `as` 断言）。
- `server-service.example.server.ts`：domain 层纯函数 / 编排函数。

使用示例时遵循当前任务和周围代码，不复制无关业务块。

## 变更记录

- 2026-07：从 slimvid-shopify-app 拆出 worker 仓库；移除 UI/bis/ajaxHelper 示例；新增 parse-job-body。
