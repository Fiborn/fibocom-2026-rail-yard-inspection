(() => {
    'use strict';

    const image = document.getElementById('remoteVideo');
    const status = document.getElementById('cameraStatus');
    const statusText = status ? status.querySelector('span') : null;
    const reconnectButton = document.getElementById('cameraStartButton');
    const streamUrl = window.SMART_TILL_EYE_CONFIG && window.SMART_TILL_EYE_CONFIG.cameraStreamUrl;

    if (!image) return;

    function setStatus(text, visible, showButton) {
        if (!status) return;
        if (statusText) statusText.textContent = text;
        status.hidden = !visible;
        if (reconnectButton) reconnectButton.hidden = !showButton;
    }

    function connectCamera() {
        setStatus('正在连接摄像头', true, false);

        if (!streamUrl) {
            setStatus('视频流地址未配置，请检查 camera-config.js', true, true);
            return;
        }

        image.removeAttribute('src');
        window.setTimeout(() => {
            const separator = streamUrl.includes('?') ? '&' : '?';
            image.src = `${streamUrl}${separator}_reconnect=${Date.now()}`;
        }, 50);
    }

    image.addEventListener('load', () => {
        setStatus('', false, false);
        window.dispatchEvent(new CustomEvent('camera-stream-ready'));
    });

    image.addEventListener('error', () => {
        setStatus('视频流连接失败，请检查 SC171 网络或摄像头', true, true);
    });

    if (reconnectButton) reconnectButton.addEventListener('click', connectCamera);
    connectCamera();
})();
