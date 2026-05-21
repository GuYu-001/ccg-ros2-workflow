---
description: 'Agent Teams 需求研究 - 并行探索代码库，产出约束集 + 可验证成功判据'
---
<!-- CCG:TEAM:RESEARCH:START -->
**Core Philosophy**
- Research 产出的是**约束集**，不是信息堆砌。每条约束缩小解决方案空间。
- 约束告诉后续阶段"不要考虑这个方向"，使 plan 阶段能产出零决策计划。
- 输出：约束集合 + 可验证的成功判据，写入 `.claude/team-plan/<任务名>-research.md`。

**Guardrails**
- **STOP! BEFORE ANY OTHER ACTION**: 必须先做 Prompt 增强。
- 按上下文边界（context boundaries）划分探索范围，不按角色划分。
- 多模型协作是 **mandatory**：Codex（底层控制边界）+ Gemini（上层应用边界）。
- 不做架构决策——只发现约束。
- 使用 `AskUserQuestion` 解决任何歧义，绝不假设。

**Steps**
0. **MANDATORY: Prompt 增强**
   - **立即执行，不可跳过。**
   - 分析 $ARGUMENTS 的意图、缺失信息、隐含假设，补全为结构化需求（明确目标、技术约束、范围边界、验收标准）。
   - 后续所有步骤使用增强后的需求。

1. **代码库评估**
   - 用 Glob/Grep/Read 扫描项目结构。
   - 判断项目规模：单包 vs 多包（ament 工作空间）。
   - 识别技术栈：ROS2 版本、节点语言（C++/Python）、依赖包、现有消息定义。

2. **定义探索边界（按上下文划分）**
   - 识别自然的上下文边界（不是功能角色）：
     * 边界 1：底层控制域（控制节点、硬件驱动、实时算法、消息定义）
     * 边界 2：上层应用域（Launch 文件、Python 节点、RViz 配置、仿真）
     * 边界 3：基础设施（CMakeLists、package.xml、配置文件、部署脚本）
   - 每个边界应自包含，无需跨边界通信。

3. **多模型并行探索（PARALLEL）**
   - **CRITICAL**: 必须在一条消息中同时发起两个 Bash 调用。
   - **工作目录**：`{{WORKDIR}}` 替换为目标工作目录的绝对路径。

   **FIRST Bash call (Codex - 底层控制)**:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex - \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/codex/analyzer.md\n<TASK>\n需求：<增强后的需求>\n探索范围：底层控制相关上下文边界（C++节点/硬件驱动/实时算法/消息定义）\n</TASK>\nOUTPUT (JSON):\n{\n  \"module_name\": \"探索的上下文边界\",\n  \"existing_structures\": [\"发现的关键模式\"],\n  \"existing_conventions\": [\"使用中的规范\"],\n  \"constraints_discovered\": [\"限制解决方案空间的硬约束\"],\n  \"open_questions\": [\"需要用户确认的歧义\"],\n  \"dependencies\": [\"跨模块依赖\"],\n  \"risks\": [\"潜在阻碍\"],\n  \"success_criteria_hints\": [\"可观测的成功行为\"]\n}\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Codex 底层控制探索"
   })
   ```

   **SECOND Bash call (Gemini - 上层应用) - IN THE SAME MESSAGE**:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend gemini {{GEMINI_MODEL_FLAG}}- \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/gemini/analyzer.md\n<TASK>\n需求：<增强后的需求>\n探索范围：上层应用相关上下文边界（Launch文件/Python节点/RViz配置/仿真）\n</TASK>\nOUTPUT (JSON):\n{\n  \"module_name\": \"探索的上下文边界\",\n  \"existing_structures\": [\"发现的关键模式\"],\n  \"existing_conventions\": [\"使用中的规范\"],\n  \"constraints_discovered\": [\"限制解决方案空间的硬约束\"],\n  \"open_questions\": [\"需要用户确认的歧义\"],\n  \"dependencies\": [\"跨模块依赖\"],\n  \"risks\": [\"潜在阻碍\"],\n  \"success_criteria_hints\": [\"可观测的成功行为\"]\n}\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Gemini 上层应用探索"
   })
   ```

   **等待结果**:
   ```
   TaskOutput({ task_id: "<codex_task_id>", block: true, timeout: 600000 })
   TaskOutput({ task_id: "<gemini_task_id>", block: true, timeout: 600000 })
   ```

4. **聚合与综合**
   - 合并所有探索输出为统一约束集：
     * **硬约束**：技术限制、不可违反的模式（如 QoS 兼容性、实时性要求、硬件接口）
     * **软约束**：惯例、偏好、ROS2 编码规范
     * **依赖**：影响实施顺序的跨模块关系（如消息定义必须先于节点实现）
     * **风险**：需要缓解的阻碍（如硬件依赖、驱动兼容性）

5. **歧义消解**
   - 编译优先级排序的开放问题列表。
   - 用 `AskUserQuestion` 系统性地呈现：
     * 分组相关问题
     * 为每个问题提供上下文
     * 在适用时建议默认值
   - 将用户回答转化为额外约束。

6. **写入研究文件**
   - 路径：`.claude/team-plan/<任务名>-research.md`
   - 格式：

   ```markdown
   # Team Research: <任务名>

   ## 增强后的需求
   <结构化需求描述>

   ## 约束集

   ### 硬约束
   - [HC-1] <约束描述> — 来源：<Codex/Gemini/用户>
   - [HC-2] ...

   ### 软约束
   - [SC-1] <约束描述> — 来源：<Codex/Gemini/用户>
   - [SC-2] ...

   ### 依赖关系
   - [DEP-1] <模块A> → <模块B>：<原因>（如：消息定义 → 控制节点）

   ### 风险
   - [RISK-1] <风险描述> — 缓解：<策略>

   ## 成功判据
   - [OK-1] <可验证的成功行为>
   - [OK-2] ...

   ## 开放问题（已解决）
   - Q1: <问题> → A: <用户回答> → 约束：[HC/SC-N]
   ```

7. **上下文检查点**
   - 报告当前上下文使用量。
   - 提示：`研究完成，运行 /clear 后执行 /ccg:team-plan <任务名> 开始规划`

**Exit Criteria**
- [ ] Codex + Gemini 探索完成
- [ ] 所有歧义已通过用户确认解决
- [ ] 约束集 + 成功判据已写入研究文件
- [ ] 零开放问题残留
<!-- CCG:TEAM:RESEARCH:END -->
