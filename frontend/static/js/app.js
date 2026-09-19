// 公共函数&操作
function leftFeedback(command) {
    leftText.textContent = command;
    leftFeedbackBox.classList.add('show');
    setTimeout(() => {
        leftFeedbackBox.classList.remove('show');
    }, 3000);
}
function rightFeedback(command) {
    rightText.textContent = command;
    rightFeedbackBox.classList.add('show');
    setTimeout(() => {
        rightFeedbackBox.classList.remove('show');
    }, 3000);
}

function updateSpeedSlider(speed) {
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    speedSlider.value = speed;
    speedValue.textContent = speed;
}
/* 命令发送函数 */
function sendCommand(command) {
    console.log(`命令已发送: ${command}`);
    rightFeedback("命令已发送: " + command);

    if (ws_control && ws_control.readyState === WebSocket.OPEN) {
        ws_control.send(command);
    } else {
        console.warn('尝试发送命令时连接不可用');
    }
}
