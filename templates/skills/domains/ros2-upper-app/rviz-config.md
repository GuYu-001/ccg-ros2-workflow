# RViz2 配置

## 何时用

- 调试感知:看 LiDAR 点云、相机图像、TF 树
- 调试导航:看 costmap、规划路径、定位粒子云
- 调试机械臂:看关节状态、规划场景、轨迹

## 创建配置文件流程

1. 启动 RViz2:`rviz2`
2. 手动添加 Display(LaserScan, TF, RobotModel, etc.),设置好
3. `File → Save Config As` → 保存到 `<pkg>/rviz/<name>.rviz`
4. 在 launch 中引用

## 在 launch 中启动 RViz

```python
Node(
    package='rviz2',
    executable='rviz2',
    name='rviz2',
    arguments=['-d', PathJoinSubstitution([
        FindPackageShare('my_robot'), 'rviz', 'view.rviz'
    ])],
    parameters=[{'use_sim_time': use_sim_time}],
    condition=IfCondition(LaunchConfiguration('use_rviz')),
    output='screen',
)
```

## 关键 Display 配置

| Display | 用途 | 必填字段 |
|---------|------|----------|
| **TF** | 坐标系树 | 无 — 自动订阅 `/tf`, `/tf_static` |
| **RobotModel** | 显示机器人 3D 模型 | `Description Topic`(默认 `/robot_description`) |
| **LaserScan** | 显示 2D 激光 | `Topic`(如 `/scan`),`Size`(像素或米) |
| **PointCloud2** | 显示 3D 点云 | `Topic`,`Style`(Points/Boxes/Spheres),`Color Transformer`(Intensity / Z-axis / Flat) |
| **Image** | 显示相机 | `Topic`(如 `/camera/image_raw`) |
| **Map** | 占据栅格地图 | `Topic`(如 `/map`),`Color Scheme`(map / costmap / raw) |
| **Path** | 路径(规划/历史) | `Topic` |
| **MarkerArray** | 自定义可视化 | `Topic` |
| **PoseArray** | AMCL 粒子云 | `Topic`(如 `/particle_cloud`) |

## QoS 兼容性

RViz2 默认订阅是 **Reliable + Volatile**,但许多传感器流是 **Best Effort**。
如果 RViz 收不到话题数据:

1. 在 Display 的 `Topic` 下展开 `Reliability Policy`
2. 切换到 `Best Effort` 或 `Reliable` 匹配发布端

## Fixed Frame(关键)

```
Global Options → Fixed Frame → "map"  # 通常是 map / odom / base_link
```

- 选错会报 `For frame [...]: No transform from [...] to [map]`
- 多机器人场景:全局 fixed frame 用 `map`,各机器人本地用 `<robot>/base_link`

## .rviz 文件结构(YAML)

```yaml
Panels:
  - Class: rviz_common/Displays
    Name: Displays
  - Class: rviz_common/Tool Properties
    Name: Tool Properties

Visualization Manager:
  Class: ""
  Displays:
    - Alpha: 1
      Class: rviz_default_plugins/RobotModel
      Description File: ""
      Description Source: Topic
      Description Topic:
        Depth: 5
        Durability Policy: Volatile
        History Policy: Keep Last
        Reliability Policy: Reliable
        Value: /robot_description
      Enabled: true
      Name: RobotModel

    - Alpha: 1
      Class: rviz_default_plugins/LaserScan
      Color: 255; 255; 255
      Topic:
        Depth: 5
        Durability Policy: Volatile
        Reliability Policy: Best Effort
        Value: /scan
      Enabled: true
      Name: LaserScan
      Size (m): 0.05

  Global Options:
    Background Color: 48; 48; 48
    Fixed Frame: map
    Frame Rate: 30
```

## 多视角配置

不同任务用不同 .rviz 文件,通过 launch 参数切换:

```python
DeclareLaunchArgument('rviz_config', default_value='view.rviz',
    description='RViz config: view.rviz / nav.rviz / moveit.rviz')

Node(
    package='rviz2', executable='rviz2',
    arguments=['-d', PathJoinSubstitution([
        FindPackageShare('my_robot'), 'rviz',
        LaunchConfiguration('rviz_config')
    ])],
)
```

## install 配置

ament_cmake `CMakeLists.txt`:
```cmake
install(DIRECTORY rviz DESTINATION share/${PROJECT_NAME})
```

ament_python `setup.py`:
```python
data_files=[
    (os.path.join('share', package_name, 'rviz'), glob('rviz/*.rviz')),
],
```

## 调试技巧

### 找不到 TF
```bash
ros2 run tf2_tools view_frames    # 生成 frames.pdf
ros2 run tf2_ros tf2_echo map base_link  # 直接打印
```

### 找不到 robot_description
```bash
ros2 topic echo /robot_description --once | head -5
ros2 param get /robot_state_publisher robot_description
```

### 点云看不见
- 检查 `Color Transformer`(默认 `Intensity` 时若 PCL 无 intensity 字段会全黑)
- 改成 `Z-axis` 或 `Flat Color`

### 卡顿
- `MarkerArray` 几千个 marker → 改用 `MeshResource`
- `PointCloud2` 百万点 → 在发布端体素降采样
- 关闭不用的 Display
