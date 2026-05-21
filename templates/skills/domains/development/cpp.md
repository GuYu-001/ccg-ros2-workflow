---
name: cpp
description: C/C++ 开发(含 ROS2 C++ 节点)。系统编程、性能优化、内存管理、ROS2 节点开发。当用户提到 C、C++、CMake、内存、指针、ROS2、rclcpp、生命周期节点时使用。
---

# 📜 符箓秘典 · C/C++(ROS2 增强版)

## ROS2 C++ 开发上下文(底层控制核心)

ROS2 项目中,C++ 节点承担**底层控制**职责:硬件驱动、实时控制算法、关键性能路径。

### rclcpp 核心模式

```cpp
#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/laser_scan.hpp>
#include <geometry_msgs/msg/twist.hpp>

class MotorDriverNode : public rclcpp::Node {
public:
  MotorDriverNode() : Node("motor_driver") {
    // QoS 策略:控制指令需要 Reliable
    auto qos = rclcpp::QoS(10).reliable();

    cmd_sub_ = this->create_subscription<geometry_msgs::msg::Twist>(
      "cmd_vel", qos,
      [this](const geometry_msgs::msg::Twist::SharedPtr msg) {
        this->cmd_callback(msg);
      });

    odom_pub_ = this->create_publisher<nav_msgs::msg::Odometry>("odom", qos);

    // 高频控制循环 (100Hz)
    timer_ = this->create_wall_timer(
      std::chrono::milliseconds(10),
      std::bind(&MotorDriverNode::control_loop, this));
  }

private:
  rclcpp::Subscription<geometry_msgs::msg::Twist>::SharedPtr cmd_sub_;
  rclcpp::Publisher<nav_msgs::msg::Odometry>::SharedPtr odom_pub_;
  rclcpp::TimerBase::SharedPtr timer_;
};
```

### 生命周期节点 (Lifecycle Node)

适用场景:硬件驱动、需要状态管理的关键节点。

```cpp
#include <rclcpp_lifecycle/lifecycle_node.hpp>

class LidarDriver : public rclcpp_lifecycle::LifecycleNode {
public:
  CallbackReturn on_configure(const rclcpp_lifecycle::State&) {
    // 初始化硬件连接
    return CallbackReturn::SUCCESS;
  }

  CallbackReturn on_activate(const rclcpp_lifecycle::State&) {
    // 启动数据采集
    return CallbackReturn::SUCCESS;
  }

  CallbackReturn on_deactivate(const rclcpp_lifecycle::State&) {
    // 停止数据采集,保留连接
    return CallbackReturn::SUCCESS;
  }
};
```

### CMakeLists.txt 标准模板

```cmake
cmake_minimum_required(VERSION 3.8)
project(my_robot_driver)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic -O2)
endif()

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)

add_executable(motor_driver src/motor_driver.cpp)
ament_target_dependencies(motor_driver
  rclcpp sensor_msgs geometry_msgs)

install(TARGETS motor_driver DESTINATION lib/${PROJECT_NAME})

ament_package()
```

### ROS2 实时性约束

| 场景 | 推荐策略 |
|------|----------|
| 控制循环 (>= 100Hz) | wall_timer + 独立 callback group + Reentrant |
| 传感器数据 | Best Effort QoS,丢包优于阻塞 |
| 关键控制指令 | Reliable QoS,深度 10 |
| 配置参数 | Transient Local,新订阅者获取最新 |

### 线程安全(多回调场景)

```cpp
// 使用 mutex 保护共享状态
std::mutex state_mutex_;
geometry_msgs::msg::Twist current_cmd_;

void cmd_callback(const geometry_msgs::msg::Twist::SharedPtr msg) {
  std::lock_guard<std::mutex> lock(state_mutex_);
  current_cmd_ = *msg;
}

void control_loop() {
  geometry_msgs::msg::Twist cmd;
  {
    std::lock_guard<std::mutex> lock(state_mutex_);
    cmd = current_cmd_;
  }
  // 使用 cmd 计算控制量
}
```

---

## 通用 C++ 知识(以下保持原样)


## 现代 C++ (C++17/20)

### 智能指针
```cpp
#include <memory>

// unique_ptr - 独占所有权
auto ptr = std::make_unique<MyClass>(args);
ptr->method();

// shared_ptr - 共享所有权
auto shared = std::make_shared<MyClass>(args);
auto copy = shared;  // 引用计数 +1

// weak_ptr - 弱引用，不增加引用计数
std::weak_ptr<MyClass> weak = shared;
if (auto locked = weak.lock()) {
    locked->method();
}
```

### 容器与算法
```cpp
#include <vector>
#include <algorithm>
#include <ranges>

std::vector<int> nums = {1, 2, 3, 4, 5};

// 范围 for
for (const auto& n : nums) {
    std::cout << n << std::endl;
}

// 算法
auto it = std::find(nums.begin(), nums.end(), 3);
std::sort(nums.begin(), nums.end());

// C++20 Ranges
auto even = nums | std::views::filter([](int n) { return n % 2 == 0; });
auto squared = nums | std::views::transform([](int n) { return n * n; });
```

### Lambda 表达式
```cpp
// 基础 lambda
auto add = [](int a, int b) { return a + b; };

// 捕获
int x = 10;
auto capture_val = [x]() { return x; };      // 值捕获
auto capture_ref = [&x]() { return x; };     // 引用捕获
auto capture_all = [=]() { return x; };      // 全部值捕获
auto capture_all_ref = [&]() { return x; };  // 全部引用捕获

// 泛型 lambda (C++14)
auto generic = [](auto a, auto b) { return a + b; };
```

### 并发编程
```cpp
#include <thread>
#include <mutex>
#include <future>

// 线程
std::thread t([]() {
    std::cout << "Hello from thread" << std::endl;
});
t.join();

// 互斥锁
std::mutex mtx;
{
    std::lock_guard<std::mutex> lock(mtx);
    // 临界区
}

// async/future
auto future = std::async(std::launch::async, []() {
    return compute_result();
});
auto result = future.get();

// 条件变量
std::condition_variable cv;
std::unique_lock<std::mutex> lock(mtx);
cv.wait(lock, []() { return ready; });
```

## 内存管理

### RAII 模式
```cpp
class FileHandle {
public:
    FileHandle(const char* path) : file(fopen(path, "r")) {
        if (!file) throw std::runtime_error("Failed to open file");
    }

    ~FileHandle() {
        if (file) fclose(file);
    }

    // 禁止拷贝
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;

    // 允许移动
    FileHandle(FileHandle&& other) noexcept : file(other.file) {
        other.file = nullptr;
    }

private:
    FILE* file;
};
```

### 内存安全检查
```bash
# AddressSanitizer
g++ -fsanitize=address -g main.cpp -o main
./main

# Valgrind
valgrind --leak-check=full ./main

# 静态分析
clang-tidy main.cpp
cppcheck main.cpp
```

## CMake

### CMakeLists.txt
```cmake
cmake_minimum_required(VERSION 3.16)
project(MyProject VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 添加可执行文件
add_executable(myapp
    src/main.cpp
    src/utils.cpp
)

# 添加库
add_library(mylib STATIC
    src/lib.cpp
)

# 链接库
target_link_libraries(myapp PRIVATE mylib)

# 包含目录
target_include_directories(myapp PRIVATE ${CMAKE_SOURCE_DIR}/include)

# 查找外部库
find_package(Threads REQUIRED)
target_link_libraries(myapp PRIVATE Threads::Threads)

# 测试
enable_testing()
add_executable(tests tests/test_main.cpp)
add_test(NAME MyTests COMMAND tests)
```

### 构建
```bash
mkdir build && cd build
cmake ..
cmake --build .
ctest  # 运行测试
```

## 测试

### Google Test
```cpp
#include <gtest/gtest.h>

TEST(MathTest, Add) {
    EXPECT_EQ(add(1, 2), 3);
    EXPECT_EQ(add(-1, 1), 0);
}

TEST(MathTest, Divide) {
    EXPECT_DOUBLE_EQ(divide(10, 2), 5.0);
    EXPECT_THROW(divide(1, 0), std::invalid_argument);
}

// Fixture
class UserTest : public ::testing::Test {
protected:
    void SetUp() override {
        user = std::make_unique<User>("Alice");
    }

    std::unique_ptr<User> user;
};

TEST_F(UserTest, GetName) {
    EXPECT_EQ(user->getName(), "Alice");
}
```

## 项目结构

```
myproject/
├── CMakeLists.txt
├── include/
│   └── myproject/
│       ├── utils.h
│       └── types.h
├── src/
│   ├── main.cpp
│   └── utils.cpp
├── tests/
│   └── test_main.cpp
└── build/
```

## 常用库

| 库 | 用途 |
|---|------|
| Boost | 通用库集合 |
| fmt | 格式化输出 |
| spdlog | 日志 |
| nlohmann/json | JSON |
| Catch2/GTest | 测试 |
| OpenSSL | 加密 |

---

