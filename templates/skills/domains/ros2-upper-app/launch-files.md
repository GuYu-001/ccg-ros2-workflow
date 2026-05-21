# ROS2 Launch 文件编排

## 何时使用

- 启动单节点(`Node`)
- 多节点编排,带启动顺序、条件、重映射
- 复用其他 launch 文件(`IncludeLaunchDescription`)
- 接收命令行参数 / 从 YAML 读取参数

## 标准 launch.py 模板

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription, GroupAction
from launch.conditions import IfCondition, UnlessCondition
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution, TextSubstitution
from launch_ros.actions import Node, PushRosNamespace
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    pkg_share = FindPackageShare('my_robot')

    use_sim_time = LaunchConfiguration('use_sim_time')
    namespace = LaunchConfiguration('namespace')
    params_file = LaunchConfiguration('params_file')

    declare_use_sim_time = DeclareLaunchArgument(
        'use_sim_time', default_value='false',
        description='Use simulation (Gazebo) clock if true')

    declare_namespace = DeclareLaunchArgument(
        'namespace', default_value='',
        description='Top-level namespace')

    declare_params = DeclareLaunchArgument(
        'params_file',
        default_value=PathJoinSubstitution([pkg_share, 'config', 'params.yaml']),
        description='Full path to the ROS2 parameters file')

    bringup_group = GroupAction([
        PushRosNamespace(namespace),

        Node(
            package='my_robot',
            executable='controller_node',
            name='controller',
            parameters=[params_file, {'use_sim_time': use_sim_time}],
            remappings=[
                ('/cmd_vel', 'cmd_vel'),
                ('/odom', 'odom'),
            ],
            output='screen',
            emulate_tty=True,
        ),

        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(
                PathJoinSubstitution([pkg_share, 'launch', 'sensors.launch.py'])),
            launch_arguments={
                'use_sim_time': use_sim_time,
            }.items(),
        ),
    ])

    return LaunchDescription([
        declare_use_sim_time,
        declare_namespace,
        declare_params,
        bringup_group,
    ])
```

## 关键 API

### Node 参数

| 参数 | 用途 |
|------|------|
| `package` | ament 包名 |
| `executable` | `setup.py` 中 console_scripts 名,或 C++ 可执行文件名 |
| `name` | 节点运行时名(不写则用代码里的名) |
| `namespace` | 节点的 ROS namespace |
| `parameters` | 列表:dict / yaml 文件路径都可以 |
| `remappings` | `[(from, to), ...]` |
| `arguments` | 透传给 `argv` |
| `respawn` | 崩溃自动重启 |
| `output` | `screen`(打印到终端)/ `log`(写入日志) |
| `emulate_tty` | 让 RCLCPP_INFO 等日志保留颜色 |

### 路径替换(永远不要硬编码)

```python
# ❌ 错误
params=['/opt/ros/humble/share/my_pkg/config/params.yaml']

# ✅ 正确
PathJoinSubstitution([
    FindPackageShare('my_pkg'), 'config', 'params.yaml'
])
```

## 条件启动

```python
from launch.conditions import IfCondition, UnlessCondition

Node(
    package='rviz2', executable='rviz2',
    condition=IfCondition(LaunchConfiguration('use_rviz')),
)

# CLI: ros2 launch my_robot bringup.launch.py use_rviz:=true
```

## 启动顺序与延迟

```python
from launch.actions import TimerAction
from launch.event_handlers import OnProcessStart
from launch.actions import RegisterEventHandler

# 方案 A: 固定延时(简单但不优雅)
TimerAction(period=2.0, actions=[
    Node(package='nav2_bringup', executable='bringup_launcher')
])

# 方案 B: 事件驱动(推荐)
RegisterEventHandler(
    OnProcessStart(
        target_action=robot_state_publisher_node,
        on_start=[
            Node(package='controller_manager', executable='spawner',
                 arguments=['joint_state_broadcaster'])
        ]
    )
)
```

## 包含其他 launch

### Python launch

```python
IncludeLaunchDescription(
    PythonLaunchDescriptionSource(
        PathJoinSubstitution([FindPackageShare('nav2_bringup'),
                              'launch', 'bringup_launch.py'])),
    launch_arguments={'use_sim_time': 'true'}.items(),
)
```

### XML launch(老式)

```python
from launch.launch_description_sources import FrontendLaunchDescriptionSource

IncludeLaunchDescription(
    FrontendLaunchDescriptionSource(
        PathJoinSubstitution([FindPackageShare('legacy_pkg'),
                              'launch', 'old.launch.xml']))
)
```

## 多机器人 / 命名空间

```python
robots = [
    {'name': 'robot1', 'x': '0', 'y': '0'},
    {'name': 'robot2', 'x': '2', 'y': '0'},
]

actions = []
for r in robots:
    actions.append(GroupAction([
        PushRosNamespace(r['name']),
        Node(package='my_robot', executable='controller', name='controller'),
    ]))
```

## install 配置(否则 launch 找不到)

`CMakeLists.txt`(ament_cmake 包):
```cmake
install(DIRECTORY launch config rviz urdf
        DESTINATION share/${PROJECT_NAME})
```

`setup.py`(ament_python 包):
```python
data_files=[
    ('share/' + package_name, ['package.xml']),
    (os.path.join('share', package_name, 'launch'),
        glob('launch/*.launch.py')),
    (os.path.join('share', package_name, 'config'),
        glob('config/*.yaml')),
],
```

## 调试

```bash
# 列出所有可用 launch
ros2 pkg list | xargs -I{} ros2 launch --show-args {} 2>/dev/null

# 看 launch 实际展开成什么节点
ros2 launch my_robot bringup.launch.py --show-args

# 启动后查看节点拓扑
ros2 node list
ros2 node info /controller
ros2 topic list -t
```

## 常见反模式

| 反模式 | 问题 | 修复 |
|--------|------|------|
| 路径硬编码 | 装载到其他机器或 colcon 构建后失效 | `FindPackageShare` |
| 参数散落 launch 各处 | 难以从外部覆盖,难审计 | 集中到 `config/*.yaml` |
| 节点重启策略缺失 | 单节点崩溃整个系统挂 | `respawn=True` + 上限 |
| `use_sim_time` 不传递 | 仿真时间不一致,TF 错乱 | 顶层 LaunchConfiguration 透传到所有 Node |
| 多 launch 重复 declare 同名参数 | 后者覆盖前者,行为难以预测 | 顶层 declare,子 launch 通过 launch_arguments 接收 |
