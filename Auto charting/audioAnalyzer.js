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

const btnLibrary = document.getElementById('btn-library');
const libraryContent = document.getElementById('library-content');
const libraryCount = document.getElementById('library-count');

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

// Lógica de Librería
if (btnLibrary) {
    btnLibrary.addEventListener('click', (e) => {
        e.stopPropagation();
        libraryContent.classList.toggle('hidden');
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.library-dropdown')) {
            libraryContent.classList.add('hidden');
        }
    });
}

function renderLibrary() {
    libraryCount.innerText = `(${window.savedSongs.length})`;
    if (window.savedSongs.length === 0) {
        libraryContent.innerHTML = '<div class="library-empty">Aún no has generado canciones</div>';
        return;
    }
    
    libraryContent.innerHTML = '';
    if (window.audioMap) {
        window.audioMap.forEach(n => { 
            n.active = true; 
            n.scored = false; 
            n.isHolding = false; 
        });
    }
    window.savedSongs.forEach(song => {
        let div = document.createElement('div');
        div.className = 'library-item';
        div.innerHTML = `<strong>${song.name}</strong><span>Dificultad: ${song.difficulty} - Notas: ${song.audioMap.length}</span>`;
        div.addEventListener('click', () => {
            loadSongFromLibrary(song);
        });
        libraryContent.appendChild(div);
    });
}

function loadSongFromLibrary(song) {
    if (typeof stopPreviousAudio === 'function') stopPreviousAudio();
    isPlaying = false; // Detener el loop visual
    
    window.audioBuffer = song.audioBuffer;
    window.audioMap = song.audioMap;
    window.selectedDifficulty = song.difficulty;
    window.currentFileName = song.name;
    
    fileNameDisplay.innerText = song.name;
    fileInfo.classList.remove('hidden');
    dropzone.classList.add('hidden');
    
    // Update visual selector
    modeBtns.forEach(b => {
        if(b.dataset.diff === song.difficulty) b.classList.add('active');
        else b.classList.remove('active');
    });

    // Reset Play UI
    btnProcess.classList.add('hidden');
    const btnPlayGame = document.getElementById('btn-play');
    btnPlayGame.classList.remove('hidden');
    const btnPauseGame = document.getElementById('btn-pause');
    btnPauseGame.classList.add('hidden');
    statusText.innerText = `(Cargado) ${song.name}\nPresiona ESPACIO o haz clic en Jugar.`;
    
    libraryContent.classList.add('hidden');
    
    if (typeof window.drawReadyState === 'function') {
        setTimeout(() => window.drawReadyState(), 50); // Pequeño delay para asegurar que el buffer esté listo
    }
}

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
            btnPlay.classList.remove('hidden');
            statusText.innerText = `¡Se generaron ${window.audioMap.length} notas!\nPresiona ESPACIO o haz clic en Jugar para iniciar.`;
            
            // Guardar a la librería
            const songObj = {
                id: Date.now(),
                name: window.currentFileName || 'Desconocido',
                difficulty: window.selectedDifficulty,
                audioBuffer: window.audioBuffer,
                audioMap: window.audioMap
            };
            
            let existingIndex = window.savedSongs.findIndex(s => s.name === songObj.name && s.difficulty === songObj.difficulty);
            if (existingIndex !== -1) {
                window.savedSongs[existingIndex] = songObj;
            } else {
                window.savedSongs.push(songObj);
            }
            renderLibrary();

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
    
    let minNoiseFloor = (difficulty === 'facil' ? 1.0 : (difficulty === 'inhumano' ? 0.2 : 0.4));
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
    let localAverageBuffer = [];
    let avgWindow = 50; 
    let minTimeGap = 0.3; 
    let energyMultiplier = 1.8; 

    // Configuración Base (Serán modificadas dinámicamente en el loop)
    if (difficulty === 'facil') { minTimeGap = 0.50; energyMultiplier = 3.5; }
    else if (difficulty === 'normal') { minTimeGap = 0.25; energyMultiplier = 2.6; }
    else if (difficulty === 'dificil') { minTimeGap = 0.15; energyMultiplier = 2.1; }
    else if (difficulty === 'inhumano') { minTimeGap = 0.08; energyMultiplier = 1.8; }

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
        let dynamicMultiplier = energyMultiplier;
        if (localIntensity > 1.4) dynamicMultiplier *= 0.85; // Secciones intensas (drop/estribillo)
        if (localIntensity < 0.7) dynamicMultiplier *= 1.20; // Secciones tranquilas (outro/intro)

        let isBeat = flux > localAvg * dynamicMultiplier && flux > minNoiseFloor;
        let isDebounced = false; // Definir para compatibilidad con notas largas
        
        // --- ADAPTABILIDAD RÍTMICA ---
        let adaptiveGap = minTimeGap;
        if (localIntensity < 0.8) adaptiveGap *= 1.8; 
        
        if (isBeat) {
            let lastNoteTime = map.length > 0 ? map[map.length-1].time : -1;
            let timeFromLast = energies[i].time - lastNoteTime;

            if (timeFromLast < minTimeGap * 1.5 && flux < localAvg * dynamicMultiplier * 2.5) {
                isBeat = false;
                isDebounced = true;
            } else if (timeFromLast < adaptiveGap) {
                isBeat = false;
                isDebounced = true;
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
            
            // Guardamos el tono en el objeto por si lo necesitan las notas largas después
            energies[i].pitch = currentPitch;

            let favoredCol = -1;
            if (currentPitch > 50) { 
                    if (currentPitch < 220) favoredCol = 0;
                    else if (currentPitch < 540) favoredCol = 1;
                    else if (currentPitch < 1200) favoredCol = 2;
                    else favoredCol = 3;
                } else {
                    favoredCol = (lastCol !== -1) ? (lastCol + 1) % 4 : Math.floor(Math.random() * 4);
                }

                // --- 2. PENALIZACIÓN DE REPETICIÓN Y VARIedad (FLOW) ---
                let timeGap = energies[i].time - (map.length > 0 ? map[map.length-1].time : 0);
                
                // Si la nota es muy rápida (<0.35s) o se repite el mismo carril, forzar dispersión
                if (favoredCol === lastCol || timeGap < 0.35) {
                    let forceChangeChance = timeGap < 0.35 ? 0.92 : 0.6;
                    if (Math.random() < forceChangeChance) {
                        // Realizar saltos de 1 o 2 campos para evitar spam de un solo lugar
                        let shift = Math.random() < 0.6 ? (Math.random() < 0.5 ? 1 : -1) : (Math.random() < 0.5 ? 2 : -2);
                        favoredCol = (lastCol + shift + 4) % 4;
                    }
                }
                
                let col = favoredCol;
                lastCol = col;
                map.push({ time: energies[i].time - 0.02, col: col, active: true, scored: false, type: 'single', duration: 0, holdEnded: false, rawEnergy: flux });

                // --- 2. LÓGICA DE DOBLES (SOLO GOLPES EXTREMOS) ---
                // Si el impacto es excepcionalmente fuerte (Factor aumentado de 2.4 a 3.8)
                if (flux > localAvg * dynamicMultiplier * 3.8 && difficulty !== 'facil') {
                    let secondCol = (col + 2) % 4; // Nota de apoyo
                    map.push({ time: energies[i].time - 0.02, col: secondCol, active: true, scored: false, type: 'single', duration: 0, holdEnded: false, rawEnergy: flux });
                }
            }
        
        if ((!isBeat || isDebounced) && map.length > 0) {
            let lastNote = map[map.length - 1];
            // Si la nota última nota no ha terminado y es reciente (<3s)
            if (!lastNote.holdEnded && (energies[i].time - lastNote.time < 3.0)) {
                
                // Si no tenemos el tono para este frame (Lazy), lo calculamos solo si es necesario para el sustain
                if (energies[i].pitch === undefined) {
                    const corrSize = Math.floor(sampleRate * 0.025);
                    const startIdx = Math.max(0, Math.floor((energies[i].sampleIdx || 0) - corrSize / 2));
                    const corrData = trebleData.subarray(startIdx, Math.min(trebleData.length, startIdx + corrSize));
                    energies[i].pitch = autoCorrelate(corrData, sampleRate);
                }

                const currentPitch = energies[i].pitch;
                const prevPitch = (energies[i-1] && energies[i-1].pitch !== undefined) ? energies[i-1].pitch : currentPitch;
                
                let sustainThreshold = localAvg * 1.3; 
                const isPitchStable = currentPitch > 50 && Math.abs(currentPitch - prevPitch) / (prevPitch || 1) < 0.10;
                const isHighVolumeSustain = energies[i].vol > sustainThreshold && energies[i].vol > minNoiseFloor * 0.8;

                if (isPitchStable && isHighVolumeSustain) {
                    lastNote.type = 'long';
                    lastNote.duration = energies[i].time - lastNote.time;
                } else {
                    lastNote.holdEnded = true; 
                }
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
        map.forEach(n => {
            if (n.type === 'long') {
                if (n.duration < step * 1.5) { n.type = 'single'; n.duration = 0; }
                else { n.duration = Math.max(step * 2, Math.round(n.duration / step) * step); }
            }
        });

        map = map.filter((note, index, self) => 
            index === self.findIndex((t) => Math.abs(t.time - note.time) < 0.01 && t.col === note.col)
        );
        statusText.innerText += `\n[Tempo Detectado: ${bpm} BPM]`;
    }

    return map;
}
