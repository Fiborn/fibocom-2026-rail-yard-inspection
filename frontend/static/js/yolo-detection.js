(() => {
    'use strict';

    const INPUT_SIZE = 640;
    const FRAME_INTERVAL_MS = 900;
    const ALERT_COOLDOWN_MS = 30000;
    const UPLOAD_WIDTH = 480;
    const JPEG_QUALITY = 0.78;

    const labelMap = {
        person_intrusion: { text: '人员越界', key: 'person', level: '高' },
        track_obstacle: { text: '道旁异物', key: 'object', level: '高' },
        open_door: { text: '车门异常', key: 'door', level: '高' },
        track_damage: { text: '轨道损坏', key: 'track', level: '中' }
    };

    const video = document.getElementById('remoteVideo');
    const canvas = document.getElementById('detectionCanvas');
    const status = document.getElementById('detectionStatus');
    const captureCanvas = document.createElement('canvas');
    const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: false });
    const ctx = canvas ? canvas.getContext('2d') : null;

    let running = false;
    let busy = false;
    let lastDetections = [];
    const lastAlertByType = new Map();

    function setStatus(text, ready = false) {
        if (!status) return;
        status.textContent = text;
        status.classList.toggle('ready', ready);
    }

    function resizeCanvas() {
        if (!canvas || !video) return false;
        const rect = video.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        return width > 1 && height > 1;
    }

    function intersectionOverUnion(a, b) {
        const left = Math.max(a.x1, b.x1);
        const top = Math.max(a.y1, b.y1);
        const right = Math.min(a.x2, b.x2);
        const bottom = Math.min(a.y2, b.y2);
        const area = Math.max(0, right - left) * Math.max(0, bottom - top);
        const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
        const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
        return area / Math.max(1e-6, areaA + areaB - area);
    }

    function nonMaxSuppression(detections) {
        const sorted = detections.sort((a, b) => b.score - a.score);
        const kept = [];
        for (const item of sorted) {
            const overlaps = kept.some(other =>
                other.className === item.className && intersectionOverUnion(other, item) > 0.45
            );
            if (!overlaps) kept.push(item);
        }
        return kept;
    }

    function drawDetections(detections) {
        if (!ctx || !resizeCanvas()) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scaleX = canvas.width / INPUT_SIZE;
        const scaleY = canvas.height / INPUT_SIZE;

        detections.forEach(item => {
            const meta = labelMap[item.className] || { text: item.className };
            const x = Math.max(0, item.x1 * scaleX);
            const y = Math.max(0, item.y1 * scaleY);
            const width = Math.min(canvas.width - x, (item.x2 - item.x1) * scaleX);
            const height = Math.min(canvas.height - y, (item.y2 - item.y1) * scaleY);
            const text = `${meta.text} ${(item.score * 100).toFixed(0)}%`;

            ctx.lineWidth = 4;
            ctx.strokeStyle = '#ff2d2d';
            ctx.strokeRect(x, y, width, height);
            ctx.font = '700 15px Microsoft YaHei UI, sans-serif';
            const labelWidth = Math.ceil(ctx.measureText(text).width) + 14;
            const labelHeight = 24;
            const labelY = Math.max(0, y - labelHeight);
            ctx.fillStyle = 'rgba(196, 0, 0, 0.86)';
            ctx.fillRect(x, labelY, labelWidth, labelHeight);
            ctx.fillStyle = '#fff';
            ctx.fillText(text, x + 7, labelY + 17);
        });
    }

    function shouldCreateAlert(item, now) {
        const lastAlertTime = lastAlertByType.get(item.className) || 0;
        if (now - lastAlertTime < ALERT_COOLDOWN_MS) return false;
        lastAlertByType.set(item.className, now);
        return true;
    }

    function persistAlarm(item) {
        const meta = labelMap[item.className] || {};
        const record = {
            triggerTime: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            targetClass: item.className,
            label: meta.text || item.className,
            level: item.level || meta.level || '中',
            confidence: Number(item.score.toFixed(4)),
            x1: Number(item.x1.toFixed(2)),
            y1: Number(item.y1.toFixed(2)),
            x2: Number(item.x2.toFixed(2)),
            y2: Number(item.y2.toFixed(2))
        };

        fetch('/alarm-log/append', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
        }).catch(error => console.warn('Alarm record save failed:', error));
    }

    function updateAgentPanel(data) {
        const label = document.getElementById('agent-label');
        const confidence = document.getElementById('agent-confidence');
        const severity = document.getElementById('agent-severity');
        const advice = document.getElementById('agent-advice');
        if (!label || !confidence || !severity || !advice) return;

        label.textContent = data.label || '未知告警';
        confidence.textContent = `${Math.round((data.confidence || 0) * 100)}%`;
        severity.textContent = data.severity || '待复核';
        severity.className = '';
        if ((data.severity || '').includes('高危')) severity.classList.add('danger');
        else if ((data.severity || '').includes('中等')) severity.classList.add('warning');
        else severity.classList.add('normal');
        advice.textContent = data.advice || '暂无建议，请等待人工复核。';
    }

    window.updateRailwayAgentPanel = updateAgentPanel;

    function requestAgentAdvice(item) {
        const meta = labelMap[item.className] || {};
        fetch('/agent/advice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetClass: item.className,
                label: meta.text || item.className,
                confidence: Number(item.score.toFixed(4))
            })
        })
            .then(response => response.json())
            .then(result => {
                if (result && result.code === 0 && result.data) updateAgentPanel(result.data);
            })
            .catch(error => console.warn('Agent advice request failed:', error));
    }

    function syncDashboard(detections) {
        const grouped = new Map();
        detections.forEach(item => {
            const meta = labelMap[item.className];
            if (!meta) return;
            const merged = { ...item, ...meta, level: item.level || meta.level };
            const current = grouped.get(meta.key);
            if (!current || item.score > current.score) grouped.set(meta.key, merged);
        });

        ['door', 'object', 'person', 'track'].forEach(key => {
            const hit = grouped.get(key);
            const value = hit ? Math.round(Math.max(36, hit.score * 100)) : 0;
            const bar = document.getElementById(`dist-${key}`);
            const label = document.getElementById(`dist-${key}-val`);
            if (bar) bar.style.width = `${value}%`;
            if (label) label.textContent = String(value);
        });

        const tbody = document.getElementById('alert-body');
        if (tbody && grouped.size > 0) {
            const now = Date.now();
            const newAlerts = Array.from(grouped.values()).filter(item => shouldCreateAlert(item, now));
            if (newAlerts.length === 0) return;
            newAlerts.forEach(persistAlarm);
            newAlerts.forEach(requestAgentAdvice);

            const rows = newAlerts.map(item => {
                const levelClass = item.level === '高' ? 'high' : item.level === '中' ? 'mid' : 'low';
                return `<tr>
                    <td>${new Date().toLocaleTimeString('zh-CN', { hour12: false })}</td>
                    <td>${item.text}</td>
                    <td><span class="level ${levelClass}">${item.level}</span></td>
                    <td>已识别</td>
                </tr>`;
            });
            tbody.innerHTML = rows.concat(Array.from(tbody.querySelectorAll('tr')).map(row => row.outerHTML))
                .slice(0, 6)
                .join('');
        }

        const warningCount = document.getElementById('warning-count');
        if (warningCount) warningCount.textContent = String(grouped.size);
    }

    function captureFrame() {
        const sourceWidth = video.naturalWidth || video.videoWidth || 640;
        const sourceHeight = video.naturalHeight || video.videoHeight || 480;
        const height = Math.max(1, Math.round(UPLOAD_WIDTH * sourceHeight / Math.max(1, sourceWidth)));
        captureCanvas.width = UPLOAD_WIDTH;
        captureCanvas.height = height;
        captureCtx.drawImage(video, 0, 0, UPLOAD_WIDTH, height);
        return captureCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
    }

    async function detectOnce() {
        if (!running || busy || !video || (video.tagName === 'IMG' ? !video.complete || !video.naturalWidth : video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)) return;
        busy = true;
        try {
            const response = await fetch('/vision/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: captureFrame(),
                    width: INPUT_SIZE,
                    height: INPUT_SIZE
                })
            });
            const result = await response.json();
            const detections = result && result.code === 0 && result.data ? result.data.detections || [] : [];
            lastDetections = nonMaxSuppression(detections);
            drawDetections(lastDetections);
            syncDashboard(lastDetections);
            setStatus(
                lastDetections.length
                    ? `后端识别到 ${lastDetections.length} 处异常`
                    : `后端识别运行中，未发现异常${result && result.data && result.data.bestLabel ? `，最高匹配${result.data.bestLabel} ${(result.data.bestScore || 0).toFixed(2)}` : ''}`,
                true
            );
        } catch (error) {
            console.error('Backend vision failed:', error);
            setStatus('后端识别请求异常，请确认服务已启动');
        } finally {
            busy = false;
        }
    }

    function detectLoop() {
        detectOnce();
        window.setTimeout(detectLoop, FRAME_INTERVAL_MS);
    }

    function init() {
        if (!video || !canvas) {
            setStatus('视频或画布未加载，识别未启动');
            return;
        }
        if (video.tagName === 'IMG') {
            setStatus('SC171 实时画面已接入；跨源 MJPEG 不进行浏览器抓帧识别', true);
            window.addEventListener('resize', () => drawDetections(lastDetections));
            return;
        }
        running = true;
        window.__railwayDetectionActive = true;
        setStatus('后端识别已启用，等待摄像头画面', true);
        const readyEvent = video.tagName === 'IMG' ? 'load' : 'loadeddata';
        video.addEventListener(readyEvent, detectLoop, { once: true });
        window.addEventListener('camera-stream-ready', detectLoop, { once: true });
        if (video.tagName === 'IMG' ? video.complete && video.naturalWidth : video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) detectLoop();
        window.addEventListener('resize', () => drawDetections(lastDetections));
    }

    init();
})();
