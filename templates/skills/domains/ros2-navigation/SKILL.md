---
name: ros2-navigation
description: ROS2 导航技能。Nav2 栈、SLAM、路径规划、costmap、全局/局部规划器。当用户提到 Nav2、SLAM、slam_toolbox、Cartographer、AMCL、costmap、规划器、navfn 时使用。
user-invocable: false
category: domain
---

# ROS2 导航技能

## 适用场景

机器人自主导航,从 SLAM 建图到 Nav2 路径规划。

### 触发关键词

- 导航 / Nav2 / navigation_stack
- SLAM / slam_toolbox / Cartographer / RTAB-Map
- 定位 / AMCL / 蒙特卡洛
- 地图 / map_server / OccupancyGrid
- 规划 / planner / Dijkstra / A* / DWB / Hybrid A*
- 代价地图 / costmap / 膨胀层 / 障碍层

---

## Nav2 栈架构

```
[BT Navigator] (行为树)
    ├── [Planner Server] (NavfnPlanner / SmacPlanner)
    ├── [Controller Server] (DWBController / RPP / MPPI)
    ├── [Recovery Server] (Spin / BackUp / Wait)
    └── [Costmap 2D] (Global + Local)
```

### 标准启动

```bash
ros2 launch nav2_bringup bringup_launch.py \
  map:=/path/to/map.yaml \
  use_sim_time:=false \
  params_file:=/path/to/nav2_params.yaml
```

### nav2_params.yaml 关键配置

```yaml
amcl:
  ros__parameters:
    use_sim_time: False
    alpha1: 0.2
    alpha2: 0.2
    base_frame_id: "base_footprint"
    odom_frame_id: "odom"
    global_frame_id: "map"
    laser_model_type: "likelihood_field"
    max_particles: 2000
    min_particles: 500

global_costmap:
  global_costmap:
    ros__parameters:
      update_frequency: 1.0
      publish_frequency: 1.0
      global_frame: map
      robot_base_frame: base_link
      robot_radius: 0.22
      resolution: 0.05
      plugins: ["static_layer", "obstacle_layer", "inflation_layer"]
      obstacle_layer:
        plugin: "nav2_costmap_2d::ObstacleLayer"
        observation_sources: scan
        scan:
          topic: /scan
          max_obstacle_height: 2.0
          clearing: True
          marking: True
          data_type: "LaserScan"
      inflation_layer:
        plugin: "nav2_costmap_2d::InflationLayer"
        cost_scaling_factor: 3.0
        inflation_radius: 0.55

planner_server:
  ros__parameters:
    planner_plugins: ["GridBased"]
    GridBased:
      plugin: "nav2_navfn_planner/NavfnPlanner"
      tolerance: 0.5
      use_astar: false
      allow_unknown: true

controller_server:
  ros__parameters:
    controller_frequency: 20.0
    controller_plugins: ["FollowPath"]
    FollowPath:
      plugin: "dwb_core::DWBLocalPlanner"
      min_vel_x: 0.0
      max_vel_x: 0.5
      max_vel_theta: 1.0
```

---

## SLAM 选型

| 工具 | 适用场景 | 特点 |
|------|----------|------|
| **slam_toolbox** | 2D 室内 | 在线建图 + 离线优化,推荐 |
| **Cartographer** | 2D/3D 室内外 | Google 维护,稳定 |
| **RTAB-Map** | 3D + 视觉 | 视觉惯性,大场景 |
| **LIO-SAM** | 3D 户外 | 激光 + IMU 紧耦合 |

### slam_toolbox 启动

```bash
ros2 launch slam_toolbox online_async_launch.py \
  use_sim_time:=false \
  params_file:=/path/to/mapper_params.yaml
```

### 保存地图

```bash
ros2 run nav2_map_server map_saver_cli -f my_map
```

---

## 行为树 (BT)

### 自定义行为节点

```xml
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <RecoveryNode number_of_retries="6" name="NavigateRecovery">
      <PipelineSequence name="NavigateWithReplanning">
        <RateController hz="1.0">
          <RecoveryNode number_of_retries="1" name="ComputePathToPose">
            <ComputePathToPose goal="{goal}" path="{path}" planner_id="GridBased"/>
            <ClearEntireCostmap name="ClearGlobalCostmap-Context"
                                 service_name="global_costmap/clear_entirely_global_costmap"/>
          </RecoveryNode>
        </RateController>
        <RecoveryNode number_of_retries="1" name="FollowPath">
          <FollowPath path="{path}" controller_id="FollowPath"/>
          <ClearEntireCostmap name="ClearLocalCostmap-Context"
                               service_name="local_costmap/clear_entirely_local_costmap"/>
        </RecoveryNode>
      </PipelineSequence>
    </RecoveryNode>
  </BehaviorTree>
</root>
```

---

## 程序化导航

### Nav2 Action Client

```python
from nav2_simple_commander.robot_navigator import BasicNavigator
from geometry_msgs.msg import PoseStamped

navigator = BasicNavigator()
navigator.waitUntilNav2Active()

goal = PoseStamped()
goal.header.frame_id = 'map'
goal.pose.position.x = 5.0
goal.pose.position.y = 3.0
goal.pose.orientation.w = 1.0

navigator.goToPose(goal)

while not navigator.isTaskComplete():
    feedback = navigator.getFeedback()
    print(f'Distance remaining: {feedback.distance_remaining}')
```

---

## 调试与可视化

```bash
# RViz2 with Nav2 plugin
rviz2 -d $(ros2 pkg prefix nav2_bringup)/share/nav2_bringup/rviz/nav2_default_view.rviz

# 查看代价地图
ros2 topic echo /global_costmap/costmap

# 检查 TF 树
ros2 run tf2_tools view_frames
```
