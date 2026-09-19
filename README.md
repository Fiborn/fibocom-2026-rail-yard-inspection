# SmartTillEye 小车智能巡检系统

SmartTillEye 是一个面向轨道/场景巡检的小车智能识别系统，包含 Spring Boot 后端、前端控制台、ESP32 小车与机械臂控制程序、视觉识别模型和自动发现启动脚本。

本仓库是从完整交付包中整理出的 GitHub 展示与开发版本，只保留源码、结构、脚本、固件和说明文档；未包含 JRE runtime、构建产物、运行日志、历史备份和重复 JAR 文件。

## 仓库结构

```text
backend/    Spring Boot 后端源码与 Maven 配置
frontend/   前端静态页面、样式、控制逻辑、ONNX Runtime 与模型文件
esp32/      ESP32 控制源码与 SCServo 舵机库
firmware/   ESP32 自动发现版烧录固件与烧录脚本
scripts/    Windows 一键启动/停止脚本与本地 GPS 接收脚本
docs/       部署说明与项目技术报告
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
scripts/启动系统_自动发现.cmd
```

4. 浏览器访问：

```text
http://127.0.0.1:8088/
```

## 后端开发

```bash
cd backend
mvn spring-boot:run
```

后端默认使用 `8088` 端口，并通过 WebSocket 与浏览器端和 ESP32 通信。

## 前端

前端源码位于：

```text
frontend/static/
```

其中包含控制台页面、摄像头/视频处理、WebSocket 控制、定位地图、YOLO 检测等逻辑。

## ESP32

ESP32 源码位于：

```text
esp32/src/esp32_car_arm_network.ino
```

依赖的舵机库位于：

```text
esp32/libraries/SCServo/
```

可直接烧录的固件位于：

```text
firmware/
```

## 说明

本仓库面向代码审阅、项目展示和二次开发。若需要完整离线运行包，请使用原始交付包中的 `运行文件/runtime` 和可执行 JAR。
