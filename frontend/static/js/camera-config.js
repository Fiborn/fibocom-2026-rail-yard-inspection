// SC171-V3 MJPEG stream. Keep the page on HTTP; HTTPS would block this HTTP stream as mixed content.
window.SMART_TILL_EYE_CONFIG = Object.freeze({
    cameraStreamUrl: 'http://10.13.49.100:8080/?action=stream'
});
