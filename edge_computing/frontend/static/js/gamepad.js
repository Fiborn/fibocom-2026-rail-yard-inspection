/* 手柄控制器 */
let gamepadIndex = null;
let polling = false;
let lastDirCommand = null;
const deadZone = 0.5;
let gamepadIndicator = document.querySelector('.status-indicator');
let gamepadIcon = document.querySelector('.status-indicator .icon');
let gamepadStatus = document.querySelector('.status-indicator .status');
const commandFeedback = document.getElementById('commandFeedback');
const commandText = document.getElementById('commandText');
let isLightPressed = false;
let gamepadLightOn = false;

// 初始化手柄监听
function initGamepads() {
    window.addEventListener("gamepadconnected", function(event) {
        console.log("手柄已连接:", event.gamepad);
        gamepadIndex = event.gamepad.index;
        if (!polling) {
            polling = true;
            pollGamepads();
        }
        gamepadIcon.classList.remove('disconnected');
        gamepadIcon.classList.add('connected');
        gamepadStatus.textContent = `手柄已连接`;
        gamepadStatus.classList.add('connected');
    });

    window.addEventListener("gamepaddisconnected", function(event) {
        console.log("手柄已断开:", event.gamepad);
        if (gamepadIndex === event.gamepad.index) {
            gamepadIndex = null;
            lastDirCommand = null;
            sendCommand("STOP");
            isLightPressed = false;
        }
        gamepadIcon.classList.remove('connected');
        gamepadIcon.classList.add('disconnected');
        gamepadStatus.textContent = '未检测到手柄';
        gamepadStatus.classList.remove('connected');
    });
}

// 轮询手柄状态
function pollGamepads() {
    if (!polling) return;

    const gamepads = navigator.getGamepads();
    if (gamepadIndex !== null) {
        const gamepad = gamepads[gamepadIndex];
        if (gamepad) updateControllerState(gamepad);
    }

    requestAnimationFrame(pollGamepads);
}

// 更新控制器状态
function updateControllerState(gamepad) {
    // 处理方向键 (D-pad)
    let directionCommand = null;
    if (gamepad.buttons[12]?.pressed) directionCommand = "FWD"; // 上
    else if (gamepad.buttons[13]?.pressed) directionCommand = "BACK"; // 下
    else if (gamepad.buttons[14]?.pressed) directionCommand = "LEFT"; // 左
    else if (gamepad.buttons[15]?.pressed) directionCommand = "RIGHT"; // 右

    // 处理左摇杆
    if (!directionCommand) {
        const axes = gamepad.axes;
        const xAxis = axes[0] || 0; // 左右轴
        const yAxis = axes[1] || 0; // 上下轴

        if (Math.abs(yAxis) > deadZone || Math.abs(xAxis) > deadZone) {
            if (Math.abs(yAxis) >= Math.abs(xAxis)) {
                directionCommand = yAxis < -deadZone ? "FWD" : "BACK";
            } else {
                directionCommand = xAxis < -deadZone ? "LEFT" : "RIGHT";
            }
        }
    }

    // 处理状态变化
    if (directionCommand !== lastDirCommand) {
        if (directionCommand) {
            sendCommand(directionCommand);
        } else if (lastDirCommand !== null) {
            sendCommand("STOP");
        }
        lastDirCommand = directionCommand;
    }

    // 处理灯光按钮（A键）
    const aButton = gamepad.buttons[0];
    if (aButton && aButton.pressed && !isLightPressed) {
        isLightPressed = true;
    } else if (!aButton?.pressed && isLightPressed) {
        gamepadLightOn = !gamepadLightOn;
        sendCommand(gamepadLightOn ? "LIGHT_ON" : "LIGHT_OFF");
        isLightPressed = false;
    }

    // 处理开始/停止任务按钮
    if (gamepad.buttons[3]?.pressed) { // Y按钮
        sendCommand("START_WORK");
    }
    if (gamepad.buttons[1]?.pressed) { // B按钮
        sendCommand("STOP_WORK");
    }
}

// 初始化手柄连接
initGamepads();
