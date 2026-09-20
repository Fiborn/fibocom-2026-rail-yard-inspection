# 铁路货场空地一体智能巡检系统

本项目面向铁路货场巡检场景，构建空地一体智能巡检系统。系统结合地面智能巡检小车、前端可视化控制台、边缘侧目标识别、实时定位与路径规划等模块，用于完成货场通道、轨旁环境、人员闯入、障碍物和设备状态等巡检任务的感知、展示与辅助处置。

本仓库基于 FiBoom-project 模板整理，只保留与代码结构、核心功能和项目展示相关的内容；未包含 JRE runtime、构建产物、运行日志、历史备份和重复 JAR 文件。真实 API Key 与本机专属配置不进入仓库，请参考 `.env.example` 在本地配置。

## 仓库结构

```text
.github/          Issue 与 Pull Request 模板
cloud/            云端服务预留目录，当前为空
docs/             部署说明、项目技术报告和功能说明
edge_computing/   后端服务、前端控制台、边缘识别模型和静态资源
firmware/         ESP32 自动发现版烧录固件与烧录脚本
hardware/         ESP32 控制源码与 SCServo 舵机库
tools/            Windows 一键启动/停止脚本与本地 GPS 接收脚本
```

## 快速启动

完整部署说明见：

```text
docs/README_部署说明.md
```

常规运行方式：

1. 电脑安装 Java 17 或更高版本。
2. 电脑与 ESP32 连接同一个 Wi-Fi。
3. 双击或运行：

```text
tools/scripts/启动系统_自动发现.cmd
```

4. 浏览器访问：

```text
http://127.0.0.1:8088/
```

一键启动脚本会同时启动本地 GPS 定位服务，默认监听：

```text
http://127.0.0.1:5001/location
```

手机 GPSLogger 可通过 HTTP 将定位上传到电脑，前端定位页面会读取该接口并在高德地图中展示当前位置和路径规划。

## 后端开发

```bash
cd edge_computing/backend
mvn spring-boot:run
```

后端默认使用 `8088` 端口，并通过 WebSocket 与浏览器端和 ESP32 通信。

## 前端

前端源码位于：

```text
edge_computing/frontend/static/
```

其中包含控制台页面、摄像头/视频处理、WebSocket 控制、定位地图、YOLO 检测等逻辑。

实时定位与路径规划说明见：

```text
docs/实时定位与路径规划.md
```

## ESP32

ESP32 源码位于：

```text
hardware/esp32/src/esp32_car_arm_network.ino
```

依赖的舵机库位于：

```text
hardware/esp32/libraries/SCServo/
```

可直接烧录的固件位于：

```text
firmware/
```

## 说明

本仓库面向代码审阅、项目展示和二次开发。若需要完整离线运行包，请使用原始交付包中的 `运行文件/runtime` 和可执行 JAR。
