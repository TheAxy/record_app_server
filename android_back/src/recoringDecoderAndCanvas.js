import { configuration } from "./videoDecoderAndCanvas.js";
import { getConfiguration, sendCommand } from "./websocket.js";
import { base64ToArrayBuffer } from "./main.js";

export const recordingDecoder = {
    canvas: undefined,
    ctx: undefined,
    decoder: undefined,
    isRecording: false,
    recordingForInSecond: 20,
    recordId: 0,
    recordingFrames: [],
    currentFrameIndex: 0,
    autoPlayTimer: undefined, 
    autoPlayPauseTimeout: undefined,
    recordingPolling: undefined,

    hiddenCanvas: undefined,
    hiddenCtx: undefined,
    playSavedFramesId: 0,
};

export const initRecordingDecoder = () => {
    if (!('VideoDecoder' in window)) {
        alert('Ваш браузер не поддерживает VideoDecoder (WebCodecs API).');
        return;
    }
    recordingDecoder.decoder = new VideoDecoder({
        output: frame => {
            console.log('[RecordingDecoder] Получен кадр с размерами:', frame.codedWidth, frame.codedHeight);
            recordingDecoder.canvas.width = frame.codedWidth;
            recordingDecoder.canvas.height = frame.codedHeight;
            recordingDecoder.ctx.drawImage(frame, 0, 0, recordingDecoder.canvas.width, recordingDecoder.canvas.height);
            frame.close();
        },
        error: e => {
            console.log('[RecordingDecoder] Ошибка декодирования кадра:', e);
            
            getConfiguration();
            initRecordingFrames();
            initRecordingDecoder();
        }
    });
    recordingDecoder.decoder.configure({
        codec: 'hev1.1.6.L93.B0',
        hardwareAcceleration: 'prefer-hardware',
    });
    console.log('Декодер записи инициализирован');
};

function initRecordingFrames() {
    recordingDecoder.recordingFrames = [];

    recordingDecoder.currentFrameIndex = 0;

    if (!configuration.isIos){
        recordingDecoder.recordingFrames = [
            new EncodedVideoChunk({
                type:'key',
                timestamp: configuration.configurationFrame.timestamp,
                data: new Uint8Array(base64ToArrayBuffer("AAAAASYBrwle+Y7/24Z7syM/nOpk20/t7vdxrQuI3qkpP1YFNZIYloFO5bs5x7Q+CB6LJlC2np9bI1plTB2GJ1xYqtAnqnHTAPh92TF3bhc")),
            }),
            configuration.configurationFrame
        ];

        playRecordingFrame();

        recordingDecoder.currentFrameIndex++;
    }
}

function playRecordingFrame() {
    if (!recordingDecoder.decoder || recordingDecoder.decoder.state === 'closed') {
        return;
    }
    
    if (recordingDecoder.recordingFrames.length === 0) {
        console.warn('[Recording] Нет кадров для воспроизведения.');

        return;
    }

    const encodedChunk = recordingDecoder.recordingFrames[recordingDecoder.currentFrameIndex];

    try {
        recordingDecoder.decoder.decode(encodedChunk);
    } catch (e) {
        console.error('Ошибка декодирования записи:', e);

        getConfiguration();

        initRecordingDecoder();
        initRecordingFrames();
    }
}

function playSavedRecordingFrame(index) {
    const frames = recordingDecoder.recordingFrames;
    if (!frames || frames.length === 0 || index < 0 || index >= frames.length) {
        console.warn('[RecordingDecoder] Неверный индекс кадра или кадры отсутствуют');
        return;
    }
    
    recordingDecoder.playSavedFramesId++;

    const id = recordingDecoder.playSavedFramesId;

    let keyFrameIndex = index;
    while (keyFrameIndex > 0 && frames[keyFrameIndex].type !== 'key') {
        keyFrameIndex--;
    }

    if (frames[keyFrameIndex].type !== 'key') {
        while (frames[index].type !== 'key') {
            index++;
        }

        keyFrameIndex = index;
    }

    const hiddenCanvas = recordingDecoder.hiddenCanvas;
    const hiddenCtx = recordingDecoder.hiddenCtx;

    if (!hiddenCanvas || !hiddenCtx) {
        console.warn('[RecordingDecoder] Скрытый canvas не инициализирован');
        return;
    }

    hiddenCtx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);

    const drawFrames = frames.slice(keyFrameIndex, index + 1);
    let numberToPlay = drawFrames.length;

    const hiddenDecoder = new VideoDecoder({
        output: frame => {
            if (id != recordingDecoder.playSavedFramesId) return;

            console.log('[HiddenDecoder] Получен кадр с размерами:', frame.codedWidth, frame.codedHeight);
            hiddenCanvas.width = frame.codedWidth;
            hiddenCanvas.height = frame.codedHeight;
            hiddenCtx.drawImage(frame, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
            
            frame.close();

            numberToPlay--;
            if (numberToPlay == 0) {
                // Draw "READY" message on the main visible canvas
                const canvas = recordingDecoder.canvas;
                const ctx = recordingDecoder.ctx;

                if (canvas && ctx) {
                    canvas.width = hiddenCanvas.width;
                    canvas.height = hiddenCanvas.height;

                    ctx.drawImage(hiddenCanvas, 0, 0);
                }
            }
        },
        error: e => {
            console.log('[HiddenDecoder] Ошибка декодирования кадра:', e);
            
            getConfiguration();
            initRecordingFrames();
            initRecordingDecoder();
        }
    });
    hiddenDecoder.configure({
        codec: 'hev1.1.6.L93.B0',
        hardwareAcceleration: 'prefer-hardware',
    });

    //console.log(drawFrames);

    if (!configuration.isIos) {
        hiddenDecoder.decode(new EncodedVideoChunk({
            type: "key",
            timestamp: drawFrames[0].timestamp,
            data: new Uint8Array(base64ToArrayBuffer("AAAAASYBrwle+Y7/24Z7syM/nOpk20/t7vdxrQuI3qkpP1YFNZIYloFO5bs5x7Q+CB6LJlC2np9bI1plTB2GJ1xYqtAnqnHTAPh92TF3bhc")),
        }));
        hiddenDecoder.decode(configuration.configurationFrame);
    }

    drawFrames.forEach(frame => {
        try {
            hiddenDecoder.decode(frame);
        } catch (e) {
            console.error('Ошибка декодирования записи:', e);
    
            getConfiguration();
    
            initRecordingDecoder();
            initRecordingFrames();
        }
    });

    recordingDecoder.currentFrameIndex = index;
}

function startAutoPlay() {
    clearInterval(recordingDecoder.autoPlayTimer);

    recordingDecoder.autoPlayTimer = setInterval(() => {
        console.log(recordingDecoder.currentFrameIndex, recordingDecoder.recordingFrames.length - 1);
        if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
            playRecordingFrame();
            recordingDecoder.currentFrameIndex++;
        }
    }, 30);
}

function pauseAutoPlayTemporarily() {
    clearInterval(recordingDecoder.autoPlayTimer);
    clearTimeout(recordingDecoder.autoPlayPauseTimeout);
    // recordingDecoder.autoPlayPauseTimeout = setTimeout(() => {
    //   startAutoPlay();
    // }, 3000);
}

function handleRecordingToggle() {
    const btn = document.getElementById('recordButton');

    if (btn.textContent.includes('Остановить запись')) {
        console.log('[UI] Остановка записи');
        sendCommand('stopRecording');
        recordingDecoder.isRecording = false;
        if (recordingDecoder.recordingPolling) clearInterval(recordingDecoder.recordingPolling);
        if (recordingDecoder.autoPlayTimer) clearInterval(recordingDecoder.autoPlayTimer);
        btn.textContent = 'Начать запись (K)';
        btn.style.backgroundColor = '#007bff'; // Возвращаем синий цвет
        btn.style.color = 'white';
    } else {
        console.log('[UI] Запуск записи');
        if (!configuration.wasConfigurated && !configuration.isIos) {
            alert("Дождитесь начала видео потока перед началом записи.");

            return;
        }

        initRecordingFrames();

        recordingDecoder.recordId++;
        let recordIdHere = recordingDecoder.recordId;

        sendCommand('startRecording');

        setTimeout(() => {
            if (recordingDecoder.isRecording && recordIdHere == recordingDecoder.recordId) {
                handleRecordingToggle()
            }
        }, recordingDecoder.recordingForInSecond * 1000);

        recordingDecoder.currentFrameIndex = 0;

        startAutoPlay();
        recordingDecoder.isRecording = true;
        btn.textContent = 'Остановить запись (K)';
        btn.style.backgroundColor = '#ff4444'; // Меняем на красный цвет
        btn.style.color = 'white';
    }
}

export function initRecordingCanvas() {
    recordingDecoder.canvas = document.getElementById('recordingCanvas');
    recordingDecoder.ctx = recordingDecoder.canvas.getContext('2d');

    recordingDecoder.hiddenCanvas = document.getElementById('hiddenRecodingCanvas');
    recordingDecoder.hiddenCtx = recordingDecoder.hiddenCanvas.getContext('2d');
}

export function addListenerToRecording() {
    document.getElementById('prevFrameBtn').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex > 0) {
            console.log('[prevFrameBtn] Перемотка назад: с ', recordingDecoder.currentFrameIndex, ' на ', recordingDecoder.currentFrameIndex - 1);

            pauseAutoPlayTemporarily();
            playSavedRecordingFrame(recordingDecoder.currentFrameIndex - 1);
        } else {
            console.log('[prevFrameBtn] Уже на первом кадре: ', recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('rewindBack').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex > 0) {
            let newIndex = Math.max(0, recordingDecoder.currentFrameIndex - 5);

            console.log('[rewindBack] Перемотка на 5 кадров назад: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);

            pauseAutoPlayTemporarily();
            playSavedRecordingFrame(newIndex);
        } else {
            console.log('[prevFrameBtn] Уже на первом кадре: ', recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('rewindFramesBack').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex > 0) {
            const newIndex = Math.max(0, recordingDecoder.currentFrameIndex - 10);

            console.log('[rewindFramesBack] Перемотка на 10 кадров назад: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);

            pauseAutoPlayTemporarily();
            playSavedRecordingFrame(newIndex);
        } else {
            console.log('[prevFrameBtn] Уже на первом кадре: ', recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('nextFrameBtn').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
            const newIndex = recordingDecoder.currentFrameIndex + 1;

            console.log('[nextFrameBtn] Перемотка вперед: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);

            pauseAutoPlayTemporarily();
            playSavedRecordingFrame(newIndex);
        } else {
            console.log('[nextFrameBtn] Уже на последнем кадре: ', recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('rewindForward').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
            const newIndex = Math.min(recordingDecoder.recordingFrames.length, recordingDecoder.currentFrameIndex + 5);

            console.log('[rewindForward] Перемотка вперед на 5 кадров: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);

            pauseAutoPlayTemporarily();
            playSavedRecordingFrame(newIndex);
        } else {
            console.log('[nextFrameBtn] Уже на последнем кадре: ', recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('rewindFramesForward').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
            const newIndex = Math.min(recordingDecoder.recordingFrames.length, recordingDecoder.currentFrameIndex + 10);

            console.log('[rewindForward] Перемотка вперед на 10 кадров: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);

            pauseAutoPlayTemporarily();
            playSavedRecordingFrame(newIndex);
        } else {
            console.log('[nextFrameBtn] Уже на последнем кадре: ', recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('goToFirstFrame').addEventListener('click', () => {
        console.log(`[goToFirstFrame] Переход к первому кадру: с ${recordingDecoder.currentFrameIndex} на 0`);

        pauseAutoPlayTemporarily();
        playSavedRecordingFrame(0);
    });

    // Добавляем обработчик события keydown на весь документ
    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        // Проверяем, какая клавиша была нажата
        if (key === 'i' || key === 'ш') {
            if (recordingDecoder.currentFrameIndex > 0) {
                //console.log('[prevFrameBtn] Перемотка назад: с ', recordingDecoder.currentFrameIndex, ' на ', recordingDecoder.currentFrameIndex - 1);
    
                pauseAutoPlayTemporarily();
                playSavedRecordingFrame(recordingDecoder.currentFrameIndex - 1);
            } else {
                console.log('[prevFrameBtn] Уже на первом кадре: ', recordingDecoder.currentFrameIndex);
            }
        } else if (key === 'o' || key === 'щ') {
            if (recordingDecoder.currentFrameIndex > 0) {
                let newIndex = Math.max(0, recordingDecoder.currentFrameIndex + 1);
    
                console.log('[rewindBack] Перемотка на 5 кадров назад: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);
    
                pauseAutoPlayTemporarily();
                playSavedRecordingFrame(newIndex);
            } else {
                console.log('[prevFrameBtn] Уже на первом кадре: ', recordingDecoder.currentFrameIndex);
            }
        } else if (key === ',' || key === 'б') {
            if (recordingDecoder.currentFrameIndex > 0) {
                const newIndex = Math.max(0, recordingDecoder.currentFrameIndex - 10);
    
                console.log('[rewindFramesBack] Перемотка на 10 кадров назад: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);
    
                pauseAutoPlayTemporarily();
                playSavedRecordingFrame(newIndex);
            } else {
                console.log('[prevFrameBtn] Уже на первом кадре: ', recordingDecoder.currentFrameIndex);
            }
        } else if (key === 'j' || key === 'о') {
            if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
                const newIndex = recordingDecoder.currentFrameIndex + 1;
    
                console.log('[nextFrameBtn] Перемотка вперед: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);
    
                pauseAutoPlayTemporarily();
                playSavedRecordingFrame(newIndex);
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ', recordingDecoder.currentFrameIndex);
            }
        } else if (key === 'n' || key === 'т') {
            if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
                const newIndex = Math.min(recordingDecoder.recordingFrames.length, recordingDecoder.currentFrameIndex + 5);
    
                console.log('[rewindForward] Перемотка вперед на 5 кадров: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);
    
                pauseAutoPlayTemporarily();
                playSavedRecordingFrame(newIndex);
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ', recordingDecoder.currentFrameIndex);
            }
        } else if (key === 'm' || key === 'ь') {
            if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
                const newIndex = Math.min(recordingDecoder.recordingFrames.length, recordingDecoder.currentFrameIndex + 10);
    
                console.log('[rewindForward] Перемотка вперед на 10 кадров: с ', recordingDecoder.currentFrameIndex + ' на ', newIndex);
    
                pauseAutoPlayTemporarily();
                playSavedRecordingFrame(newIndex);
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ', recordingDecoder.currentFrameIndex);
            }
        }

        else if (key === 'k' || key === 'л') {
            handleRecordingToggle();
        } else if (key === 'l' || key === 'д') {

            console.log(`[goToFirstFrame] Переход к первому кадру: с ${recordingDecoder.currentFrameIndex} на 0`);

            pauseAutoPlayTemporarily();
            playSavedRecordingFrame(0);
        }
    });
}