---
name: ros2-hardware
description: ROS2 硬件集成技能。串口、CAN 总线、I2C/SPI、传感器驱动、udev 规则、权限配置。当用户提到串口、CAN、Modbus、ttyUSB、ttyACM、udev、设备权限、硬件抽象时使用。
user-invocable: false
category: domain
---

# ROS2 硬件集成技能

## 适用场景

物理机器人硬件接入,涉及驱动开发、协议解析、设备权限。

### 触发关键词

- 串口 / Serial / RS232 / RS485 / ttyUSB / ttyACM
- CAN / SocketCAN / can0 / candump / cansend
- I2C / SPI / GPIO
- USB / udev / 设备权限
- Modbus / Modbus RTU / Modbus TCP

---

## 串口通信

### ROS2 推荐库:`serial_driver` (transport_drivers)

```cpp
#include <io_context/io_context.hpp>
#include <serial_driver/serial_driver.hpp>

using drivers::common::IoContext;
using drivers::serial_driver::SerialDriver;
using drivers::serial_driver::SerialPortConfig;

IoContext ctx(2);
SerialPortConfig config(115200,  // baud_rate
                        drivers::serial_driver::FlowControl::NONE,
                        drivers::serial_driver::Parity::NONE,
                        drivers::serial_driver::StopBits::ONE);
auto driver = std::make_unique<SerialDriver>(ctx);
driver->init_port("/dev/ttyUSB0", config);
driver->port()->open();

driver->port()->async_receive([](const std::vector<uint8_t>& buffer, size_t bytes_transferred) {
  // 处理接收数据
});

std::vector<uint8_t> data{0xAA, 0x55};
driver->port()->async_send(data);
```

### 简单方案:Python pyserial

```python
import serial

ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=1.0)
ser.write(b'\xAA\x55')
data = ser.read(8)
ser.close()
```

---

## CAN 总线

### SocketCAN 配置

```bash
# 启用 CAN0
sudo ip link set can0 up type can bitrate 1000000

# 检查状态
ip -details link show can0

# 抓包调试
candump can0
cansend can0 100#1122334455667788
```

### ROS2 推荐:`ros2_socketcan`

```bash
ros2 launch ros2_socketcan socket_can_bridge.launch.xml \
  interface:=can0
```

发布的话题:
- `/from_can_bus` (can_msgs/Frame): 接收的 CAN 帧
- `/to_can_bus` (can_msgs/Frame): 发送的 CAN 帧

### C++ SocketCAN 直接调用

```cpp
#include <linux/can.h>
#include <linux/can/raw.h>
#include <sys/ioctl.h>
#include <net/if.h>

int sock = socket(PF_CAN, SOCK_RAW, CAN_RAW);
struct ifreq ifr;
strcpy(ifr.ifr_name, "can0");
ioctl(sock, SIOCGIFINDEX, &ifr);

struct sockaddr_can addr = {};
addr.can_family = AF_CAN;
addr.can_ifindex = ifr.ifr_ifindex;
bind(sock, (struct sockaddr*)&addr, sizeof(addr));

struct can_frame frame;
read(sock, &frame, sizeof(frame));  // 阻塞接收
```

---

## udev 规则(关键!)

避免 `/dev/ttyUSB0` 编号变化导致驱动失效。

### 创建规则文件

```bash
sudo nano /etc/udev/rules.d/99-my-robot.rules
```

```
# RPLidar A2
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", \
  MODE="0666", SYMLINK+="rplidar"

# 电机驱动
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", \
  ATTRS{serial}=="A12345", MODE="0666", SYMLINK+="motor_driver"
```

### 重载规则

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
ls -l /dev/rplidar  # 验证 symlink
```

### 查询设备信息

```bash
# 查看 USB 设备 vendor/product ID
lsusb

# 查看串口完整属性
udevadm info -a -n /dev/ttyUSB0
```

---

## 设备权限

### 添加用户到 dialout 组(串口)

```bash
sudo usermod -aG dialout $USER
# 重新登录生效
```

### CAN 用户权限

```bash
sudo usermod -aG can $USER
# 或在 udev 规则中设置 GROUP="can"
```

---

## I2C / SPI

### Linux i2c-tools

```bash
sudo apt install i2c-tools
i2cdetect -y 1   # 扫描总线 1
i2cget -y 1 0x68 0x75   # 读寄存器
i2cset -y 1 0x68 0x6B 0x00   # 写寄存器
```

### ROS2 节点示例 (libi2c-dev)

```cpp
#include <fcntl.h>
#include <linux/i2c-dev.h>
#include <sys/ioctl.h>

int fd = open("/dev/i2c-1", O_RDWR);
ioctl(fd, I2C_SLAVE, 0x68);  // IMU 地址

uint8_t reg = 0x3B;
write(fd, &reg, 1);
uint8_t buf[14];
read(fd, buf, 14);
```

---

## 硬件抽象层 (HAL) 设计

### 接口模式

```cpp
class HardwareInterface {
public:
  virtual ~HardwareInterface() = default;
  virtual bool connect() = 0;
  virtual bool disconnect() = 0;
  virtual bool read(uint8_t* data, size_t len) = 0;
  virtual bool write(const uint8_t* data, size_t len) = 0;
};

class SerialHardware : public HardwareInterface { /* ... */ };
class CanHardware : public HardwareInterface { /* ... */ };
```

### 错误处理

```cpp
class HardwareDriver : public rclcpp::Node {
private:
  void publish_diagnostic() {
    diagnostic_msgs::msg::DiagnosticStatus status;
    status.name = "Motor Driver";
    if (!hw_->is_connected()) {
      status.level = DiagnosticStatus::ERROR;
      status.message = "Hardware disconnected";
    } else {
      status.level = DiagnosticStatus::OK;
    }
    diag_pub_->publish(status);
  }

  // 自动重连
  void reconnect_loop() {
    if (!hw_->is_connected()) {
      RCLCPP_WARN(this->get_logger(), "Reconnecting...");
      hw_->connect();
    }
  }
};
```

---

## 调试工具

```bash
# 串口
sudo apt install minicom screen
screen /dev/ttyUSB0 115200

# CAN
sudo apt install can-utils
candump -tz can0
cangen can0 -v   # 生成测试帧

# 系统设备
dmesg | tail   # 查看插拔日志
udevadm monitor   # 实时监控 udev 事件
```

---

## 安全清单

- [ ] udev 规则避免设备编号漂移
- [ ] 软件层面的硬件超时检测
- [ ] 自动重连逻辑
- [ ] 硬件诊断话题 `/diagnostics`
- [ ] 急停按钮独立硬件回路(不经软件)
- [ ] 看门狗定时器(硬件级)
