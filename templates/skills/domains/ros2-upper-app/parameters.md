# ROS2 参数体系

## 参数三层模型

```
[CLI / launch override]   最高优先级
     ↓
[YAML params_file]        中等
     ↓
[declare_parameter 默认值] 最低
```

## YAML 标准格式

### 节点完整名(/ namespace + 节点名)

```yaml
# config/params.yaml
controller:
  ros__parameters:
    max_speed: 1.0
    safe_distance: 0.5
    enabled_features:
      - lidar
      - imu

/robot1/controller:
  ros__parameters:
    max_speed: 0.8

# 通配符(rclcpp_components / 多节点共享)
"/**":
  ros__parameters:
    use_sim_time: false
```

### 嵌套参数(reflected as dotted keys)

```yaml
controller:
  ros__parameters:
    pid:
      kp: 1.0
      ki: 0.1
      kd: 0.01
```

代码中读:`this->get_parameter("pid.kp")`

## 节点端声明

### C++

```cpp
class Controller : public rclcpp::Node {
public:
  Controller() : Node("controller") {
    this->declare_parameter<double>("max_speed", 1.0);
    this->declare_parameter<double>("safe_distance", 0.5);
    this->declare_parameter<std::vector<std::string>>("enabled_features", {});

    max_speed_ = this->get_parameter("max_speed").as_double();
    enabled_ = this->get_parameter("enabled_features").as_string_array();

    // 监听运行时变化
    param_cb_handle_ = this->add_on_set_parameters_callback(
      [this](const std::vector<rclcpp::Parameter>& params) {
        rcl_interfaces::msg::SetParametersResult result;
        result.successful = true;
        for (const auto& p : params) {
          if (p.get_name() == "max_speed") {
            if (p.as_double() < 0) {
              result.successful = false;
              result.reason = "max_speed must be >= 0";
            } else {
              max_speed_ = p.as_double();
            }
          }
        }
        return result;
      });
  }

private:
  double max_speed_;
  std::vector<std::string> enabled_;
  OnSetParametersCallbackHandle::SharedPtr param_cb_handle_;
};
```

### Python

```python
from rcl_interfaces.msg import SetParametersResult

class Controller(Node):
    def __init__(self):
        super().__init__('controller')

        self.declare_parameter('max_speed', 1.0)
        self.declare_parameter('safe_distance', 0.5)
        self.declare_parameter('enabled_features', [])

        self.max_speed = self.get_parameter('max_speed').value

        self.add_on_set_parameters_callback(self.on_param_change)

    def on_param_change(self, params):
        for p in params:
            if p.name == 'max_speed':
                if p.value < 0:
                    return SetParametersResult(
                        successful=False, reason='must be >= 0')
                self.max_speed = p.value
        return SetParametersResult(successful=True)
```

## 参数描述符(强约束 + 文档化)

```cpp
auto descriptor = rcl_interfaces::msg::ParameterDescriptor();
descriptor.description = "Maximum linear speed in m/s";

rcl_interfaces::msg::FloatingPointRange range;
range.from_value = 0.0;
range.to_value = 5.0;
descriptor.floating_point_range.push_back(range);

this->declare_parameter("max_speed", 1.0, descriptor);
```

效果:`ros2 param set` 超出 [0, 5] 直接拒绝。

## CLI 操作

```bash
# 列出节点参数
ros2 param list /controller

# 读
ros2 param get /controller max_speed

# 写
ros2 param set /controller max_speed 0.8

# 整体 dump
ros2 param dump /controller > current.yaml

# 整体 load
ros2 param load /controller params.yaml
```

## 在 Launch 中加载

```python
Node(
    package='my_robot',
    executable='controller_node',
    name='controller',
    parameters=[
        # 1. 来自 YAML
        PathJoinSubstitution([FindPackageShare('my_robot'),
                              'config', 'params.yaml']),
        # 2. 命令行覆盖单项
        {'max_speed': LaunchConfiguration('max_speed')},
        # 3. 强制 use_sim_time
        {'use_sim_time': use_sim_time},
    ],
)
```

注意:**列表后面的覆盖前面的**。

## 命名约定

| 类型 | 风格 |
|------|------|
| 简单标量 | `snake_case`: `max_speed` |
| 嵌套组 | `pid.kp`, `pid.ki` |
| 频率 | `update_rate_hz` (单位写在名里) |
| 启用开关 | `enable_<feature>` 或 `<feature>.enabled` |
| 阈值 | `min_<x>` / `max_<x>` / `<x>_threshold` |

## 反模式

| 反模式 | 后果 |
|--------|------|
| 不 declare 直接 get | 抛 `ParameterNotDeclaredException` |
| 在构造函数读完就忘了 | 运行时改参数无效 — 用 set 回调 |
| 不同节点参数命名风格混乱 | 难维护、难审计 |
| 把硬件路径写死(`/dev/ttyUSB0`) | udev 编号变化即崩 — 改成参数 + udev rules |
| 把超大数据(图像、点云)塞参数 | 参数服务器不是为大数据设计的 — 用 topic |
