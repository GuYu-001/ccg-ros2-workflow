# ROS2 Role Prompt Inventory

The installer copies `templates/prompts/<backend>/*.md` to
`~/.claude/.ccg/prompts/<backend>/`. The wrapper reads each `ROLE_FILE` before
dispatch. This inventory records all 52 existing files; filenames and output
contracts remain stable.

## Files

Each name below is relative to `templates/prompts/`.

- `antigravity/`: `analyzer.md`, `architect.md`, `builder.md`, `debugger.md`, `frontend.md`, `optimizer.md`, `reviewer.md`, `tester.md`.
- `claude/`: `analyzer.md`, `architect.md`, `debugger.md`, `optimizer.md`, `reviewer.md`, `tester.md`.
- `codex/`: `analyzer.md`, `architect.md`, `builder.md`, `debugger.md`, `optimizer.md`, `reviewer.md`, `tester.md`.
- `gemini/`: `analyzer.md`, `architect.md`, `debugger.md`, `frontend.md`, `optimizer.md`, `reviewer.md`, `tester.md`.
- `grok/`: `analyzer.md`, `architect.md`, `builder.md`, `debugger.md`, `frontend.md`, `optimizer.md`, `reviewer.md`, `tester.md`.
- `kimi/`: `analyzer.md`, `architect.md`, `builder.md`, `debugger.md`, `frontend.md`, `optimizer.md`, `reviewer.md`, `tester.md`.
- `opencode/`: `analyzer.md`, `architect.md`, `builder.md`, `debugger.md`, `frontend.md`, `optimizer.md`, `reviewer.md`, `tester.md`.

## Consumers

`templates/engine/model-router.md` resolves `$MODEL/$ROLE.md` dynamically for
all backends. Its analysis, planning, review and debugging tables select
`analyzer`, `architect`, `reviewer` and `debugger`; its role list also exposes
`optimizer`, `tester` and `builder`. Pure Claude mode inlines the Claude
role into native Agents instead of recursively invoking a Claude CLI.

`templates/codex/AGENTS.md` dynamically selects the configured frontend and
Claude roles for analysis, review, debugging and optimization.

Role-specific callers, in addition to that dynamic router:

- `analyzer.md`: engine `full-collaborate`, `guided-develop`, `deep-research`; legacy `analyze`, `backend`, `frontend`, `workflow`, `plan`, `feat`, `team-plan`, `team-research`.
- `architect.md`: engine `full-collaborate`; legacy `backend`, `frontend`, `workflow`, `plan`, `execute`, `feat`, `team`.
- `builder.md`: engine `full-collaborate`, `guided-develop` when an external executor is selected. Claude uses native Agents; Gemini has no builder file.
- `debugger.md`: engine `debug-investigate`; legacy `debug`.
- `optimizer.md`: engine `optimize-measure`; legacy `optimize`.
- `reviewer.md`: engine `full-collaborate`, `guided-develop`, `refactor-safely`, `review-audit`; legacy `backend`, `frontend`, `workflow`, `review`, `execute`, `codex-exec`, `feat`, `team`, `team-review`.
- `tester.md`: legacy `test`, or explicit router role selection.
- `frontend.md`: legacy `execute` and `feat` explicitly select Gemini; other existing frontend files are available to explicit `ROLE_FILE` callers, not selected by the v3 router's default role list.

Legacy `analyze`, `plan`, `execute`, `feat`, `optimize`, `test`, `review` and
parts of `debug` still contain explicit Codex/Gemini paths. Configurable
legacy `backend`, `frontend`, `workflow` and Team commands use
`{{BACKEND_PRIMARY}}` / `{{FRONTEND_PRIMARY}}`.

## Stable Contracts

Backend/frontend are task lanes, not model capabilities: any configured
model may serve either lane. Low-level work emphasizes C++ `rclcpp`,
drivers, real-time control and `ros2_control`; upper-layer work emphasizes
Python `rclpy`, launch, parameters, RViz/Gazebo and Nav2/MoveIt integration.

Non-builder roles retain their read-only and patch/report-only contracts.
Builders retain scoped write access. Antigravity's report-only formats,
Claude's integration view, reviewer score fields, and all template
variables are retained. No missing role files are synthesized or renamed.
