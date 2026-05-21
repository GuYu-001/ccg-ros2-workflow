---
description: 'Agent Teams 规划 - Lead 调用 Codex/Gemini 并行分析，产出零决策并行实施计划'
---
<!-- CCG:TEAM:PLAN:START -->
**Core Philosophy**
- 产出的计划必须让 Builder teammates 能无决策机械执行。
- 每个子任务的文件范围必须隔离，确保并行不冲突。
- 多模型协作是强制的：Codex（底层控制权威）+ Gemini（上层应用权威）。

**Guardrails**
- 多模型分析是 **mandatory**：必须同时调用 Codex 和 Gemini。
- 不写产品代码，只做分析和规划。
- 计划文件必须包含 Codex/Gemini 的实际分析摘要。
- 使用 `AskUserQuestion` 解决任何歧义。

**Steps**
1. **上下文收集**
   - 用 Glob/Grep/Read 分析项目结构、ROS2 工作空间、现有节点和消息定义。
   - 如果 `{{MCP_SEARCH_TOOL}}` 可用，优先语义检索。
   - 整理出：ROS2 版本、包结构、节点拓扑、消息类型、CMakeLists 配置。

2. **多模型并行分析（PARALLEL）**
   - **CRITICAL**: 必须在一条消息中同时发起两个 Bash 调用，`run_in_background: true`。
   - **工作目录**：`{{WORKDIR}}` 替换为目标工作目录的绝对路径。

   **FIRST Bash call (Codex - 底层控制)**:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex - \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/codex/analyzer.md\n<TASK>\n需求：$ARGUMENTS\n上下文：<步骤1收集的项目结构和关键代码>\n</TASK>\nOUTPUT:\n1) 技术可行性评估（C++节点/实时性/硬件驱动）\n2) 推荐底层控制架构（精确到文件和函数）\n3) 详细实施步骤（节点、消息、控制算法）\n4) 风险评估（硬件依赖、实时性约束、驱动兼容性）\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Codex 底层控制分析"
   })
   ```

   **SECOND Bash call (Gemini - 上层应用) - IN THE SAME MESSAGE**:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend gemini {{GEMINI_MODEL_FLAG}}- \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/gemini/analyzer.md\n<TASK>\n需求：$ARGUMENTS\n上下文：<步骤1收集的项目结构和关键代码>\n</TASK>\nOUTPUT:\n1) 上层应用架构方案（Launch文件/Python节点/RViz配置）\n2) 节点拆分建议（精确到文件和函数）\n3) 详细实施步骤（Launch、仿真、可视化）\n4) 系统集成要点（Topic/Service/Action 设计）\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Gemini 上层应用分析"
   })
   ```

   **等待结果**:
   ```
   TaskOutput({ task_id: "<codex_task_id>", block: true, timeout: 600000 })
   TaskOutput({ task_id: "<gemini_task_id>", block: true, timeout: 600000 })
   ```

   - 必须指定 `timeout: 600000`，否则默认 30 秒会提前超时。
   - 若 10 分钟后仍未完成，继续轮询，**绝对不要 Kill 进程**。

3. **综合分析 + 任务拆分**
   - 底层控制方案以 Codex 为准，上层应用方案以 Gemini 为准。
   - 拆分为独立子任务，每个子任务：
     * 文件范围不重叠（**强制**）
     * 如果无法避免重叠 → 设为依赖关系（如消息定义必须先于节点实现）
     * 有具体实施步骤和验收标准
   - 按依赖关系分 Layer：同 Layer 可并行，跨 Layer 串行。

4. **写入计划文件**
   - 路径：`.claude/team-plan/<任务名>.md`（英文短横线命名）
   - 格式：

   ```markdown
   # Team Plan: <任务名>

   ## 概述
   <一句话描述>

   ## Codex 分析摘要（底层控制）
   <Codex 实际返回的关键内容>

   ## Gemini 分析摘要（上层应用）
   <Gemini 实际返回的关键内容>

   ## 技术方案
   <综合最优方案，含关键技术决策（节点架构/消息设计/QoS配置）>

   ## 子任务列表

   ### Task 1: <名称>
   - **类型**: 底层控制/上层应用
   - **文件范围**: <精确文件路径列表>
   - **依赖**: 无 / Task N
   - **实施步骤**:
     1. <具体步骤>
     2. <具体步骤>
   - **验收标准**: <怎么算完成>

   ### Task 2: <名称>
   ...

   ## 文件冲突检查
   ✅ 无冲突 / ⚠️ 已通过依赖关系解决

   ## 并行分组
   - Layer 1 (并行): Task 1, Task 2
   - Layer 2 (依赖 Layer 1): Task 3
   ```

5. **用户确认**
   - 展示计划摘要（子任务数、并行分组、Builder 数量）。
   - 用 `AskUserQuestion` 请求确认。
   - 确认后提示：`计划已就绪，运行 /ccg:team-exec 开始并行实施`

6. **上下文检查点**
   - 报告当前上下文使用量。
   - 如果接近 80K：建议 `/clear` 后运行 `/ccg:team-exec`。

**Exit Criteria**
- [ ] Codex + Gemini 分析完成
- [ ] 子任务文件范围无冲突
- [ ] 计划文件已写入 `.claude/team-plan/`
- [ ] 用户已确认计划
<!-- CCG:TEAM:PLAN:END -->
