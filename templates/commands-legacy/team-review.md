---
description: 'Agent Teams 审查 - 双模型交叉审查并行实施的产出，分级处理 Critical/Warning/Info'
---
<!-- CCG:TEAM:REVIEW:START -->
**Core Philosophy**
- 双模型交叉验证捕获单模型审查遗漏的盲区。
- Critical 问题必须修复后才能结束。
- 审查范围严格限于 team-exec 的变更，不扩大范围。

**Guardrails**
- **MANDATORY**: Codex 和 Gemini 必须都完成审查后才能综合。
- 审查范围限于 `git diff` 的变更，不做范围蔓延。
- Lead 可以直接修复 Critical 问题（审查阶段允许写代码）。

**Steps**
1. **收集变更产物**
   - 运行 `git diff` 获取变更摘要。
   - 如果有 `.claude/team-plan/` 下的计划文件，读取约束和成功判据作为审查基准。
   - 列出所有被修改的文件。

2. **多模型审查（PARALLEL）**
   - **CRITICAL**: 必须在一条消息中同时发起两个 Bash 调用。
   - **工作目录**：`{{WORKDIR}}` 替换为目标工作目录的绝对路径。

   **FIRST Bash call (Codex - 底层控制审查)**:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex - \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/codex/reviewer.md\n<TASK>\n审查以下变更（底层控制视角：C++/硬件驱动/实时性/控制算法）：\n<git diff 输出或变更文件列表>\n</TASK>\nOUTPUT (JSON):\n{\n  \"findings\": [\n    {\n      \"severity\": \"Critical|Warning|Info\",\n      \"dimension\": \"logic|realtime|safety|memory|ros2_conventions\",\n      \"file\": \"path/to/file\",\n      \"line\": 42,\n      \"description\": \"问题描述\",\n      \"fix_suggestion\": \"修复建议\"\n    }\n  ],\n  \"passed_checks\": [\"已验证的检查项\"],\n  \"summary\": \"总体评估\"\n}\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Codex 底层控制审查"
   })
   ```

   **SECOND Bash call (Gemini - 上层应用审查) - IN THE SAME MESSAGE**:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend gemini {{GEMINI_MODEL_FLAG}}- \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/gemini/reviewer.md\n<TASK>\n审查以下变更（上层应用视角：Launch文件/Python节点/RViz/系统集成）：\n<git diff 输出或变更文件列表>\n</TASK>\nOUTPUT (JSON):\n{\n  \"findings\": [\n    {\n      \"severity\": \"Critical|Warning|Info\",\n      \"dimension\": \"launch_config|topic_design|qos|visualization|integration\",\n      \"file\": \"path/to/file\",\n      \"line\": 42,\n      \"description\": \"问题描述\",\n      \"fix_suggestion\": \"修复建议\"\n    }\n  ],\n  \"passed_checks\": [\"已验证的检查项\"],\n  \"summary\": \"总体评估\"\n}\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Gemini 上层应用审查"
   })
   ```

   **等待结果**:
   ```
   TaskOutput({ task_id: "<codex_task_id>", block: true, timeout: 600000 })
   TaskOutput({ task_id: "<gemini_task_id>", block: true, timeout: 600000 })
   ```

3. **综合发现**
   - 合并两个模型的发现。
   - 去重重叠问题。
   - 按严重性分级：
     * **Critical**: 安全漏洞、逻辑错误、实时性破坏、内存泄漏 → 必须修复
     * **Warning**: ROS2 规范偏离、QoS 配置问题、可维护性问题 → 建议修复
     * **Info**: 小改进建议、注释补充、命名规范 → 可选修复

4. **输出审查报告**
   ```markdown
   ## 审查报告

   ### 🔴 Critical (X issues) - 必须修复
   - [ ] [实时性] controller.cpp:42 - 描述
   - [ ] [逻辑] driver.cpp:15 - 描述

   ### 🟡 Warning (Y issues) - 建议修复
   - [ ] [QoS] topic_pub.cpp:88 - 描述

   ### 🔵 Info (Z issues) - 可选
   - [ ] [规范] helper.py:20 - 描述

   ### ✅ 已通过检查
   - ✅ 无内存泄漏
   - ✅ Topic/Service 命名规范
   - ✅ Launch 文件参数完整
   ```

5. **决策门**
   - **Critical > 0**:
     * 展示发现，用 `AskUserQuestion` 询问："立即修复 / 跳过"
     * 选择修复 → Lead 直接修复（底层控制问题参考 Codex 建议，上层应用参考 Gemini 建议）
     * 修复后重新运行受影响的审查维度
     * 重复直到 Critical = 0
   - **Critical = 0**:
     * 报告通过，建议提交代码

6. **上下文检查点**
   - 报告当前上下文使用量。

**Exit Criteria**
- [ ] Codex + Gemini 审查完成
- [ ] 所有发现已综合分级
- [ ] Critical = 0（已修复或用户确认跳过）
- [ ] 审查报告已输出
<!-- CCG:TEAM:REVIEW:END -->
