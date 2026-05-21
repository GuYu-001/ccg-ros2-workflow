# CCG-ROS2 - Claude + Codex + Antigravity ROS2 多模型协作系统

<div align="center">

<img src="assets/logo/ccg-logo-cropped.png" alt="CCG-ROS2 Workflow" width="400">

[![npm version](https://img.shields.io/npm/v/ccg-ros2-workflow.svg)](https://www.npmjs.com/package/ccg-ros2-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Compatible-green.svg)](https://claude.ai/code)
[![ROS2](https://img.shields.io/badge/ROS2-Humble-blue.svg)](https://docs.ros.org/en/humble/)

简体中文 | [English](./README.md)

</div>

---

CCG-ROS2 是 Claude Code 的工作流引擎,编排多个 AI 模型(Codex 负责底层控制、Antigravity 负责上层应用、Claude 负责编排),具备基于 Hook 的状态追踪、自动策略选择和 Agent Teams 并行执行能力 — 专为 ROS2 机器人开发定制。

> **Fork 自** [fengshao1227/ccg-workflow](https://github.com/fengshao1227/ccg-workflow) v3.1.0,为 ROS2 Humble 机器人开发定制。

## v3.0.0 新特性(ROS2 版)

v3.0.0 将强大的 v3.1.0 引擎带入 ROS2 开发,并增加领域特定增强:

- **ROS2 感知路由** — 上层应用任务(Launch 文件、Python 节点、RViz、仿真)路由至 Antigravity。底层控制任务(C++ 节点、硬件驱动、实时控制)路由至 Codex。
- **7 阶段工作流** — 从 6 阶段扩展,新增专门的硬件部署阶段(部署脚本、硬件依赖检查、Gazebo 仿真验证)。
- **ROS2 系统集成设计师** — 用 `system-integrator` agent 替换 UI/UX 设计师,专注于 ROS2 节点架构、Topic/Service 设计和 QoS 配置。
- **ROS2 领域技能** — 感知(激光雷达/相机/点云)、控制(PID/轨迹/电机驱动)、导航(Nav2/SLAM/路径规划)、操作(MoveIt/抓取规划)、硬件集成(CAN/串口/传感器驱动)。
- **ROS2 版 Codex Mode** — Codex 主导编排,注入 ROS2 上下文(节点边界、消息选型、QoS 决策)。
- **所有 v3.1.0 特性** — Hook 引擎、任务持久化、Agent Teams、质量关卡、领域知识 Hook、Codex 主导模式。

## 快速开始

```bash
npx ccg-ros2-workflow
```

**要求**: Node.js 20+、Claude Code CLI  
**可选**: Codex CLI(底层控制)、Antigravity CLI(上层应用)

安装器引导 4 个步骤:API 配置、模型路由、MCP 工具、性能模式。

## 工作原理(ROS2 示例)

```
你: /ccg:go 为差速驱动机器人实现自主导航

CCG-ROS2 引擎:
  1. 读取 ROS2 项目上下文(package.xml、colcon 工作空间、launch 文件)
  2. 分类: 功能 / XL 复杂度 / 混合(上层+底层) / 高风险
  3. 选择策略: full-collaborate
  4. 创建 .ccg/tasks/autonomous-navigation/task.json
  5. 启动双模型分析:
     - Codex: 电机驱动、里程计、底层控制
     - Antigravity: Nav2 配置、launch 文件、RViz 设置
  6. 生成计划(节点架构 + QoS 设计) → HARD STOP 等待批准
  7. 生成 Agent Teams Builders 并行实施
  8. 运行质量关卡(验证 ROS2 消息定义、QoS 策略、生命周期)
  9. 硬件部署阶段: 生成部署脚本、检查 CAN/串口、Gazebo 仿真
  10. 报告结果

每轮注入:
  <ccg-state>
  任务: autonomous-navigation (进行中)
  策略: full-collaborate
  阶段: 4-实施
  ROS2 上下文: colcon 工作空间、3 个包、Nav2 栈
  下一步: Layer 1 Builders 执行中(motor_driver_node + nav2_config)
  </ccg-state>
```

## ROS2 模型路由

| 模型 | 职责 | 适用场景 |
|------|------|----------|
| **Codex** | 底层控制权威 | C++ 节点、硬件驱动、实时控制算法、消息定义 |
| **Antigravity** | 上层应用权威 | Launch 文件、Python 节点、RViz 配置、仿真设置 |
| **Claude** | 编排 + 交付 | 计划审批、代码写入、质量把关 |

## 策略(ROS2 感知)

引擎根据任务类型和复杂度选择策略,注入 ROS2 特定上下文:

| 策略 | 适用场景 | 外部模型 | Teams | ROS2 上下文 |
|------|----------|----------|-------|-------------|
| direct-fix | 简单 bug,单文件 | 否 | 否 | 节点崩溃、话题不匹配 |
| quick-implement | 小功能,范围清晰 | 否 | 否 | 添加参数、简单服务 |
| guided-develop | 中等功能,需要规划 | 单模型 | 否 | 新节点、消息定义 |
| full-collaborate | 复杂功能,多模块 | 双模型并行 | 是 | 导航栈、感知管线 |
| debug-investigate | 复杂 bug,原因未知 | 双模型诊断 | 否 | QoS 不匹配、生命周期问题 |
| refactor-safely | 代码重构 | 双模型审查 | 否 | 节点拆分、消息重构 |
| deep-research | 技术研究、对比 | 双模型探索 | 否 | SLAM 算法、控制策略 |
| optimize-measure | 性能优化 | 可选 | 否 | CPU/内存、QoS 调优 |
| review-audit | 代码审查 | 双模型交叉审查 | 否 | QoS 策略、生命周期、安全 |
| git-action | commit、rollback、分支 | 否 | 否 | 标准 git 操作 |

简单任务快速运行无开销。复杂 ROS2 任务获得完整引擎和硬件部署阶段。

## 命令

### 智能入口

| 命令 | 说明 |
|------|------|
| `/ccg:go` | 用自然语言描述需求。引擎分析意图、选择策略并执行。 |

### ROS2 开发工作流(传统命令)

| 命令 | 说明 |
|------|------|
| `/ccg:workflow` | 7 阶段完整工作流(含硬件部署) |
| `/ccg:plan` | 多模型协作规划(Phase 1-2) |
| `/ccg:execute` | 多模型协作执行(Phase 3-5) |
| `/ccg:frontend` | 上层应用专项(Antigravity 主导:Launch/Python/RViz) |
| `/ccg:backend` | 底层控制专项(Codex 主导:C++/驱动/实时) |
| `/ccg:feat` | 智能功能开发 |
| `/ccg:analyze` | 双模型技术分析 |
| `/ccg:debug` | 多模型问题诊断 |
| `/ccg:optimize` | 多模型性能优化 |
| `/ccg:test` | 智能测试生成 |
| `/ccg:review` | 双模型代码审查 |
| `/ccg:enhance` | Prompt 增强 |
| `/ccg:init` | 初始化 CLAUDE.md |

### OpenSpec 规范驱动

| 命令 | 说明 |
|------|------|
| `/ccg:spec-init` | 初始化 OPSX 环境 |
| `/ccg:spec-research` | 需求 → 约束集 |
| `/ccg:spec-plan` | 约束 → 零决策计划 |
| `/ccg:spec-impl` | 按规范执行 + 归档 |
| `/ccg:spec-review` | 双模型交叉审查 |

### Agent Teams 并行实施

| 命令 | 说明 |
|------|------|
| `/ccg:team` | **统一工作流(推荐)** — 8 阶段全流程,7 角色自动编排 |
| `/ccg:team-research` | 并行约束集研究(Codex 底层 + Antigravity 上层) |
| `/ccg:team-plan` | 零决策并行实施计划 |
| `/ccg:team-exec` | spawn Builder teammates 并行写代码 |
| `/ccg:team-review` | 双模型交叉审查实施产出 |

### Git 工具

| 命令 | 说明 |
|------|------|
| `/ccg:commit` | 智能 Git 提交(conventional commit) |
| `/ccg:rollback` | 交互式 Git 回滚 |
| `/ccg:clean-branches` | 清理已合并分支 |
| `/ccg:worktree` | Worktree 管理 |

### 项目管理

| 命令 | 说明 |
|------|------|
| `/ccg:context` | 项目上下文管理(.context 初始化/日志/压缩/历史) |
| `/ccg:codex-exec` | Codex 全权执行计划(MCP + 代码 + 测试) |

## 7 阶段 ROS2 工作流

```
研究 → 构思 → 计划 → 执行 → 优化 → 评审 → 硬件部署
```

- **阶段 1-2(研究/构思)**: Codex + Antigravity 并行分析,双视角评估
- **阶段 3(计划)**: Claude 综合方案,用户批准后存档
- **阶段 4(执行)**: Claude 主导代码实现
- **阶段 5(优化)**: Codex + Antigravity 并行审查,Claude 整合修复
- **阶段 6(评审)**: 最终质量把关
- **阶段 7(硬件部署)**: 生成部署脚本、检查硬件依赖(串口/CAN/传感器)、Gazebo 仿真验证

## 架构

```
Claude(编排 + 最终写代码)
  ├── Codex      → 只读,返回 patch(底层:C++/驱动/实时)
  └── Antigravity → 只读,返回 patch(上层:Launch/Python/RViz)
```

外部模型对文件系统零写入权限,所有代码由 Claude 审核后落盘。

## 子智能体

| 智能体 | 用途 |
|--------|------|
| `system-integrator` | ROS2 系统集成设计师(节点架构/Topic-Service/QoS 设计) |
| `planner` | ROS2 任务规划师(WBS 分解) |
| `init-architect` | 项目初始化架构师 |
| `get-current-datetime` | 获取当前时间 |
| `team-architect` | 团队架构师(v3.0+) |
| `team-qa` | QA 工程师(v3.0+) |
| `team-reviewer` | 代码审查员(v3.0+) |

## 输出风格

安装后可通过 output-styles 目录选择 AI 输出风格:

- `engineer-professional` - SOLID/KISS/DRY 专业工程师风格
- `nekomata-engineer` - 猫娘工程师(幽浮喵)
- `laowang-engineer` - 老王工程师
- `abyss-cultivator` - 深渊修炼者
- `ojousama-engineer` - 大小姐风格
- `abyss-concise` - 深渊简报
- `abyss-command` - 深渊铁律
- `abyss-ritual` - 深渊祭仪

## 固定配置

| 项目 | 值 |
|------|----|
| ROS2 版本 | Humble Hawksbill(LTS) |
| 目标平台 | 物理机器人 |
| 上层应用模型 | Antigravity(默认) / Gemini(备选) |
| 底层控制模型 | Codex |
| 工作流阶段 | 7 阶段(含硬件部署) |

## Codex 主导模式(可选)

通过菜单选项 `X. Codex Mode` 安装。Codex CLI 作为主编排器,注入 ROS2 上下文:

- `~/.codex/AGENTS.md` — 自适应决策框架,注入 ROS2 上下文(节点边界、消息选型、QoS 决策)
- `~/.codex/hooks/ccg-workflow.py` — 智能守护 Hook,注入 ROS2 检查点(package.xml、CMakeLists.txt、launch 文件、colcon build)
- `~/.codex/config.toml` — 启用 Multi-agent v2
- `~/.codex/agents/` — 原生子 agent 定义,注入 ROS2 上下文

## MCP 工具集成

可选 MCP 工具增强功能:

- **fast-context**(推荐) — Windsurf Fast Context 代码检索
- **ace-tool** — 代码搜索 + prompt 增强
- **ContextWeaver** — 本地优先语义代码搜索
- **context7**(自动安装) — 免费库文档查询

## 相关链接

- [npm 包](https://www.npmjs.com/package/ccg-ros2-workflow)
- [GitHub 仓库](https://github.com/GuYu-001/ccg-ros2-workflow)
- [官方 ccg-workflow](https://github.com/fengshao1227/ccg-workflow)
- [ROS2 Humble 文档](https://docs.ros.org/en/humble/)

## 贡献

欢迎贡献!请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解指南。

## 许可证

MIT License - 详见 [LICENSE](./LICENSE)

---

**版本**: 3.0.0  
**最后更新**: 2026-05-20
