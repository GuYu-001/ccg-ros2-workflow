---
name: python
description: Python 开发(含 ROS2 Python 节点)。Web框架、数据处理、自动化脚本、ROS2 Python 节点、Launch 文件。当用户提到 Python、Django、Flask、FastAPI、pytest、pandas、rclpy、launch 时使用。
---

# Python 开发(ROS2 增强版)

## ROS2 Python 开发上下文(上层应用核心)

ROS2 项目中,Python 节点承担**上层应用**职责:Launch 文件、参数配置、可视化、仿真、状态机编排。

### rclpy 核心模式

```python
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy
from sensor_msgs.msg import LaserScan
from geometry_msgs.msg import Twist


class NavigationNode(Node):
    def __init__(self):
        super().__init__('navigation_node')

        # QoS 策略
        sensor_qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=10
        )

        # 订阅传感器
        self.scan_sub = self.create_subscription(
            LaserScan, '/scan', self.scan_callback, sensor_qos)

        # 发布控制指令
        self.cmd_pub = self.create_publisher(Twist, '/cmd_vel', 10)

        # 参数声明
        self.declare_parameter('max_speed', 1.0)
        self.declare_parameter('safe_distance', 0.5)

    def scan_callback(self, msg: LaserScan):
        max_speed = self.get_parameter('max_speed').value
        # 处理逻辑
        cmd = Twist()
        cmd.linear.x = max_speed
        self.cmd_pub.publish(cmd)


def main():
    rclpy.init()
    node = NavigationNode()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
```

### Launch 文件标准模板

```python
# launch/navigation.launch.py
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    use_sim_time = LaunchConfiguration('use_sim_time', default='false')
    params_file = PathJoinSubstitution([
        FindPackageShare('my_robot'), 'config', 'params.yaml'
    ])

    return LaunchDescription([
        DeclareLaunchArgument(
            'use_sim_time',
            default_value='false',
            description='Use simulation clock'),

        Node(
            package='my_robot',
            executable='navigation_node',
            name='navigation',
            parameters=[params_file, {'use_sim_time': use_sim_time}],
            remappings=[('/scan', '/lidar/scan')],
            output='screen',
        ),

        IncludeLaunchDescription(
            PythonLaunchDescriptionSource([
                FindPackageShare('nav2_bringup'),
                '/launch/navigation_launch.py'
            ])
        ),
    ])
```

### setup.py 标准模板

```python
from setuptools import setup
import os
from glob import glob

package_name = 'my_robot'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'),
            glob('launch/*.launch.py')),
        (os.path.join('share', package_name, 'config'),
            glob('config/*.yaml')),
        (os.path.join('share', package_name, 'rviz'),
            glob('rviz/*.rviz')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    entry_points={
        'console_scripts': [
            'navigation_node = my_robot.navigation_node:main',
        ],
    },
)
```

### 参数 YAML 配置

```yaml
# config/params.yaml
navigation:
  ros__parameters:
    max_speed: 1.0
    safe_distance: 0.5
    update_rate: 50.0
    frame_id: "base_link"
    use_sim_time: false
```

### ROS2 Python 测试 (launch_testing)

```python
import unittest
import launch_testing
import pytest
from launch import LaunchDescription
from launch_ros.actions import Node


@pytest.mark.launch_test
def generate_test_description():
    return LaunchDescription([
        Node(
            package='my_robot',
            executable='navigation_node',
        ),
        launch_testing.actions.ReadyToTest(),
    ])


class TestNavigation(unittest.TestCase):
    def test_node_starts(self, proc_info):
        proc_info.assertWaitForStartup(timeout=10)
```

### 仿真集成(Gazebo)

```python
# launch/simulation.launch.py
def generate_launch_description():
    return LaunchDescription([
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource([
                FindPackageShare('gazebo_ros'),
                '/launch/gazebo.launch.py'
            ])
        ),
        Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            parameters=[{'robot_description': robot_description}],
        ),
    ])
```

---

## 通用 Python 知识(以下保持原样)

# 📜 符箓秘典 · Python


## Web 框架

### FastAPI (推荐)
```python
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

class User(BaseModel):
    name: str
    email: str
    age: Optional[int] = None

@app.get("/users/{user_id}")
async def get_user(user_id: int):
    return {"user_id": user_id}

@app.post("/users")
async def create_user(user: User):
    return user

# 依赖注入
async def get_db():
    db = Database()
    try:
        yield db
    finally:
        await db.close()

@app.get("/items")
async def get_items(db = Depends(get_db)):
    return await db.fetch_all("SELECT * FROM items")
```

### Flask
```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/users', methods=['GET', 'POST'])
def users():
    if request.method == 'POST':
        data = request.json
        return jsonify(data), 201
    return jsonify([])

@app.errorhandler(404)
def not_found(e):
    return jsonify(error="Not found"), 404
```

### Django
```python
# models.py
from django.db import models

class User(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

# views.py
from django.http import JsonResponse
from django.views import View

class UserView(View):
    def get(self, request, user_id):
        user = User.objects.get(id=user_id)
        return JsonResponse({'name': user.name})

# urls.py
urlpatterns = [
    path('users/<int:user_id>/', UserView.as_view()),
]
```

## 异步编程

```python
import asyncio
import aiohttp

async def fetch(url: str) -> str:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.text()

async def fetch_all(urls: list[str]) -> list[str]:
    tasks = [fetch(url) for url in urls]
    return await asyncio.gather(*tasks)

# 运行
asyncio.run(fetch_all(['http://example.com', 'http://example.org']))
```

## 数据处理

### Pandas
```python
import pandas as pd

# 读取数据
df = pd.read_csv('data.csv')
df = pd.read_json('data.json')

# 数据清洗
df = df.dropna()
df = df.drop_duplicates()
df['column'] = df['column'].str.strip()

# 数据转换
df['date'] = pd.to_datetime(df['date'])
df['category'] = df['category'].astype('category')

# 聚合分析
result = df.groupby('category').agg({
    'value': ['sum', 'mean', 'count']
})

# 导出
df.to_csv('output.csv', index=False)
df.to_json('output.json', orient='records')
```

## 测试

### pytest
```python
import pytest
from myapp import calculate, UserService

# 基础测试
def test_add():
    assert calculate.add(1, 2) == 3

# 参数化
@pytest.mark.parametrize("a,b,expected", [
    (1, 2, 3),
    (0, 0, 0),
    (-1, 1, 0),
])
def test_add_params(a, b, expected):
    assert calculate.add(a, b) == expected

# Fixture
@pytest.fixture
def user_service():
    service = UserService()
    yield service
    service.cleanup()

def test_create_user(user_service):
    user = user_service.create("test")
    assert user.name == "test"

# Mock
from unittest.mock import Mock, patch

@patch('myapp.requests.get')
def test_fetch(mock_get):
    mock_get.return_value.json.return_value = {"id": 1}
    result = fetch_user(1)
    assert result["id"] == 1

# 异步测试
@pytest.mark.asyncio
async def test_async_fetch():
    result = await async_fetch()
    assert result is not None
```

### 运行测试
```bash
pytest                      # 运行所有
pytest test_file.py         # 指定文件
pytest -k "test_add"        # 匹配名称
pytest -v                   # 详细输出
pytest --cov=myapp          # 覆盖率
pytest -x                   # 失败即停
```

## CLI 工具

### Typer (推荐)
```python
import typer

app = typer.Typer()

@app.command()
def hello(name: str, count: int = 1):
    """Say hello NAME, COUNT times."""
    for _ in range(count):
        typer.echo(f"Hello {name}!")

@app.command()
def goodbye(name: str, formal: bool = False):
    if formal:
        typer.echo(f"Goodbye Ms. {name}. Have a good day.")
    else:
        typer.echo(f"Bye {name}!")

if __name__ == "__main__":
    app()
```

### argparse
```python
import argparse

parser = argparse.ArgumentParser(description='My CLI tool')
parser.add_argument('input', help='Input file')
parser.add_argument('-o', '--output', default='output.txt')
parser.add_argument('-v', '--verbose', action='store_true')

args = parser.parse_args()
```

## 项目结构

```
myproject/
├── pyproject.toml          # 项目配置
├── README.md
├── src/
│   └── myproject/
│       ├── __init__.py
│       ├── main.py
│       ├── models.py
│       └── utils.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   └── test_main.py
└── scripts/
    └── run.py
```

### pyproject.toml
```toml
[project]
name = "myproject"
version = "0.1.0"
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.23.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-cov>=4.0.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 120
select = ["E", "F", "I"]
```

## 常用库

| 库 | 用途 |
|---|------|
| requests/httpx | HTTP 客户端 |
| aiohttp | 异步 HTTP |
| SQLAlchemy | ORM |
| Pydantic | 数据验证 |
| Click/Typer | CLI |
| pytest | 测试 |
| pandas | 数据处理 |
| loguru | 日志 |

---

