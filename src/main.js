const sliders = {
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
        step: 100,
        range: {min: 1000, max: 17500}
    },
    fps: {element: 'fps-slider', value: 'fps-value', command: 'setFps', step: 1, range: {min: 1, max: 100}},
    focus: {
        element: 'focus-slider',
        value: 'focus-value',
        command: 'setFocus',
        step: 0.1,
        range: {min: 0.1, max: 10}
    },
};

const params = new URLSearchParams(window.location.search);
const deviceId = params.get('deviceId') || 'defaultDevice';

// const pathSegments = window.location.pathname.split('/').filter(Boolean);
// const deviceId = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : 'Rasim1';
const wsUrl = `wss://axysites.ru:8082/ws?id=${deviceId}`;
console.log(`WebSocket URL: ${wsUrl}`);
console.log(`Device ID: ${deviceId}`);
// // const wsUrl = 'wss://89.104.71.153:8082'; // Обновите URL на WSS
// let deviceId = window.location.pathname.slice(1);
// // Если ничего не указано, задаем значение по умолчанию 
// if (!deviceId) {
//     deviceId = 'Rasim1';
// }
// // Формируем URL с путём и параметром id
// const wsUrl = `wss://axysites.ru:8082/ws?id=${deviceId}`;
// console.log("Подключаемся к камере с deviceId:", deviceId);
// console.log("WebSocket URL:", wsUrl);
//const wsUrl = 'wss://axysites.ru:8082'; // Обновите URL на WSS
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');
let videoDecoder;
let ws;
let recordId = 0;
let recordingForInSecond = 20;
const prevFrameButton = document.getElementById('prevFrame');
const nextFrameButton = document.getElementById('nextFrame');
const rewindBackButton = document.getElementById('rewindBack');
const rewindForwardButton = document.getElementById('rewindForward');
const rewindFramesBackButton = document.getElementById('rewindFramesBack');
const rewindFramesForwardButton = document.getElementById('rewindFramesForward');
const goToFirstFrameButton = document.getElementById('goToFirstFrame');
const recordButton = document.getElementById('startRecordingBtn')
const toggleButton = document.getElementById('toggleButton');

let wasConfugurated = false;
let wasConfugurating = false;
let isStreaming = false;
let isGrayscale = false;
let isRecording = false;
let isIos = false;
let configurationFrame;
let firstChank = null;
let resolution = {width: 640, height: 480};
let currentBrightness = 1; // Диапазон: от -255 до 255
let currentContrast = 1.0;
let streamingInterval;

function getConfiguration() {
    if (ws) {
        ws.send(JSON.stringify({command: 'getConfiguration'}));
    } else {
        console.error("Failed to get configuration frame: ws conn is not opened!");
    }
}

const initDecoder = () => {
    if (!('VideoDecoder' in window)) {
        alert('Ваш браузер не поддерживает VideoDecoder (WebCodecs API).');
        return;
    }
    videoDecoder = new VideoDecoder({
        output: frame => {
            if (!isIos && !configurationFrame) {
                getConfiguration();

                return;
            }

            drawFrame(frame);

            frame.close();
        },
        error: e => {
            // console.error('Ошибка декодирования:', e);
            initDecoder();
            
            getConfiguration();
        }
    });

    videoDecoder.configure({
        codec: 'hev1.1.6.L93.B0', // h.264 baseline profile
        hardwareAcceleration: 'prefer-hardware',
    });
    console.log('Декодер инициализирован');
};


const drawFrame = (frame) => {
    if (!frame) return;
    canvas.width = frame.codedWidth;
    canvas.height = frame.codedHeight;
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    //console.log('[Canvas] Кадр отрисован на videoCanvas.');
};

const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64); // Декодируем Base64
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const startWebSocket = () => {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log('Подключено к серверу WebSocket');
    ws.onclose = () => console.log('Отключено от WebSocket');
    ws.onerror = (err) => console.error('WebSocket ошибка:', err);
    ws.onmessage = (event) => {
        let type, timestamp, data, confFrame;
        try {
            const message = JSON.parse(event.data);
            console.log(message)
            switch (message.command) {
                case "recordingData":
                    console.log('[Fetch] Получены данные записи:', message.recording);
                    recordingFrames = message.recording.recording || [];
                    console.log('[Fetch] Количество кадров записи:', recordingFrames.length);
                    if (recordingFrames.length > 0 && currentFrameIndex >= recordingFrames.length) {
                        currentFrameIndex = recordingFrames.length - 1;
                    }

                    break;
                    
                case "isIos":
                    isIos = message.value == "true" ? true : false;

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

document.getElementById("wsButton").addEventListener("click", function () {
    sendCommand('reset');
    if (ws) {
        ws.close();
    }
    startWebSocket();
});

function configure(data, type, timestamp) {
    if (isIos || wasConfugurating) return;

    wasConfugurating = true;
    wasConfugurated = false;

    console.log("Configurating...");

    console.log(data, type, timestamp);

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

    console.log("first frame from server is: ", encodedChunk);

    configurationFrame = encodedChunk;

    videoDecoder.decode(configurationFrame);

    recordingDecoder.decode(new EncodedVideoChunk({
        type: "key",
        timestamp: timestamp,
        data: new Uint8Array(base64ToArrayBuffer("AAAAASYBrwle+Y7/24Z7syM/nOpk20/t7vdxrQuI3qkpP1YFNZIYloFO5bs5x7Q+CB6LJlC2np9bI1plTB2GJ1xYqtAnqnHTAPh92TF3bhc")),
    }));

    recordingDecoder.decode(configurationFrame);

    console.log("Configurated");

    wasConfugurated = true;
    wasConfugurating = false;
}

const processChunk = (data, type, timestamp) => {
    if (!videoDecoder || videoDecoder.state === 'closed') return;

    const chunk = new Uint8Array(base64ToArrayBuffer(data));

    try {
        const encodedChunk = new EncodedVideoChunk({
            type: type === 'key' ? 'key' : 'delta',
            timestamp: timestamp, // Используем timestamp из сообщения
            data: chunk
        });
        if (!isIos && !wasConfugurated) {
            getConfiguration();

            return;
        }

        if (type === 'key') {
            //console.log('Получен ключевой кадр');
        }

        if (isRecording) {
            recordingFrames.push(encodedChunk);
        }

        videoDecoder.decode(encodedChunk);
    } catch (e) {
        console.error('Ошибка обработки чанка:', e);
    }
};

// --- ЗАПИСЬ!!! ---
const recordingCanvas = document.getElementById('recordingCanvas');
const recCtx = recordingCanvas.getContext('2d');

let recordingDecoder;
let recordingFrames = [];
let currentFrameIndex = 0;
let autoPlayTimer;
let autoPlayPauseTimeout;
const frameInterval = 100;
let recordingPolling;
let isConfigurated = false;

const initRecordingDecoder = () => {
    if (!('VideoDecoder' in window)) {
        alert('Ваш браузер не поддерживает VideoDecoder (WebCodecs API).');
        return;
    }
    recordingDecoder = new VideoDecoder({
        output: frame => {
            console.log('[RecordingDecoder] Получен кадр с размерами:', frame.codedWidth, frame.codedHeight);
            recordingCanvas.width = frame.codedWidth;
            recordingCanvas.height = frame.codedHeight;
            recCtx.drawImage(frame, 0, 0, recordingCanvas.width, recordingCanvas.height);
            frame.close();
        },
        error: e => {
            console.log('[RecordingDecoder] Ошибка декодирования кадра:', e);
            

            getConfiguration();
            initRecordingFrames();
            initRecordingDecoder();
        }
    });
    recordingDecoder.configure({
        codec: 'hev1.1.6.L93.B0',
        hardwareAcceleration: 'prefer-hardware',
    });
    console.log('Декодер записи инициализирован');
};

function initRecordingFrames() {
    recordingFrames = [];

    currentFrameIndex = 0;

    if (!isIos){
        recordingFrames = [
            configurationFrame
        ];

        playRecordingFrame();

        currentFrameIndex++;
    }
}

function playRecordingFrame() {
    if (recordingFrames.length === 0) {
        console.warn('[Recording] Нет кадров для воспроизведения.');

        return;
    }

    const encodedChunk = recordingFrames[currentFrameIndex];

    try {
        recordingDecoder.decode(encodedChunk);
    } catch (e) {
        console.error('Ошибка декодирования записи:', e);

        getConfiguration();

        initRecordingDecoder();
        initRecordingFrames();
    }
}

function startAutoPlay() {
    clearInterval(autoPlayTimer);
    autoPlayTimer = setInterval(() => {
        if (currentFrameIndex < recordingFrames.length - 1) {
            playRecordingFrame();
            currentFrameIndex++;
        }
    }, 30);
}

function pauseAutoPlayTemporarily() {
    clearInterval(autoPlayTimer);
    clearTimeout(autoPlayPauseTimeout);
    // autoPlayPauseTimeout = setTimeout(() => {
    //   startAutoPlay();
    // }, 3000);
}

// TODO
function fetchRecording() {
    console.log("[Recording] Получение всей записи...");

    ws.send(JSON.stringify({command: 'getRecording', offset: currentFrameIndex}));
}

// Функция для отправки команды на сервер через WebSocket */

function sendCommand(command) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({command});
        console.log('[WebSocket] Отправка команды:', message);
        ws.send(message);
    } else {
        console.error('[WebSocket] Соединение не открыто. Невозможно отправить команду:', command);
    }
}

// Обработка данных о записи, полученных через WebSocket
function handleRecordingData(data) {
    console.log('[Recording] Обработка данных записи из WebSocket:', data);
    recordingFrames = data.recording || [];
    console.log('[Recording] Обновлено количество кадров записи:', recordingFrames.length);
    if (recordingFrames.length > 0 && currentFrameIndex >= recordingFrames.length) {
        currentFrameIndex = recordingFrames.length - 1;
    }
}

// Объединённый обработчик для кнопки "Начать запись"
// document.getElementById('startRecordingBtn').addEventListener('click', () => {
//     console.log('[UI] Нажата кнопка "Начать запись".');
//     if (recordingPolling) clearInterval(recordingPolling);
//     sendCommand('startRecording');
//     currentFrameIndex = 0;
//     fetchRecording();
//     startAutoPlay();
//     recordingPolling = setInterval(fetchRecording, 1000);
// });

// Кнопка "Начать запись"
// document.getElementById('startRecordingBtn').addEventListener('click', () => {
//     sendCommand('startRecording');
//     currentFrameIndex = 0;
//     startAutoPlay();
// });

// Кнопка "Стоп запись"
// document.getElementById('stopRecordingBtn').addEventListener('click', () => {
//     console.log('[UI] Нажата кнопка "Стоп запись".');
//     sendCommand('stopRecording');
//     if (recordingPolling) clearInterval(recordingPolling);
// });

function handleRecordingToggle() {
    const btn = document.getElementById('recordButton');

    if (btn.textContent.includes('Остановить запись')) {
        console.log('[UI] Остановка записи');
        sendCommand('stopRecording');
        isRecording = false;
        if (recordingPolling) clearInterval(recordingPolling);
        if (autoPlayTimer) clearInterval(autoPlayTimer);
        btn.textContent = 'Начать запись (K)';
        btn.style.backgroundColor = '#007bff'; // Возвращаем синий цвет
        btn.style.color = 'white';
    } else {
        console.log('[UI] Запуск записи');
        if (!wasConfugurated && !isIos) {
            alert("Дождитесь начала видео потока перед началом записи.");

            return;
        }

        initRecordingFrames();

        recordId++;
        let recordIdHere = recordId;

        sendCommand('startRecording');

        setTimeout(() => {
            if (isRecording && recordIdHere == recordId) {
                handleRecordingToggle()
            }
        }, recordingForInSecond * 1000);

        currentFrameIndex = 0;
        fetchRecording();
        startAutoPlay();
        isRecording = true;
        btn.textContent = 'Остановить запись (K)';
        btn.style.backgroundColor = '#ff4444'; // Меняем на красный цвет
        btn.style.color = 'white';
    }
}

//  document.getElementById('startRecordingBtn').addEventListener('click', () => {
//     let message = JSON.stringify({ command: 'startRecording' });
//     console.log(message);
//     ws.send(message);
//     currentFrameIndex = 0;
//     fetchRecording();
//     startAutoPlay();
//     recordingPolling = setInterval(fetchRecording, 1000);
// });
// document.getElementById('stopRecordingBtn').addEventListener('click', () => {
//   ws.send(JSON.stringify({ command: 'stopRecording' }));
//   clearInterval(recordingPolling);
// });

document.getElementById('prevFrameBtn').addEventListener('click', () => {
    if (currentFrameIndex > 0) {
        const prevIndex = currentFrameIndex;
        currentFrameIndex--;
        console.log('[prevFrameBtn] Перемотка назад: с ' + prevIndex + ' на ' + currentFrameIndex);
        playRecordingFrame();
        pauseAutoPlayTemporarily();
    } else {
        console.log('[prevFrameBtn] Уже на первом кадре: ' + currentFrameIndex);
    }
});

document.getElementById('rewindBack').addEventListener('click', () => {
    if (currentFrameIndex > 0) {
        const prevIndex = currentFrameIndex;
        currentFrameIndex = Math.max(0, currentFrameIndex - 5);
        console.log('[rewindBack] Перемотка на 5 кадров назад: с ' + prevIndex + ' на ' + currentFrameIndex);
        playRecordingFrame();
        pauseAutoPlayTemporarily();
    } else {
        console.log('[prevFrameBtn] Уже на первом кадре: ' + currentFrameIndex);
    }
});

document.getElementById('rewindFramesBack').addEventListener('click', () => {
    if (currentFrameIndex > 0) {
        const prevIndex = currentFrameIndex;
        currentFrameIndex = Math.max(0, currentFrameIndex - 10);
        console.log('[rewindFramesBack] Перемотка на 10 кадров назад: с ' + prevIndex + ' на ' + currentFrameIndex);
        playRecordingFrame();
        pauseAutoPlayTemporarily();
    } else {
        console.log('[prevFrameBtn] Уже на первом кадре: ' + currentFrameIndex);
    }
});

document.getElementById('nextFrameBtn').addEventListener('click', () => {
    if (currentFrameIndex < recordingFrames.length - 1) {
        const prevIndex = currentFrameIndex;
        currentFrameIndex++;
        console.log('[nextFrameBtn] Перемотка вперед: с ' + prevIndex + ' на ' + currentFrameIndex);
        playRecordingFrame();
        pauseAutoPlayTemporarily();
    } else {
        console.log('[nextFrameBtn] Уже на последнем кадре: ' + currentFrameIndex);
    }
});

document.getElementById('rewindForward').addEventListener('click', () => {
    if (currentFrameIndex < recordingFrames.length - 1) {
        const prevIndex = currentFrameIndex;
        currentFrameIndex = Math.max(0, currentFrameIndex - 5);
        console.log('[rewindForward] Перемотка вперед на 5 кадров: с ' + prevIndex + ' на ' + currentFrameIndex);
        playRecordingFrame();
        pauseAutoPlayTemporarily();
    } else {
        console.log('[nextFrameBtn] Уже на последнем кадре: ' + currentFrameIndex);
    }
});

document.getElementById('rewindFramesForward').addEventListener('click', () => {
    if (currentFrameIndex < recordingFrames.length - 1) {
        const prevIndex = currentFrameIndex;
        currentFrameIndex = Math.max(0, currentFrameIndex - 10);
        console.log('[rewindFramesForward] Перемотка вперед на 10 кадров: с ' + prevIndex + ' на ' + currentFrameIndex);
        playRecordingFrame();
        pauseAutoPlayTemporarily();
    } else {
        console.log('[nextFrameBtn] Уже на последнем кадре: ' + currentFrameIndex);
    }
});

document.getElementById('goToFirstFrame').addEventListener('click', () => {
    const prevIndex = currentFrameIndex;
    currentFrameIndex = 0;
    console.log(`[goToFirstFrame] Переход к первому кадру: с ${prevIndex} на ${currentFrameIndex}`);
    playRecordingFrame();
    pauseAutoPlayTemporarily();
});


window.onload = () => {
    console.log('[UI] Страница загружена. Инициализация декодеров и WebSocket.');
    initDecoder();
    initRecordingDecoder();
    startWebSocket();
};

// Функция для применения контрастности к изображению
function applyContrastToFrame(imageData, contrast) {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // Применяем контрастность к каждому каналу (R, G, B)
        data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128));     // Красный канал
        data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrast + 128)); // Зелёный канал
        data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrast + 128)); // Синий канал
    }

    return imageData;
}

// Функция для применения яркости к изображению
function applyBrightnessToFrame(imageData, brightness) {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // Применяем яркость к каждому каналу (R, G, B)
        data[i] = Math.min(255, Math.max(0, data[i] + brightness));     // Красный канал
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + brightness)); // Зелёный канал
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + brightness)); // Синий канал
    }

    return imageData;
}

document.getElementById('batteryProcent').addEventListener('click', e => {
    console.log('batteryProcent')
    ws.send(JSON.stringify({command: 'setBatteryPercent'}));
})

canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left; // Координата X относительно canvas
    const y = event.clientY - rect.top; // Координата Y относительно canvas

    // Нормализация координат в диапазон [0.0, 1.0]
    const normalizedX = x / canvas.width;
    const normalizedY = y / canvas.height;

    console.log(`Клик по координатам: (${normalizedX.toFixed(2)}, ${normalizedY.toFixed(2)})`);

    // Отправка команды на сервер
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            command: "setFocusPoint",
            value: {x: normalizedX, y: normalizedY}
        }));
    } else {
        console.warn("WebSocket не готов, команда не отправлена.");
    }
});

document.addEventListener('DOMContentLoaded', () => {
    let isFlippedHorizontally = false;
    let isFlippedVertically = false;
    let currentRotation = 0;

    document.getElementById('flipHorizontal').addEventListener('click', () => {
        isFlippedHorizontally = !isFlippedHorizontally;
        updateCanvasTransform();
    });
    document.getElementById('flipVertical').addEventListener('click', () => {
        isFlippedVertically = !isFlippedVertically;
        updateCanvasTransform();
    });

    function updateCanvasTransform() {
        const scaleX = isFlippedHorizontally ? -1 : 1;
        const scaleY = isFlippedVertically ? -1 : 1;

        canvas.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
        recordingCanvas.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
    }

    function updateCanvasRotation(degrees) {
        currentRotation += degrees;
        canvas.style.transform = `rotate(${currentRotation}deg)`;
        recordingCanvas.style.transform = `rotate(${currentRotation}deg)`;
    }

    document.getElementById('rotateMinus90').addEventListener('click', () => {
        updateCanvasRotation(-90);
    });
    document.getElementById('rotateMinus5').addEventListener('click', () => {
        updateCanvasRotation(-5);
    });
    document.getElementById('rotatePlus5').addEventListener('click', () => {
        updateCanvasRotation(5);
    });
    document.getElementById('rotatePlus90').addEventListener('click', () => {
        updateCanvasRotation(90);
    });

    // Обработчик кнопки для переключения камеры
    document.getElementById('switchCameraButton').addEventListener('click', () => {
        console.log("Отправлена команда на переключение камеры");
        ws.send(JSON.stringify({command: "switchCamera"}));
    });

    toggleButton.addEventListener('click', () => {
        isGrayscale = !isGrayscale;

        if (isGrayscale) {
            canvas.style.filter = 'grayscale(100%)';
            recordingCanvas.style.filter = 'grayscale(100%)';
        } else {
            canvas.style.filter = 'grayscale(0%)';
            recordingCanvas.style.filter = 'grayscale(0%)';
        }
    });


    // document.getElementById('startStopButton').addEventListener('click', () => {
    //     isStreaming = !isStreaming;
    //     const command = isStreaming ? "startStreaming" : "stopStreaming";
    //     console.log(`Отправлена команда: ${command}`);
    //     ws.send(JSON.stringify({ command }));
    //     document.getElementById('startStopButton').textContent = isStreaming ? "Остановить" : "Начать";
    // });


    // // Добавляем обработчик события на кнопку
    // recordButton.addEventListener('click', () => {
    //     if (isRecording) {
    //         // Если запись уже идет, останавливаем её
    //         console.log("Отправлена команда на остановку записи");
    //         isRecording = false;
    //         ws.send(JSON.stringify({ command: "stopRecording" }));
    //         recordButton.textContent = 'Начать запись (K)';
    //         recordButton.classList.remove('_recording');
    //         stopStreamingRecordedFrames(); // Останавливаем потоковый просмотр записанных кадров
    //     } else {
    //         // Если запись не идет, начинаем её
    //         console.log("Отправлена команда на начало записи");
    //         isRecording = true;
    //         recordedFrames = [];
    //         currentFrameIndex = 0;
    //         ws.send(JSON.stringify({ command: "startRecording" }));
    //         recordButton.textContent = 'Остановить запись (K)';
    //         recordButton.classList.add('_recording');
    //         recordingCanvas.style.display = 'block';
    //         document.querySelector('.navigation-buttons').style.display = 'block';
    //         startStreamingRecordedFrames(); // Стартуем потоковый просмотр записанных кадров
    //     }
    // });

    // Добавляем обработчик события keydown на весь документ
    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        // Проверяем, какая клавиша была нажата
        if (key === 'i' || key === 'ш') {
            // Листаем назад при нажатии на "I"
            if (currentFrameIndex > 0) {
                const prevIndex = currentFrameIndex;
                currentFrameIndex--;
                console.log('[prevFrameBtn] Перемотка назад: с ' + prevIndex + ' на ' + currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[prevFrameBtn] Уже на первом кадре: ' + currentFrameIndex);
            }
        } else if (key === 'o' || key === 'щ') {
            if (currentFrameIndex < recordingFrames.length - 1) {
                const prevIndex = currentFrameIndex;
                currentFrameIndex++;
                console.log('[nextFrameBtn] Перемотка вперед: с ' + prevIndex + ' на ' + currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ' + currentFrameIndex);
            }
        } else if (key === ',' || key === 'б') {
            if (currentFrameIndex > 0) {
                const prevIndex = currentFrameIndex;
                currentFrameIndex = Math.max(0, currentFrameIndex - 10);
                console.log('[rewindFramesBack] Перемотка на 10 кадров назад: с ' + prevIndex + ' на ' + currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[prevFrameBtn] Уже на первом кадре: ' + currentFrameIndex);
            }
        } else if (key === 'j' || key === 'о') {
            if (currentFrameIndex < recordingFrames.length - 1) {
                const prevIndex = currentFrameIndex;
                currentFrameIndex = Math.max(0, currentFrameIndex - 5);
                console.log('[rewindForward] Перемотка вперед на 5 кадров: с ' + prevIndex + ' на ' + currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ' + currentFrameIndex);
            }
        } else if (key === 'n' || key === 'т') {
            if (currentFrameIndex < recordingFrames.length - 1) {
                const prevIndex = currentFrameIndex;
                currentFrameIndex = Math.max(0, currentFrameIndex + 5);
                console.log('[rewindForward] Перемотка вперед на 5 кадров: с ' + prevIndex + ' на ' + currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ' + currentFrameIndex);
            }
        } else if (key === 'm' || key === 'ь') {
            if (currentFrameIndex < recordingFrames.length - 1) {
                const prevIndex = currentFrameIndex;
                const framesToAdvance = 10;
                currentFrameIndex = Math.max(0, currentFrameIndex + 10);
                console.log('[rewindFramesForward] Перемотка вперед на 10 кадров: с ' + prevIndex + ' на ' + currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ' + currentFrameIndex);
            }
        }
            // else if (key === 'k' || key === 'л') {
            //     if (isRecording) {
            //         // Если запись уже идет, останавливаем её
            //         console.log("Отправлена команда на остановку записи");
            //         // isRecording = false;
            //         // ws.send(JSON.stringify({ command: "stopRecording" }));
            //         sendCommand('stopRecording');
            //         recordButton.textContent = 'Начать запись (K)';
            //         // recordButton.classList.remove('_recording');
            //         // stopStreamingRecordedFrames(); // Останавливаем потоковый просмотр записанных кадров
            //         if (recordingPolling) clearInterval(recordingPolling);
            //     } else {
            //         // Если запись не идет, начинаем её
            //         console.log("Отправлена команда на начало записи");
            //         // isRecording = true;
            //         // recordedFrames = [];
            //         // currentFrameIndex = 0;
            //         // ws.send(JSON.stringify({ command: "startRecording" }));
            //         if (recordingPolling) clearInterval(recordingPolling);
            //         sendCommand('startRecording');
            //         recordButton.textContent = 'Остановить запись (K)';
            //         // recordButton.classList.add('_recording');
            //         // recordingCanvas.style.display = 'block';
            //         // document.querySelector('.navigation-buttons').style.display = 'block';
            //         // startStreamingRecordedFrames(); // Стартуем потоковый просмотр записанных кадров
            //         currentFrameIndex = 0;
            //         fetchRecording();
            //         startAutoPlay();
            //         recordingPolling = setInterval(fetchRecording, 1000);
            //     }
        // }

        else if (key === 'k' || key === 'л') {
            handleRecordingToggle();
        } else if (key === 'l' || key === 'д') {
            const prevIndex = currentFrameIndex;
            currentFrameIndex = 0;
            console.log(`[goToFirstFrame] Переход к первому кадру: с ${prevIndex} на ${currentFrameIndex}`);
            playRecordingFrame();
            pauseAutoPlayTemporarily();
        }
    });

    // prevFrameButton.addEventListener('click', () => {
    //     if (currentFrameIndex > 0) {
    //         currentFrameIndex--;
    //         switchToFrameByFrame();
    //         displayFrame(currentFrameIndex);
    //     }
    // });

    // nextFrameButton.addEventListener('click', () => {
    //     if (currentFrameIndex < recordedFrames.length - 1) {
    //         currentFrameIndex++;
    //         switchToFrameByFrame();
    //         displayFrame(currentFrameIndex);
    //     }
    // });

    // rewindBackButton.addEventListener('click', () => {
    //     const framesToRewind = 5; // Количество кадров для перемотки назад
    //     if (currentFrameIndex - framesToRewind >= 0) {
    //         currentFrameIndex -= framesToRewind;
    //     } else {
    //         currentFrameIndex = 0; // Перематываем к первому кадру, если текущий индекс меньше количества кадров для перемотки
    //     }
    //     switchToFrameByFrame();
    //     displayFrame(currentFrameIndex);
    // });

    // rewindFramesBackButton.addEventListener('click', () => {
    //     const framesToRewind = 5; // Количество кадров для перемотки назад
    //     if (currentFrameIndex - framesToRewind >= 0) {
    //         currentFrameIndex -= framesToRewind;
    //     } else {
    //         currentFrameIndex = 0; // Перематываем к первому кадру, если текущий индекс меньше количества кадров для перемотки
    //     }
    //     switchToFrameByFrame();
    //     displayFrame(currentFrameIndex);
    // });

    // rewindForwardButton.addEventListener('click', () => {
    //     const framesToRewind = 10; // Количество кадров для перемотки вперед
    //     if (currentFrameIndex + framesToRewind < recordedFrames.length) {
    //         currentFrameIndex += framesToRewind;
    //     } else {
    //         currentFrameIndex = recordedFrames.length - 1; // Перематываем к последнему кадру, если текущий индекс превышает количество кадров
    //     }
    //     switchToFrameByFrame();
    //     displayFrame(currentFrameIndex);
    // });

    // rewindFramesForwardButton.addEventListener('click', () => {
    //     const framesToRewind = 10; // Количество кадров для перемотки вперед
    //     if (currentFrameIndex + framesToRewind < recordedFrames.length) {
    //         currentFrameIndex += framesToRewind;
    //     } else {
    //         currentFrameIndex = recordedFrames.length - 1; // Перематываем к последнему кадру, если текущий индекс превышает количество кадров
    //     }
    //     switchToFrameByFrame();
    //     displayFrame(currentFrameIndex);
    // });

    // goToFirstFrameButton.addEventListener('click', () => {
    //     currentFrameIndex = 0;
    //     switchToFrameByFrame();
    //     displayFrame(currentFrameIndex);
    // });

    function resetAll() {
        // Сброс поворотов
        currentRotation = 0;
        canvas.style.transform = 'rotate(0deg)';

        // Сброс отражений
        isFlippedHorizontally = false;
        isFlippedVertically = false;
        canvas.style.transform += ' scaleX(1) scaleY(1)';

        // Сброс слайдеров
        const slidersToReset = [
            'minutes-slider',
            'ISO-slider',
            'zoom-slider',
            'fps-slider',
            'contrast-slider',
            'brightness-slider'
        ];

        slidersToReset.forEach(sliderId => {
            const slider = document.getElementById(sliderId);
            if (slider && slider.noUiSlider) {
                slider.noUiSlider.reset();
            }
        });
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({command: 'SetISODuration', value: 20}));
            ws.send(JSON.stringify({command: 'setISO', value: 0.0}));
            ws.send(JSON.stringify({command: 'setZoom', value: 1.0}));
            ws.send(JSON.stringify({command: 'setFps', value: 30}));
            ws.send(JSON.stringify({command: 'setBitrate', value: 30}));
        } else {
            console.warn(`WebSocket не готов, не отправляем: ${slider.command}`);
        }
        contrastValue.textContent = 1.0;
        currentContrast = 1.0; // Обновляем текущее значение контрастности
        brightnessValue.textContent = 0;
        currentBrightness = 0; // Обновляем текущее значение яркости

        // Если есть отображаемый кадр, применяем яркость к нему
        if (recordedFrames.length > 0) {
            displayFrame(currentFrameIndex); // Перерисовываем текущий кадр
        }


        console.log("Все настройки сброшены");
    }

    document.getElementById('resetButton').addEventListener('click', resetAll);

    // Слайдер для контрастности
    const contrastSlider = document.getElementById('contrast-slider');
    const contrastValue = document.getElementById('contrast-value');

    noUiSlider.create(contrastSlider, {
        start: 1.0,
        step: 0.1,
        range: {min: 0.0, max: 2.0}
    });

    contrastSlider.noUiSlider.on('update', (values) => {
        const value = parseFloat(values[0]);
        contrastValue.textContent = value.toFixed(1);
        currentContrast = value
        // Обновляем стиль контраста для обоих canvas
        document.getElementById('videoCanvas').style.filter = `contrast(${value}) brightness(${currentBrightness})`;
        document.getElementById('recordingCanvas').style.filter = `contrast(${value}) brightness(${currentBrightness})`;
    });


    // Слайдер для яркости
    const brightnessSlider = document.getElementById('brightness-slider');
    const brightnessValue = document.getElementById('brightness-value');

    noUiSlider.create(brightnessSlider, {
        start: 1.0, // Начальное значение яркости
        step: 0.1,
        range: {min: 0.0, max: 2.0} // Диапазон яркости
    });

    brightnessSlider.noUiSlider.on('update', (values) => {
        const value = parseFloat(values[0]);
        brightnessValue.textContent = value.toFixed(1);
        currentBrightness = value
        // Обновляем стиль яркости для обоих canvas
        document.getElementById('videoCanvas').style.filter = `contrast(${currentContrast}) brightness(${value})`;
        document.getElementById('recordingCanvas').style.filter = `contrast(${currentContrast}) brightness(${value})`;
    });

    Object.keys(sliders).forEach((key) => {
        const slider = sliders[key];
        const sliderElement = document.getElementById(slider.element);
        const valueElement = document.getElementById(slider.value);
        let isFirstTime = true;

        let startValue = (slider.range.min + slider.range.max) / 2;
        if (key === 'recording') {
            recordingForInSecond = 20;
            startValue = 20;
        } else if (key === 'exposureDuration') {
            startValue = 0;
        } else if (key === 'ISO') {
            startValue = 40;
        } else if (key === 'zoom') {
            startValue = 1.0;
        } else if (key === 'focus') {
            startValue = 1;
        } else if (key === 'fps') {
            startValue = 30;
        } else if (key === 'bitrate') {
            startValue = 5000;
        }

        noUiSlider.create(sliderElement, {
            start: startValue,
            step: slider.step,
            range: slider.range
        });

        let debounceTimeout;

        sliderElement.noUiSlider.on('update', (values) => {
            const value = slider.step < 1 ? parseFloat(values[0]) : parseInt(values[0]);
            valueElement.textContent = value.toFixed(slider.step < 1 ? 2 : 0);

            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                if (isFirstTime) {
                    isFirstTime = false;
                    return;
                }

                if (ws && ws.readyState === WebSocket.OPEN) {
                    console.log(`Отправка: ${slider.command}, значение: ${value}`);

                    if (key === 'recording') {
                        recordingForInSecond = value;
                    }

                    ws.send(JSON.stringify({command: slider.command, value}));
                } else {
                    console.warn(`WebSocket не готов, не отправляем: ${slider.command}`);
                }
            }, 100); // Задержка 100 мс
        });
    });

});