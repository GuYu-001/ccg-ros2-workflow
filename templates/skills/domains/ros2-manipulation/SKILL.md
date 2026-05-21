---
name: ros2-manipulation
description: ROS2 机械臂操作技能。MoveIt 2、运动规划、抓取规划、逆运动学、笛卡尔规划。当用户提到 MoveIt、机械臂、抓取、IK、URDF、joint_trajectory、planning scene 时使用。
user-invocable: false
category: domain
---

# ROS2 机械臂操作技能

## 适用场景

机械臂运动规划、抓取、操作任务。

### 触发关键词

- MoveIt / MoveIt2 / move_group
- 机械臂 / manipulator / arm
- 抓取 / grasp / pick / place
- 逆运动学 / IK / FK / 运动学
- URDF / SRDF / xacro
- 轨迹 / trajectory / OMPL / CHOMP / STOMP

---

## MoveIt 2 架构

```
[move_group] (核心节点)
    ├── [Planning Pipeline] (OMPL/CHOMP/STOMP)
    ├── [Planning Scene] (碰撞检测)
    ├── [Trajectory Execution] (FollowJointTrajectory Action)
    └── [Robot State] (joint_states)
```

### 启动 MoveIt 2

```bash
ros2 launch <robot>_moveit_config demo.launch.py
```

---

## URDF/SRDF 基础

### URDF 关键元素

```xml
<robot name="my_robot">
  <link name="base_link">
    <visual>
      <geometry><cylinder length="0.1" radius="0.05"/></geometry>
    </visual>
    <collision>
      <geometry><cylinder length="0.1" radius="0.05"/></geometry>
    </collision>
    <inertial>
      <mass value="1.0"/>
      <inertia ixx="0.01" iyy="0.01" izz="0.01" ixy="0" ixz="0" iyz="0"/>
    </inertial>
  </link>

  <joint name="joint1" type="revolute">
    <parent link="base_link"/>
    <child link="link1"/>
    <origin xyz="0 0 0.1" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" effort="10" velocity="1.0"/>
  </joint>
</robot>
```

### SRDF 规划组

```xml
<robot name="my_robot">
  <group name="arm">
    <chain base_link="base_link" tip_link="end_effector"/>
  </group>
  <group_state name="home" group="arm">
    <joint name="joint1" value="0"/>
    <joint name="joint2" value="-1.57"/>
  </group_state>
</robot>
```

---

## C++ MoveIt 2 API

```cpp
#include <moveit/move_group_interface/move_group_interface.h>

auto move_group = std::make_shared<moveit::planning_interface::MoveGroupInterface>(
    node, "arm");

// 设置目标位姿
geometry_msgs::msg::Pose target;
target.position.x = 0.5;
target.position.y = 0.0;
target.position.z = 0.5;
target.orientation.w = 1.0;
move_group->setPoseTarget(target);

// 规划
moveit::planning_interface::MoveGroupInterface::Plan plan;
auto success = (move_group->plan(plan) ==
                moveit::core::MoveItErrorCode::SUCCESS);

if (success) {
  move_group->execute(plan);
}
```

### 笛卡尔路径

```cpp
std::vector<geometry_msgs::msg::Pose> waypoints;
waypoints.push_back(start_pose);
waypoints.push_back(mid_pose);
waypoints.push_back(end_pose);

moveit_msgs::msg::RobotTrajectory trajectory;
double fraction = move_group->computeCartesianPath(
    waypoints, 0.01, 0.0, trajectory);

if (fraction > 0.95) {
  move_group->execute(trajectory);
}
```

---

## Python MoveIt 2 (pymoveit2)

```python
from pymoveit2 import MoveIt2
from rclpy.executors import MultiThreadedExecutor

moveit2 = MoveIt2(
    node=node,
    joint_names=["joint1", "joint2", "joint3"],
    base_link_name="base_link",
    end_effector_name="end_effector",
    group_name="arm",
)

# 关节空间运动
moveit2.move_to_configuration([0.0, -1.57, 0.0])
moveit2.wait_until_executed()

# 笛卡尔运动
moveit2.move_to_pose(
    position=[0.5, 0.0, 0.5],
    quat_xyzw=[0.0, 0.0, 0.0, 1.0],
    cartesian=True,
)
```

---

## 抓取规划

### Grasp Pose 生成

```cpp
moveit_msgs::msg::Grasp grasp;
grasp.grasp_pose.header.frame_id = "base_link";
grasp.grasp_pose.pose.position.x = 0.5;
grasp.grasp_pose.pose.position.y = 0.0;
grasp.grasp_pose.pose.position.z = 0.3;

// 接近
grasp.pre_grasp_approach.direction.vector.z = -1.0;
grasp.pre_grasp_approach.min_distance = 0.05;
grasp.pre_grasp_approach.desired_distance = 0.1;

// 抓取后撤
grasp.post_grasp_retreat.direction.vector.z = 1.0;
grasp.post_grasp_retreat.min_distance = 0.05;
grasp.post_grasp_retreat.desired_distance = 0.15;

move_group->pick("target_object", {grasp});
```

---

## Planning Scene 管理

### 添加碰撞物体

```cpp
moveit_msgs::msg::CollisionObject obj;
obj.header.frame_id = "base_link";
obj.id = "table";

shape_msgs::msg::SolidPrimitive box;
box.type = box.BOX;
box.dimensions = {1.0, 1.0, 0.05};
obj.primitives.push_back(box);

geometry_msgs::msg::Pose pose;
pose.position.z = -0.025;
pose.orientation.w = 1.0;
obj.primitive_poses.push_back(pose);

obj.operation = obj.ADD;

moveit::planning_interface::PlanningSceneInterface psi;
psi.applyCollisionObject(obj);
```

---

## 规划器对比

| 规划器 | 类型 | 特点 |
|--------|------|------|
| **OMPL/RRTConnect** | 采样 | 默认,快速找解 |
| **OMPL/RRTstar** | 采样 | 渐近最优 |
| **CHOMP** | 优化 | 平滑轨迹 |
| **STOMP** | 优化 | 处理硬约束 |
| **Pilz** | 工业 | 直线/圆弧/PTP |

---

## 调试

```bash
# 可视化规划场景
rviz2 -d moveit.rviz

# 查看规划组
ros2 topic echo /move_group/planning_scene

# 监控执行状态
ros2 topic echo /joint_trajectory_controller/state
```
