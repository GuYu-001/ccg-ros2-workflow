# ROS2 Python 节点(rclpy)

## 何时用 Python 而不是 C++

| 场景 | 选 Python | 选 C++ |
|------|-----------|--------|
| 高频控制循环(>= 100Hz) | ❌ | ✅ |
| 硬件实时驱动 | ❌ | ✅ |
| 状态机 / 决策层 | ✅ | 视情况 |
| 数据处理 / 调试工具 | ✅ | ❌ |
| 与 Python 生态(numpy/scikit) | ✅ | ❌ |
| 仿真/launch 集成节点 | ✅ | ❌ |

经验法则:**控制环路用 C++,业务逻辑用 Python**。

## 基本节点骨架

```python
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy
from std_msgs.msg import String


class ExampleNode(Node):
    def __init__(self):
        super().__init__('example_node')

        self.declare_parameter('greeting', 'hello')

        self.pub = self.create_publisher(String, 'output', 10)
        self.sub = self.create_subscription(
            String, 'input', self.on_input, 10)
        self.timer = self.create_timer(1.0, self.tick)

    def on_input(self, msg: String):
        self.get_logger().info(f'received: {msg.data}')

    def tick(self):
        msg = String()
        msg.data = self.get_parameter('greeting').value
        self.pub.publish(msg)


def main():
    rclpy.init()
    node = ExampleNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
```

## QoS 模式

```python
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy, HistoryPolicy

# 高频传感器(LiDAR / 相机)
sensor_qos = QoSProfile(
    reliability=ReliabilityPolicy.BEST_EFFORT,
    history=HistoryPolicy.KEEP_LAST,
    depth=5
)

# 控制指令
control_qos = QoSProfile(
    reliability=ReliabilityPolicy.RELIABLE,
    history=HistoryPolicy.KEEP_LAST,
    depth=10
)

# 静态信息(地图、机器人描述、参数)
latching_qos = QoSProfile(
    reliability=ReliabilityPolicy.RELIABLE,
    durability=DurabilityPolicy.TRANSIENT_LOCAL,
    history=HistoryPolicy.KEEP_LAST,
    depth=1
)
```

## 多回调并发

### 默认:单线程(回调串行)

```python
rclpy.spin(node)  # 一次只跑一个回调
```

→ **慢回调阻塞所有其他回调**(包括 timer)。

### 多线程 + 回调组

```python
from rclpy.executors import MultiThreadedExecutor
from rclpy.callback_groups import ReentrantCallbackGroup, MutuallyExclusiveCallbackGroup

class MyNode(Node):
    def __init__(self):
        super().__init__('my_node')

        # 同组互斥(默认):同组内串行
        self.exclusive_cb_group = MutuallyExclusiveCallbackGroup()
        # 同组可重入:同组内并行
        self.reentrant_cb_group = ReentrantCallbackGroup()

        self.fast_timer = self.create_timer(
            0.01, self.fast_tick,
            callback_group=self.reentrant_cb_group)

        self.slow_service = self.create_service(
            Trigger, 'slow_op', self.handle_slow,
            callback_group=self.exclusive_cb_group)


def main():
    rclpy.init()
    node = MyNode()
    executor = MultiThreadedExecutor(num_threads=4)
    executor.add_node(node)
    try:
        executor.spin()
    finally:
        node.destroy_node()
        rclpy.shutdown()
```

## 调用其他节点服务(异步)

```python
from rclpy.client import Client
from std_srvs.srv import SetBool

class Caller(Node):
    def __init__(self):
        super().__init__('caller')
        self.client = self.create_client(SetBool, 'enable')

    async def call_enable(self, value: bool) -> bool:
        if not self.client.wait_for_service(timeout_sec=1.0):
            self.get_logger().error('service unavailable')
            return False
        req = SetBool.Request()
        req.data = value
        future = self.client.call_async(req)
        # 在 MultiThreadedExecutor 里直接 await
        result = await future
        return result.success
```

## Action 客户端

```python
from rclpy.action import ActionClient
from nav2_msgs.action import NavigateToPose

class Navigator(Node):
    def __init__(self):
        super().__init__('navigator')
        self._action_client = ActionClient(self, NavigateToPose, 'navigate_to_pose')

    async def go_to(self, x: float, y: float):
        self._action_client.wait_for_server()

        goal = NavigateToPose.Goal()
        goal.pose.header.frame_id = 'map'
        goal.pose.pose.position.x = x
        goal.pose.pose.position.y = y
        goal.pose.pose.orientation.w = 1.0

        send_future = self._action_client.send_goal_async(
            goal, feedback_callback=self.on_feedback)
        goal_handle = await send_future
        if not goal_handle.accepted:
            return False
        result_future = goal_handle.get_result_async()
        result = await result_future
        return result.status == 4  # SUCCEEDED

    def on_feedback(self, fb):
        self.get_logger().info(
            f'distance remaining: {fb.feedback.distance_remaining:.2f}')
```

## 生命周期节点(Python)

ROS2 Humble 起 `rclpy` 支持 LifecycleNode。

```python
from rclpy.lifecycle import LifecycleNode, TransitionCallbackReturn, State

class HardwareDriver(LifecycleNode):
    def __init__(self):
        super().__init__('hw_driver')

    def on_configure(self, state: State) -> TransitionCallbackReturn:
        # 打开串口、加载参数
        self.serial = open('/dev/ttyUSB0')
        return TransitionCallbackReturn.SUCCESS

    def on_activate(self, state: State) -> TransitionCallbackReturn:
        # 启动数据流、激活 publisher
        self.timer = self.create_timer(0.01, self.tick)
        return TransitionCallbackReturn.SUCCESS

    def on_deactivate(self, state: State) -> TransitionCallbackReturn:
        self.destroy_timer(self.timer)
        return TransitionCallbackReturn.SUCCESS

    def on_cleanup(self, state: State) -> TransitionCallbackReturn:
        self.serial.close()
        return TransitionCallbackReturn.SUCCESS
```

CLI 切换状态:
```bash
ros2 lifecycle set /hw_driver configure
ros2 lifecycle set /hw_driver activate
```

## 注册为 console_script

`setup.py`:
```python
entry_points={
    'console_scripts': [
        'example = my_package.example_node:main',
        'navigator = my_package.navigator:main',
    ],
},
```

## 反模式

| 反模式 | 后果 | 改 |
|--------|------|----|
| 在回调里 `time.sleep()` | 阻塞 executor | 用 timer 或 async |
| `subprocess.run()` 在回调里 | 阻塞 | 异步 + callback group |
| 没有 `try/finally rclpy.shutdown()` | 节点卡死、TF 不释放 | 永远配 finally |
| 共享 state 不加锁(多线程 executor) | data race | `threading.Lock` 或限制到 mutex 回调组 |
| 不 `declare_parameter` 直接 `get_parameter` | `ParameterNotDeclaredException` | 先 declare |
| `print()` 而非 `self.get_logger().info()` | 不受日志级别控制 | 永远用 ROS logger |
