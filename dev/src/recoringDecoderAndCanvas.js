import { configuration } from "./videoDecoderAndCanvas.js";
import { getConfiguration, sendCommand } from "./websocket.js";

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
            configuration.configurationFrame
        ];

        playRecordingFrame();

        recordingDecoder.currentFrameIndex++;
    }
}

function playRecordingFrame() {
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
}

export function addListenerToRecording() {
    document.getElementById('prevFrameBtn').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex > 0) {
            const prevIndex = recordingDecoder.currentFrameIndex;
            recordingDecoder.currentFrameIndex--;
            console.log('[prevFrameBtn] Перемотка назад: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
            playRecordingFrame();
            pauseAutoPlayTemporarily();
        } else {
            console.log('[prevFrameBtn] Уже на первом кадре: ' + recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('rewindBack').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex > 0) {
            const prevIndex = recordingDecoder.currentFrameIndex;
            recordingDecoder.currentFrameIndex = Math.max(0, recordingDecoder.currentFrameIndex - 5);
            console.log('[rewindBack] Перемотка на 5 кадров назад: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
            playRecordingFrame();
            pauseAutoPlayTemporarily();
        } else {
            console.log('[prevFrameBtn] Уже на первом кадре: ' + recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('rewindFramesBack').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex > 0) {
            const prevIndex = recordingDecoder.currentFrameIndex;
            recordingDecoder.currentFrameIndex = Math.max(0, recordingDecoder.currentFrameIndex - 10);
            console.log('[rewindFramesBack] Перемотка на 10 кадров назад: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
            playRecordingFrame();
            pauseAutoPlayTemporarily();
        } else {
            console.log('[prevFrameBtn] Уже на первом кадре: ' + recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('nextFrameBtn').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
            const prevIndex = recordingDecoder.currentFrameIndex;
            recordingDecoder.currentFrameIndex++;
            console.log('[nextFrameBtn] Перемотка вперед: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
            playRecordingFrame();
            pauseAutoPlayTemporarily();
        } else {
            console.log('[nextFrameBtn] Уже на последнем кадре: ' + recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('rewindForward').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
            const prevIndex = recordingDecoder.currentFrameIndex;
            recordingDecoder.currentFrameIndex = Math.max(0, recordingDecoder.currentFrameIndex - 5);
            console.log('[rewindForward] Перемотка вперед на 5 кадров: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
            playRecordingFrame();
            pauseAutoPlayTemporarily();
        } else {
            console.log('[nextFrameBtn] Уже на последнем кадре: ' + recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('rewindFramesForward').addEventListener('click', () => {
        if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
            const prevIndex = recordingDecoder.currentFrameIndex;
            recordingDecoder.currentFrameIndex = Math.max(0, recordingDecoder.currentFrameIndex - 10);
            console.log('[rewindFramesForward] Перемотка вперед на 10 кадров: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
            playRecordingFrame();
            pauseAutoPlayTemporarily();
        } else {
            console.log('[nextFrameBtn] Уже на последнем кадре: ' + recordingDecoder.currentFrameIndex);
        }
    });
    
    document.getElementById('goToFirstFrame').addEventListener('click', () => {
        const prevIndex = recordingDecoder.currentFrameIndex;
        recordingDecoder.currentFrameIndex = 0;
        console.log(`[goToFirstFrame] Переход к первому кадру: с ${prevIndex} на ${recordingDecoder.currentFrameIndex}`);
        playRecordingFrame();
        pauseAutoPlayTemporarily();
    });

    // Добавляем обработчик события keydown на весь документ
    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        // Проверяем, какая клавиша была нажата
        if (key === 'i' || key === 'ш') {
            // Листаем назад при нажатии на "I"
            if (recordingDecoder.currentFrameIndex > 0) {
                const prevIndex = recordingDecoder.currentFrameIndex;
                recordingDecoder.currentFrameIndex--;
                console.log('[prevFrameBtn] Перемотка назад: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[prevFrameBtn] Уже на первом кадре: ' + recordingDecoder.currentFrameIndex);
            }
        } else if (key === 'o' || key === 'щ') {
            if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
                const prevIndex = recordingDecoder.currentFrameIndex;
                recordingDecoder.currentFrameIndex++;
                console.log('[nextFrameBtn] Перемотка вперед: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ' + recordingDecoder.currentFrameIndex);
            }
        } else if (key === ',' || key === 'б') {
            if (recordingDecoder.currentFrameIndex > 0) {
                const prevIndex = recordingDecoder.currentFrameIndex;
                recordingDecoder.currentFrameIndex = Math.max(0, recordingDecoder.currentFrameIndex - 10);
                console.log('[rewindFramesBack] Перемотка на 10 кадров назад: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[prevFrameBtn] Уже на первом кадре: ' + recordingDecoder.currentFrameIndex);
            }
        } else if (key === 'j' || key === 'о') {
            if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
                const prevIndex = recordingDecoder.currentFrameIndex;
                recordingDecoder.currentFrameIndex = Math.max(0, recordingDecoder.currentFrameIndex - 5);
                console.log('[rewindForward] Перемотка вперед на 5 кадров: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ' + recordingDecoder.currentFrameIndex);
            }
        } else if (key === 'n' || key === 'т') {
            if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
                const prevIndex = recordingDecoder.currentFrameIndex;
                recordingDecoder.currentFrameIndex = Math.max(0, recordingDecoder.currentFrameIndex + 5);
                console.log('[rewindForward] Перемотка вперед на 5 кадров: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ' + recordingDecoder.currentFrameIndex);
            }
        } else if (key === 'm' || key === 'ь') {
            if (recordingDecoder.currentFrameIndex < recordingDecoder.recordingFrames.length - 1) {
                const prevIndex = recordingDecoder.currentFrameIndex;
                const framesToAdvance = 10;
                recordingDecoder.currentFrameIndex = Math.max(0, recordingDecoder.currentFrameIndex + 10);
                console.log('[rewindFramesForward] Перемотка вперед на 10 кадров: с ' + prevIndex + ' на ' + recordingDecoder.currentFrameIndex);
                playRecordingFrame();
                pauseAutoPlayTemporarily();
            } else {
                console.log('[nextFrameBtn] Уже на последнем кадре: ' + recordingDecoder.currentFrameIndex);
            }
        }

        else if (key === 'k' || key === 'л') {
            handleRecordingToggle();
        } else if (key === 'l' || key === 'д') {
            const prevIndex = recordingDecoder.currentFrameIndex;
            recordingDecoder.currentFrameIndex = 0;
            console.log(`[goToFirstFrame] Переход к первому кадру: с ${prevIndex} на ${recordingDecoder.currentFrameIndex}`);
            playRecordingFrame();
            pauseAutoPlayTemporarily();
        }
    });
}