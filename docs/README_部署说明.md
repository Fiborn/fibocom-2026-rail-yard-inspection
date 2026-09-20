# SmartTillEye 小车智能巡检系统

版本：自动发现版 2026-08-10

## 一、交付内容

- `运行文件/smart-till-eye-1.0.0.jar`：Spring Boot 后端和前端静态页面。
- `运行文件/启动系统_自动发现.cmd`：一键启动后端、局域网发现服务并打开前端。
- `ESP32驱动/源码/esp32_car_arm_network.ino`：最新 ESP32 小车、机械臂、灯光和自动发现驱动源码。
- `ESP32驱动/烧录文件/esp32_car_arm_network.ino.merged.bin`：可从地址 `0x0` 整体烧录的固件。
- `ESP32驱动/烧录文件/`：分区烧录所需的 bootloader、partitions、application 固件。
- `ESP32驱动/libraries/SCServo/`：ST3215 舵机驱动库。
- `前端源码/static/`：页面、样式、控制逻辑、ONNX Runtime、YOLO 模型和类别文件。
- `后端源码/`：后端源代码和 Maven 配置。

## 二、首次使用

### 1. 网络

电脑和 ESP32 连接同一个指定热点：

- Wi-Fi 名称：`main`
- Wi-Fi 密码：`88888888`

ESP32 会通过 UDP `4210` 端口自动寻找后端，不再依赖固定电脑 IP。

### 2. 启动

电脑安装 Java 17 或更高版本，然后双击：

`运行文件/启动系统_自动发现.cmd`

脚本会启动 `8088` 端口后端并打开：

`http://127.0.0.1:8088/`

启动后保持后端窗口运行。给小车上电后，页面应显示 `ESP32在线`。

### 3. 换电脑

只需将整个交付包复制到新电脑，连接同名 Wi-Fi，安装 Java，双击启动脚本即可。不需要修改 ESP32 源码中的电脑 IP，也不需要重新烧录。

## 三、ESP32 烧录

### 方式 A：整体固件

使用 esptool 将：

`ESP32驱动/烧录文件/esp32_car_arm_network.ino.merged.bin`

从地址 `0x0` 写入 ESP32。

### 方式 B：Arduino IDE

用 Arduino IDE 打开：

`ESP32驱动/源码/esp32_car_arm_network.ino`

选择 ESP32 Dev Module 和当前串口，编译上传。依赖库使用交付包中的 `ESP32驱动/libraries/SCServo`。

本版本已验证串口为 `COM6`，不同电脑可能显示为其他串口。

## 四、控制功能

- 小车：前进、后退、左转、右转、停止、速度调节。
- 键盘：`W/S/A/D` 控制移动，`Q` 自动巡检，`E` 手动巡检，空格总急停。
- 机械臂：二维遥感控制底座与肩肘联动，保留夹爪控制和全部回位。
- 自动巡检：小车前进，机械臂展开，云台进行相对基准位置的左右扫描。
- 视觉：摄像头视频帧发送到后端，后端使用 ONNX YOLO 推理并在前端绘制红框。
- 告警：支持车门异常、道旁异物、人员越界、轨道损坏。
- 告警防抖：同一种告警 30 秒内不重复进入队列、不重复写表格、不更新 Agent 建议。
- Agent：根据目标类别和识别置信度区间返回预设运维建议。
- 表格：告警记录保存到后端工作目录下的 `alarm-records` 文件夹，按天生成 CSV 文件。

## 五、实时定位与路径规划

本仓库已整理实时定位与路径规划相关代码：

- `scripts/gps_receiver_local.py`：本地 GPS 接收服务，监听 `0.0.0.0:5001`。
- `frontend/static/location.html`：高德地图定位与路径规划页面。
- `frontend/static/js/location-map.js`：读取 `/location`、更新当前位置、选择目的地和调用 `AMap.Driving`。
- `frontend/static/js/app-config.js`：统一配置 `locationApiBase`。
- `frontend/static/js/app-config.local.example.js`：高德 Web 端 JS API Key 与 Security JS Code 的本地配置示例。

定位链路：

`手机 GPSLogger -> HTTP -> gps_receiver_local.py :5001 -> WGS84 转 GCJ-02 -> /location -> SmartTillEye -> 高德地图 -> AMap.Driving`

GPSLogger URL 模板：

`http://<SERVER_IP>:5001/?lat=%LAT&longitude=%LON&time=%TIME&speed=%SPD`

当前 Windows 联调默认配置：

`locationApiBase: 'http://127.0.0.1:5001'`

未来部署到 SC171-V3 或其他定位服务器时，只需要将 `frontend/static/js/app-config.js` 中的 `locationApiBase` 改为：

`http://<SC171_IP>:5001`

高德 Key 不应直接写入公开仓库。需要本地运行地图时，复制：

`frontend/static/js/app-config.local.example.js`

为：

`frontend/static/js/app-config.local.js`

然后在 `app-config.local.js` 中填写本机使用的高德 Web 端 JS API Key 与 Security JS Code。

## 六、端口和协议

- HTTP：`8088`
- GPS 定位服务 HTTP：`5001`
- 浏览器控制 WebSocket：`/ws/controller`
- ESP32 WebSocket：`/ws/car`
- 局域网自动发现 UDP：`4210`
- 自动发现请求：`SMARTTILLEYE_DISCOVER,8088`
- 自动发现回复：`SMARTTILLEYE_SERVER,8088`

## 七、故障排查

### 页面打不开

检查后端窗口是否仍在运行，确认 `8088` 端口没有被其他程序占用。

### 定位页面没有当前位置

先访问 `http://127.0.0.1:5001/location`。如果无法访问，说明 GPS 接收服务没有启动或 `5001` 端口被占用；如果返回 `valid=false`，说明定位服务已启动但还没有收到手机 GPSLogger 数据。

### GPSLogger 无法上传

确认手机和电脑在同一网络，URL 使用电脑局域网 IP，例如：

`http://<电脑IP>:5001/?lat=%LAT&longitude=%LON&time=%TIME&speed=%SPD`

### 页面显示 ESP32 离线

确认电脑和小车连接同一个 `main` 热点；重新给 ESP32 上电；检查 Windows 防火墙是否允许 Java 和 UDP `4210` 通信。

### 摄像头没有画面

页面通过 `前端源码/static/js/camera-config.js` 中配置的 MJPEG 地址连接 SC171-V3。依次检查：电脑与 SC171 是否在同一局域网、浏览器能否直接打开 `http://10.13.49.100:8080/`、`http://10.13.49.100:8080/?action=stream` 是否有画面，然后点击页面中的“重新连接”。当前页面使用 HTTP；如果以后改成 HTTPS，浏览器可能把 HTTP 视频流作为 mixed content 拦截。

### 机械臂不可用

检查舵机独立电源、ESP32 与舵机电源共地、GPIO18/19 接线和舵机总线；页面显示机械臂未就绪时重新上电。

### 告警过多

当前同类型告警冷却时间为 30 秒，冷却结束后才允许同类型告警再次生成。
