# CCG-ROS2-Workflow

ROS2 多模型协作开发工具 - 基于 Claude Code CLI

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
1. 安装工作流
2. 配置 API 密钥
3. 配置 ace-tool MCP
4. 卸载工作流

## 前置依赖

需要先安装：

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Codex CLI](https://github.com/openai/codex) (可选)
- [Gemini CLI](https://github.com/google/gemini-cli) (可选)
- [ace-tool](https://augmentcode.com/) (推荐，提供代码上下文)

```bash
# Gemini CLI
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
| `/ccg:workflow` | 🚀 主工作流 - 6阶段完整开发流程（研究→构思→计划→执行→优化→评审） |
| `/ccg:plan` | 📋 多模型协作规划 - Codex + Gemini 双模型生成实施计划 |
| `/ccg:execute` | ⚡ 多模型协作执行 - 根据计划获取原型 → Claude 重构实施 |
| `/ccg:feat` | ✨ 智能功能开发 - 自动识别输入类型，规划/讨论/实施全流程 |

### 专项开发

| 命令 | 说明 |
|------|------|
| `/ccg:frontend` | 🎨 前端专项开发 - Gemini 主导（Python 节点、配置、诊断） |
| `/ccg:backend` | 🔧 后端专项开发 - Codex 主导（C++ 节点、控制、驱动） |

### 分析与优化

| 命令 | 说明 |
|------|------|
| `/ccg:analyze` | 🔍 多模型技术分析 - Codex 底层视角 + Gemini 上层视角交叉验证 |
| `/ccg:review` | 👀 多模型代码审查 - 双模型交叉验证 git diff |
| `/ccg:test` | 🧪 多模型测试生成 - Codex 后端测试 / Gemini 前端测试 |
| `/ccg:debug` | 🐛 多模型调试 - Codex 后端诊断 + Gemini 前端诊断 |
| `/ccg:optimize` | ⚡ 多模型性能优化 - Codex 后端优化 + Gemini 前端优化 |

### 辅助工具

| 命令 | 说明 |
|------|------|
| `/ccg:init` | 🏗️ 初始化项目 AI 上下文 - 生成 CLAUDE.md 索引 |
| `/ccg:enhance` | 📝 Prompt 优化 - 使用 ace-tool 增强用户提示词 |
| `/ccg:commit` | 💾 智能 Git 提交 - 分析改动生成 Conventional Commit |
| `/ccg:rollback` | ⏪ 交互式 Git 回滚 - 安全回滚到历史版本 |
| `/ccg:clean-branches` | 🧹 清理 Git 分支 - 安全清理已合并/过期分支 |
| `/ccg:worktree` | 🌲 Git Worktree 管理 - 创建工作树支持 IDE 集成 |

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

## 配置

安装后配置文件位于：

```
~/.claude/
├── .ccg/
│   ├── config.toml          # 主配置
│   └── prompts/             # 提示词
│       ├── codex/           # 底层分析/架构/审查/调试/优化/测试
│       ├── gemini/          # 上层分析/架构/审查/调试/优化/测试/前端
│       └── claude/          # 编排分析/架构/审查/调试/优化/测试
├── commands/ccg/            # 17 个命令文件
├── mcp_servers.json         # MCP 配置 (ace-tool)
└── bin/
    └── codeagent-wrapper    # 模型调用脚本
```

## MCP 配置 (ace-tool)

ace-tool 是 Augment Code 的代码上下文引擎，让 AI 自动理解项目结构。

安装时选择「配置 ace-tool MCP」会自动添加到 `~/.claude/mcp_servers.json`：

```json
{
  "ace-tool": {
    "command": "ace-tool",
    "args": ["mcp"],
    "env": {}
  }
}
```

使用前需要：
1. 安装 ace-tool CLI（访问 https://augmentcode.com/）
2. 运行 `ace-tool login` 登录
3. 重启 Claude Code

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
