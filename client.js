const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');

// Подключение к WebSocket-серверу
const ws = new WebSocket('ws://89.104.71.153:8081');

let frames = [];
let isPlaying = false;

ws.onopen = () => {
    console.log('Подключено к WebSocket-серверу');
    // Запрашиваем текущую запись при подключении
    ws.send(JSON.stringify({ command: 'getRecording' }));
};

ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
        // Текстовые данные (JSON)
        const data = JSON.parse(event.data);

        if (data.command === 'recordingData') {
            console.log('Получены данные записи');
            frames = data.recording;
            if (!isPlaying) {
                isPlaying = true;
                playFrames(frames);
            }
        } else if (data.command === 'newFrame') {
            console.log('Получен новый кадр');
            frames.push(data.frame); // Добавляем новый кадр в массив
        }
    } else {
        // Бинарные данные (например, Blob)
        console.log('Получены бинарные данные:', event.data);
        handleBinaryFrame(event.data);
    }
};

ws.onerror = (error) => {
    console.error('Ошибка WebSocket:', error);
};

ws.onclose = () => {
    console.log('Соединение закрыто');
};

function handleBinaryFrame(blob) {
    const reader = new FileReader();

    reader.onload = () => {
        const base64Data = reader.result.split(',')[1]; // Убираем префикс "data:..."
        const timestamp = Date.now();
        frames.push({ timestamp, data: base64Data });

        if (!isPlaying) {
            isPlaying = true;
            playFrames(frames);
        }
    };

    reader.onerror = (error) => {
        console.error('Ошибка при чтении бинарных данных:', error);
    };

    reader.readAsDataURL(blob); // Преобразуем Blob в Base64
}

function playFrames(frames) {
    let currentIndex = 0;
    const startTime = Date.now();

    function drawFrame() {
        if (currentIndex >= frames.length) {
            console.log('Воспроизведение завершено.');
            return;
        }

        const frame = frames[currentIndex];
        const image = new Image();
        image.src = `data:image/jpeg;base64,${frame.data}`;

        image.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            // Вычисляем задержку до следующего кадра
            const nextFrameTime = frames[currentIndex + 1]?.timestamp || Date.now();
            const delay = Math.max(0, (nextFrameTime - frame.timestamp));

            currentIndex++;
            setTimeout(drawFrame, delay);
        };

        image.onerror = () => {
            console.error('Ошибка загрузки кадра.');
            currentIndex++;
            drawFrame();
        };
    }

    drawFrame();
}
