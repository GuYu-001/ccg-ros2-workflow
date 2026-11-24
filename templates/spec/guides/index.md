# Guides — 跨模块开发指南

> 用于上层应用与底层控制的交接。记录双方实际依赖的 ROS2 接口和验证结果。

## 包与接口边界

- 确认项目的 ROS2 发行版、RMW 和平台。对照 `package.xml` 与构建配置检查包依赖和安装资源。
- 修改 `.msg`、`.srv` 或 `.action` 时，同时列出接口包及其消费者，核对类型、名称和重映射。

## 通信、坐标与时钟

- QoS 按发布端提供、订阅端请求的策略核对兼容性，不要求两端一律相同。
- 跨节点定位问题时，检查 tf2 坐标系、时间戳和 `use_sim_time`，区分缺少变换与时钟不一致。

## 验证交接

- [ ] 从工作区根目录运行 `colcon build --packages-up-to <pkg>`，覆盖受影响的包及依赖。
- [ ] 用 `colcon test --packages-select <pkg>` 和 `colcon test-result --verbose` 记录结果；跨节点交互按需用 `launch_testing`。
- [ ] 只读角色列出建议命令，不执行构建。缺少 ROS、SDK 或硬件时写明未运行的项目及原因。
