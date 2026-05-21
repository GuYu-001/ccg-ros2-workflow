# ROS2 仿真(Gazebo / Ignition)

## 选型

| 工具 | 别名 | 状态 |
|------|------|------|
| **Gazebo Classic** | gazebo, gazebo11 | EOL 2025,新项目不建议 |
| **Gazebo (Ignition rebrand)** | gz, gz-sim | **当前主流**,Humble 起推荐 |
| **Webots** | - | 适合教学,生态较小 |

ROS2 Humble + 物理机器人:**首选 Gazebo (Ignition rebrand)**。

## 启动 Gazebo + 机器人

### 标准 launch 模板

```python
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription, ExecuteProcess
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    pkg_share = FindPackageShare('my_robot')
    use_sim_time = LaunchConfiguration('use_sim_time', default='true')
    world = LaunchConfiguration('world')

    declare_world = DeclareLaunchArgument(
        'world',
        default_value=PathJoinSubstitution([pkg_share, 'worlds', 'empty.sdf']),
        description='SDF world file')

    # 1. 启动 Gazebo
    gazebo = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            PathJoinSubstitution([
                FindPackageShare('ros_gz_sim'), 'launch', 'gz_sim.launch.py'])),
        launch_arguments={'gz_args': [world, ' -r']}.items(),
    )

    # 2. robot_state_publisher(发布 TF + robot_description)
    robot_state_publisher = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        parameters=[{
            'robot_description': open(os.path.join(
                get_package_share_directory('my_robot'),
                'urdf', 'robot.urdf.xacro')).read(),
            'use_sim_time': use_sim_time,
        }],
    )

    # 3. spawn 机器人到 Gazebo
    spawn = Node(
        package='ros_gz_sim',
        executable='create',
        arguments=[
            '-name', 'my_robot',
            '-topic', 'robot_description',
            '-x', '0', '-y', '0', '-z', '0.1'
        ],
        output='screen',
    )

    # 4. ros_gz_bridge:GZ topic ↔ ROS2 topic
    bridge = Node(
        package='ros_gz_bridge',
        executable='parameter_bridge',
        arguments=[
            '/clock@rosgraph_msgs/msg/Clock[gz.msgs.Clock',
            '/cmd_vel@geometry_msgs/msg/Twist]gz.msgs.Twist',
            '/odom@nav_msgs/msg/Odometry[gz.msgs.Odometry',
            '/scan@sensor_msgs/msg/LaserScan[gz.msgs.LaserScan',
        ],
        output='screen',
    )

    return LaunchDescription([
        declare_world,
        gazebo,
        robot_state_publisher,
        spawn,
        bridge,
    ])
```

## ros_gz_bridge 桥接语法

```
<ros_topic>@<ros_type>[<gz_type>      # GZ → ROS(单向输入)
<ros_topic>@<ros_type>]<gz_type>      # ROS → GZ(单向输出)
<ros_topic>@<ros_type>@<gz_type>      # 双向
```

常用桥:

| ROS topic | ROS type | GZ type |
|-----------|----------|---------|
| `/clock` | `rosgraph_msgs/msg/Clock` | `gz.msgs.Clock` |
| `/cmd_vel` | `geometry_msgs/msg/Twist` | `gz.msgs.Twist` |
| `/odom` | `nav_msgs/msg/Odometry` | `gz.msgs.Odometry` |
| `/scan` | `sensor_msgs/msg/LaserScan` | `gz.msgs.LaserScan` |
| `/imu` | `sensor_msgs/msg/Imu` | `gz.msgs.IMU` |
| `/camera/image` | `sensor_msgs/msg/Image` | `gz.msgs.Image` |
| `/camera/camera_info` | `sensor_msgs/msg/CameraInfo` | `gz.msgs.CameraInfo` |
| `/joint_states` | `sensor_msgs/msg/JointState` | `gz.msgs.Model` |
| `/tf` | `tf2_msgs/msg/TFMessage` | `gz.msgs.Pose_V` |

## URDF / xacro 加载

```bash
# 验证 URDF
check_urdf <(xacro robot.urdf.xacro)

# 可视化关节树
urdf_to_graphiz robot.urdf
```

xacro 标签建议:
- `<material>` 抽到独立 xacro
- 关节参数(尺寸、惯量)用 xacro `<xacro:property>`
- Gazebo 插件标签 `<gazebo>` 集中放在 `gazebo.xacro`

## 时间同步(关键!)

仿真时所有节点必须 `use_sim_time: True`,否则 TF 错位:

```python
# 全 launch 顶层声明
use_sim_time = LaunchConfiguration('use_sim_time', default='true')

# 每个节点都传
parameters=[..., {'use_sim_time': use_sim_time}]
```

CLI 校验:
```bash
ros2 param get /controller use_sim_time
# 应返回 True
ros2 topic echo /clock --once
# 仿真时间应该在跑
```

## ros2_control + Gazebo

`my_robot.urdf.xacro`:
```xml
<ros2_control name="GazeboSystem" type="system">
  <hardware>
    <plugin>gz_ros2_control/GazeboSimSystem</plugin>
  </hardware>
  <joint name="left_wheel_joint">
    <command_interface name="velocity"/>
    <state_interface name="position"/>
    <state_interface name="velocity"/>
  </joint>
</ros2_control>

<gazebo>
  <plugin name="gz_ros2_control" filename="gz_ros2_control-system">
    <parameters>$(find my_robot)/config/controllers.yaml</parameters>
  </plugin>
</gazebo>
```

`config/controllers.yaml`:
```yaml
controller_manager:
  ros__parameters:
    update_rate: 50
    diff_drive_controller:
      type: diff_drive_controller/DiffDriveController
    joint_state_broadcaster:
      type: joint_state_broadcaster/JointStateBroadcaster
```

## 录制 / 回放仿真数据

```bash
# 录制(包括 /tf, /scan, 等)
ros2 bag record -o sim_run /tf /tf_static /scan /odom /cmd_vel

# 回放(用作测试基线)
ros2 bag play sim_run --clock
```

## 反模式

| 反模式 | 后果 |
|--------|------|
| 真机 launch 和仿真 launch 共用一份 | 仿真插件污染真机 |
| 不传 `use_sim_time` | TF 时间漂移、传感器数据错位 |
| `/dev/ttyUSB0` 在仿真里出现 | 仿真节点找不到真硬件直接挂 |
| spawn 时 `-z 0` | 机器人陷在地下,关节穿模 |
| ros_gz_bridge 用错方向 | 数据不通,没有报错 |
| Gazebo Classic 与 ros_gz_bridge 混用 | 完全不兼容 |

## 推荐项目结构

```
my_robot/
├── launch/
│   ├── real.launch.py        # 真机
│   ├── sim.launch.py         # 仿真
│   ├── common.launch.py      # 公共部分
│   └── rviz.launch.py
├── urdf/
│   ├── robot.urdf.xacro
│   ├── gazebo.xacro
│   └── ros2_control.xacro
├── worlds/
│   └── empty.sdf
├── config/
│   ├── params.yaml
│   └── controllers.yaml
├── rviz/
│   ├── view.rviz
│   └── nav.rviz
└── package.xml
```
