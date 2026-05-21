# CCG-ROS2 - Claude + Codex + Antigravity ROS2 Multi-Model Collaboration

<div align="center">

<img src="assets/logo/ccg-logo-cropped.png" alt="CCG-ROS2 Workflow" width="400">

[![npm version](https://img.shields.io/npm/v/ccg-ros2-workflow.svg)](https://www.npmjs.com/package/ccg-ros2-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Compatible-green.svg)](https://claude.ai/code)
[![ROS2](https://img.shields.io/badge/ROS2-Humble-blue.svg)](https://docs.ros.org/en/humble/)

[简体中文](./README.zh-CN.md) | English

</div>

---

CCG-ROS2 is a workflow engine for Claude Code that orchestrates multiple AI models (Codex for low-level control, Antigravity for upper-layer application, Claude for orchestration) with hook-based state tracking, automatic strategy selection, and Agent Teams parallel execution — specialized for ROS2 robotics development.

> **Fork from** [fengshao1227/ccg-workflow](https://github.com/fengshao1227/ccg-workflow) v3.1.0, customized for ROS2 Humble robotics development.

## What's new in v3.0.0 (ROS2 Edition)

v3.0.0 brings the powerful v3.1.0 engine to ROS2 development with domain-specific enhancements:

- **ROS2-aware routing** — Upper-layer tasks (Launch files, Python nodes, RViz, simulation) route to Antigravity. Low-level tasks (C++ nodes, hardware drivers, real-time control) route to Codex.
- **7-phase workflow** — Extended from 6 phases with dedicated hardware deployment phase (deployment scripts, hardware dependency checks, Gazebo simulation validation).
- **ROS2 system integrator** — Replaces UI/UX designer with `system-integrator` agent specialized in ROS2 node architecture, Topic/Service design, and QoS configuration.
- **ROS2 domain skills** — Perception (LiDAR/camera/point cloud), control (PID/trajectory/motor drivers), navigation (Nav2/SLAM/path planning), manipulation (MoveIt/grasp planning), hardware integration (CAN/serial/sensor drivers).
- **Codex Mode for ROS2** — Codex-led orchestration with ROS2 context (node boundaries, message selection, QoS decisions).
- **All v3.1.0 features** — Hook engine, task persistence, Agent Teams, quality gates, domain knowledge hooks, Codex-Led Mode.

## Quick Start

```bash
npx ccg-ros2-workflow
```

**Requirements**: Node.js 20+, Claude Code CLI  
**Optional**: Codex CLI (low-level control), Antigravity CLI (upper-layer application)

The installer walks through 4 steps: API config, model routing, MCP tools, performance mode.

## How it works (ROS2 Example)

```
You: /ccg:go implement autonomous navigation for differential drive robot

CCG-ROS2 Engine:
  1. Reads ROS2 project context (package.xml, colcon workspace, launch files)
  2. Classifies: feature / XL complexity / mixed (upper+lower) / high risk
  3. Selects strategy: full-collaborate
  4. Creates .ccg/tasks/autonomous-navigation/task.json
  5. Launches dual-model analysis:
     - Codex: motor driver, odometry, low-level control
     - Antigravity: Nav2 config, launch files, RViz setup
  6. Produces plan with node architecture + QoS design → HARD STOP for approval
  7. Spawns Agent Teams Builders for parallel implementation
  8. Runs quality gates (verify ROS2 message definitions, QoS policies, lifecycle)
  9. Hardware deployment phase: generates deployment scripts, checks CAN/serial, Gazebo sim
  10. Reports results

Every turn, a hook injects:
  <ccg-state>
  Task: autonomous-navigation (in_progress)
  Strategy: full-collaborate
  Phase: 4-implementation
  ROS2 Context: colcon workspace, 3 packages, Nav2 stack
  Next: Layer 1 Builders executing (motor_driver_node + nav2_config)
  </ccg-state>
```

## ROS2 Model Routing

| Model | Role | Suitable for |
|-------|------|--------------|
| **Codex** | Low-level Control Authority | C++ nodes, hardware drivers, real-time control algorithms, message definitions |
| **Antigravity** | Upper-layer Application Authority | Launch files, Python nodes, RViz configuration, simulation setup |
| **Claude** | Orchestration + Delivery | Plan approval, code writing, quality control |

## Strategies (ROS2-aware)

The engine picks a strategy based on task type and complexity, with ROS2-specific context:

| Strategy | When | External models | Teams | ROS2 Context |
|----------|------|-----------------|-------|--------------|
| direct-fix | Simple bug, single file | No | No | Node crash, topic mismatch |
| quick-implement | Small feature, clear scope | No | No | Add parameter, simple service |
| guided-develop | Medium feature, needs planning | Single model | No | New node, message definition |
| full-collaborate | Complex feature, multi-module | Dual model parallel | Yes | Navigation stack, perception pipeline |
| debug-investigate | Complex bug, unknown cause | Dual model diagnosis | No | QoS mismatch, lifecycle issue |
| refactor-safely | Code restructuring | Dual model review | No | Node splitting, message refactor |
| deep-research | Technical research, comparison | Dual model exploration | No | SLAM algorithm, control strategy |
| optimize-measure | Performance optimization | Optional | No | CPU/memory, QoS tuning |
| review-audit | Code review | Dual model cross-review | No | QoS policies, lifecycle, safety |
| git-action | commit, rollback, branches | No | No | Standard git operations |

Simple tasks run fast with no overhead. Complex ROS2 tasks get the full engine with hardware deployment phase.

## Commands

### Smart Entry Point

| Command | Description |
|---------|-------------|
| `/ccg:go` | Describe what you want in plain language. The engine analyzes your intent, picks the right strategy, and executes it. |

### ROS2 Development Workflow (Legacy Commands)

| Command | Description |
|---------|-------------|
| `/ccg:workflow` | 7-phase complete workflow (with hardware deployment) |
| `/ccg:plan` | Multi-model collaborative planning (Phase 1-2) |
| `/ccg:execute` | Multi-model collaborative execution (Phase 3-5) |
| `/ccg:frontend` | Upper-layer application focus (Antigravity-led: Launch/Python/RViz) |
| `/ccg:backend` | Low-level control focus (Codex-led: C++/drivers/real-time) |
| `/ccg:feat` | Smart feature development |
| `/ccg:analyze` | Dual-model technical analysis |
| `/ccg:debug` | Multi-model problem diagnosis |
| `/ccg:optimize` | Multi-model performance optimization |
| `/ccg:test` | Smart test generation |
| `/ccg:review` | Dual-model code review |
| `/ccg:enhance` | Prompt enhancement |
| `/ccg:init` | Initialize CLAUDE.md |

### OpenSpec Specification-Driven

| Command | Description |
|---------|-------------|
| `/ccg:spec-init` | Initialize OPSX environment |
| `/ccg:spec-research` | Requirements → Constraint set |
| `/ccg:spec-plan` | Constraints → Zero-decision plan |
| `/ccg:spec-impl` | Execute by specification + archive |
| `/ccg:spec-review` | Dual-model cross-review |

### Agent Teams Parallel Implementation

| Command | Description |
|---------|-------------|
| `/ccg:team` | **Unified workflow (recommended)** — 8-phase full process with 7-role auto-orchestration |
| `/ccg:team-research` | Parallel constraint set research (Codex low-level + Antigravity upper-layer) |
| `/ccg:team-plan` | Zero-decision parallel implementation plan |
| `/ccg:team-exec` | Spawn Builder teammates for parallel coding |
| `/ccg:team-review` | Dual-model cross-review implementation output |

### Git Tools

| Command | Description |
|---------|-------------|
| `/ccg:commit` | Smart Git commit (conventional commit) |
| `/ccg:rollback` | Interactive Git rollback |
| `/ccg:clean-branches` | Clean merged branches |
| `/ccg:worktree` | Worktree management |

### Project Management

| Command | Description |
|---------|-------------|
| `/ccg:context` | Project context management (.context initialization/log/compress/history) |
| `/ccg:codex-exec` | Codex full execution plan (MCP + code + tests) |

## 7-Phase ROS2 Workflow

```
Research → Ideation → Planning → Execution → Optimization → Review → Hardware Deployment
```

- **Phase 1-2 (Research/Ideation)**: Codex + Antigravity parallel analysis, dual-perspective evaluation
- **Phase 3 (Planning)**: Claude synthesizes solution, user approval then archive
- **Phase 4 (Execution)**: Claude leads code implementation
- **Phase 5 (Optimization)**: Codex + Antigravity parallel review, Claude integrates fixes
- **Phase 6 (Review)**: Final quality control
- **Phase 7 (Hardware Deployment)**: Generate deployment scripts, check hardware dependencies (serial/CAN/sensors), Gazebo simulation validation

## Architecture

```
Claude (Orchestration + Final Code Writing)
  ├── Codex      → Read-only, returns patch (Low-level: C++/drivers/real-time)
  └── Antigravity → Read-only, returns patch (Upper-layer: Launch/Python/RViz)
```

External models have zero write permissions to the filesystem. All code is reviewed by Claude before landing.

## Sub-Agents

| Agent | Purpose |
|-------|---------|
| `system-integrator` | ROS2 system integration designer (node architecture/Topic-Service/QoS design) |
| `planner` | ROS2 task planner (WBS decomposition) |
| `init-architect` | Project initialization architect |
| `get-current-datetime` | Get current time |
| `team-architect` | Team architect (v3.0+) |
| `team-qa` | QA engineer (v3.0+) |
| `team-reviewer` | Code reviewer (v3.0+) |

## Output Styles

After installation, choose AI output style via output-styles directory:

- `engineer-professional` - SOLID/KISS/DRY professional engineer style
- `nekomata-engineer` - Cat-girl engineer (UFO Meow)
- `laowang-engineer` - Old Wang engineer
- `abyss-cultivator` - Abyss cultivator
- `ojousama-engineer` - Ojou-sama style
- `abyss-concise` - Abyss concise report
- `abyss-command` - Abyss iron command
- `abyss-ritual` - Abyss ritual scroll

## Fixed Configuration

| Item | Value |
|------|-------|
| ROS2 Version | Humble Hawksbill (LTS) |
| Target Platform | Physical Robot |
| Upper-layer Application Model | Antigravity (default) / Gemini (fallback) |
| Low-level Control Model | Codex |
| Workflow Phases | 7 phases (with hardware deployment) |

## Codex-Led Mode (Optional)

Install via menu option `X. Codex Mode`. Codex CLI acts as lead orchestrator with ROS2 context:

- `~/.codex/AGENTS.md` — Adaptive decision framework with ROS2 context (node boundaries, message selection, QoS decisions)
- `~/.codex/hooks/ccg-workflow.py` — Intelligent guardrail hook with ROS2 checkpoints (package.xml, CMakeLists.txt, launch files, colcon build)
- `~/.codex/config.toml` — Multi-agent v2 enabled
- `~/.codex/agents/` — Native sub-agent definitions with ROS2 context

## MCP Tools Integration

Optional MCP tools for enhanced functionality:

- **fast-context** (recommended) — Windsurf Fast Context for code retrieval
- **ace-tool** — Code search + prompt enhancement
- **ContextWeaver** — Local-first semantic code search
- **context7** (auto-installed) — Free library documentation query

## Related Links

- [npm package](https://www.npmjs.com/package/ccg-ros2-workflow)
- [GitHub repository](https://github.com/GuYu-001/ccg-ros2-workflow)
- [Official ccg-workflow](https://github.com/fengshao1227/ccg-workflow)
- [ROS2 Humble Documentation](https://docs.ros.org/en/humble/)

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Version**: 3.0.0  
**Last Updated**: 2026-05-20
