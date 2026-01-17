# CCG-ROS2-Workflow

ROS2 多模型协作开发工具 - 基于 Claude Code CLI

## 特性

- **多模型协作**: Codex (底层控制) + Gemini (上层集成) + Claude (编排)
- **ROS2 Humble**: 专为物理机器人开发优化
- **简洁原则**: 信任模型能力，上下文由 MCP 检索
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

## 前置依赖

需要先安装：

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Codex CLI](https://github.com/openai/codex) (可选)
- [Gemini CLI](https://github.com/google/gemini-cli) (可选)

```bash
# Gemini CLI
npm install -g @google/gemini-cli
```

## 使用方法

在 Claude Code 中：

```bash
# 完整工作流
/ccg:workflow 为移动机器人添加速度限制器

# 分析任务
/ccg:analyze 分析控制器实现

# 代码审查
/ccg:review

# 查看所有命令
/ccg:<Tab>
```

## 命令列表

| 命令 | 说明 |
|------|------|
| `/ccg:workflow` | 6 阶段完整工作流 |
| `/ccg:analyze` | 双模型并行分析 |
| `/ccg:plan` | 多模型协作规划 |
| `/ccg:execute` | 执行实施 |
| `/ccg:review` | 双模型代码审查 |
| `/ccg:debug` | 多模型调试 |
| `/ccg:optimize` | 性能优化 |
| `/ccg:test` | 测试生成 |
| `/ccg:commit` | 智能 Git 提交 |

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

## 配置

安装后配置文件位于：

```
~/.claude/
├── .ccg/
│   ├── config.toml          # 主配置
│   └── prompts/             # 提示词
│       ├── codex/
│       ├── gemini/
│       └── claude/
├── commands/ccg/            # 命令文件
└── bin/
    └── codeagent-wrapper    # 模型调用脚本
```

## 语言配置

| 场景 | 语言 |
|------|------|
| 提示词 | English |
| 交互 | 中文 |
| 代码注释 | 中文 |

## 卸载

```bash
npx ccg-ros2-workflow
# 选择 "卸载工作流"
```

## License

MIT
