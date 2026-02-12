import { startWebSocket, sendCommand } from "./websocket.js";
import { initDecoder } from "./videoDecoderAndCanvas.js";
import { initRecordingDecoder } from "./recoringDecoderAndCanvas.js";

export const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64); // Декодируем Base64
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

export const sliders = {
    recording: {
        element: 'minutes-slider',
        value: 'minutes-value',
        command: 'setRecordingDuration',
        step: 1,
        range: {min: 10, max: 30}
    },
    exposureDuration: {
        element: 'exposureDuration-slider',
        value: 'exposureDuration-value',
        command: 'setExposureDuration',
        step: 0.01,
        range: {min: 1, max: 15}
    },
    ISO: {element: 'ISO-slider', value: 'ISO-value', command: 'setISO', step: 1, range: {min: 40, max: 5000}},
    zoom: {
        element: 'zoom-slider',
        value: 'zoom-value',
        command: 'setZoom',
        step: 0.1,
        range: {min: 1.0, max: 10.0}
    },
    bitrate: {
        element: 'bitrate-slider',
        value: 'bitrate-value',
        command: 'setBitrate',
        step: 10000,
        range: {min: 10000, max: 10000000}
    },
    fps: {element: 'fps-slider', value: 'fps-value', command: 'setFps', step: 1, range: {min: 1, max: 100}},
    focus: {
        element: 'focus-slider',
        value: 'focus-value',
        command: 'setFocus',
        step: 0.01,
        range: {min: 0.1, max: 10}
    },
    yellow: {
        element: 'yellow-slider',
        value: 'yellow-value',
        command: 'setYellowFilter',
        step: 100,
        range: {min: 1000, max: 10000}
    },
    noise: {
        element: 'noise-slider',
        value: 'noise-value',
        command: 'setNoiseFilter',
        step: 1,
        range: {min: -10, max: 10}
    },
    sharpen: {
        element: 'sharpen-slider',
        value: 'sharpen-value',
        command: 'setSharpenFilter',
        step: 1,
        range: {min: -10, max: 10}
    },
    clarity: {
        element: 'clarity-slider',
        value: 'clarity-value',
        command: 'setClarityFilter',
        step: 1,
        range: {min: -10, max: 10}
    },
    shadow: {
        element: 'shadow-slider',
        value: 'shadow-value',
        command: 'setShadowFilter',
        step: 1,
        range: {min: -10, max: 10}
    },
};

document.getElementById("wsButton").addEventListener("click", function () {
    const params = new URLSearchParams(window.location.search);
    const deviceId = params.get('deviceId') || 'defaultDevice';

    console.log()

    sendCommand('reset');
    startWebSocket(deviceId);
});

window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const deviceId = params.get('deviceId') || 'defaultDevice';

    console.log('[UI] Страница загружена. Инициализация декодеров и WebSocket.');

    initDecoder();
    initRecordingDecoder();

    startWebSocket(deviceId);
};

document.getElementById('batteryProcent').addEventListener('click', e => {
    console.log('batteryProcent')

    sendCommand('setBatteryPercent');
});