---
name: ros2-upper-app
description: ROS2 上层应用集成域。Launch 编排、参数配置、RViz 可视化、Python 节点、Gazebo/Ignition 仿真。当用户提到 launch 文件、launch.py、参数 YAML、RViz、URDF 显示、Python 节点、rclpy、Gazebo、Ignition 仿真、机器人状态发布时使用。
user-invocable: false
category: domain
---

# ROS2 上层应用集成域

## 域定位

负责 ROS2 系统的**上层编排与可视化**——把各个底层节点(感知/控制/驱动)串成可启动、可配置、可视化、可仿真的整体。

**Authority Model**: Antigravity 优先(默认),Gemini 备选。

## 子技能索引

| 子技能 | 职责 | 触发关键词 |
|--------|------|------------|
| [launch-files.md](./launch-files.md) | Launch 文件编排 | launch, launch.py, IncludeLaunchDescription, launch_arguments |
| [parameters.md](./parameters.md) | 参数 YAML / declare_parameter | params.yaml, ros__parameters, declare_parameter, override |
| [rviz-config.md](./rviz-config.md) | RViz 可视化配置 | rviz, rviz2, .rviz config, displays, fixed frame, TF tree |
| [python-nodes.md](./python-nodes.md) | rclpy 节点开发 | rclpy, Python node, async, MultiThreadedExecutor, callback group |
| [simulation.md](./simulation.md) | Gazebo / Ignition 仿真 | gazebo, gz, ignition, sdf, world, robot_state_publisher, controller spawner |

## 与其他 ROS2 域的关系

```
┌─────────────────────────────┐
│   ros2-upper-app(本域)     │  ← Antigravity 主导
│   Launch / Params / Viz     │
└──────────┬──────────────────┘
           │ 启动并连接
           ↓
┌──────────────────────────────────────────────┐
│   ros2-perception / control / navigation /   │  ← Codex 主导
│   manipulation / hardware                    │
└──────────────────────────────────────────────┘
```

- 本域负责 **how to compose**(如何组装)
- 其他 ROS2 域负责 **what to compute**(算什么)

## 通用约束

- 路径不要硬编码 — 用 `FindPackageShare` + `PathJoinSubstitution`
- 参数不要散落在 launch 中 — 集中到 `config/*.yaml`
- 节点命名空间显式声明 — 多机器人场景下避免冲突
- TF tree 单根原则 — 全系统只有一个根 frame(通常是 `map` 或 `odom`)
- `use_sim_time` 在仿真场景必须显式传递到所有节点
