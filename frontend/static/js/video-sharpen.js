(() => {
    'use strict';

    const video = document.getElementById('remoteVideo');
    const canvas = document.getElementById('sharpenCanvas');
    const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
    const buffer = document.createElement('canvas');
    const bufferCtx = buffer.getContext('2d', { willReadFrequently: true });

    if (!video || !canvas || !ctx || !bufferCtx) return;

    const SHARPEN_AMOUNT = 0.62;
    const MAX_RENDER_WIDTH = 960;
    let running = false;

    function resizeCanvas() {
        const rect = video.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const sourceWidth = video.videoWidth || width;
        const sourceHeight = video.videoHeight || height;
        const scale = Math.min(1, MAX_RENDER_WIDTH / Math.max(1, sourceWidth));
        const workWidth = Math.max(1, Math.round(sourceWidth * scale));
        const workHeight = Math.max(1, Math.round(sourceHeight * scale));
        if (buffer.width !== workWidth || buffer.height !== workHeight) {
            buffer.width = workWidth;
            buffer.height = workHeight;
        }
    }

    function clamp(value) {
        return Math.max(0, Math.min(255, value));
    }

    function sharpen(imageData) {
        const { data, width, height } = imageData;
        const source = new Uint8ClampedArray(data);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const offset = (y * width + x) * 4;
                const left = offset - 4;
                const right = offset + 4;
                const top = offset - width * 4;
                const bottom = offset + width * 4;

                for (let channel = 0; channel < 3; channel++) {
                    const center = source[offset + channel];
                    const laplacian = center * 4
                        - source[left + channel]
                        - source[right + channel]
                        - source[top + channel]
                        - source[bottom + channel];
                    data[offset + channel] = clamp(center + laplacian * SHARPEN_AMOUNT);
                }
            }
        }

        return imageData;
    }

    function render() {
        if (!running) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            resizeCanvas();
            bufferCtx.drawImage(video, 0, 0, buffer.width, buffer.height);
            const imageData = bufferCtx.getImageData(0, 0, buffer.width, buffer.height);
            bufferCtx.putImageData(sharpen(imageData), 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
        }
        window.requestAnimationFrame(render);
    }

    function start() {
        if (running) return;
        running = true;
        render();
    }

    window.addEventListener('local-camera-ready', start);
    window.addEventListener('resize', resizeCanvas);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) start();
})();
