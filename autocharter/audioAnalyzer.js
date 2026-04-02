// Elementos de UI
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileNameDisplay = document.getElementById('file-name-display');
const btnProcess = document.getElementById('btn-process');
const btnPlay = document.getElementById('btn-play');
const modeBtns = document.querySelectorAll('.mode-btn');
const statusText = document.getElementById('status-text');
const speedRange = document.getElementById('speed-range');
const speedVal = document.getElementById('speed-val');

// Variables Globales
window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
window.audioBuffer = null;
window.audioMap = [];
window.selectedDifficulty = 'normal';
window.fallSpeed = 1.5;
window.currentFileName = '';
window.savedSongs = [];

// Función centralizada para resetear la UI de subida
window.resetUploaderUI = function(isInstant = false) {
    if (isInstant) {
        fileInfo.classList.add('hidden');
        fileInfo.style.opacity = '0';
        fileInfo.style.transform = 'translateY(0)';
        dropzone.classList.remove('hidden');
        dropzone.style.opacity = '1';
        dropzone.style.transform = 'translateY(0)';
    } else {
        fileInfo.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        fileInfo.style.opacity = '0';
        fileInfo.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            fileInfo.classList.add('hidden');
            fileInfo.style.transform = 'translateY(0)';
            
            dropzone.classList.remove('hidden');
            dropzone.style.opacity = '0';
            dropzone.style.transform = 'translateY(10px)';
            
            requestAnimationFrame(() => {
                dropzone.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                dropzone.style.opacity = '1';
                dropzone.style.transform = 'translateY(0)';
            });
        }, 500);
    }
};

// Configuración de UI
speedRange.addEventListener('input', (e) => {
    window.fallSpeed = parseFloat(e.target.value);
    speedVal.innerText = window.fallSpeed.toFixed(1) + 'x';
});

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window.selectedDifficulty = btn.dataset.diff;
    });
});

// Manejo de Archivos
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (!file.type.startsWith('audio/')) {
        statusText.innerText = 'Por favor sube un archivo de audio válido (.mp3, .wav)';
        return;
    }
    window.currentFileName = file.name;
    fileNameDisplay.innerText = file.name;
    
    fileInfo.classList.remove('hidden');
    fileInfo.style.transition = 'opacity 0.5s';
    fileInfo.style.opacity = '1';
    
    dropzone.classList.add('hidden');
    dropzone.style.transition = 'opacity 0.5s';
    dropzone.style.opacity = '1';
    
    btnProcess.classList.remove('hidden');
    btnProcess.disabled = false;
    btnProcess.innerText = 'Procesar Audio y Generar Mapa';
    btnPlay.classList.add('hidden');
    statusText.innerText = 'Archivo cargado. Listo para generar.';

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
        // Detener cualquier audio previo antes de reanudar el contexto para evitar "despauses"
        if (typeof stopPreviousAudio === 'function') stopPreviousAudio();
        
        if (window.audioContext.state === 'suspended') {
            window.audioContext.resume();
        }
        window.audioContext.decodeAudioData(reader.result, buffer => {
            window.audioBuffer = buffer;
            statusText.innerHTML = '<span style="color: var(--success); font-weight: 700; text-shadow: 0 0 10px var(--success);">✓ CANCIÓN IMPORTADA</span><br/>Analizaremos el ritmo y tono automáticamente.';
            fileInfo.classList.add('import-success');
            // Quitar feedback viejo
            setTimeout(() => fileInfo.classList.remove('import-success'), 2000);
        }, error => {
            statusText.innerText = 'Error al decodificar el audio.';
        });
    };
}

btnProcess.addEventListener('click', async () => {
    if (!window.audioBuffer) return;
    
    btnProcess.disabled = true;
    btnProcess.innerText = 'Procesando...';
    statusText.innerText = 'Analizando ritmo completo y densificando mapa...';
    
    setTimeout(async () => {
        try {
            window.audioMap = await detectBeats(window.audioBuffer, window.selectedDifficulty);
            
            btnProcess.innerText = 'Mapa Generado ✓';
            btnProcess.classList.add('hidden');
            
            // Mostrar controles de juego
            btnPlay.classList.remove('hidden');
            statusText.innerText = `¡Se generaron ${window.audioMap.length} notas!\nPresiona ESPACIO o haz clic en Jugar para iniciar.`;

            if (typeof window.renderLibrary === 'function') {
                window.renderLibrary();
            }
            
            if (typeof window.drawReadyState === 'function') {
                window.drawReadyState();
            }
            
            // Fase de Fade-Out elegante usando la nueva función centralizada
            setTimeout(() => {
                window.resetUploaderUI(false);
            }, 1500);
        } catch (e) {
            console.error(e);
            statusText.innerHTML = `<span style="color: #ff4444;">Error técnico: ${e.message}</span><br/><small>Por favor, intenta con otra canción o recarga la página.</small>`;
            btnProcess.disabled = false;
            btnProcess.innerText = 'Procesar Audio y Generar Mapa';
        }
    }, 100);
});

// Procesamiento Offline: Análisis General de la Canción
async function analyzeAudio(buffer, difficulty) {
    // Ya no lo llamamos directamente aquí, lo delegamos a detectBeats
    return await detectBeats(buffer, difficulty);
}

function estimateBPM(onsets) {
    if (onsets.length < 5) return 120;

    const scores = {};
    // Análisis de intervalos cruzados (comparamos cada nota con las siguientes 10)
    for (let i = 0; i < onsets.length; i++) {
        for (let j = i + 1; j < Math.min(i + 10, onsets.length); j++) {
            let diff = onsets[j] - onsets[i];
            
            // Producir candidatos de intervalo (normalizados a 60-180 BPM)
            let candidate = diff;
            while (candidate < 0.33) candidate *= 2; 
            while (candidate > 1.0) candidate /= 2;
            
            const bucket = Math.round(candidate * 100) / 100;
            scores[bucket] = (scores[bucket] || 0) + (10 / (j - i)); // Más peso a intervalos cercanos
        }
    }

    let bestInterval = 0.5;
    let maxScore = 0;
    for (const [int, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestInterval = parseFloat(int);
        }
    }

    let bpm = Math.round(60 / bestInterval);
    // Preferir BPMs comunes (múltiplos de 5 o pares) si están muy cerca
    if (Math.abs(bpm - Math.round(bpm/5)*5) < 2) bpm = Math.round(bpm/5)*5;
    
    return Math.round(60 / bestInterval);
}

function autoCorrelate(data, sampleRate) {
    const SIZE = data.length;
    let sumOfSquares = 0;
    for (let i = 0; i < SIZE; i++) sumOfSquares += data[i] * data[i];
    const rms = Math.sqrt(sumOfSquares / SIZE);
    if (rms < 0.02) return -1; 

    const minPeriod = Math.floor(sampleRate / 1200);
    const maxPeriod = Math.min(Math.floor(sampleRate / 80), SIZE - 1);
    
    let bestCorrelation = -1;
    let bestPeriod = -1;

    // Optimización: Stride de 2 para acelerar el cálculo sin pérdida notable de precisión
    for (let period = minPeriod; period <= maxPeriod; period++) {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < SIZE - period; j += 2) {
            sum += Math.abs(data[j] - data[j + period]); 
            count++;
        }
        
        const correlation = 1 - (sum / count); 
        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestPeriod = period;
        }
    }

    return bestCorrelation > 0.80 ? (sampleRate / bestPeriod) : -1;
}

async function detectBeats(buffer, difficulty) {
    // --- ANÁLISIS MULTIBANDA (ULTRA FIDELIDAD) ---
    const bassCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
    const bassSource = bassCtx.createBufferSource();
    bassSource.buffer = buffer;
    const lpf = bassCtx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 180; // Enfocarse solo en bombos y bajos
    bassSource.connect(lpf);
    lpf.connect(bassCtx.destination);
    bassSource.start();
    const bassBuffer = await bassCtx.startRendering();

    const trebleCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
    const trebleSource = trebleCtx.createBufferSource();
    trebleSource.buffer = buffer;
    const hpf = trebleCtx.createBiquadFilter();
    hpf.type = 'peaking';
    hpf.frequency.value = 2200; // Capturar ataques de platos, guitarras y caja
    hpf.gain.value = 12;
    hpf.Q.value = 1.8;
    trebleSource.connect(hpf);
    hpf.connect(trebleCtx.destination);
    trebleSource.start();
    const trebleBuffer = await trebleCtx.startRendering();

    // 2. PROCESAMIENTO TURBO-FIDELIDAD (Balance 5ms + Peak Sync)
    const bassData = bassBuffer.getChannelData(0);
    const trebleData = trebleBuffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.005); // Balance perfecto: 5ms
    const energies = []; 
    const bpmEnergies = []; 

    // --- ESTIMACIÓN PREVIA DE BPM PARA VENTANA DINÁMICA ---
    const prelimOnsets = [];
    for (let i = 2; i < bassData.length - windowSize; i += windowSize) {
        let vol = 0;
        for (let j = 0; j < windowSize; j++) vol += Math.abs(bassData[i + j]);
        if (vol > 0.5) prelimOnsets.push(i / sampleRate);
        if (prelimOnsets.length > 200) break;
    }
    const estimatedBPM = estimateBPM(prelimOnsets.slice(0, 100));
    
    // Ventana dinámica: Más pequeña para canciones rápidas (Ultrakill style)
    let dynamicWindow = 0.25;
    if (estimatedBPM > 190) dynamicWindow = 0.14;
    else if (estimatedBPM > 150) dynamicWindow = 0.18;
    
    statusText.innerText = `[Análisis: ${estimatedBPM} BPM | Ventana: ${dynamicWindow}s]`;
    
    let minNoiseFloor = (difficulty === 'facil' ? 2.5 : (difficulty === 'inhumano' ? 0.8 : 1.2));
    const totalSteps = bassData.length;
    const batchSize = windowSize * 1500; 

    for (let i = 0; i < totalSteps; i += windowSize) {
        if (i % batchSize === 0) {
            const progress = Math.floor((i / totalSteps) * 100);
            statusText.innerText = `Análisis Turbo - Procesando: ${progress}%...`;
            await new Promise(r => setTimeout(r, 0));
        }

        const bassWin = bassData.subarray(i, i + windowSize);
        const trebleWin = trebleData.subarray(i, i + windowSize);
        
        let bSum = 0; 
        let tSum = 0; 
        let maxPeakValue = -1;
        let peakOffset = 0;

        for (let j = 0; j < bassWin.length; j++) {
            const bAbs = Math.abs(bassWin[j]);
            const tAbs = Math.abs(trebleWin[j]);
            if (tAbs > maxPeakValue) { maxPeakValue = tAbs; peakOffset = j; }
            bSum += bAbs;
            tSum += tAbs;
        }
        
        let totalVol = (bSum * 0.7) + (tSum * 1.3); 
        const preciseTime = (i + peakOffset) / sampleRate;
        
        // NO calculamos el tono aquí (Lazy Loading) para ahorrar 95% de CPU
        energies.push({ 
            time: preciseTime, 
            vol: totalVol, 
            bassVol: bSum, 
            trebleVol: tSum,
            sampleIdx: i
        });
        bpmEnergies.push({ time: preciseTime, vol: bSum });
    }

    // 3. GENERACIÓN DE MAPA (POST-PROCESAMIENTO)
    statusText.innerText = "Sincronizando rejilla musical...";
    
    let map = [];
    let lastCol = -1;
    let staircaseDir = 1; 
    let sideLaneCounter = 0; // NEW: Contador para evitar el spam en los bordes (0 y 3)
    let localAverageBuffer = [];
    let avgWindow = 50; 
    let minTimeGap = 0.3; 
    let energyMultiplier = 1.8; 

    // Configuración Base (Serán modificadas dinámicamente en el loop)
    if (difficulty === 'facil') { minTimeGap = 0.50; energyMultiplier = 3.5; }
    else if (difficulty === 'normal') { minTimeGap = 0.25; energyMultiplier = 2.6; }
    else if (difficulty === 'dificil') { minTimeGap = 0.15; energyMultiplier = 2.1; }
    else if (difficulty === 'inhumano') { minTimeGap = 0.08; energyMultiplier = 1.8; } // Recuperar agresividad

    const globalAvgVol = energies.reduce((sum, e) => sum + e.vol, 0) / energies.length;

    for(let i = 1; i < energies.length; i++) {
        let diff = energies[i].vol - energies[i-1].vol;
        let flux = diff > 0 ? diff : 0; 
        localAverageBuffer.push(flux);
        if (localAverageBuffer.length > avgWindow) localAverageBuffer.shift();
        let localAvg = localAverageBuffer.reduce((a, b) => a + b, 0) / localAverageBuffer.length;
        
        // --- DINAMISMO DE INTENSIDAD ---
        // Ajustar el multiplicador según si la sección es fuerte (más notas) o suave (menos notas)
        let localIntensity = energies[i].vol / (globalAvgVol || 1);
        // --- ADAPTABILIDAD RÍTMICA DINÁMICA ---
        let dynamicMultiplier = energyMultiplier;
        let adaptiveGap = minTimeGap;

        if (localIntensity < 0.15) { 
            // SILENCIO CASI TOTAL: Bloquear notas fantasmas
            adaptiveGap *= 4.0; 
            dynamicMultiplier *= 3.0; 
        } else if (localIntensity > 1.2) {
            // SECCIÓN FUERTE: Máxima sensibilidad para ráfagas
            adaptiveGap *= 0.8;
            dynamicMultiplier *= 0.85; 
        }
        
        let isBeat = flux > (localAvg * dynamicMultiplier) && flux > minNoiseFloor && energies[i].vol > (minNoiseFloor * 2);
        
        if (isBeat) {
            let lastNoteTime = map.length > 0 ? map[map.length-1].time : -1;
            let timeFromLast = energies[i].time - lastNoteTime;

            if (timeFromLast < minTimeGap * 1.5 && flux < localAvg * dynamicMultiplier * 2.5) {
                isBeat = false;
            } else if (timeFromLast < adaptiveGap) {
                isBeat = false;
            }
        }

        if (isBeat) {
            // DETECCIÓN DE TONO BAJO DEMANDA: Solo cuando confirmamos que habrá nota
            let currentPitch = -1;
            const corrSize = Math.floor(sampleRate * 0.025);
            // Aseguramos que el índice sea un entero válido
            const centerIdx = energies[i].sampleIdx || 0;
            const startIdx = Math.max(0, Math.floor(centerIdx - corrSize / 2));
            const endIdx = Math.min(trebleData.length, startIdx + corrSize);
            
            const corrData = trebleData.subarray(startIdx, endIdx);
            currentPitch = autoCorrelate(corrData, sampleRate);
            
            // Guardamos el tono en el objeto por si fuera útil para análisis posterior
            energies[i].pitch = currentPitch;

                // --- ALGORITMO DE SELECCIÓN DE CARRIL (STAIRCASE ENGINE) ---
                let favoredCol = 1;
                
                // En modo Inhumano, los agudos tienen más peso para capturar ráfagas de platos/snares
                const trebleWeight = (difficulty === 'inhumano') ? 1.5 : 1.0;
                const trebleFlux = energies[i].trebleVol - (i > 0 ? energies[i-1].trebleVol : 0);
                const combinedFlux = (flux * 0.7) + (Math.max(0, trebleFlux) * 0.3 * trebleWeight);
             let timeGap = energies[i].time - (map.length > 0 ? map[map.length-1].time : 0);

             // Si la canción es rápida o hay ráfaga, activar "Modo Escalera"
             if (timeGap < 0.40 && lastCol !== -1) {
                 favoredCol = lastCol + staircaseDir;
                 
                 // Rebotar en los bordes
                 if (favoredCol > 3) {
                     favoredCol = 2;
                     staircaseDir = -1;
                 } else if (favoredCol < 0) {
                     favoredCol = 1;
                     staircaseDir = 1;
                 }
                 
                 // Alta probabilidad de cambiar de dirección o saltar para variedad (231, 312, etc.)
                 if (Math.random() < 0.35) {
                     staircaseDir *= -1;
                     // A veces dar un salto doble para romper la monotonía
                     if (Math.random() < 0.3) favoredCol = (lastCol + (staircaseDir * 2) + 4) % 4;
                 }

             } else {
                 // Si las notas están separadas, usar el Tono (Pitch) para mapeo melódico mejorado
                 if (currentPitch > 50) { 
                     // Rangos de frecuencia ajustados para mayor equilibrio central
                     if (currentPitch < 180) favoredCol = 0;
                     else if (currentPitch < 480) favoredCol = 1;
                     else if (currentPitch < 1100) favoredCol = 2;
                     else favoredCol = 3;

                     // --- SISTEMA DE CENTRADO PROACTIVO (ANTI-BORDES) ---
                     // Si el tono pide un borde (0 o 3) pero ya hemos usado mucho los bordes, forzar centro
                     if ((favoredCol === 0 || favoredCol === 3)) {
                         sideLaneCounter++;
                         if (sideLaneCounter > 1) { // Máximo 1 nota de borde permitida antes de forzar centro
                             favoredCol = (favoredCol === 0) ? 1 : 2;
                             sideLaneCounter = 0; 
                         }
                     } else {
                         sideLaneCounter = 0; // Reset si la nota es central
                     }
                 } else {
                     // Si no hay tono claro, preferir carriles centrales (1 o 2)
                     const rand = Math.random();
                     favoredCol = rand < 0.35 ? 1 : (rand < 0.7 ? 2 : (rand < 0.85 ? 0 : 3));
                 }
             }

                // --- 2. LÓGICA ANTI-MINIJACKS DEFINITIVA (MEMORIA DINÁMICA) ---
                const addNoteToMap = (time, col, energy) => {
                    let finalCol = col;
                    let attempts = 0;
                    
                    let collision = true;
                    while (collision && attempts < 4) {
                        collision = false;
                        for (let j = map.length - 1; j >= 0; j--) {
                            if (time - map[j].time > dynamicWindow) break; 
                            
                            if (map[j].col === finalCol) {
                                collision = true;
                                finalCol = (finalCol + 1) % 4;
                                attempts++;
                                break;
                            }
                        }
                    }
                    
                    map.push({ time, col: finalCol, active: true, scored: false, rawEnergy: energy });
                };

                let col = favoredCol;
                addNoteToMap(energies[i].time - 0.02, col, flux);

                // --- 3. LÓGICA DE DOBLES (MEJORADA) ---
                if (flux > localAvg * dynamicMultiplier * 3.8 && difficulty !== 'facil') {
                    let secondCol = (col + 2) % 4; 
                    // Verificar también el segundo carril del acorde contra la nota anterior
                    addNoteToMap(energies[i].time - 0.02, secondCol, flux);
                }
            }
        
    }
    
    // --- CUANTIZACIÓN FINAL ---
    const bpmOnsets = [];
    for (let i = 1; i < bpmEnergies.length; i++) {
        let diff = bpmEnergies[i].vol - bpmEnergies[i-1].vol;
        if (diff > 0.5) bpmOnsets.push(bpmEnergies[i].time);
    }
    const bpm = estimateBPM(bpmOnsets);
    const beatDuration = 60 / bpm;

    if (map.length > 5) {
        let anchor = bpmOnsets.length > 0 ? bpmOnsets[0] : map[0].time;
        // Mayor resolución de cuadrícula: Normal ahora soporta 1/8+, Hard+ soporta 1/16
        const subdivision = (difficulty === 'dificil' || difficulty === 'inhumano') ? 16 : 8;
        const step = beatDuration / subdivision;
        const mainBeatStep = beatDuration / 4; // 1/4 note

        map.forEach(note => {
            const nearestQuarter = Math.round((note.time - anchor) / mainBeatStep);
            const quarterTime = anchor + (nearestQuarter * mainBeatStep);
            
            // --- PREFERENCIA DE TIEMPOS FUERTES (1/4) ---
            // Si la nota está suficientemente cerca de una negra, forzar el snap a ella
            if (Math.abs(note.time - quarterTime) < mainBeatStep * 0.35) {
                note.time = quarterTime;
            } else {
                const nearestStep = Math.round((note.time - anchor) / step);
                note.time = anchor + (nearestStep * step);
            }
        });
        
        // Limpieza final de duración

        map = map.filter((note, index, self) => 
            index === self.findIndex((t) => Math.abs(t.time - note.time) < 0.01 && t.col === note.col)
        );

        // --- BARRIDO FINAL ANTI-MINIJACKS (POST-CUANTIZACIÓN) ---
        // Después del snap al BPM, verificamos que las notas no hayan quedado peligrosamente juntas en el mismo carril
        for (let i = 1; i < map.length; i++) {
            let current = map[i];
            // Revisar contra las 3 anteriores (por si hay acordes de 3 o ráfagas continuas)
            for (let b = 1; b <= 3; b++) {
                if (i - b < 0) break;
                let prev = map[i - b];
                
                if (current.col === prev.col && Math.abs(current.time - prev.time) < (dynamicWindow * 0.85)) {
                    current.col = (current.col + 1) % 4;
                    b = 0; 
                }
            }
        }

        statusText.innerText += `\n[Tempo Detectado: ${bpm} BPM]`;
    }

    return map;
}
