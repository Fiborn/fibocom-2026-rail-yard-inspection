(() => {
    'use strict';

    const panel = document.createElement('aside');
    panel.className = 'robot-control-panel';
    panel.innerHTML = `
        <div class="robot-control-head">
            <div><strong>机器人联网控制 <small class="robot-release">v2.2</small></strong><span id="robot-link-state" class="robot-state offline">服务器连接中</span></div>
        </div>
        <div id="robot-control-body" class="robot-control-body">
            <section class="robot-control-section">
                <h3>小车控制</h3>
                <div class="inspection-mode-row">
                    <button class="auto-inspect" data-command="AUTO_INSPECT_START">自动巡检</button>
                    <button class="manual-inspect" data-command="MANUAL_INSPECT">手动巡检</button>
                </div>
                <div class="robot-direction-grid">
                    <button class="move up" data-move="FWD">↑ 前进</button>
                    <button class="move left" data-move="LEFT">← 左转</button>
                    <button class="stop" data-command="STOP">停止</button>
                    <button class="move right" data-move="RIGHT">右转 →</button>
                    <button class="move down" data-move="BACK">↓ 后退</button>
                </div>
                <label class="robot-speed">PWM <output id="robot-speed-value">400</output>
                    <input id="robot-speed" type="range" min="100" max="1200" step="20" value="400">
                </label>
                <div class="robot-hint">转向会自动提升到至少 PWM 700</div>
            </section>
            <section class="robot-control-section">
                <h3>机械臂遥感控制</h3>
                <div class="arm-joystick-wrap">
                    <div id="arm-joystick" class="arm-joystick" role="application" aria-label="机械臂二维遥感控制">
                        <span class="arm-axis arm-axis-x"></span><span class="arm-axis arm-axis-y"></span>
                        <span id="arm-joystick-knob" class="arm-joystick-knob"></span>
                    </div>
                    <div class="arm-joystick-values">
                        <span>底座 <output id="arm-base-value">2048</output></span>
                        <span>肩肘 <output id="arm-lift-value">0</output></span>
                    </div>
                </div>
                <div class="robot-button-grid">
                    <button data-command="ARM_HOME">全部回位</button>
                    <button data-command="ARM_GRIPPER_CW_90">夹爪顺90°</button>
                    <button data-command="ARM_GRIPPER_CCW_90">夹爪逆90°</button>
                    <button data-command="ARM_GRIPPER_CCW_45">夹爪逆45°</button>
                    <button data-command="ARM_GRIPPER_HOME">夹爪回位</button>
                    <button data-command="ARM_STOP">机械臂停止</button>
                </div>
            </section>
            <section class="robot-control-section robot-aux-row">
                <button data-command="LIGHT_ON">开灯</button>
                <button data-command="LIGHT_OFF">关灯</button>
                <button class="all-stop" data-command="ALL_STOP">总急停（空格）</button>
            </section>
            <div id="robot-arm-status" class="robot-arm-status">机械臂状态：等待设备反馈</div>
            <div id="robot-control-log" class="robot-control-log">等待服务器连接…</div>
        </div>`;
    const mount = document.getElementById('robot-control-mount');
    (mount || document.body).appendChild(panel);

    const linkState = document.getElementById('robot-link-state');
    const log = document.getElementById('robot-control-log');
    const armStatus = document.getElementById('robot-arm-status');
    const speed = document.getElementById('robot-speed');
    const speedValue = document.getElementById('robot-speed-value');
    const body = document.getElementById('robot-control-body');
    let socket = null;
    let reconnectTimer = null;
    let movementTimer = null;
    let activeDirection = null;
    let carOnline = false;
    const joystick = document.getElementById('arm-joystick');
    const joystickKnob = document.getElementById('arm-joystick-knob');
    const baseValue = document.getElementById('arm-base-value');
    const liftValue = document.getElementById('arm-lift-value');
    const joystickState = { dragging: false, pointerId: null, base: 2048, lift: 0 };
    const joystickRadius = 82;
    let joystickSendTimer = null;

    function setLog(message) {
        log.textContent = `${new Date().toLocaleTimeString('zh-CN', {hour12: false})}  ${message}`;
    }

    function setConnection(text, online) {
        linkState.textContent = text;
        linkState.classList.toggle('online', online);
        linkState.classList.toggle('offline', !online);
    }

    function updateControlAvailability() {
        document.querySelectorAll('.robot-control-panel [data-move], .robot-control-panel [data-command]')
            .forEach(button => { button.disabled = !carOnline; });
    }

    function formatDeviceMessage(message) {
        if (message.includes('@ARM:WARN,BASE_CW_LIMITED_BY_POSITION_RANGE#')) {
            return '底座顺时针动作已执行，并在安全位置 4050 自动限位';
        }
        if (message.includes('@ARM:ERROR,SEQUENCE_TARGET_OUT_OF_RANGE#')) {
            return '机械臂循环流程不可用：当前标定位置会导致目标越界';
        }
        if (message.includes('@ARM:ERROR,NOT_READY#')) {
            return '机械臂未就绪：请检查电源并按 ESP32 的 EN 键复位';
        }
        if (message.includes('@ARM:MANUAL_COMMAND_ACCEPTED#')) {
            return '机械臂动作指令已接受';
        }
        if (message.includes('@ESP:MOTOR_STOPPED#')) return '小车已停止';
        if (message.includes('@ALL:STOPPED#')) return '总急停已执行';
        if (message.includes('@INSPECT:AUTO_STARTED#')) return '自动巡检已启动：小车前进，机械臂展开并开始云台扫描';
        if (message.includes('@INSPECT:MANUAL_READY#')) return '已切换手动巡检：小车停止，机械臂正在归位';
        if (message.includes('@INSPECT:ERROR,NOT_READY#')) return '自动巡检不可用：机械臂未就绪';
        if (message.includes('@INSPECT:ERROR,TARGET_OUT_OF_RANGE#')) return '自动巡检不可用：目标位置超出安全范围';
        if (message.includes('@LIGHT:ON#')) return '照明灯已开启';
        if (message.includes('@LIGHT:OFF#')) return '照明灯已关闭';
        return `设备：${message.slice(0, 180)}`;
    }

    function updateArmStatus(message) {
        if (!message.startsWith('@ARM:STATUS,')) return;
        const fields = Object.fromEntries(
            message.replace(/^@ARM:STATUS,|#$/g, '').split(',').map(item => item.split('='))
        );
        const ready = fields.ready === '1';
        const sequenceReady = fields.sequenceReady === '1';
        const loop = fields.loop === '1';
        armStatus.classList.toggle('warning', !ready || !sequenceReady);
        armStatus.textContent = ready
            ? `机械臂：可手动控制｜循环流程：${sequenceReady ? (loop ? '运行中' : '可用') : '因目标越界已禁用'}｜底座基准：${fields.base ?? '--'}`
            : '机械臂：未就绪，请检查机械臂电源后按 EN 复位';
    }

    function send(command, quiet = false) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            if (!quiet) setLog('服务器未连接，命令未发送');
            return false;
        }
        socket.send(command);
        if (!quiet) setLog(`发送：${command}`);
        return true;
    }

    function renderJoystick() {
        const x = (joystickState.base / 4095) * 2 * joystickRadius - joystickRadius;
        const y = -(joystickState.lift / 1024) * joystickRadius;
        joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
        baseValue.value = joystickState.base;
        liftValue.value = joystickState.lift;
    }

    function updateJoystick(event) {
        const rect = joystick.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = event.clientX - centerX;
        let dy = event.clientY - centerY;
        const distance = Math.hypot(dx, dy);
        if (distance > joystickRadius) {
            const scale = joystickRadius / distance;
            dx *= scale;
            dy *= scale;
        }
        joystickState.base = Math.round(((dx + joystickRadius) / (2 * joystickRadius)) * 4095);
        joystickState.lift = Math.round((-dy / joystickRadius) * 1024);
        renderJoystick();
    }

    function sendJoystickPose() {
        if (joystickState.dragging) send(`ARM_POSE,${joystickState.base},${joystickState.lift}`, true);
    }

    function stopMovement(quiet = false) {
        if (movementTimer) clearInterval(movementTimer);
        movementTimer = null;
        activeDirection = null;
        send('STOP', quiet);
        document.querySelectorAll('.robot-control-panel .move.active').forEach(b => b.classList.remove('active'));
    }

    function startMovement(direction, button) {
        if (!carOnline) {
            setLog('ESP32不在线，拒绝运动');
            return;
        }
        stopMovement(true);
        activeDirection = direction;
        button.classList.add('active');
        send(`SPEED:${speed.value}`, true);
        send(direction);
        movementTimer = setInterval(() => {
            send(`SPEED:${speed.value}`, true);
            send(direction, true);
        }, 200);
    }

    function connect() {
        clearTimeout(reconnectTimer);
        const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        socket = new WebSocket(`${scheme}://${window.location.host}/ws/controller`);
        setConnection('服务器连接中', false);

        socket.onopen = () => {
            setConnection('服务器已连接 / 等待ESP32', false);
            setLog('控制网页已连接后端');
            send('STATUS', true);
        };
        socket.onmessage = event => {
            const message = String(event.data);
            if (message.includes('@SERVER:CAR_ONLINE#')) {
                carOnline = true;
                setConnection('ESP32在线', true);
                updateControlAvailability();
                send('ARM_STATUS', true);
            } else if (message.includes('@SERVER:CAR_OFFLINE#')) {
                carOnline = false;
                stopMovement(true);
                setConnection('ESP32离线', false);
                updateControlAvailability();
            }
            updateArmStatus(message);
            setLog(formatDeviceMessage(message));
        };
        socket.onerror = () => socket.close();
        socket.onclose = () => {
            carOnline = false;
            if (movementTimer) clearInterval(movementTimer);
            movementTimer = null;
            activeDirection = null;
            setConnection('网络断开，正在重连', false);
            updateControlAvailability();
            reconnectTimer = setTimeout(connect, 2000);
        };
    }

    document.querySelectorAll('.robot-control-panel [data-move]').forEach(button => {
        button.addEventListener('pointerdown', event => {
            event.preventDefault();
            button.setPointerCapture?.(event.pointerId);
            startMovement(button.dataset.move, button);
        });
        button.addEventListener('pointerup', () => stopMovement());
        button.addEventListener('pointercancel', () => stopMovement());
        button.addEventListener('lostpointercapture', () => {
            if (activeDirection === button.dataset.move) stopMovement();
        });
    });

    document.querySelectorAll('.robot-control-panel [data-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.dataset.command;
            if (command === 'STOP') stopMovement();
            else {
                if (command === 'ALL_STOP' || command === 'AUTO_INSPECT_START' || command === 'MANUAL_INSPECT') stopMovement(true);
                send(command);
            }
        });
    });

    joystick.addEventListener('pointerdown', event => {
        if (!carOnline) { setLog('ESP32不在线，拒绝控制机械臂'); return; }
        event.preventDefault();
        joystickState.dragging = true;
        joystickState.pointerId = event.pointerId;
        joystick.setPointerCapture?.(event.pointerId);
        updateJoystick(event);
        sendJoystickPose();
    });
    joystick.addEventListener('pointermove', event => {
        if (joystickState.dragging && event.pointerId === joystickState.pointerId) updateJoystick(event);
    });
    function stopJoystick() {
        joystickState.dragging = false;
        joystickState.pointerId = null;
    }
    joystick.addEventListener('pointerup', stopJoystick);
    joystick.addEventListener('pointercancel', stopJoystick);
    joystick.addEventListener('lostpointercapture', stopJoystick);
    joystickSendTimer = setInterval(sendJoystickPose, 40);
    renderJoystick();

    speed.addEventListener('input', () => {
        speedValue.value = speed.value;
        if (activeDirection) send(`SPEED:${speed.value}`, true);
    });

    const keyMap = {ArrowUp: 'FWD', KeyW: 'FWD', ArrowDown: 'BACK', KeyS: 'BACK',
                    ArrowLeft: 'LEFT', KeyA: 'LEFT', ArrowRight: 'RIGHT', KeyD: 'RIGHT'};
    const commandKeyMap = {KeyQ: 'AUTO_INSPECT_START', KeyE: 'MANUAL_INSPECT'};
    const heldKeys = new Set();
    document.addEventListener('keydown', event => {
        if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
        if (event.code === 'Space') {
            event.preventDefault();
            stopMovement(true);
            send('ALL_STOP');
            return;
        }
        const command = commandKeyMap[event.code];
        if (command) {
            if (heldKeys.has(event.code)) return;
            event.preventDefault();
            heldKeys.add(event.code);
            stopMovement(true);
            send(command);
            return;
        }
        const direction = keyMap[event.code];
        if (!direction || heldKeys.has(event.code)) return;
        event.preventDefault();
        heldKeys.add(event.code);
        const button = document.querySelector(`.robot-control-panel [data-move="${direction}"]`);
        startMovement(direction, button);
    });
    document.addEventListener('keyup', event => {
        if (commandKeyMap[event.code]) {
            heldKeys.delete(event.code);
            return;
        }
        if (!keyMap[event.code]) return;
        heldKeys.delete(event.code);
        stopMovement();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopMovement(true);
            send('ALL_STOP', true);
        }
    });
    window.addEventListener('beforeunload', () => send('ALL_STOP', true));
    updateControlAvailability();
    connect();
})();

