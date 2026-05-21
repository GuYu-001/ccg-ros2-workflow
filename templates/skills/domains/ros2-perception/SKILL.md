---
name: ros2-perception
description: ROS2 感知技能。激光雷达、相机、点云处理、传感器融合、SLAM 输入。当用户提到激光雷达、LiDAR、点云、PCL、PointCloud2、相机标定、深度图、传感器融合时使用。
user-invocable: false
category: domain
---

# ROS2 感知技能

## 适用场景

机器人感知层开发,处理传感器原始数据并提取语义信息。

### 触发关键词

- 激光雷达 / LiDAR / RPLidar / Velodyne / Ouster
- 点云 / PointCloud2 / PCL / 点云分割 / 体素
- 相机 / RGB / 深度相机 / RealSense / ZED
- 标定 / calibration / 内参 / 外参
- SLAM 输入 / 里程计输入 / 传感器融合

---

## 激光雷达驱动

### 标准包列表

| 厂商 | ROS2 包 | 默认 Topic |
|------|---------|------------|
| RPLidar | `rplidar_ros` | `/scan` (sensor_msgs/LaserScan) |
| Velodyne | `velodyne_driver` | `/velodyne_points` (sensor_msgs/PointCloud2) |
| Ouster | `ouster_ros` | `/ouster/points` |
| Livox | `livox_ros_driver2` | `/livox/lidar` |

### 启动示例

```python
# launch/rplidar.launch.py
Node(
    package='rplidar_ros',
    executable='rplidar_node',
    name='rplidar',
    parameters=[{
        'serial_port': '/dev/ttyUSB0',
        'frame_id': 'laser_link',
        'angle_compensate': True,
        'scan_mode': 'Standard',
    }],
)
```

---

## 点云处理 (PCL)

### 体素降采样

```cpp
#include <pcl/filters/voxel_grid.h>
#include <pcl_conversions/pcl_conversions.h>

void cloud_callback(const sensor_msgs::msg::PointCloud2::SharedPtr msg) {
  pcl::PointCloud<pcl::PointXYZ>::Ptr cloud(new pcl::PointCloud<pcl::PointXYZ>);
  pcl::fromROSMsg(*msg, *cloud);

  pcl::VoxelGrid<pcl::PointXYZ> voxel;
  voxel.setInputCloud(cloud);
  voxel.setLeafSize(0.05f, 0.05f, 0.05f);  // 5cm 体素
  pcl::PointCloud<pcl::PointXYZ>::Ptr filtered(new pcl::PointCloud<pcl::PointXYZ>);
  voxel.filter(*filtered);

  sensor_msgs::msg::PointCloud2 output;
  pcl::toROSMsg(*filtered, output);
  output.header = msg->header;
  pub_->publish(output);
}
```

### 平面分割 (RANSAC)

```cpp
#include <pcl/segmentation/sac_segmentation.h>

pcl::SACSegmentation<pcl::PointXYZ> seg;
seg.setOptimizeCoefficients(true);
seg.setModelType(pcl::SACMODEL_PLANE);
seg.setMethodType(pcl::SAC_RANSAC);
seg.setDistanceThreshold(0.01);
seg.setInputCloud(cloud);

pcl::ModelCoefficients::Ptr coefficients(new pcl::ModelCoefficients);
pcl::PointIndices::Ptr inliers(new pcl::PointIndices);
seg.segment(*inliers, *coefficients);
```

---

## 相机集成

### RealSense 启动

```bash
ros2 launch realsense2_camera rs_launch.py \
  enable_color:=true \
  enable_depth:=true \
  align_depth.enable:=true \
  pointcloud.enable:=true
```

### 深度图转点云

```cpp
// depth_image_proc 功能包提供
#include <depth_image_proc/point_cloud_xyz.hpp>
```

---

## 传感器融合

### TF2 时间同步

```cpp
#include <message_filters/subscriber.h>
#include <message_filters/time_synchronizer.h>
#include <message_filters/sync_policies/approximate_time.h>

using SyncPolicy = message_filters::sync_policies::ApproximateTime<
    sensor_msgs::msg::PointCloud2,
    sensor_msgs::msg::Image>;

message_filters::Subscriber<sensor_msgs::msg::PointCloud2> cloud_sub_;
message_filters::Subscriber<sensor_msgs::msg::Image> image_sub_;
message_filters::Synchronizer<SyncPolicy> sync_(SyncPolicy(10), cloud_sub_, image_sub_);
sync_.registerCallback(&Node::fusion_callback, this);
```

---

## 关键 QoS 策略

| 数据类型 | Reliability | Durability | History | Depth |
|----------|-------------|------------|---------|-------|
| LaserScan | Best Effort | Volatile | Keep Last | 5 |
| PointCloud2 | Best Effort | Volatile | Keep Last | 1 |
| Image (高分辨率) | Best Effort | Volatile | Keep Last | 1 |
| 相机内参 | Reliable | Transient Local | Keep Last | 1 |

---

## 调试工具

```bash
# 查看话题数据
ros2 topic echo /scan --no-arr
ros2 topic hz /velodyne_points

# RViz2 可视化
rviz2 -d perception.rviz

# 录制 rosbag
ros2 bag record /scan /velodyne_points /camera/image_raw

# 回放
ros2 bag play <bag_file>
```
