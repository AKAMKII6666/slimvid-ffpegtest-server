# Batch Execute — 示例

## 1. Worker 脚手架分轮（本仓库）

**任务文件：** `docs/milestones/worker-scaffold.md`（待建）

**Invocation：**

```text
@batch-execute docs/milestones/worker-scaffold.md batch_size=2 stop_on_fail=true
```

**Agent 行为：**

1. 只读表中 `⬜` 行，取前 2 项
2. 实现 HTTP / job store / 单测等
3. 轮末：`npm run typecheck` + 对应 `npm run test`
4. 勾选已完成项
5. 自动下一轮直到无 `⬜` 或达到 `max_rounds`

## 2. 通用 checklist 格式

任务表支持：

- Markdown `- [ ]` / `- [x]`
- 表格 `| ⬜ | ID | 描述 | verify |`

每行 **verify** 列应写具体命令（如 `npm run test -- tests/job/cancel.test.ts`）。

## 3. 与主 app 联调任务

跨仓库任务（主 app env + worker 部署）建议任务文件放在 **主 app** `docs/AI与人类/`，本仓库 `@batch-execute` 只覆盖 worker 侧实现项。
