---
name: batch-execute
description: >-
  Executes tasks from a markdown checklist or plan file in bounded rounds with
  per-round verification and progress updates. Use when the user asks to batch
  run, execute in rounds, work through a task plan, @batch-execute, or process
  a milestone checklist (⬜/✅) without doing everything in one shot.
---

# Batch Execute（分轮批处理）

按计划文件 **分批、分轮** 执行工作：每轮范围可控、轮末验收、更新勾选状态，通过后自动进入下一轮。适用于任意 Markdown 任务表，不限于特定业务。

## 何时使用

- 用户提到：分轮、批量执行、按计划做、跑 checklist、@batch-execute
- 任务来源：`docs/**` 里程碑、§4 任务表、或用户给的任意勾选清单
- **不要**用于：单次小改、纯问答、或与清单无关的探索

## 用户怎么触发

解析用户消息中的参数（缺省用默认值）：

| 参数 | 默认 | 说明 |
|------|------|------|
| 任务文件 | （必填） | 含 `\| ⬜ \| ID \|` 或 `- [ ]` 的 Markdown 路径 |
| `batch_size` | `3` | 每轮最多处理几项 |
| `group` | `order` | `order` 按表顺序；`milestone` 同前缀（如 M1-*）为一组，整组不拆则本轮只做同一 milestone |
| `from` | 第一个 `⬜` | 起始 ID 或章节（如 `§4.1`、`M1`） |
| `stop_on_fail` | `true` | 验收失败则停，不进入下一轮 |
| `max_rounds` | `10` | 单次用户消息内最多连续轮数，避免上下文爆炸 |
| `verify` | 任务文件内 `verify` 列或 §8 命令块 | 轮末运行的检查 |

**示例 invocation：**

```text
@batch-execute docs/AI与人类/任务与进度/里程碑/Mock对齐协议v19.3任务计划.md §4.1 batch_size=3
```

## 任务文件格式（支持两种）

### A. Markdown 表格（本项目常用）

```markdown
| 状态 | ID | 任务 | verify |
|------|-----|------|--------|
| ⬜ | M1-1 | 实现 xxx | 单元测试 |
| ✅ | M1-2 | 已完成 | — |
```

- **待办**：`⬜`、`- [ ]`、`[ ]`
- **完成**：`✅`、`- [x]`、`[x]`
- 可选列：`ID`、`任务`、`verify`

### B. 任务文件头部 YAML（可选，覆盖默认）

```yaml
---
batch_size: 2
stop_on_fail: true
verify_commands:
  - npm run typecheck
  - npm run test -- tests/server/foo
---
```

## 单轮工作流（必须按顺序）

每轮开始前列出 checklist，轮末勾选并写 Round Report。

```
Round N:
  1. LOAD   — 读任务文件；统计 ⬜ 剩余；按 batch_size / group 选出本轮 ID 列表
  2. PLAN   — 向用户简短声明：Round N、本轮 ID、预计触及文件、轮末 verify 命令
  3. DO     — 只实现本轮项；不扩 scope、不顺手重构无关代码
  4. VERIFY — 跑本轮 verify（合并各任务 verify 列 + 文件 § 中的命令块）；失败则 FIX 一次，仍失败则 STOP
  5. SYNC   — 将本轮已完成项在任务文件中 ⬜→✅；更新「变更记录」表（若有 §9）
  6. REPORT — 输出 Round Report（模板见下）
  7. NEXT   — 若仍有 ⬜、未超 max_rounds、无 blocker → 立即开始 Round N+1（无需用户说「继续」）
```

### Round Report 模板

```markdown
## Round N 完成

**本轮 ID：** M1-1, M1-2, M1-3
**改动摘要：** （1–3 句）
**验证：** typecheck ✅ | tests ✅ | （或失败项）
**任务文件：** 已勾选 M1-1～M1-3
**剩余：** X 项 ⬜
**下一轮：** M1-4, M1-5, …（若继续）
```

### 必须停止并询问用户

- 需求歧义、协议未定义、多种合理解法
- 验收失败且一轮修复后仍失败
- 任务要求触及 harness（`docs/AI文档/`）但用户未明示固化
- 已达 `max_rounds` 仍有 ⬜ → 汇报进度，请用户发「继续 batch」或提高 `max_rounds`

## 范围与质量约束

- 遵循项目 `.cursor/rules/`（分层、测试、文档三层）
- 每轮 **聚焦** 本轮 ID；禁止「顺便」完成未列入本轮的 ⬜
- 文档更新任务（如 D-*）：若本轮含文档项，只改列出的文档
- 测试：改 Mock/契约逻辑时必须补或改 `tests/`（见任务文件 §8 若有）

## 与 /loop 的区别

| | batch-execute | /loop |
|---|---------------|-------|
| 驱动 | 任务清单逐项减少 | 时间间隔重复同一 prompt |
| 状态 | 写回任务文件勾选 | 无清单状态 |
| 适用 | 多步实现、里程碑 | 监控、轮询、定时检查 |

## 附加资源

- 本项目示例： [examples.md](examples.md)
