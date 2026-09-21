(() => {
    'use strict';

    const config = window.SMART_TILL_EYE_LOCATION_CONFIG || {};
    const locationApiBase = String(config.locationApiBase || '').replace(/\/$/, '');
    const mapElement = document.getElementById('map');
    const statusBadge = document.getElementById('locationStatus');
    const longitudeText = document.getElementById('longitudeValue');
    const latitudeText = document.getElementById('latitudeValue');
    const speedText = document.getElementById('speedValue');
    const destinationText = document.getElementById('destinationValue');
    const distanceText = document.getElementById('distanceValue');
    const durationText = document.getElementById('durationValue');
    const planButton = document.getElementById('planRouteButton');
    const clearButton = document.getElementById('clearRouteButton');
    const message = document.getElementById('locationMessage');

    let map = null;
    let driving = null;
    let currentMarker = null;
    let destinationMarker = null;
    let currentPosition = null;
    let destinationPosition = null;
    let pollTimer = null;

    function setMessage(text, type) {
        message.textContent = text;
        message.className = `message${type ? ` ${type}` : ''}`;
    }

    function setOnline(online) {
        statusBadge.textContent = online ? '定位在线' : '定位离线';
        statusBadge.classList.toggle('online', online);
    }

    function formatNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number.toFixed(6) : '--';
    }

    function formatDuration(seconds) {
        const total = Math.max(0, Math.round(Number(seconds) || 0));
        const minutes = Math.round(total / 60);
        if (minutes < 60) return `${minutes} 分钟`;
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
    }

    function formatDistance(meters) {
        const distance = Number(meters) || 0;
        if (distance >= 1000) return `${(distance / 1000).toFixed(2)} 公里`;
        return `${Math.round(distance)} 米`;
    }

    function updatePlanButton() {
        planButton.disabled = !currentPosition || !destinationPosition;
    }

    function ensureCurrentMarker(position) {
        if (!currentMarker) {
            currentMarker = new AMap.Marker({
                map,
                position,
                title: '当前位置',
                offset: new AMap.Pixel(-13, -30)
            });
            return;
        }
        currentMarker.setPosition(position);
    }

    function setDestination(position) {
        destinationPosition = position;
        destinationText.textContent = `${formatNumber(position.lng)}, ${formatNumber(position.lat)}`;

        if (!destinationMarker) {
            destinationMarker = new AMap.Marker({
                map,
                position,
                title: '目的地',
                offset: new AMap.Pixel(-13, -30)
            });
        } else {
            destinationMarker.setPosition(position);
        }

        distanceText.textContent = '--';
        durationText.textContent = '--';
        updatePlanButton();
        setMessage('目的地已选择，可以规划路线。');
    }

    async function fetchLocation() {
        if (!locationApiBase) {
            setOnline(false);
            setMessage('定位服务地址未配置，请检查 js/app-config.js。', 'error');
            return;
        }

        try {
            const response = await fetch(`${locationApiBase}/location`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (!data || !data.valid) {
                setOnline(false);
                setMessage('暂未收到有效定位。', 'warn');
                return;
            }

            const longitude = Number(data.longitude);
            const latitude = Number(data.latitude);
            if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
                setOnline(false);
                setMessage('定位数据格式异常。', 'error');
                return;
            }

            currentPosition = new AMap.LngLat(longitude, latitude);
            longitudeText.textContent = formatNumber(longitude);
            latitudeText.textContent = formatNumber(latitude);
            speedText.textContent = data.speed == null ? '--' : `${data.speed}`;
            setOnline(true);
            ensureCurrentMarker(currentPosition);
            updatePlanButton();

            if (!map.getCenter() || map.getZoom() < 10) {
                map.setZoomAndCenter(16, currentPosition);
            }
        } catch (error) {
            setOnline(false);
            setMessage(`定位服务连接失败：${error.message}`, 'error');
        }
    }

    function planRoute() {
        if (!currentPosition || !destinationPosition || !driving) return;

        distanceText.textContent = '--';
        durationText.textContent = '--';
        setMessage('正在规划路线...');

        driving.search(currentPosition, destinationPosition, (status, result) => {
            if (status !== 'complete' || !result.routes || !result.routes.length) {
                setMessage('路线规划失败，请检查高德 Key、网络或目的地。', 'error');
                return;
            }

            const route = result.routes[0];
            distanceText.textContent = formatDistance(route.distance);
            durationText.textContent = formatDuration(route.time);
            setMessage('路线规划完成。');
        });
    }

    function clearRoute() {
        if (driving) driving.clear();
        if (destinationMarker) {
            destinationMarker.setMap(null);
            destinationMarker = null;
        }
        destinationPosition = null;
        destinationText.textContent = '点击地图选择';
        distanceText.textContent = '--';
        durationText.textContent = '--';
        updatePlanButton();
        setMessage('路线已清除，可以重新选择目的地。');
    }

    function initMap() {
        map = new AMap.Map(mapElement, {
            zoom: 14,
            center: [116.397428, 39.90923],
            resizeEnable: true,
            viewMode: '2D'
        });

        driving = new AMap.Driving({
            map,
            hideMarkers: true,
            policy: AMap.DrivingPolicy.LEAST_TIME
        });

        map.on('click', event => setDestination(event.lnglat));
        planButton.addEventListener('click', planRoute);
        clearButton.addEventListener('click', clearRoute);

        fetchLocation();
        pollTimer = window.setInterval(fetchLocation, 2000);
        setMessage('地图已加载，等待定位数据。');
    }

    window.initLocationMap = initMap;

    window.addEventListener('beforeunload', () => {
        if (pollTimer) window.clearInterval(pollTimer);
        if (map) map.destroy();
    });
})();
