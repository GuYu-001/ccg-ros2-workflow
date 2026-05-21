---
name: ros2-control
description: ROS2 控制技能。PID 控制、轨迹跟踪、电机驱动、ros2_control 框架、生命周期节点。当用户提到控制器、PID、MPC、LQR、轨迹跟踪、ros2_control、电机、伺服时使用。
user-invocable: false
category: domain
---

# ROS2 控制技能

## 适用场景

机器人执行层开发,实现各种控制算法和电机驱动。

### 触发关键词

- 控制器 / Controller / PID / MPC / LQR
- 轨迹跟踪 / 路径跟随 / Pure Pursuit / Stanley
- 电机驱动 / 伺服控制 / 编码器 / 闭环
- ros2_control / controller_manager / hardware_interface

---

## ros2_control 框架

### 架构

```
[Controller Manager]
    ├── [Hardware Interface] → 物理硬件 (CAN/Modbus/Serial)
    └── [Controllers] → diff_drive_controller / joint_trajectory_controller
```

### 配置示例

```yaml
# config/controllers.yaml
controller_manager:
  ros__parameters:
    update_rate: 100  # Hz

    diff_drive_controller:
      type: diff_drive_controller/DiffDriveController

    joint_state_broadcaster:
      type: joint_state_broadcaster/JointStateBroadcaster

diff_drive_controller:
  ros__parameters:
    left_wheel_names: ["left_wheel_joint"]
    right_wheel_names: ["right_wheel_joint"]
    wheel_separation: 0.3
    wheel_radius: 0.05
    publish_rate: 50.0
    odom_frame_id: odom
    base_frame_id: base_link
    enable_odom_tf: true
    cmd_vel_timeout: 0.5
```

---

## PID 控制器

### 基础实现

```cpp
class PIDController {
public:
  PIDController(double kp, double ki, double kd, double dt)
    : kp_(kp), ki_(ki), kd_(kd), dt_(dt) 

  double compute(double setpoint, double measurement) {
    double error = setpoint - measurement;
    integral_ += error * dt_;
    integral_ = std::clamp(integral_, -i_max_, i_max_);  // 抗饱和
    double derivative = (error - prev_error_) / dt_;
    prev_error_ = error;
    return kp_ * error + ki_ * integral_ + kd_ * derivative;
  }

private:
  double kp_, ki_, kd_, dt_;
  double integral_ = 0.0;
  double prev_error_ = 0.0;
  double i_max_ = 1.0;
};
```

### ROS2 PID 节点模板

```cpp
class VelocityController : public rclcpp::Node {
public:
  VelocityController() : Node("velocity_controller") {
    // 参数声明
    this->declare_parameter("kp", 1.0);
    this->declare_parameter("ki", 0.1);
    this->declare_parameter("kd", 0.01);

    pid_ = std::make_unique<PIDController>(
      this->get_parameter("kp").as_double(),
      this->get_parameter("ki").as_double(),
      this->get_parameter("kd").as_double(),
      0.01);

    // 100Hz 控制循环
    timer_ = this->create_wall_timer(
      std::chrono::milliseconds(10),
      std::bind(&VelocityController::control_loop, this));
  }

private:
  void control_loop() {
    double output = pid_->compute(target_velocity_, current_velocity_);
    publish_motor_cmd(output);
  }
};
```

---

## 轨迹跟踪

### Pure Pursuit 算法

```cpp
geometry_msgs::msg::Twist computePurePursuit(
    const geometry_msgs::msg::Pose& current,
    const std::vector<geometry_msgs::msg::Point>& path,
    double lookahead_distance) {

  // 1. 找到前瞻点
  auto target = findLookaheadPoint(current, path, lookahead_distance);

  // 2. 计算转向角
  double dx = target.x - current.position.x;
  double dy = target.y - current.position.y;
  double yaw = quaternionToYaw(current.orientation);

  double target_angle = std::atan2(dy, dx) - yaw;
  double curvature = 2.0 * std::sin(target_angle) / lookahead_distance;

  // 3. 输出速度指令
  geometry_msgs::msg::Twist cmd;
  cmd.linear.x = max_speed_;
  cmd.angular.z = curvature * cmd.linear.x;
  return cmd;
}
```

---

## 电机通信协议

### CAN 总线 (SocketCAN)

```cpp
#include <linux/can.h>
#include <sys/socket.h>

int can_socket_ = socket(PF_CAN, SOCK_RAW, CAN_RAW);
struct sockaddr_can addr = {};
addr.can_family = AF_CAN;
strcpy(ifr.ifr_name, "can0");
ioctl(can_socket_, SIOCGIFINDEX, &ifr);
addr.can_ifindex = ifr.ifr_ifindex;
bind(can_socket_, (struct sockaddr*)&addr, sizeof(addr));

struct can_frame frame;
frame.can_id = 0x100;
frame.can_dlc = 8;
// fill frame.data[]
write(can_socket_, &frame, sizeof(frame));
```

### Modbus RTU (libmodbus)

```cpp
modbus_t* ctx = modbus_new_rtu("/dev/ttyUSB0", 115200, 'N', 8, 1);
modbus_set_slave(ctx, 1);
modbus_connect(ctx);

uint16_t regs[2];
modbus_write_registers(ctx, 0x100, 2, regs);
modbus_read_registers(ctx, 0x200, 2, regs);
```

---

## 关键 QoS 策略

| 数据类型 | Reliability | Durability | History | Depth |
|----------|-------------|------------|---------|-------|
| /cmd_vel | Reliable | Volatile | Keep Last | 10 |
| /odom | Reliable | Volatile | Keep Last | 10 |
| 关节状态 | Reliable | Volatile | Keep Last | 10 |
| 紧急停止 | Reliable | Transient Local | Keep Last | 1 |

---

## 安全注意事项

- **超时保护**: cmd_vel 超过 0.5s 未更新 → 自动停止
- **速度限制**: 软件限速 + 硬件限速双保险
- **急停按钮**: 独立硬件回路,不依赖软件
- **看门狗**: 控制循环失活 → 触发硬件保护
