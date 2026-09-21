# Firmware

本目录保留 ESP32 自动发现版固件和烧录脚本，便于 GitHub 仓库展示完整硬件交付链路。

已排除 `esptool.exe` 等平台工具二进制文件。烧录时可使用本机已有的 esptool、Arduino IDE 或原始交付包中的烧录工具。

主要文件：

- `esp32_car_arm_network.ino.merged.bin`：从地址 `0x0` 整体烧录的合并固件。
- `esp32_car_arm_network.ino.bootloader.bin`：bootloader。
- `esp32_car_arm_network.ino.partitions.bin`：分区表。
- `esp32_car_arm_network.ino.bin`：应用固件。
- `烧录自动发现版.cmd`：原交付包中的烧录脚本。
