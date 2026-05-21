# Contributing to CCG-ROS2

Thanks for your interest in contributing to CCG-ROS2! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 20+
- npm (comes with Node.js)
- Go 1.21+ (only for `codeagent-wrapper` changes)
- ROS2 Humble (optional, for testing ROS2-specific features)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/GuYu-001/ccg-ros2-workflow.git
cd ccg-ros2-workflow

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

### Project Structure

```
ccg-ros2-workflow/
├── src/                    # TypeScript source
│   ├── cli.ts              # CLI entry point
│   ├── commands/           # CLI commands (init, update, menu, etc.)
│   └── utils/              # Shared utilities
├── templates/              # Installed to ~/.claude/
│   ├── commands/           # Slash command templates (.md)
│   ├── commands-legacy/    # Legacy 6-phase workflow commands
│   ├── engine/             # Strategy engine + phase guides
│   ├── prompts/            # Expert prompts (codex/gemini/antigravity/claude)
│   ├── skills/             # Quality gates + ROS2 domain skills
│   ├── rules/              # Global rules
│   ├── hooks/              # Session hooks
│   └── codex/              # Codex Mode templates
├── codeagent-wrapper/      # Go binary source
├── src/utils/__tests__/    # Vitest test files
└── bin/                    # Build output + pre-compiled binaries
```

### Key Files

| File | Purpose |
|------|---------|
| `src/utils/installer.ts` | Core installation logic |
| `src/utils/config.ts` | Configuration management (ROS2 routing defaults) |
| `src/utils/mcp.ts` | MCP tool integration |
| `templates/commands-legacy/*.md` | 7-phase ROS2 workflow commands |
| `templates/prompts/` | Expert prompts for Codex/Gemini/Antigravity/Claude |
| `templates/engine/strategies/` | 11 strategy templates with ROS2 context |

## ROS2-Specific Contributions

### ROS2 Domain Skills

When adding new ROS2 domain skills to `templates/skills/domains/`:

- **Perception**: LiDAR processing, camera calibration, point cloud filtering
- **Control**: PID tuning, trajectory tracking, motor control algorithms
- **Navigation**: Nav2 configuration, SLAM tuning, path planning
- **Manipulation**: MoveIt configuration, grasp planning, inverse kinematics
- **Hardware**: CAN bus drivers, serial communication, sensor integration

Each skill should include:
- Clear ROS2 context (packages, nodes, topics, services)
- QoS policy recommendations
- Launch file examples
- Testing strategies (launch_testing, gtest, rosbag)

### ROS2 Terminology

Maintain consistent terminology throughout:

| English | 中文 | Context |
|---------|------|---------|
| Upper-layer Application | 上层应用 | Launch files, Python nodes, RViz, simulation |
| Low-level Control | 底层控制 | C++ nodes, hardware drivers, real-time control |
| System Integrator | 系统集成设计师 | Node architecture, Topic/Service design, QoS |

### Testing ROS2 Features

When testing ROS2-specific changes:

```bash
# Create a test ROS2 workspace
mkdir -p ~/test_ws/src
cd ~/test_ws
colcon build

# Test CCG-ROS2 in the workspace
cd ~/test_ws
npx ccg-ros2-workflow
# Follow prompts, then test commands like:
# /ccg:workflow implement odometry publisher
# /ccg:frontend create launch file for navigation
# /ccg:backend implement motor driver node
```

## How to Contribute

### Find an Issue

- Check [`good first issue`](https://github.com/GuYu-001/ccg-ros2-workflow/labels/good%20first%20issue) for beginner-friendly tasks
- Check [`help wanted`](https://github.com/GuYu-001/ccg-ros2-workflow/labels/help%20wanted) for tasks needing assistance
- Check [`ros2-enhancement`](https://github.com/GuYu-001/ccg-ros2-workflow/labels/ros2-enhancement) for ROS2-specific improvements
- Or open a new issue to propose your idea

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run tests: `npm test`
5. Build: `npm run build`
6. Commit with conventional format: `git commit -m "feat: add something"`
7. Push and create a Pull Request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Usage |
|--------|-------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation changes |
| `test:` | Adding or updating tests |
| `refactor:` | Code refactoring (no behavior change) |
| `chore:` | Build, CI, dependency updates |
| `ros2:` | ROS2-specific changes (skills, prompts, strategies) |

### Code Standards

- **TypeScript**: Follow existing patterns in `src/`
- **Templates**: Markdown files in `templates/` — use `{{VARIABLE}}` for template variables
- **ROS2 Context**: Inject ROS2-specific context (colcon, package.xml, QoS) in prompts and strategies
- **Tests**: Use Vitest, place tests in `src/utils/__tests__/` mirroring `src/` structure
- **Metrics**: Function complexity < 10, single function < 50 lines, single file < 500 lines

### What Makes a Good PR

- **Focused**: One concern per PR
- **Tested**: Include tests for new functionality
- **Documented**: Update README if adding user-facing features
- **ROS2-aware**: Ensure ROS2 terminology and context are consistent
- **Small**: Prefer multiple small PRs over one large one

## Good First Issues

Good first issues are designed to be completable in ~2 hours. They typically involve:

- **Documentation**: Fix typos, improve ROS2 examples, add missing descriptions
- **i18n**: Add missing translations in command templates
- **Tests**: Write tests for untested utility functions
- **Templates**: Improve slash command templates with better ROS2 examples
- **Small fixes**: Single-file bug fixes in `src/utils/`
- **ROS2 skills**: Add new domain skills (e.g., sensor calibration, controller tuning)

Each good first issue includes:
- Clear problem description
- Specific files to modify
- Acceptance criteria
- Verification commands

## Review Process

| Event | Timeline |
|-------|----------|
| Issue claimed | Assigned within 1 day |
| PR submitted | First review within 3 days |
| After review feedback | Contributor has 5 days to respond |
| No response | Issue unassigned (you can reclaim later) |

## Questions?

- Open a [Discussion](https://github.com/GuYu-001/ccg-ros2-workflow/discussions)
- Check existing [Issues](https://github.com/GuYu-001/ccg-ros2-workflow/issues)
- Refer to upstream [ccg-workflow](https://github.com/fengshao1227/ccg-workflow) for general CCG questions

---

Thank you for contributing to CCG-ROS2!
