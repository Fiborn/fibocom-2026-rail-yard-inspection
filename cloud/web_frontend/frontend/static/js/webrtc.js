/* WebRTC视频流连接 */
const video = document.getElementById('remoteVideo');
let ws = null;
let pc = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 2000; // 2 seconds

function connectWebSocket() {
    // ws = new WebSocket(`wss://${window.location.host}/signaling`);
    ws = new WebSocket(`wss://smarttilleye.59888888.xyz/signaling`);
    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
    };
    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('收到WEBRTC WS消息:', message.type);
        if (message.type === 'offer') {
            await handleOffer(message);
        }
    };
    ws.onclose = (event) => {
        console.log('WebSocket closed, reconnecting...', event);
        if (pc) {
            pc.close();
            pc = null;
        }
        video.srcObject = null;
        setTimeout(connectWebSocket, reconnectDelay);
    };
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
    };
}

async function handleOffer(offer) {
    try {
        // 清理之前的连接
        if (pc) {
            pc.close();
            pc = null;
        }
        // 创建新连接
        pc = new RTCPeerConnection();
        pc.ontrack = (e) => {
            if (e.track.kind === 'video') {
                video.srcObject = e.streams[0];
            }
        };
        pc.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected') {
                console.log('ICE disconnected, requesting reconnect');
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'reconnect' }));
                }
            }
        };
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription.sdp }));
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

// 初始连接
connectWebSocket();