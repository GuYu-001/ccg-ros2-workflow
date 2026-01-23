# CCG-ROS2-Workflow

[![npm version](https://badge.fury.io/js/ccg-ros2-workflow.svg)](https://www.npmjs.com/package/ccg-ros2-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

ROS2 多模型协作开发工具 - 基于 Claude Code CLI

> **v1.3.0** - 参考 ccg-workflow 官方实现，全新交互式安装体验

## 特性

- **多模型协作**: Codex (底层控制) + Gemini (上层集成) + Claude (编排)
- **ROS2 Humble**: 专为物理机器人开发优化
- **简洁原则**: 信任模型能力，上下文由 MCP 检索
- **ace-tool MCP**: 自动理解项目结构和代码上下文
- **跨平台**: macOS / Ubuntu 支持

## 安装

```bash
npx ccg-ros2-workflow
```

或全局安装：

```bash
npm install -g ccg-ros2-workflow
ccg-ros2-workflow
```

安装程序提供以下选项：
1. 安装/重装工作流
2. 更新工作流
3. 配置 ace-tool MCP
4. 配置 API 密钥
5. 帮助
6. 卸载工作流
7. 退出

## 前置依赖

**必须安装**：

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) - 核心运行环境

```bash
# Claude Code CLI (必须)
npm install -g @anthropic-ai/claude-code
```

**可选安装**（启用多模型协作）：

- [Codex CLI](https://github.com/openai/codex) - 底层控制专家
- [Gemini CLI](https://github.com/google/gemini-cli) - 上层集成专家
- [ace-tool](https://augmentcode.com/) - 代码上下文引擎（推荐）

```bash
# Codex CLI (可选)
npm install -g @openai/codex

# Gemini CLI (可选)
npm install -g @google/gemini-cli
```

## 使用方法

在 Claude Code 中：

```bash
# 完整工作流
/ccg:workflow 为移动机器人添加速度限制器

# 智能功能开发
/ccg:feat 实现 PID 控制器

# 分析任务
/ccg:analyze 分析控制器实现

# 代码审查
/ccg:review

# 查看所有命令
/ccg:<Tab>
```

## 命令列表

### 核心工作流

| 命令 | 说明 |
|------|------|
| `/ccg:workflow` | 🚀 ROS2 多模型协作开发 (研究→构思→计划→执行→优化→评审)，智能路由 Codex/Gemini |
| `/ccg:plan` | 📋 多模型协作规划 - 上下文检索 + 双模型分析 → 生成 Step-by-step 实施计划 |
| `/ccg:execute` | ⚡ 多模型协作执行 - 根据计划获取原型 → Claude 重构实施 → 多模型审计交付 |
| `/ccg:feat` | ✨ 智能功能开发 - 自动识别输入类型，规划/讨论/实施全流程 |

### 专项开发

| 命令 | 说明 |
|------|------|
| `/ccg:frontend` | 🎨 上层应用专项工作流 - Gemini 主导集成、可视化、Launch、Python节点 |
| `/ccg:backend` | 🔧 底层控制专项工作流 - Codex 主导控制算法、C++节点、驱动 |

### 分析与优化

| 命令 | 说明 |
|------|------|
| `/ccg:analyze` | 🔍 多模型技术分析 - Codex 底层控制分析 + Gemini 上层集成分析，交叉验证后综合见解 |
| `/ccg:review` | 👀 多模型代码审查 - 无参数时自动审查 git diff，双模型交叉验证 |
| `/ccg:test` | 🧪 多模型测试生成 - 智能路由 Codex 底层单元测试 / Gemini 上层集成测试 |
| `/ccg:debug` | 🐛 多模型调试 - Codex 底层控制诊断 + Gemini 上层应用诊断，交叉验证定位问题 |
| `/ccg:optimize` | ⚡ 多模型性能优化 - Codex 底层实时性优化 + Gemini 上层集成优化 |

### 辅助工具

| 命令 | 说明 |
|------|------|
| `/ccg:init` | 🏗️ 初始化项目 AI 上下文 - 生成根级与模块级 CLAUDE.md 索引 |
| `/ccg:enhance` | 📝 Prompt 优化 - 使用 ace-tool enhance_prompt 优化提示词，展示原始与增强版本供确认 |
| `/ccg:commit` | 💾 智能 Git 提交 - 分析改动生成 Conventional Commit 信息，支持拆分建议 |
| `/ccg:rollback` | ⏪ 交互式 Git 回滚 - 安全回滚分支到历史版本，支持 reset/revert 模式 |
| `/ccg:clean-branches` | 🧹 清理 Git 分支 - 安全清理已合并或过期分支，默认 dry-run 模式 |
| `/ccg:worktree` | 🌲 Git Worktree 管理 - 在 ../.ccg/项目名/ 目录创建，支持 IDE 集成和内容迁移 |

## 架构

```
┌─────────────────────────────────────────┐
│              Claude (编排)               │
│         执行代码修改、协调工作流          │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌───────────────┐
│  Codex (底层)  │   │ Gemini (上层) │
│  控制、C++     │   │ 集成、Python  │
│  硬件、实时    │   │ 配置、诊断    │
└───────────────┘   └───────────────┘
```

### 模型分工

| 模型 | 职责 | 关键词 |
|------|------|--------|
| **Codex** | 底层系统 | 控制算法、运动学/动力学、实时性能、硬件驱动、C++ 节点、安全系统 |
| **Gemini** | 上层集成 | Launch 文件、YAML 配置、Python 节点、系统诊断、参数管理 |
| **Claude** | 编排执行 | 综合两个模型输出、执行代码修改、协调工作流 |

### 智能路由

系统根据任务类型自动分配到合适的模型：

| 任务类型 | 路由目标 |
|----------|----------|
| 控制算法、C++、硬件驱动、实时性 | → Codex |
| Launch、YAML、Python、诊断、集成 | → Gemini |
| 代码审查、测试 | → 双模型并行 |

## 配置

安装后配置文件位于：

```
~/.claude/
├── .ccg/
│   ├── config.toml          # 主配置
│   └── prompts/             # 提示词 (19个)
│       ├── codex/           # analyzer, architect, reviewer, debugger, optimizer, tester
│       ├── gemini/          # analyzer, architect, reviewer, debugger, optimizer, tester, frontend
│       └── claude/          # analyzer, architect, reviewer, debugger, optimizer, tester
├── commands/ccg/            # 17 个命令文件
├── agents/ccg/              # 3 个 agent 文件
│   ├── system-integrator.md # ROS2 系统集成设计
│   ├── planner.md           # WBS 任务规划
│   └── get-current-datetime.md
├── mcp_servers.json         # MCP 配置 (ace-tool)
└── bin/
    └── codeagent-wrapper    # 模型调用脚本
```

## MCP 配置 (ace-tool)

ace-tool 是 Augment Code 的代码上下文引擎，让 AI 自动理解项目结构。

### 安装方式

运行安装程序，选择「配置 ace-tool MCP」：

```bash
npx ccg-ros2-workflow
# 选择 3. 配置 ace-tool MCP
# 选择版本：ace-tool (Node.js) 或 ace-tool-rs (Rust，推荐)
# 输入 Token（从 augmentcode.com 或中转服务获取）
```

### 配置示例

```json
{
  "ace-tool": {
    "command": "npx",
    "args": ["ace-tool-rs", "mcp", "--token", "your-token"],
    "env": { "RUST_LOG": "info" }
  }
}
```

### Token 获取

- **官方服务**: https://augmentcode.com/ 注册获取
- **中转服务**: 使用第三方中转（需要配置 Base URL）

配置完成后重启 Claude Code 即可使用。

## 语言配置

| 场景 | 语言 |
|------|------|
| 提示词 | English |
| 交互 | 中文 |
| 代码注释 | 中文 |

## ROS2 配置

| 项目 | 值 |
|------|-----|
| 发行版 | Humble |
| 目标 | 物理机器人 |
| 路由模式 | 智能路由 |

## 卸载

```bash
npx ccg-ros2-workflow
# 选择 "卸载工作流"
```

## License

MIT

## 更新日志

### v1.3.0
- 参考 ccg-workflow 官方实现重写 CLI
- 全新交互式安装流程，支持 MCP 工具选择
- 配置摘要显示（模型路由、命令数量、MCP 工具、目标平台）
- 安装成功后显示已安装命令列表（逐个显示 ✓）
- 显示已安装提示词（按模型分组）
- 显示已安装二进制文件和 PATH 配置
- 改进卸载流程，检测全局安装并提供完整卸载指引
- 添加 ora 加载动画 spinner

### v1.2.0
- 全新交互式菜单 (inquirer + chalk)
- 添加更新检查功能，支持 npm 版本对比
- 新增 agents 目录，包含 3 个 agent 文件
- 改进卸载流程，显示详细文件统计
- 新增帮助命令，展示所有可用 /ccg: 命令
- 优化安装流程，显示安装摘要

### v1.1.0
- 支持直接安装 ace-tool，无需手动安装 CLI
- 支持 ace-tool (Node.js) 和 ace-tool-rs (Rust) 两种版本
- 支持配置 Token 和 Base URL（中转服务）
- 使用 npx 自动下载运行，首次使用自动安装

### v1.0.9
- 提示词文件统一使用英文
- 保留 "Code comments in Chinese" 指令
- 语言规范：提示词(英文) / 交互(中文) / 注释(中文)

### v1.0.8
- 基于 Codex+Gemini 双模型交叉验证分析优化
- `gemini/architect.md`: 增加 QoS 策略设计 + Node Composition
- `codex/architect.md`: 增加 RT Checklist (executor/ros2_control/E-stop)
- `workflow.md`: 新增 Stage 7 硬件验证 gate
- 术语规范化：`ui-ux-designer` → `system-integrator`

### v1.0.7
- 完成所有 17 个命令文件的 ROS2 术语适配
- 术语映射：前端/后端 → 上层应用/底层控制
- 任务路由：Launch/Python → Gemini，C++/控制 → Codex

### v1.0.6
- 更新 README 文档，添加完整命令列表
- 修复 "仿真" → "集成" 术语

### v1.0.5
- 初始 ROS2 Humble 物理机器人版本
