@echo off
setlocal
cd /d "%~dp0"
set "ESPTOOL=%~dp0esptool.exe"
if not exist "%ESPTOOL%" set "ESPTOOL=esptool.exe"
set "BIN=%~dp0esp32_car_arm_network.ino.merged.bin"
if not exist "%BIN%" (
  echo 未找到 merged.bin
  pause
  exit /b 1
)
set /p PORT=请输入 ESP32 串口，例如 COM6：
"%ESPTOOL%" --chip esp32 --port %PORT% --baud 460800 write-flash --flash-mode dio --flash-freq 80m --flash-size 4MB 0x0 "%BIN%"
if errorlevel 1 (
  echo 烧录失败，请检查串口、USB线和BOOT键。
) else (
  echo 烧录成功。
)
pause
