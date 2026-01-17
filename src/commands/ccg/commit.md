---
description: '智能 Git 提交：分析改动生成 Conventional Commit 信息，支持拆分建议'
---

# Commit - 智能 Git 提交

分析当前改动，生成 Conventional Commits 风格的提交信息。

## 使用方法

```bash
/commit [options]
```

## 选项

| 选项 | 说明 |
|------|------|
| `--no-verify` | 跳过 Git 钩子 |
| `--all` | 暂存所有改动 |
| `--amend` | 修补上次提交 |
| `--signoff` | 附加签名 |
| `--emoji` | 包含 emoji 前缀 |
| `--scope <scope>` | 指定作用域 |
| `--type <type>` | 指定提交类型 |

---

## 执行工作流

### 🔍 阶段 1：仓库校验

`[模式：检查]`

1. 验证 Git 仓库状态
2. 检测 rebase/merge 冲突
3. 读取当前分支/HEAD 状态

### 📋 阶段 2：改动检测

`[模式：分析]`

1. 获取已暂存与未暂存改动
2. 若暂存区为空：
   - `--all` → 执行 `git add -A`
   - 否则提示选择

### ✂️ 阶段 3：拆分建议

`[模式：建议]`

按以下维度聚类：
- 关注点（源代码 vs 文档/测试）
- 文件模式（不同目录/包）
- 改动类型（新增 vs 删除）

若检测到多组独立变更（>300 行 / 跨多个顶级目录），建议拆分。

### ✍️ 阶段 4：生成提交信息

`[模式：生成]`

**格式**：`[emoji] <type>(<scope>): <subject>`

- 首行 ≤ 72 字符
- 祈使语气
- 消息体：动机、实现要点、影响范围

**语言**：根据最近 50 次提交判断中文/英文

### ✅ 阶段 5：执行提交

`[模式：执行]`

```bash
git commit [-S] [--no-verify] [-s] -F .git/COMMIT_EDITMSG
```

---

## Type 与 Emoji 映射

| Emoji | Type | 说明 |
|-------|------|------|
| ✨ | `feat` | 新增功能 |
| 🐛 | `fix` | 缺陷修复 |
| 📝 | `docs` | 文档更新 |
| 🎨 | `style` | 代码格式 |
| ♻️ | `refactor` | 重构 |
| ⚡️ | `perf` | 性能优化 |
| ✅ | `test` | 测试相关 |
| 🔧 | `chore` | 构建/工具 |
| 👷 | `ci` | CI/CD |
| ⏪️ | `revert` | 回滚 |

---

## 示例

```bash
# 基本提交
/commit

# 暂存所有并提交
/commit --all

# 带 emoji 提交
/commit --emoji

# 指定类型和作用域
/commit --scope ui --type feat --emoji

# 修补上次提交
/commit --amend --signoff
```

## 关键规则

1. **仅使用 Git** – 不调用包管理器
2. **尊重钩子** – 默认执行，`--no-verify` 可跳过
3. **不改源码** – 只读写 `.git/COMMIT_EDITMSG`
4. **原子提交** – 一次提交只做一件事
