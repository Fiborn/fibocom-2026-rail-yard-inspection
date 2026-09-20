/* 控制命令WebSocket连接 */
let ws_control;
let reconnectAttempts_control = 0;
const maxReconnectAttempts_control = 5;
const reconnectDelay_control = 3000; // 3秒重连间隔

function connectWebSocket_control() {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws_control = new WebSocket(`${scheme}://${window.location.host}/ws/controller`);
    // 设置事件监听
    ws_control.onopen = () => {
        console.log('WebSocket连接建立');
        reconnectAttempts_control = 0;
    };
    ws_control.onmessage = (event) => {
        leftFeedback("WS收到消息:" + event.data);
        console.log('收到消息:', event.data);
        //返回的速度信息Speed:800
        if (event.data.startsWith('Speed:')) {
            const speed = parseInt(event.data.split(':')[1]);
            updateSpeedSlider(speed);
        }
    };
    ws_control.onclose = (event) => {
        console.log(`连接关闭 code:${event.code} reason:${event.reason}`);
        handleReconnect();
    };
    ws_control.onerror = (error) => {
        console.error('WebSocket Error:', error);
        ws_control.close();
    };
}

function handleReconnect() {
    if (reconnectAttempts_control < maxReconnectAttempts_control) {
        setTimeout(() => {
            console.log(`尝试重连第 ${reconnectAttempts_control + 1} 次`);
            reconnectAttempts_control++;
            connectWebSocket_control();
        }, reconnectDelay_control);
    } else {
        console.log('重连失败');
    }
}

