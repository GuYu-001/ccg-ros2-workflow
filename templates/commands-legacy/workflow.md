---
description: 'ROS2 多模型协作开发工作流（研究→构思→计划→执行→优化→评审→硬件部署），智能路由上层应用→{{FRONTEND_PRIMARY}}、底层控制→{{BACKEND_PRIMARY}}'
---

# Workflow - ROS2 多模型协作开发

使用质量把关、MCP 服务和多模型协作执行 ROS2 结构化开发工作流。

## 使用方法

```bash
/workflow <ROS2任务描述>
```

## 上下文

- 要开发的任务：$ARGUMENTS
- 带质量把关的结构化 7 阶段工作流（含硬件部署）
- 多模型协作：{{BACKEND_PRIMARY}}（底层控制）+ {{FRONTEND_PRIMARY}}（上层应用）+ Claude（编排）
- MCP 服务集成（ace-tool）以增强功能
- 目标平台：ROS2 Humble / 物理机器人

## 你的角色

你是**ROS2 编排者**，协调多模型协作系统（研究 → 构思 → 计划 → 执行 → 优化 → 评审 → 硬件部署），用中文协助用户，面向专业机器人开发者，交互应简洁专业，避免不必要解释。

**协作模型**：
- **ace-tool MCP** – 代码检索 + Prompt 增强
- **{{BACKEND_PRIMARY}}** – 底层控制：C++、硬件驱动、实时算法、控制器（**底层权威，可信赖**）
- **{{FRONTEND_PRIMARY}}** – 上层应用：Launch、Python、RViz、仿真配置（**上层高手，底层意见仅供参考**）
- **Claude (自己)** – 编排、计划、执行、交付

---

## 多模型调用规范

**工作目录**：
- `{{WORKDIR}}`：**必须通过 Bash 执行 `pwd`（Unix）或 `cd`（Windows CMD）获取当前工作目录的绝对路径**，禁止从 `$HOME` 或环境变量推断
- 如果用户通过 `/add-dir` 添加了多个工作区，先用 Glob/Grep 确定任务相关的工作区
- 如果无法确定，用 `AskUserQuestion` 询问用户选择目标工作区

**调用语法**（并行用 `run_in_background: true`，串行用 `false`）：

```
# 新会话调用
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--progress --backend <{{BACKEND_PRIMARY}}|{{FRONTEND_PRIMARY}}> {{GEMINI_MODEL_FLAG}}- \"{{WORKDIR}}\" <<'EOF'
ROLE_FILE: <角色提示词路径>
<TASK>
需求：<增强后的需求（如未增强则用 $ARGUMENTS）>
上下文：<前序阶段收集的项目上下文、分析结果等>
ROS2上下文：<colcon工作空间、package.xml、launch文件、节点架构等>
</TASK>
OUTPUT: 期望输出格式
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "简短描述"
})

# 复用会话调用
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--progress --backend <{{BACKEND_PRIMARY}}|{{FRONTEND_PRIMARY}}> {{GEMINI_MODEL_FLAG}}resume <SESSION_ID> - \"{{WORKDIR}}\" <<'EOF'
ROLE_FILE: <角色提示词路径>
<TASK>
需求：<增强后的需求（如未增强则用 $ARGUMENTS）>
上下文：<前序阶段收集的项目上下文、分析结果等>
ROS2上下文：<colcon工作空间、package.xml、launch文件、节点架构等>
</TASK>
OUTPUT: 期望输出格式
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "简短描述"
})
```

**角色提示词**：

| 阶段 | 底层控制 | 上层应用 |
|------|----------|----------|
| 分析 | `~/.claude/.ccg/prompts/{{BACKEND_PRIMARY}}/analyzer.md` | `~/.claude/.ccg/prompts/{{FRONTEND_PRIMARY}}/analyzer.md` |
| 规划 | `~/.claude/.ccg/prompts/{{BACKEND_PRIMARY}}/architect.md` | `~/.claude/.ccg/prompts/{{FRONTEND_PRIMARY}}/architect.md` |
| 审查 | `~/.claude/.ccg/prompts/{{BACKEND_PRIMARY}}/reviewer.md` | `~/.claude/.ccg/prompts/{{FRONTEND_PRIMARY}}/reviewer.md` |

**会话复用**：每次调用返回 `SESSION_ID: xxx`，后续阶段用 `resume xxx` 复用上下文（注意：是 `resume`，不是 `--resume`）。

**并行调用**：使用 `run_in_background: true` 启动，用 `TaskOutput` 等待结果。**必须等所有模型返回后才能进入下一阶段**。

**等待后台任务**（使用最大超时 600000ms = 10 分钟）：

```
TaskOutput({ task_id: "<task_id>", block: true, timeout: 600000 })
```

**重要**：
- 必须指定 `timeout: 600000`，否则默认只有 30 秒会导致提前超时。
如果 10 分钟后仍未完成，继续用 `TaskOutput` 轮询，**绝对不要 Kill 进程**。
- 若因等待时间过长跳过了等待 TaskOutput 结果，则**必须调用 `AskUserQuestion` 工具询问用户选择继续等待还是 Kill Task。禁止直接 Kill Task。**
- ⛔ **上层应用模型失败必须重试**：若上层应用模型调用失败（非零退出码或输出包含错误信息），最多重试 2 次（间隔 5 秒）。仅当 3 次全部失败时才跳过上层应用模型结果并使用单模型结果继续。
- ⛔ **底层控制模型结果必须等待**：底层控制模型执行时间较长（5-15 分钟）属于正常。TaskOutput 超时后必须继续用 TaskOutput 轮询，**绝对禁止在底层控制模型未返回结果时直接跳过或继续下一阶段**。已启动的底层控制任务若被跳过 = 浪费 token + 丢失结果。

---

## 沟通守则

1. 响应以模式标签 `[模式：X]` 开始，初始为 `[模式：研究]`。
2. 核心工作流严格按 `研究 → 构思 → 计划 → 执行 → 优化 → 评审 → 硬件部署` 顺序流转。
3. 每个阶段完成后必须请求用户确认。
4. 评分低于 7 分或用户未批准时强制停止。
5. 在需要询问用户时，尽量使用 `AskUserQuestion` 工具进行交互，举例场景：请求用户确认/选择/批准

---

## 执行工作流

**任务描述**：$ARGUMENTS

### 🔍 阶段 1：研究与分析

`[模式：研究]` - 理解需求并收集 ROS2 上下文：

1. **ROS2 环境检测**：
   - 检查 colcon 工作空间结构（`src/`、`build/`、`install/`）
   - 扫描 `package.xml` 文件，识别现有 ROS2 包
   - 检查 launch 文件和配置文件
2. **Prompt 准备**：直接将 $ARGUMENTS 作为后续多模型调用的输入。
3. **上下文检索**：调用 `{{MCP_SEARCH_TOOL}}`，重点检索 ROS2 相关代码（节点、消息、服务、launch）
4. **需求完整性评分**（0-10 分）：
   - 目标明确性（0-3）、预期结果（0-3）、边界范围（0-2）、约束条件（0-2）
   - ≥7 分：继续 | <7 分：⛔ 停止，提出补充问题

### 💡 阶段 2：方案构思

`[模式：构思]` - 多模型并行分析：

**并行调用**（`run_in_background: true`）：
- **底层控制模型**：使用分析提示词，输出底层控制可行性（C++ 节点/硬件驱动/实时性/消息定义）、方案、风险
- **上层应用模型**：使用分析提示词，输出上层应用可行性（Launch 文件/Python 节点/RViz 配置/仿真）、方案、集成

用 `TaskOutput` 等待结果。**📌 保存 SESSION_ID**（`BACKEND_SESSION` 和 `FRONTEND_SESSION`）。

**务必遵循上方 `多模型调用规范` 的 `重要` 指示**

综合两方分析，输出方案对比（至少 2 个方案），包含：
- 节点架构设计（节点数量、职责划分）
- Topic/Service/Action 选型
- QoS 策略建议
- 硬件依赖（CAN/串口/传感器）

等待用户选择方案。

### 📋 阶段 3：详细规划

`[模式：计划]` - 多模型协作规划：

**并行调用**（复用会话 `resume <SESSION_ID>`）：
- **底层控制模型**：使用规划提示词 + `resume $BACKEND_SESSION`，输出底层控制架构（C++ 节点实现/控制算法/消息定义/CMakeLists.txt）
- **上层应用模型**：使用规划提示词 + `resume $FRONTEND_SESSION`，输出上层应用架构（Launch 文件/参数配置/RViz 配置/Python 节点）

用 `TaskOutput` 等待结果。

综合两方规划，输出完整实施计划：
- **节点清单**：每个节点的职责、订阅/发布的 Topic、提供的 Service
- **消息定义**：自定义消息的 .msg 文件内容
- **QoS 配置**：每个 Topic 的 QoS 策略（Reliability/Durability/History）
- **Launch 配置**：启动顺序、参数传递、命名空间
- **文件清单**：需要创建/修改的文件列表

**⛔ HARD STOP**：展示计划，等待用户批准。未批准禁止进入执行阶段。

### ⚙️ 阶段 4：代码执行

`[模式：执行]` - Claude 主导实施：

根据批准的计划，按以下顺序实施：

1. **消息定义**（如需）：
   - 创建 `msg/` 目录和 .msg 文件
   - 更新 `CMakeLists.txt` 和 `package.xml`
2. **C++ 节点**（底层控制）：
   - 创建节点源文件（`src/`）
   - 实现订阅/发布/服务
   - 配置 CMakeLists.txt
3. **Python 节点**（上层应用）：
   - 创建 Python 节点（`scripts/` 或 `<package>/`）
   - 实现 rclpy 逻辑
   - 配置 setup.py
4. **Launch 文件**：
   - 创建 launch 文件（`launch/`）
   - 配置节点启动、参数、重映射
5. **配置文件**：
   - 创建参数 YAML（`config/`）
   - RViz 配置（`rviz/`）

每完成一个模块，运行 `colcon build` 验证编译。

### 🔧 阶段 5：优化审查

`[模式：优化]` - 多模型并行审查：

**并行调用**（复用会话 `resume <SESSION_ID>`）：
- **底层控制模型**：使用审查提示词 + `resume $BACKEND_SESSION`，审查 C++ 代码、消息定义、实时性、线程安全
- **上层应用模型**：使用审查提示词 + `resume $FRONTEND_SESSION`，审查 Launch 文件、参数配置、Python 代码、RViz 配置

用 `TaskOutput` 等待结果。

综合两方审查意见，Claude 整合修复：
- **Critical 问题**：必须修复（QoS 不匹配、生命周期错误、线程不安全）
- **Warning 问题**：建议修复（命名不规范、参数缺失、日志不足）
- **Info 建议**：可选优化（性能优化、代码风格）

### ✅ 阶段 6：最终评审

`[模式：评审]` - 质量把关：

1. **编译测试**：
   ```bash
   colcon build --packages-select <package_name>
   colcon test --packages-select <package_name>
   ```
2. **静态检查**：
   - C++: `cpplint` / `cppcheck`
   - Python: `flake8` / `pylint`
3. **ROS2 规范检查**：
   - package.xml 完整性
   - CMakeLists.txt 正确性
   - Launch 文件语法
4. **文档完整性**：
   - README.md 包含使用说明
   - 代码注释充分
   - Launch 文件有说明

输出评审报告，等待用户确认。

### 🚀 阶段 7：硬件部署

`[模式：硬件部署]` - 生成部署方案：

1. **硬件依赖检查**：
   - 串口设备（`/dev/ttyUSB*`、`/dev/ttyACM*`）
   - CAN 总线（`can0`、`can1`）
   - 传感器设备（相机、激光雷达）
   - 权限配置（udev rules）
2. **部署脚本生成**：
   ```bash
   # deploy.sh
   #!/bin/bash
   # 检查硬件设备
   # 配置 udev rules
   # 启动 ROS2 节点
   # 监控运行状态
   ```
3. **Gazebo 仿真验证**（可选）：
   - 生成 Gazebo world 文件
   - 配置机器人模型（URDF/SDF）
   - 启动仿真环境
   - 验证节点通信
4. **部署清单**：
   - 硬件连接检查表
   - 软件依赖安装命令
   - 启动命令
   - 故障排查指南

输出部署文档和脚本，等待用户确认。

---

## 完成标准

所有 7 个阶段完成后，输出最终交付清单：

- ✅ ROS2 包结构完整（package.xml、CMakeLists.txt、setup.py）
- ✅ 节点实现完成（C++/Python）
- ✅ 消息定义正确（.msg/.srv/.action）
- ✅ Launch 文件可用
- ✅ 配置文件完整（params.yaml、rviz config）
- ✅ 编译测试通过
- ✅ 代码审查通过
- ✅ 硬件部署方案就绪
- ✅ 文档完整

**🎉 ROS2 开发工作流完成！**
