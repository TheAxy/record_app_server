import { getConfiguration, sendCommandWithValue, sendCommand } from "./websocket.js";
import { addListenerToRecording, initRecordingCanvas, recordingDecoder } from "./recoringDecoderAndCanvas.js";
import { sliders } from "./main.js";

export let videoDecoder;
let canvas;
let ctx;
let currentBrightness = 1; // Диапазон: от -255 до 255
let currentContrast = 1.0;
let isGrayscale = false;
let isFlippedHorizontally = false;
let isFlippedVertically = false;
let currentRotation = 0;

export let configuration = {
    wasConfigurated: false,
    isConfigurating: false,
    configurationFrame: false,
    isIos: false,
};

function updateCanvasTransform() {
    const scaleX = isFlippedHorizontally ? -1 : 1;
    const scaleY = isFlippedVertically ? -1 : 1;

    canvas.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
    recordingDecoder.canvas.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
}

function updateCanvasRotation(degrees) {
    currentRotation += degrees;
    canvas.style.transform = `rotate(${currentRotation}deg)`;
    recordingDecoder.canvas.style.transform = `rotate(${currentRotation}deg)`;
}


const drawFrame = (frame) => {
    if (!frame) return;
    canvas.width = frame.codedWidth;
    canvas.height = frame.codedHeight;
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    //console.log('[Canvas] Кадр отрисован на videoCanvas.');
};

let uiIntializated = false;

export function initDecoder() {
    if (!('VideoDecoder' in window)) {
        alert('Ваш браузер не поддерживает VideoDecoder (WebCodecs API).');
        return;
    }

    canvas = document.getElementById('videoCanvas');
    ctx = canvas.getContext('2d');

    if (!uiIntializated) {
        uiIntializated = true;

        canvas.addEventListener('click', (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left; // Координата X относительно canvas
            const y = event.clientY - rect.top; // Координата Y относительно canvas
        
            // Нормализация координат в диапазон [0.0, 1.0]
            const normalizedX = x / canvas.width;
            const normalizedY = y / canvas.height;
        
            console.log(`Клик по координатам: (${normalizedX.toFixed(2)}, ${normalizedY.toFixed(2)})`);
        
            sendCommandWithValue("setFocusPoint", {x: normalizedX, y: normalizedY});
        });
    
        document.addEventListener('DOMContentLoaded', () => onLoadEvent());
    
        onLoadEvent();
    }

    videoDecoder = new VideoDecoder({
        output: frame => {
            if (!configuration.isIos && !configuration.configurationFrame) {
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

function onLoadEvent() {
    isFlippedHorizontally = false;
    isFlippedVertically = false;
    currentRotation = 0;

    initRecordingCanvas();

    document.getElementById('flipHorizontal').addEventListener('click', () => {
        isFlippedHorizontally = !isFlippedHorizontally;
        updateCanvasTransform();
    });
    document.getElementById('flipVertical').addEventListener('click', () => {
        isFlippedVertically = !isFlippedVertically;
        updateCanvasTransform();
    });

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

        sendCommand("switchCamera");
    });

    document.getElementById('toggleButton').addEventListener('click', () => {
        isGrayscale = !isGrayscale;

        if (isGrayscale) {
            canvas.style.filter = 'grayscale(100%)';
            recordingDecoder.canvas.style.filter = 'grayscale(100%)';
        } else {
            canvas.style.filter = 'grayscale(0%)';
            recordingDecoder.canvas.style.filter = 'grayscale(0%)';
        }
    });

    addListenerToRecording();

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

        sendCommandWithValue('SetISODuration', 20);
        sendCommandWithValue('setISO', 0.0);
        sendCommandWithValue('setZoom', 1.0);
        sendCommandWithValue('setFps', 30);
        sendCommandWithValue('setBitrate', 30);

        contrastValue.textContent = 1.0;
        currentContrast = 1.0; // Обновляем текущее значение контрастности
        brightnessValue.textContent = 0;
        currentBrightness = 0; // Обновляем текущее значение яркости

        // Если есть отображаемый кадр, применяем яркость к нему
        if (recordedFrames.length > 0) {
            displayFrame(recordingDecoder.currentFrameIndex); // Перерисовываем текущий кадр
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
            recordingDecoder.recordingForInSecond = 20;
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

                sendCommandWithValue(slider.command, value);
            }, 100); // Задержка 100 мс
        });
    });

}