# CCG-ROS2 - ROS2 多模型协作开发

<div align="center">

<img src="assets/logo/ccg-logo-cropped.png" alt="CCG Workflow" width="400">

[![GitHub stars](https://img.shields.io/github/stars/GuYu-001/ccg-ros2-workflow?style=social)](https://github.com/GuYu-001/ccg-ros2-workflow)
[![NPM Downloads](https://img.shields.io/npm/dt/ccg-ros2-workflow?style=flat-square&color=blue)](https://www.npmjs.com/package/ccg-ros2-workflow)
[![npm version](https://img.shields.io/npm/v/ccg-ros2-workflow.svg)](https://www.npmjs.com/package/ccg-ros2-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/GuYu-001/ccg-ros2-workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/GuYu-001/ccg-ros2-workflow/actions/workflows/ci.yml)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Compatible-green.svg)](https://claude.ai/code)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Ask DeepWiki](https://img.shields.io/badge/Ask-DeepWiki-blue?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTEgMTdoLTJ2LTJoMnYyem0yLjA3LTcuNzVsLS45Ljkydi4wMUM0LjE3IDEyLjE3IDE0IDEzIDE0IDEzaC0yYzAtMS4xLjktMiAyLTJzMi0uOSAyLTItLjktMi0yLTJINmMwLTIuMjEgMS43OS00IDQtNGgyYzIuMjEgMCA0IDEuNzkgNCA0IDAgLjg4LS4zNiAxLjY4LS45MyAyLjI1eiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=)](https://deepwiki.com/GuYu-001/ccg-ros2-workflow)

[简体中文](./README.zh-CN.md) | [English](./README.md)

</div>

## 只安装需要的 Skills（v3.7.0）

Skills 可以独立安装，也可以在 CCG 初始化向导里选择。每个选中的技能都有一个 `ccg-` 原生入口，脚本和参考资料保存在版本化源码缓存里。

```bash
npx ccg-ros2-workflow skills catalog
npx ccg-ros2-workflow skills install verify-quality ros2-control
npx ccg-ros2-workflow skills list --installed --json
npx ccg-ros2-workflow skills update
npx ccg-ros2-workflow skills remove ros2-control
# 装入 Codex 原生 Skills
npx ccg-ros2-workflow skills install verify-quality --target codex
# 给完整框架保存按需选择
npx ccg-ros2-workflow init --skills verify-quality,verify-security
npx ccg-ros2-workflow doctor --json
```

Claude Code 使用 `/ccg-verify-quality`，Codex 使用 `$ccg-verify-quality`。管理器只暴露选中的入口，保留完整资源依赖，遇到归属冲突会拒绝覆盖，修改过的缓存也会保留。菜单新增 **S. Skills 管理**、**V. 环境诊断**。重装沿用最新选择；`--skills all` 选择完整目录，`--skills none` 为空选择。已有全量安装可继续使用兼容模式。

`doctor --json` 输出带 schema 版本的检查报告，包括 check ID、状态、修复指引和失败/警告数量。它识别真实 Claude/Codex/Skills-only 模式，检查所选后端（包括审查路由）、Hook 注册和受管技能；失败退出码为 1。版本和文件检查验证配置状态，不调用模型，也不代表厂商 API 可用性验证。

独立 Codex 模式检查自身 CLI、配置和已安装文件；共享 Claude 路由配置为可选，缺少外部模型委派工具时给出警告和安装指引。

模型动作 Hook 跟随实际路由和具体型号，同一后端只调用一次；纯 Claude 配置使用原生 Agent。原生模式按需发现技能，兼容模式的知识片段有固定大小上限。

### Claude 规划，OpenCode / DeepSeek 实施

先在 OpenCode 用 `/connect` 配好 provider，再运行 `opencode models`（DeepSeek 可用 `opencode models deepseek`）查询实际型号。在 CCG 模型菜单选择 **OpenCode** 并填写对应的 `provider/model`。Claude Code 继续负责主控，worker 通过已有 wrapper 执行；改路由、重装和更新都会保留型号，CCG 不接管 provider 凭据。

## CCG-ROS2 是什么？

**CCG-ROS2 是基于上游 CCG 的 ROS2 开发工作流引擎。** Claude 负责主控编排，Codex 负责底层控制，Antigravity 负责上层应用；通过 Go 编译的 codeagent-wrapper 也可配置 Grok、Kimi Code、OpenCode、Claude、Gemini 等后端。

### ROS2 专项能力

默认面向实体机器人的 **ROS2 Humble**，执行时以项目实际发行版和工作空间为准。`/ccg:go` 读取 `package.xml`、colcon 包拓扑、launch、参数和接口，将 `perception`、`control`、`navigation`、`manipulation`、`hardware`、`upper-app` 映射到对应 `ros2-*` 技能。原生模式只加载已选择且可发现的技能，兼容模式读取全量资源。

七个模型后端统一采用 ROS2 分工：**backend 底层控制**负责 C++ `rclcpp`、驱动、实时控制和 `ros2_control`；**frontend 上层应用**负责 Python `rclpy`、launch、参数、RViz/Gazebo 和 Nav2/MoveIt 配置。[54 个角色提示词清单](./docs/ros2-prompt-inventory.md) 列出了全部文件及引用方。角色覆盖 package 边界、`.msg/.srv/.action`、Topic/Service/Action 与 QoS 兼容性、生命周期、executor/callback group、tf2 和硬件安全。

一条命令，描述你要做什么，引擎自动处理一切。

```bash
npx ccg-ros2-workflow    # 60 秒安装
```

## 架构

<div align="center">
<img src="assets/readme/architecture-zh.png" alt="CCG 架构" width="800">
</div>

**Claude Code** 是主控编排器。它分析你的意图、选择策略、管理整个工作流。**Hook 引擎**每轮注入状态，确保 Claude 永不丢失上下文 —— 即使上下文被压缩。**codeagent-wrapper**（编译的 Go 二进制）作为桥梁，将 Claude 连接到外部模型进行并行分析和审查。

## 工作流程

```
你: /ccg:go 添加带生命周期管理的电机控制器

入口:
  读取 git/项目上下文 + package.xml/colcon/launch/接口
  分类：功能 / L 复杂度 / control / 高风险
  创建 task.json，选择 full-collaborate

full-collaborate 七阶段:
  1. 研究与上下文分析
  2. 多模型方案构思
  3. 详细规划 → 硬停，等待你审批并选择实施模式
  4. 按批准模式实施
  5. 迭代交叉审查与修复
  6. 最终软件验收
  7. 硬件部署准备 → 记录结果、确认后归档
```

计划审批时由你选择 Agent Teams 或外部模型 Builder，引擎不会默选团队。`guided-develop` 同样为七阶段：需求增强、上下文检索、多模型分析、计划审批、实施、含迭代审查的验证、硬件部署准备；实施可选 Claude 或外部模型 Builder。其余五个改代码策略保留精简阶段，在完成前调用同一套 ROS2 验证和部署检查。

ROS2 软件质量门在硬件隔离或仿真配置下执行 `colcon build`、`colcon test`、`colcon test-result --verbose` 和相关 `launch_testing`。部署准备包含默认 dry-run/仿真的部署脚本、只读硬件依赖检查、资源具备时的 Gazebo 验证、交付与回滚说明。缺少 ROS/SDK、必需仿真资源或硬件时标记 **blocked / not run**，不得记作通过；仿真不证明真机安全。

真机激活、电机动作、CAN/串口写、主机权限和安全上限变更均须另行明确授权。部署准备完成不代表机器人已上线。非 ROS2 任务或用户明确跳过部署时记录 `deployment.status: "skipped"`，仍正常归档；跳过部署不等于跳过必需的软件验证。

每一轮，Hook 注入任务状态：

```text
  <ccg-state>
  任务: add-motor-controller (进行中)
  策略: full-collaborate
  阶段: 4-实施
  </ccg-state>
```

## 10 种内置策略

引擎根据任务类型和复杂度自动选择最佳策略：

| 策略 | 适用场景 | 外部模型 | Agent Teams |
|------|---------|:---:|:---:|
| `direct-fix` | 简单 bug，单文件 | — | — |
| `quick-implement` | 小功能，范围明确 | — | — |
| `guided-develop` | 中等功能，需要规划 | 双模型分析/审查 | — |
| `full-collaborate` | 复杂功能，跨模块 | 双模型并行 | 用户选择 |
| `debug-investigate` | 复杂 bug，原因未知 | 双模型诊断 | — |
| `refactor-safely` | 代码重构 | 双模型审查 | — |
| `deep-research` | 技术调研 | 双模型探索 | — |
| `optimize-measure` | 性能优化 | 可选 | — |
| `review-audit` | 代码审查 | 双模型交叉审查 | — |
| `git-action` | commit、rollback、分支 | — | — |

小任务采用精简流程；即使只改一行，ROS2 安全检查也适用。

## 核心能力

### Hook 引擎 — 永不丢失上下文

4 个 JavaScript Hook 为每个 Claude Code 会话注入状态：

| Hook | 触发时机 | 作用 |
|------|---------|------|
| `workflow-state.js` | 每轮用户消息 | 注入当前任务状态面包屑 |
| `session-start.js` | 会话开始/压缩 | 重新注入完整项目上下文 |
| `subagent-context.js` | Agent/Bash 调用 | 将 spec 直接注入子 agent 的 prompt |
| `skill-router.js` | 每轮用户消息 | 按关键词自动注入域知识 |

上下文在压缩后自动恢复。子 agent 出生即带 spec。零状态丢失。

### 任务系统 — 持久化生命周期

中等及以上复杂度的任务获得持久化目录：

```
.ccg/tasks/add-motor-controller/
├── task.json         # 状态、策略、阶段、门控
├── requirements.md   # 增强需求
├── plan.md           # 已审批的实施计划
├── context.jsonl     # 子 agent 注入的 spec 文件
├── review.md         # 审查结果
└── research/         # 持久化研究成果
```

### 质量关卡 — 内置安全与质量检查

| 关卡 | 触发条件 |
|------|---------|
| `/ccg:verify-security` | 新模块、安全相关变更 |
| `/ccg:verify-quality` | 变更超过 30 行 |
| `/ccg:verify-change` | 文档同步检查 |
| `/ccg:verify-module` | 模块结构检查 |
| `/ccg:gen-docs` | 自动生成 README + DESIGN |

ROS2 代码变更还须执行上述共用软件与部署质量门。Codex 工作流 Hook 根据任务意图、变更路径和暂存/未暂存差异识别电机/执行器控制、急停、实时循环、CAN/串口写及安全限位，要求独立安全审查。这些提醒不能代替硬件安全系统。

### 100+ 域知识秘典

领域知识同时覆盖通用工程与六个 ROS2 专项领域：

`安全` · `架构` · `DevOps` · `AI/MLOps` · `开发语言` · `基础设施` · `移动端` · `数据工程` · `编排` · `ROS2 上层应用` · `ROS2 感知` · `ROS2 控制` · `ROS2 导航` · `ROS2 操作` · `ROS2 硬件`

## 命令

### 核心命令（v3.0 默认安装 13 个）

| 命令 | 说明 |
|------|------|
| `/ccg:go` | **智能入口** — 描述你要做什么，引擎自动处理 |
| `/ccg:commit` | 智能 Conventional Commit |
| `/ccg:rollback` | 交互式回滚 |
| `/ccg:clean-branches` | 清理已合并分支 |
| `/ccg:worktree` | Worktree 管理 |
| `/ccg:init` | 初始化项目 CLAUDE.md |
| `/ccg:context` | 项目上下文管理 |

### OpenSpec 集成

| 命令 | 说明 |
|------|------|
| `/ccg:spec-init` | 初始化 OPSX 环境 |
| `/ccg:spec-research` | 需求 → 约束集 |
| `/ccg:spec-plan` | 零决策可执行计划 |
| `/ccg:spec-impl` | 按规范实施 + 归档 |
| `/ccg:spec-review` | 双模型交叉审查 |

### Legacy 模式（额外 18 个命令）

包括 `/ccg:workflow`、`/ccg:plan`、`/ccg:execute`、`/ccg:frontend`、`/ccg:backend`、`/ccg:analyze`、`/ccg:debug`、`/ccg:optimize`、`/ccg:test`、`/ccg:review`、`/ccg:team` 等。

## 快速开始

**方式 A：完整安装（多模型编排 + 命令 + hooks + binary，推荐）**

```bash
# 安装（交互式 4 步向导）
npx ccg-ros2-workflow

# 或非交互式使用默认配置
npx ccg-ros2-workflow init --skip-prompt
```

需要 **Node.js 20+** 和 **Claude Code CLI**。Codex CLI、Grok CLI、Kimi Code CLI 和 Antigravity 为可选（启用多模型功能）。

**方式 B：原生插件（仅技能，零依赖，v3.5.1+）**

只想要 ROS2 领域知识、通用工程参考和质量关卡，不需要多模型编排时：

```bash
claude plugin marketplace add GuYu-001/ccg-ros2-workflow
claude plugin install ccg@ccg
```

技能以 `/ccg:<skill>` 形式调用。无需 npx、无需 binary。多模型命令因含模板占位符不随插件分发，需方式 A。

## CLI 命令大全

```bash
npx ccg-ros2-workflow                          # 交互式菜单
npx ccg-ros2-workflow init                     # 4 步安装向导
npx ccg-ros2-workflow doctor                   # 环境健康检查
npx ccg-ros2-workflow doctor --json            # 机器可读的诊断报告
npx ccg-ros2-workflow skills list              # 查看目录与原生选择
npx ccg-ros2-workflow status                   # 安装概况
npx ccg-ros2-workflow codex-mode install       # 安装 Codex 主导模式
npx ccg-ros2-workflow codex-mode uninstall     # 卸载 Codex 主导模式
npx ccg-ros2-workflow uninstall                # 卸载 CCG
npx ccg-ros2-workflow config mcp               # 配置 MCP Token
npx ccg-ros2-workflow diagnose-mcp             # 诊断 MCP 问题
```

## 配置

```
~/.claude/
├── commands/ccg/          # 斜杠命令
├── hooks/ccg/             # Hook 脚本（5 个文件）
├── skills/ccg/            # 兼容模式的全量技能
├── skills/ccg-<slug>      # 已选择的原生技能入口
├── .ccg-skills/           # 原生选择清单与资源缓存
├── rules/                 # 自动触发规则
├── .ccg/
│   ├── config.toml        # 模型路由、MCP、性能配置
│   ├── engine/            # 10 个策略文件 + 模型路由器
│   └── prompts/           # 七个模型后端的 54 个角色提示词
└── bin/codeagent-wrapper  # 多模型桥接（Go 二进制）
```

### 环境变量

在 `~/.claude/settings.json` 的 `"env"` 中设置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CODEX_TIMEOUT` | `7200` | Wrapper 超时（秒） |
| `CODEAGENT_POST_MESSAGE_DELAY` | `5` | 完成后延迟（秒） |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | 未设置 | 设为 `1` 启用 Agent Teams 并行 |

## 更新 / 卸载

```bash
npx ccg-ros2-workflow@latest     # 更新到最新版
npx ccg-ros2-workflow doctor     # 更新后健康检查
npx ccg-ros2-workflow uninstall  # 彻底卸载
```

## 致谢

- [stellarlinkco/myclaude](https://github.com/stellarlinkco/myclaude) — codeagent-wrapper 灵感来源
- [UfoMiao/zcf](https://github.com/UfoMiao/zcf) — Git 工具参考
- [mindfold-ai/Trellis](https://github.com/mindfold-ai/Trellis) — Hook 状态注入模式
- [ace-tool](https://linux.do/t/topic/1344562) — MCP 代码检索

## 贡献者

<!-- readme: contributors -start -->
<table>
<tr>
    <td align="center"><a href="https://github.com/fengshao1227"><img src="https://avatars.githubusercontent.com/fengshao1227?v=4&s=100" width="100;" alt="fengshao1227"/><br /><sub><b>fengshao1227</b></sub></a></td>
    <td align="center"><a href="https://github.com/SXP-Simon"><img src="https://avatars.githubusercontent.com/SXP-Simon?v=4&s=100" width="100;" alt="SXP-Simon"/><br /><sub><b>SXP-Simon</b></sub></a></td>
    <td align="center"><a href="https://github.com/RebornQ"><img src="https://avatars.githubusercontent.com/RebornQ?v=4&s=100" width="100;" alt="RebornQ"/><br /><sub><b>RebornQ</b></sub></a></td>
    <td align="center"><a href="https://github.com/Sakuranda"><img src="https://avatars.githubusercontent.com/Sakuranda?v=4&s=100" width="100;" alt="Sakuranda"/><br /><sub><b>Sakuranda</b></sub></a></td>
    <td align="center"><a href="https://github.com/Mriris"><img src="https://avatars.githubusercontent.com/Mriris?v=4&s=100" width="100;" alt="Mriris"/><br /><sub><b>Mriris</b></sub></a></td>
    <td align="center"><a href="https://github.com/23q3"><img src="https://avatars.githubusercontent.com/23q3?v=4&s=100" width="100;" alt="23q3"/><br /><sub><b>23q3</b></sub></a></td>
    <td align="center"><a href="https://github.com/MrNine-666"><img src="https://avatars.githubusercontent.com/MrNine-666?v=4&s=100" width="100;" alt="MrNine-666"/><br /><sub><b>MrNine-666</b></sub></a></td>
</tr>
<tr>
    <td align="center"><a href="https://github.com/GGzili"><img src="https://avatars.githubusercontent.com/GGzili?v=4&s=100" width="100;" alt="GGzili"/><br /><sub><b>GGzili</b></sub></a></td>
</tr>
</table>
<!-- readme: contributors -end -->

## 联系

问题反馈请提交 [GitHub Issues](https://github.com/GuYu-001/ccg-ros2-workflow/issues)。

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=GuYu-001/ccg-ros2-workflow&type=timeline&legend=top-left)](https://www.star-history.com/#GuYu-001/ccg-ros2-workflow&type=timeline&legend=top-left)

## 许可证

MIT

---

v3.7.2-ros2.0 | [Issues](https://github.com/GuYu-001/ccg-ros2-workflow/issues) | [Contributing](./CONTRIBUTING.md)
