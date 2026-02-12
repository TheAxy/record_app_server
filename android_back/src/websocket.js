import { configuration, initDecoder, videoDecoder } from "./videoDecoderAndCanvas.js";
import { initRecordingDecoder, recordingDecoder } from "./recoringDecoderAndCanvas.js";
import { sliders } from "./main.js";
import { base64ToArrayBuffer } from "./main.js";

let ws = undefined;

function configure(data, type, timestamp) {
    if (configuration.isIos) return;

    configuration.wasConfigurated = false;

    console.log("Configurating...");

    // console.log(data, type, timestamp);

    const chunk = new Uint8Array(base64ToArrayBuffer(data));

    const encodedChunk = new EncodedVideoChunk({
        type: type === 'key' ? 'key' : 'delta',
        timestamp: timestamp,
        data: chunk
    });

    videoDecoder.decode(new EncodedVideoChunk({
        type: "key",
        timestamp: timestamp,
        data: new Uint8Array(base64ToArrayBuffer("AAAAASYBrwle+Y7/24Z7syM/nOpk20/t7vdxrQuI3qkpP1YFNZIYloFO5bs5x7Q+CB6LJlC2np9bI1plTB2GJ1xYqtAnqnHTAPh92TF3bhc")),
    }));

    console.log("first frame from server is: ", encodedChunk, " while isRecoring=", recordingDecoder.isRecording);

    configuration.configurationFrame = encodedChunk;
    configuration.wasConfigurated = true;

    videoDecoder.decode(configuration.configurationFrame);

    if (recordingDecoder.isRecording) {
        initRecordingDecoder();

        recordingDecoder.decoder.decode(new EncodedVideoChunk({
            type: "key",
            timestamp: timestamp,
            data: new Uint8Array(base64ToArrayBuffer("AAAAASYBrwle+Y7/24Z7syM/nOpk20/t7vdxrQuI3qkpP1YFNZIYloFO5bs5x7Q+CB6LJlC2np9bI1plTB2GJ1xYqtAnqnHTAPh92TF3bhc")),
        }));

        recordingDecoder.decoder.decode(configuration.configurationFrame);
    }
    

    console.log("Configurated");

    configuration.wasConfigurated = true;
    configuration.isConfigurating = false;
}

function processChunk(data, type, timestamp) {
    if (!videoDecoder || videoDecoder.state === 'closed') {
        initDecoder();
    }

    const chunk = new Uint8Array(base64ToArrayBuffer(data));

    try {
        const encodedChunk = new EncodedVideoChunk({
            type: type === 'key' ? 'key' : 'delta',
            timestamp: timestamp, // Используем timestamp из сообщения
            data: chunk
        });
        if (!configuration.isIos && !configuration.wasConfigurated) {
            getConfiguration();

            return;
        }

        if (type === 'key') {
            //console.log('Получен ключевой кадр');
        }

        if (recordingDecoder.isRecording) {
            recordingDecoder.recordingFrames.push(encodedChunk);
        }

        videoDecoder.decode(encodedChunk);
    } catch (e) {
        console.error('Ошибка обработки чанка:', e);
    }
};

export function startWebSocket(deviceId) {
    const wsUrl = `wss://axysites.ru:8082/ws?id=${deviceId}`;

    console.log(`WebSocket URL: ${wsUrl}`);
    console.log(`Device ID: ${deviceId}`);

    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
        console.log('Подключено к серверу WebSocket');
        sendCommand('setBatteryPercent');
    }
    ws.onclose = () => console.log('Отключено от WebSocket');
    ws.onerror = (err) => console.error('WebSocket ошибка:', err);
    ws.onmessage = (event) => {
        let type, timestamp, data;
        try {
            const message = JSON.parse(event.data);
            //console.log(message)
            switch (message.command) {
                case "recordingData":
                    console.log('[Fetch] Получены данные записи:', message.recording);
                    recordingFrames = message.recording.recording || [];
                    console.log('[Fetch] Количество кадров записи:', recordingFrames.length);
                    if (recordingFrames.length > 0 && recordingDecoder.currentFrameIndex >= recordingFrames.length) {
                        recordingDecoder.currentFrameIndex = recordingFrames.length - 1;
                    }

                    break;
                    
                case "isIos":
                    configuration.isIos = message.value == "true" ? true : false;

                    break;

                case "newFrame":
                    type = message.type;
                    timestamp = message.timestamp;
                    data = message.data;

                    processChunk(data, type, timestamp);

                    break;

                case "configurationFrame":
                    console.log("configurationFrame: ", message);

                    if (!message.success) {
                        console.log("Can't get configuration: ", message);
                        break;
                    }

                    type = message.type;
                    timestamp = message.timestamp;
                    data = message.data;

                    configure(data, type, timestamp);

                    break;

                case "setExposureDuration":
                    document.getElementById(sliders.exposureDuration.value).textContent = message.value;

                    break;

                case "setISO":
                    document.getElementById(sliders.ISO.value).textContent = message.value;

                    break;

                case "setZoom":
                    document.getElementById(sliders.zoom.value).textContent = message.value;

                    break;

                case "setBitrate":
                    document.getElementById(sliders.bitrate.value).textContent = message.value;

                    break;

                case "setFps":
                    document.getElementById(sliders.fps.value).textContent = message.value;

                    break;

                case "setFocus":
                    document.getElementById(sliders.focus.value).textContent = message.value;

                    break;

                case "setFocusPoint":
                    // TODO

                    break;

                case "batteryPercent":
                    document.getElementById('batteryProcent').textContent = `${message.value}%`;

                    break;

                case "setRecordingDuration":
                    document.getElementById(sliders.recording.value).textContent = message.value;

                    break;

                case "reset":
                    resetAll();

                    break;

                case "stopStream":
                    break;

                default:
                    console.warn('Неизвестное сообщение:', message);
            }
            // if (data) {
            //   const arrayBuffer = base64ToArrayBuffer(data);
            //   processChunk(new Uint8Array(arrayBuffer), type, timestamp);
            // }
        } catch (e) {
            console.error('Ошибка обработки сообщения:', e);
        }
    };
};

export function sendCommand(command) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log(`Sending a command ${command}.`);

        const message = JSON.stringify({command: command});

        ws.send(message);
    } else {
        console.error('[WebSocket] Соединение не открыто. Невозможно отправить команду:', command);
    }
}

export function sendCommandWithValue(command, value) {
    if (ws.readyState === WebSocket.OPEN) {
        console.log(`Sending a command ${command} with value ${value}.`);

        ws.send(JSON.stringify({
            command: command,
            value: value
        }));
    } else {
        console.error('[WebSocket] Соединение не открыто. Невозможно отправить команду:', command);
    }
}

let lastCallTime = 0;
let pendingCallTimeout = null;

export function getConfiguration() {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    // If called too soon, schedule a delayed attempt
    if (timeSinceLastCall < 100) {
        if (!pendingCallTimeout) {
            pendingCallTimeout = setTimeout(() => {
                pendingCallTimeout = null;
                getConfiguration(); // Retry after delay
            }, 100);
        }
        return;
    }

    lastCallTime = now;

    if (ws) {
        if (configuration.isConfigurating) return;
        configuration.isConfigurating = true;

        ws.send(JSON.stringify({ command: 'getConfiguration' }));
    } else {
        console.error("Failed to get configuration frame: ws conn is not opened!");
    }
}