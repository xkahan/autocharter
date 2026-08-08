// Elementos de UI
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileNameDisplay = document.getElementById('file-name-display');
const btnProcess = document.getElementById('btn-process');
const btnPlay = document.getElementById('btn-play');
const statusText = document.getElementById('status-text');
const bpmInput = document.getElementById('bpm-input');

// Variables Globales (Aseguramos que existan)
window.audioContext = window.audioContext || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
window.audioBuffer = window.audioBuffer || null;
window.audioMap = window.audioMap || [];
window.currentFileName = window.currentFileName || '';
window.currentFileCover = window.currentFileCover || null;

// Función centralizada para resetear la UI de subida
window.resetUploaderUI = function (isInstant = false) {
    if (isInstant) {
        fileInfo.classList.add('hidden');
        fileInfo.style.opacity = '0';
        fileInfo.style.transform = 'translateY(0)';
    } else {
        fileInfo.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        fileInfo.style.opacity = '0';
        fileInfo.style.transform = 'translateY(-10px)';

        setTimeout(() => {
            fileInfo.classList.add('hidden');
            fileInfo.style.transform = 'translateY(0)';
        }, 500);
    }
};

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

    if (typeof window.resetGameModes === 'function') window.resetGameModes();

    window.currentFileName = file.name;

    const successLabel = document.getElementById('upload-success-label');
    if (successLabel) {
        successLabel.innerText = `${file.name} se ha importado con exito`;
    }

    fileInfo.classList.remove('hidden');
    fileInfo.style.transition = 'opacity 0.5s';
    fileInfo.style.opacity = '1';

    btnProcess.classList.remove('hidden');
    btnProcess.disabled = false;
    btnProcess.innerText = 'Procesar Audio y Generar Mapa';
    btnPlay.classList.add('hidden');
    statusText.innerText = 'Archivo cargado. Listo para generar.';

    if (bpmInput) bpmInput.value = '';

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
        // Detener cualquier audio previo antes de reanudar el contexto para evitar "despauses"
        if (typeof stopPreviousAudio === 'function') stopPreviousAudio();

        if (window.audioContext.state === 'suspended') {
            window.audioContext.resume();
        }

        // Copy raw ArrayBuffer to send over WebRTC later
        window.rawAudioBufferArray = reader.result.slice(0);

        window.audioContext.decodeAudioData(reader.result, buffer => {
            // Keep the full song — do not trim audio length (notes should generate for the whole track)
            window.audioBuffer = buffer;
            statusText.innerHTML = '<span style="color: var(--success); font-weight: 700; text-shadow: 0 0 10px var(--success);">✓ LISTO PARA ANÁLISIS</span><br/>Haz clic en Generar Mapa para procesar el ritmo y tono.';

            // Show the success label specifically
            const successLabel = document.getElementById('upload-success-label');
            if (successLabel) successLabel.classList.remove('hidden');

            if (window.playUISuccess) window.playUISuccess();
            fileInfo.classList.add('import-success');
            setTimeout(() => fileInfo.classList.remove('import-success'), 1500);

            // Animación del banner de éxito arriba en el centro
            const successBanner = document.getElementById('import-success-banner');
            if (successBanner) {
                successBanner.classList.add('show');
                setTimeout(() => {
                    successBanner.classList.remove('show');
                }, 3000);
            }
        }, error => {
            statusText.innerText = 'Error al decodificar el audio.';
        });
    };

    // Extraer carátula (Thumbnail)
    window.currentFileCover = null;
    const thumbnailEl = document.getElementById('np-thumbnail');
    if (thumbnailEl) {
        // Reset thumbnail to CD
        thumbnailEl.style.backgroundImage = 'none';
        thumbnailEl.innerHTML = '<div class="np-cd-icon"><div class="np-cd-inner"></div></div>';
    }

    if (window.jsmediatags) {
        window.jsmediatags.read(file, {
            onSuccess: function(tag) {
                const { tags } = tag;
                if (tags.artist) window.currentArtist = tags.artist;
                if (tags.title) window.currentSongTitle = tags.title;
                if (tags.picture) {
                    const { data, format } = tags.picture;
                    let base64String = "";
                    for (let i = 0; i < data.length; i++) {
                        base64String += String.fromCharCode(data[i]);
                    }
                    window.currentFileCover = `data:${format};base64,${window.btoa(base64String)}`;
                    if (thumbnailEl) {
                        thumbnailEl.style.backgroundImage = 'none';
                        thumbnailEl.innerHTML = `<img src="${window.currentFileCover}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                    }
                }
            },
            onError: function(error) {
                console.warn('Error leyendo tags ID3:', error.type, error.info);
            }
        });
    }
}

btnProcess.addEventListener('click', async () => {
    if (!window.audioBuffer) return;

    btnProcess.disabled = true;
    btnProcess.innerText = 'Procesando...';
    statusText.innerText = 'Analizando ritmo completo y densificando mapa...';

    setTimeout(async () => {
        try {
            const songDuration = window.audioBuffer ? window.audioBuffer.duration : 0;

            const getPreloadedMap = () => {
                if (!window.preloadedSongsNotes) return null;
                if (window.currentFileName === "No Devil Lived On.mp3" && window.preloadedSongsNotes.noDevilLivedOn) {
                    return JSON.parse(JSON.stringify(window.preloadedSongsNotes.noDevilLivedOn));
                }
                if (window.currentFileName === "Pictured As Perfect.mp3" && window.preloadedSongsNotes.picturedAsPerfect) {
                    return JSON.parse(JSON.stringify(window.preloadedSongsNotes.picturedAsPerfect));
                }
                if (window.currentFileName === "Lost In Snow.mp3" && window.preloadedSongsNotes.lostInSnow) {
                    return JSON.parse(JSON.stringify(window.preloadedSongsNotes.lostInSnow));
                }
                return null;
            };

            const lastNoteTime = (map) => {
                if (!Array.isArray(map) || map.length === 0) return 0;
                let maxT = 0;
                for (const n of map) {
                    if (!n) continue;
                    const t = (typeof n.endTime === 'number' && Number.isFinite(n.endTime)) ? n.endTime : n.time;
                    if (t > maxT) maxT = t;
                }
                return maxT;
            };

            let preloaded = getPreloadedMap();
            if (preloaded) {
                const mapEnd = lastNoteTime(preloaded);
                // If the audio continues past the preloaded chart, keep the authored notes
                // and generate the rest with the same detectBeats pipeline (no algorithm change).
                if (songDuration > mapEnd + 1.5) {
                    statusText.innerText = `Mapa base cargado hasta ${mapEnd.toFixed(1)}s — generando el resto de la canción...`;
                    const generated = await detectBeats(window.audioBuffer, window.selectedDifficulty);
                    const extras = (generated || []).filter(n => n && n.time > mapEnd + 0.05);
                    window.audioMap = preloaded.concat(extras).sort((a, b) => (a.time - b.time) || (a.col - b.col));
                } else {
                    window.audioMap = preloaded;
                }
            } else {
                window.audioMap = await detectBeats(window.audioBuffer, window.selectedDifficulty);
            }

            if (typeof window.addSongToLibrary === 'function') {
                try {
                    window.addSongToLibrary({
                        fileName: window.currentFileName || 'Audio',
                        difficulty: window.selectedDifficulty,
                        fallSpeed: window.fallSpeed,
                        audioBuffer: window.audioBuffer,
                        map: window.audioMap
                    });
                } catch (e) {
                    console.warn('No se pudo guardar en biblioteca:', e);
                }
            }

            btnProcess.innerText = 'Mapa Generado ✓';
            btnProcess.classList.add('hidden');

            // Mostrar controles de juego
            btnPlay.classList.remove('hidden');
            statusText.innerText = `¡Se generaron ${window.audioMap.length} notas!\nPresiona ESPACIO o haz clic en Jugar para iniciar.`;

            if (typeof window.renderLibrary === 'function') {
                window.renderLibrary();
            }

            if (typeof window.updateExtremeDiffMsg === 'function') {
                window.updateExtremeDiffMsg(window.audioMap.length, window.audioBuffer ? window.audioBuffer.duration : 0);
            }

            if (typeof window.drawReadyState === 'function') {
                window.drawReadyState();
            }

            // Dispatch event for multiplayer auto-synchronization
            window.dispatchEvent(new CustomEvent('neonbeat-song-loaded'));

            // Fase de Fade-Out elegante usando la nueva función centralizada
            setTimeout(() => {
                window.resetUploaderUI(false);
            }, 4000);
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

    // --- ESTIMADOR DE BPM POR AUTOCORRELACIÓN DE INTERVALOS (ACF-IOI) ---
    // Mucho más preciso que el bucket counting. Analiza la periodicidad dominante
    // en los intervalos entre onsets usando autocorrelación.

    // Paso 1: Construir un histograma de alta resolución de intervalos
    const histResolution = 0.002; // 2ms de resolución
    const maxLag = 2.0; // Hasta 2 segundos (30 BPM mínimo)
    const histSize = Math.ceil(maxLag / histResolution);
    const histogram = new Float32Array(histSize);

    // Kernel gaussiano para suavizar (sigma = 5ms)
    const sigma = 0.005 / histResolution; // ~2.5 bins
    const kernelRadius = Math.ceil(sigma * 3);

    for (let i = 0; i < onsets.length; i++) {
        const limit = Math.min(i + 16, onsets.length); // Comparar con las 16 más cercanas
        for (let j = i + 1; j < limit; j++) {
            let diff = onsets[j] - onsets[i];
            if (diff <= 0 || diff > maxLag) continue;

            const bin = Math.round(diff / histResolution);
            const weight = 1.0 / (j - i); // Más peso a intervalos cercanos

            // Aplicar kernel gaussiano para suavizar el histograma
            for (let k = -kernelRadius; k <= kernelRadius; k++) {
                const idx = bin + k;
                if (idx >= 0 && idx < histSize) {
                    const gaussWeight = Math.exp(-(k * k) / (2 * sigma * sigma));
                    histogram[idx] += weight * gaussWeight;
                }
            }
        }
    }

    // Paso 2: Buscar picos en el rango 60-200 BPM
    const minInterval = 60 / 200; // 0.3s (200 BPM)
    const maxInterval = 60 / 60;  // 1.0s (60 BPM)
    const minBin = Math.floor(minInterval / histResolution);
    const maxBin = Math.ceil(maxInterval / histResolution);

    // Encontrar todos los picos locales
    const peaks = [];
    for (let i = Math.max(1, minBin); i < Math.min(maxBin, histSize - 1); i++) {
        if (histogram[i] > histogram[i - 1] && histogram[i] >= histogram[i + 1] && histogram[i] > 0.1) {
            peaks.push({ bin: i, score: histogram[i] });
        }
    }

    if (peaks.length === 0) return 120;

    // Paso 3: Para cada pico candidato, evaluar la fuerza de sus armónicos
    // (un BPM correcto tendrá picos en 1x, 2x, 0.5x del intervalo)
    let bestBPM = 120;
    let bestScore = -1;

    for (const peak of peaks) {
        const interval = peak.bin * histResolution;
        let harmonicScore = peak.score * 2; // Peso doble al fundamental

        // Verificar armónicos: doble tempo (mitad intervalo) y medio tempo (doble intervalo)
        const halfBin = Math.round(peak.bin / 2);
        const dblBin = Math.round(peak.bin * 2);
        const tripleBin = Math.round(peak.bin / 3);

        if (halfBin >= 0 && halfBin < histSize) harmonicScore += histogram[halfBin] * 1.2;
        if (dblBin >= 0 && dblBin < histSize) harmonicScore += histogram[dblBin] * 0.8;
        if (tripleBin >= 0 && tripleBin < histSize) harmonicScore += histogram[tripleBin] * 0.5;

        // Penalizar BPMs demasiado altos o bajos (preferir rango 80-170)
        const bpmCandidate = 60 / interval;
        if (bpmCandidate >= 80 && bpmCandidate <= 170) harmonicScore *= 1.15;

        if (harmonicScore > bestScore) {
            bestScore = harmonicScore;
            bestBPM = bpmCandidate;
        }
    }

    // Paso 4: Refinamiento fino - buscar el BPM exacto con resolución de 0.1 BPM
    // alrededor del candidato ganador
    let refinedBPM = bestBPM;
    let refinedScore = -1;

    for (let testBPM = bestBPM - 2; testBPM <= bestBPM + 2; testBPM += 0.1) {
        if (testBPM < 50) continue;
        const testInterval = 60 / testBPM;
        let score = 0;

        // Medir cuántos onsets caen cerca de la rejilla de este BPM
        for (let i = 0; i < Math.min(onsets.length, 200); i++) {
            const beatPhase = (onsets[i] % testInterval) / testInterval;
            // Distancia al beat más cercano (0 = perfecto, 0.5 = máximo off)
            const dist = Math.min(beatPhase, 1 - beatPhase);
            // Peso gaussiano: notas en el beat contribuyen mucho, off-beat casi nada
            score += Math.exp(-(dist * dist) / (0.04 * 0.04));
        }

        if (score > refinedScore) {
            refinedScore = score;
            refinedBPM = testBPM;
        }
    }

    // Redondear a 0.5 BPM para evitar precisión artificial
    let bpm = Math.round(refinedBPM * 2) / 2;

    // Preferir BPMs enteros comunes si estamos a menos de 0.5 BPM de uno
    const commonBPMs = [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 128, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 190, 200];
    for (const common of commonBPMs) {
        if (Math.abs(bpm - common) < 1.0) {
            bpm = common;
            break;
        }
    }

    return bpm;
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
    // Esta estimación controla la DENSIDAD de generación (cuántas notas se producen).
    // SIEMPRE debe provenir del audio real, incluso si el usuario proporcionó BPM manual.
    // El BPM manual solo se usa para la CUANTIZACIÓN FINAL (dónde caen las notas en el grid).
    const manualBPM = bpmInput ? parseFloat(bpmInput.value) : NaN;
    const hasManualBPM = Number.isFinite(manualBPM) && manualBPM >= 40 && manualBPM <= 300;

    // Siempre analizar el audio para la estimación preliminar de densidad
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

    if (hasManualBPM) {
        statusText.innerText = `[BPM Manual: ${manualBPM} | Densidad auto: ${estimatedBPM} BPM | Ventana: ${dynamicWindow}s]`;
    } else {
        statusText.innerText = `[Análisis: ${estimatedBPM} BPM | Ventana: ${dynamicWindow}s]`;
    }

    // Se ha subido la barrera mínima de ruido para ignorar sonidos inaudibles/fantasmas detectados
    let minNoiseFloor = (difficulty === 'facil' ? 18.0 : (difficulty === 'inhumano' ? 10.0 : 12.5));
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
    let lastPitch = -1;
    let staircaseDir = 1;
    let sideLaneCounter = 0; // NEW: Contador para evitar el spam en los bordes (0 y 3)
    let miniJackCount = 0;
    let localAverageBuffer = [];
    let avgWindow = 50;
    let minTimeGap = 0.3;
    let energyMultiplier = 1.8;
    let lastChordTime = -1e9;
    let recentChordTimes = [];

    // PRNG determinista: evita que el mismo audio genere patrones diferentes en cada corrida.
    const rand01 = (seed) => {
        const h = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0);
        return h / 4294967296;
    };
    const seedFromTime = (t, salt) => ((Math.floor(t * 1000) + (salt | 0)) | 0);

    // Configuración Base (Serán modificadas dinámicamente en el loop)
    if (difficulty === 'facil') { minTimeGap = 0.75; energyMultiplier = 9.0; }
    else if (difficulty === 'normal') { minTimeGap = 0.45; energyMultiplier = 7.0; }
    else if (difficulty === 'dificil') { minTimeGap = 0.22; energyMultiplier = 5.8; }
    else if (difficulty === 'inhumano') { minTimeGap = 0.12; energyMultiplier = 4.8; } // Mucho menos sensible

    const globalAvgVol = energies.reduce((sum, e) => sum + e.vol, 0) / energies.length;
    const globalAvgTrebleVol = energies.reduce((sum, e) => sum + e.trebleVol, 0) / energies.length;
    const trebleWeight = (difficulty === 'inhumano') ? 1.5 : 1.0;
    const generationSubdivision = (difficulty === 'facil') ? 8 : 16;
    const estimatedQuarterDuration = 60 / (estimatedBPM || 120);
    const estimatedStep = (estimatedQuarterDuration * 4) / generationSubdivision;
    let recentTransientTimes = [];

    for (let i = 1; i < energies.length; i++) {
        const volDiff = energies[i].vol - energies[i - 1].vol;
        const overallFlux = volDiff > 0 ? volDiff : 0;

        const bassDiff = energies[i].bassVol - energies[i - 1].bassVol;
        const bassFlux = bassDiff > 0 ? bassDiff : 0;

        const trebleDiff = energies[i].trebleVol - energies[i - 1].trebleVol;
        const trebleFlux = trebleDiff > 0 ? trebleDiff : 0;

        const flux = (overallFlux * 0.7) + (trebleFlux * 0.3 * trebleWeight);
        localAverageBuffer.push(flux);
        if (localAverageBuffer.length > avgWindow) localAverageBuffer.shift();
        let localAvg = localAverageBuffer.reduce((a, b) => a + b, 0) / localAverageBuffer.length;

        // --- DETECCIÓN DE SECCIÓN RÁPIDA (DENSIDAD) ---
        // Se calcula PRIMERO para saber qué tan rítmica está la canción actualmente.
        const isTransient = flux > minNoiseFloor && energies[i].vol > (minNoiseFloor * 2) && flux > (localAvg * 1.1);
        if (isTransient) {
            recentTransientTimes.push(energies[i].time);
        }
        const cutoff = energies[i].time - 0.9;
        while (recentTransientTimes.length && recentTransientTimes[0] < cutoff) recentTransientTimes.shift();

        let transientRate = 0;
        if (recentTransientTimes.length >= 4) {
            const span = recentTransientTimes[recentTransientTimes.length - 1] - recentTransientTimes[0];
            if (span > 0.25) transientRate = recentTransientTimes.length / span;
        }

        const fastThreshold = (difficulty === 'facil') ? 7 : (difficulty === 'normal') ? 8 : (difficulty === 'dificil') ? 10 : 12;
        const inFastSection = transientRate >= fastThreshold;

        // --- DINAMISMO DE INTENSIDAD ---
        // Ajustar el multiplicador según si la sección es fuerte (más notas) o suave (menos notas)
        let localIntensity = energies[i].vol / (globalAvgVol || 1);
        let trebleIntensity = energies[i].trebleVol / (globalAvgTrebleVol || 1);
        // --- ADAPTABILIDAD RÍTMICA DINÁMICA ---
        let dynamicMultiplier = energyMultiplier;
        let adaptiveGap = minTimeGap;

        // Modificadores de reducción según dificultad (más suaves en Easy/Normal)
        const dropGapFactor = (difficulty === 'facil') ? 0.85 : (difficulty === 'normal') ? 0.75 : 0.55;
        const dropMultFactor = (difficulty === 'facil') ? 0.90 : (difficulty === 'normal') ? 0.80 : 0.65;
        const fastGapFactor = (difficulty === 'facil') ? 0.90 : (difficulty === 'normal') ? 0.80 : 0.65;
        const fastMultFactor = (difficulty === 'facil') ? 0.90 : (difficulty === 'normal') ? 0.85 : 0.78;

        // Para considerar un DROP o SECCIÓN FUERTE, el volumen debe ser alto PERO TAMBIÉN debe haber ritmo vivo.
        // Si el drop termina pero el volumen se mantiene alto (pad/canto), transientRate caerá y la intensidad bajará.
        let isDrop = (localIntensity > 1.6 || trebleIntensity > 1.7) && transientRate >= (fastThreshold * 0.5);
        let isStrong = (localIntensity > 1.2 || trebleIntensity > 1.35) && transientRate >= (fastThreshold * 0.3);
        let isCalm = (localIntensity < 0.45 && trebleIntensity < 0.55);

        if (localIntensity < 0.15 && trebleIntensity < 0.25) {
            // SILENCIO CASI TOTAL: Bloquear notas fantasmas
            adaptiveGap *= 4.0;
            dynamicMultiplier *= 3.0;
        } else if (isDrop) {
            // DROP: Reducir gap y multiplicador para capturar más ritmo y generar más notas
            adaptiveGap *= dropGapFactor;
            dynamicMultiplier *= dropMultFactor;
        } else if (isStrong) {
            // SECCIÓN FUERTE: Máxima sensibilidad para ráfagas
            adaptiveGap *= 0.85;
            dynamicMultiplier *= 0.90;
        } else if (isCalm) {
            // SECCIÓN CALMADA: Más selectivo para evitar sobre-mapeo en partes lentas
            adaptiveGap *= 1.35;
            dynamicMultiplier *= 1.45;
        }

        if (inFastSection) {
            adaptiveGap *= fastGapFactor;
            dynamicMultiplier *= fastMultFactor;
            adaptiveGap = Math.min(adaptiveGap, estimatedStep * 1.15);
        }

        let isBeat = flux > (localAvg * dynamicMultiplier) && flux > minNoiseFloor && energies[i].vol > (minNoiseFloor * 2);
        if (!isBeat && (inFastSection || isDrop)) {
            // En partes rápidas o drops, somos más permisivos para agarrar el ritmo
            isBeat = flux > (localAvg * dynamicMultiplier * 0.85) && flux > (minNoiseFloor * 0.85) && energies[i].vol > (minNoiseFloor * 1.5);
        }

        if (isBeat) {
            let lastNoteTime = map.length > 0 ? map[map.length - 1].time : -1;
            let timeFromLast = energies[i].time - lastNoteTime;

            if (timeFromLast < adaptiveGap) {
                isBeat = false;
            } else if (!inFastSection && !isDrop && timeFromLast < minTimeGap * 1.5 && flux < localAvg * dynamicMultiplier * 2.5) {
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

            // --- ALGORITMO DE SELECCIÓN DE CARRIL (MELÓDICO Y ACORDE A LA CANCIÓN) ---
            let favoredCol = 1;
            let timeGap = energies[i].time - (map.length > 0 ? map[map.length - 1].time : 0);
            let isSamePitch = false;
            let allowMiniJack = false;

            if (currentPitch > 50 && lastPitch !== -1 && Math.abs(currentPitch - lastPitch) < 30) {
                isSamePitch = true;
            }

            if (isSamePitch && lastCol !== -1) {
                // --- MODO MINI-JACK (MISMO TONO = MISMO CARRIL) ---
                if (miniJackCount < 1) { // Límite en 1 significa que NO se permiten repeticiones consecutivas
                    favoredCol = lastCol;
                    allowMiniJack = true;
                } else {
                    // Forzar cambio de carril porque excedimos el límite
                    favoredCol = lastCol + staircaseDir;
                    if (favoredCol > 3) { favoredCol = 2; staircaseDir = -1; }
                    if (favoredCol < 0) { favoredCol = 1; staircaseDir = 1; }
                    allowMiniJack = false;
                }
            } else if (currentPitch > 50) {
                // --- DIFERENTE TONO = CAMBIO OBLIGATORIO DE CARRIL ---
                let targetCol;
                if (currentPitch < 200) targetCol = 0;
                else if (currentPitch < 500) targetCol = 1;
                else if (currentPitch < 1100) targetCol = 2;
                else targetCol = 3;

                // Forzar que NO sea el mismo carril (si es posible)
                if (targetCol === lastCol) {
                    targetCol = lastCol + staircaseDir;
                    if (targetCol > 3) { targetCol = 2; staircaseDir = -1; }
                    if (targetCol < 0) { targetCol = 1; staircaseDir = 1; }
                }
                favoredCol = targetCol;

                // --- SISTEMA DE CENTRADO PROACTIVO (ANTI-BORDES) ---
                if ((favoredCol === 0 || favoredCol === 3)) {
                    sideLaneCounter++;
                    if (sideLaneCounter > 1) {
                        favoredCol = (favoredCol === 0) ? 1 : 2;
                        sideLaneCounter = 0;
                        if (favoredCol === lastCol) favoredCol = (favoredCol === 1) ? 2 : 1;
                    }
                } else {
                    sideLaneCounter = 0;
                }
            } else if (timeGap < (difficulty === 'facil' ? 0.20 : 0.40) && lastCol !== -1) {
                // --- MODO ESCALERA (Rápido, sin tono claro) ---
                favoredCol = lastCol + staircaseDir;

                if (favoredCol > 3) {
                    favoredCol = 2;
                    staircaseDir = -1;
                } else if (favoredCol < 0) {
                    favoredCol = 1;
                    staircaseDir = 1;
                }

                const r0 = rand01(seedFromTime(energies[i].time, 11));
                if (r0 < 0.35) {
                    staircaseDir *= -1;
                    const r1 = rand01(seedFromTime(energies[i].time, 73));
                    if (r1 < 0.3) favoredCol = (lastCol + (staircaseDir * 2) + 4) % 4;
                }
            } else {
                // --- ALEATORIO SIN REPETICIÓN (Lento, sin tono claro) ---
                const rand = rand01(seedFromTime(energies[i].time, 131));
                favoredCol = rand < 0.35 ? 1 : (rand < 0.7 ? 2 : (rand < 0.85 ? 0 : 3));
                if (favoredCol === lastCol) {
                    favoredCol = (favoredCol + 1) % 4;
                }
            }

            // Actualizar pitch
            if (currentPitch > 50) lastPitch = currentPitch;

            // --- 2. LÓGICA ANTI-MINIJACKS INTELIGENTE ---
            const addNoteToMap = (time, col, energy) => {
                let finalCol = col;
                
                // Solo evitar colisiones en la misma columna si NO es un mini-jack intencional
                if (!allowMiniJack) {
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
                }

                map.push({
                    time,
                    endTime: null,
                    col: finalCol,
                    type: 'tap',
                    active: true,
                    scored: false,
                    rawEnergy: energy,
                    rawPitch: (typeof currentPitch === 'number' ? currentPitch : null)
                });
                if (finalCol === lastCol) {
                    miniJackCount++;
                } else {
                    miniJackCount = 1;
                }
                lastCol = finalCol;
                return finalCol;
            };

            const placedCol = addNoteToMap(energies[i].time, favoredCol, flux);

            // --- 3. LÓGICA DE ACORDES ELIMINADA ---
            // A petición del usuario, eliminamos la "generación forzada" de una segunda nota (dobles producidos sintéticamente).
            // Ahora, un golpe físico crea EXTRECHAMENTE sola 1 nota ("las dobles son normales").
            // Si accidentalmente el audio genera múltiples picos orgánicos a la vez, la fase posterior
            // los atrapará como dobles genuinos y cortará purgará los triples.

        }

    }

    // --- CUANTIZACIÓN FINAL ---
    const bpmOnsets = [];
    for (let i = 1; i < bpmEnergies.length; i++) {
        let diff = bpmEnergies[i].vol - bpmEnergies[i - 1].vol;
        if (diff > 0.5) bpmOnsets.push(bpmEnergies[i].time);
    }
    // Usar BPM manual si fue proporcionado, sino usar el estimador automático
    const bpm = hasManualBPM ? manualBPM : estimateBPM(bpmOnsets);
    const quarterDuration = 60 / bpm;
    const barDuration = quarterDuration * 4;

    if (map.length > 5) {
        // --- BUSCADOR DE CENTRO DE FASE GLOBAL (CORRELATION SEARCH) ---
        // En lugar de buscar solo el pico más alto en los primeros 5 segundos,
        // probamos múltiples candidatos de fase y elegimos el que maximiza
        // la correlación entre las notas detectadas y la rejilla BPM.

        // Resolución de cuadrícula por compás (4/4): Fácil = 1/8, Normal+ = 1/16
        const mainBeatStep = barDuration / 4; // negra
        // Además de 1/8 y 1/16, soportamos 1/12 y 1/24 para triplets.
        // 8  = 1/8, 12 = 1/12 (triplets), 16 = 1/16, 24 = 1/24 (triplets finos)
        const candidateSubdivisions = (difficulty === 'facil')
            ? [8, 12, 16]
            : [16, 12, 24, 8];
        let subdivision = candidateSubdivisions[0];
        let step = barDuration / subdivision;

        // --- FASE 1: Generar candidatos de anchor ---
        // Usamos las notas con mayor energía de toda la canción (no solo los primeros 5s)
        const anchorCandidates = [];
        const sortedByEnergy = [...map].sort((a, b) => (b.rawEnergy || 0) - (a.rawEnergy || 0));

        // Tomar los 30 golpes más fuertes como candidatos de fase
        for (let i = 0; i < Math.min(30, sortedByEnergy.length); i++) {
            if (sortedByEnergy[i].rawEnergy > 3.0) {
                anchorCandidates.push(sortedByEnergy[i].time);
            }
        }
        // Añadir el primer onset del bass como candidato adicional
        if (bpmOnsets.length > 0) anchorCandidates.push(bpmOnsets[0]);
        if (map.length > 0) anchorCandidates.push(map[0].time);

        // --- FASE 2: Elegir subdivisión + fase óptimas ---
        const sampleSize = Math.min(map.length, 300); // Usar hasta 300 notas para evaluar

        const computeBestAnchorForSubdivision = (gridSubdivision) => {
            const gridStep = barDuration / gridSubdivision;

            const phaseTestTimes = new Set();
            for (const candidateTime of anchorCandidates) {
                // El anchor real es el módulo dentro de un step
                // Probamos la fase del candidato y micro-ajustes de ±25% del step
                for (let offset = -gridStep * 0.25; offset <= gridStep * 0.25; offset += gridStep * 0.05) {
                    phaseTestTimes.add(candidateTime + offset);
                }
            }

            let bestAnchor = map[0].time;
            let bestScore = -1;

            for (const testAnchor of phaseTestTimes) {
                let score = 0;

                for (let i = 0; i < sampleSize; i++) {
                    const note = map[i];
                    const relativeTime = note.time - testAnchor;
                    const nearestTick = Math.round(relativeTime / gridStep);
                    const snappedTime = testAnchor + nearestTick * gridStep;
                    const deviation = Math.abs(note.time - snappedTime);
                    const devRatio = deviation / gridStep;

                    // Peso gaussiano: notas cerca del grid contribuyen mucho
                    const alignScore = Math.exp(-(devRatio * devRatio) / (0.15 * 0.15));

                    // Bonus extra si cae en un beat fuerte (negra)
                    const beatDeviation = Math.abs(relativeTime - Math.round(relativeTime / mainBeatStep) * mainBeatStep);
                    const beatBonus = Math.exp(-(beatDeviation / mainBeatStep) * (beatDeviation / mainBeatStep) / (0.1 * 0.1)) * 0.5;

                    // Ponderar por energía: golpes fuertes importan más para la fase
                    const energyWeight = 1 + Math.log1p(note.rawEnergy || 0) * 0.3;

                    score += (alignScore + beatBonus) * energyWeight;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestAnchor = testAnchor;
                }
            }

            return { bestAnchor, bestScore, gridStep, candidates: phaseTestTimes.size };
        };

        statusText.innerText = `Buscando fase óptima (${anchorCandidates.length} anchors, grids=${candidateSubdivisions.join(',')})...`;

        let anchor = map[0].time;
        let bestPhaseScore = -1;
        let bestCandidates = 0;

        for (const sub of candidateSubdivisions) {
            const res = computeBestAnchorForSubdivision(sub);
            if (res.bestScore > bestPhaseScore) {
                bestPhaseScore = res.bestScore;
                anchor = res.bestAnchor;
                subdivision = sub;
                step = res.gridStep;
                bestCandidates = res.candidates;
            }
        }

        statusText.innerText = `Fase encontrada (grid=${subdivision}, candidatos=${bestCandidates}). Detectando compases...`;

        // --- FASE 2.5: DETECCIÓN DE COMPASES POR AUTOCORRELACIÓN DE ACENTOS ---
        // En lugar de asumir 4/4 siempre, analizamos la energía real en cada posición de beat
        // y usamos autocorrelación para encontrar el período repetitivo natural de la música.
        // Esto detecta compases reales (4/4, 3/4, 6/8, etc.) y cambios de sección.

        // mainBeatStep ya fue declarado arriba (línea 714) — reutilizamos la misma variable

        // Paso 1: Construir perfil de energía por beat
        // Para cada posición de beat en la canción, calculamos la energía acumulada (bass + treble)
        const songDuration = (buffer && buffer.duration) ? buffer.duration : (energies.length > 0 ? energies[energies.length - 1].time : 60);
        const totalBeats = Math.floor(songDuration / mainBeatStep);
        const beatEnergies = new Float64Array(totalBeats);

        for (let b = 0; b < totalBeats; b++) {
            const beatTime = anchor + b * mainBeatStep;
            // Ventana de análisis: ±25% de la negra centrada en el beat
            const windowHalf = mainBeatStep * 0.25;
            let maxEnergy = 0;

            for (let ei = 0; ei < energies.length; ei++) {
                const e = energies[ei];
                if (e.time < beatTime - windowHalf) continue;
                if (e.time > beatTime + windowHalf) break;

                // Priorizar la energía de graves (donde viven kicks y bajos que marcan compases)
                const beatE = (e.bassVol || 0) * 2.0 + (e.trebleVol || 0) * 0.8;
                if (beatE > maxEnergy) maxEnergy = beatE;
            }

            beatEnergies[b] = maxEnergy;
        }

        // Paso 2: Autocorrelación del perfil de acentos por secciones
        // Dividimos la canción en segmentos de ~8 segundos y calculamos el período
        // de repetición del patrón de acentos en cada uno.
        const sectionDuration = 8.0; // segundos por sección de análisis
        const beatsPerSection = Math.max(8, Math.floor(sectionDuration / mainBeatStep));
        const candidateMeasureLengths = [2, 3, 4, 5, 6, 7, 8]; // beats por compás a probar

        // Resultado: array de secciones con su compás detectado
        const detectedSections = [];

        for (let sStart = 0; sStart < totalBeats; sStart += Math.floor(beatsPerSection * 0.75)) {
            const sEnd = Math.min(sStart + beatsPerSection, totalBeats);
            const sLen = sEnd - sStart;
            if (sLen < 6) continue; // Necesitamos al menos 6 beats para autocorrelación útil

            // Normalizar la energía de la sección (restar media, dividir por desviación)
            let mean = 0;
            for (let i = sStart; i < sEnd; i++) mean += beatEnergies[i];
            mean /= sLen;

            let variance = 0;
            for (let i = sStart; i < sEnd; i++) variance += (beatEnergies[i] - mean) ** 2;
            const stddev = Math.sqrt(variance / sLen) || 1;

            // Autocorrelación: para cada candidato de longitud de compás, ver qué tan bien
            // se repite el patrón de energía con ese período.
            let bestLag = 4; // default: 4/4
            let bestCorr = -1;

            for (const lag of candidateMeasureLengths) {
                if (lag >= sLen) continue;

                let correlation = 0;
                let pairs = 0;

                for (let i = sStart; i < sEnd - lag; i++) {
                    const a = (beatEnergies[i] - mean) / stddev;
                    const b_val = (beatEnergies[i + lag] - mean) / stddev;
                    correlation += a * b_val;
                    pairs++;
                }

                if (pairs > 0) {
                    correlation /= pairs;

                    // Bonus para compases estándar (4/4 y 3/4 son los más comunes)
                    if (lag === 4) correlation *= 1.15;
                    else if (lag === 3) correlation *= 1.05;
                    else if (lag === 8) correlation *= 1.08; // 8 beats = 2 compases de 4/4 o 1 compás largo

                    if (correlation > bestCorr) {
                        bestCorr = correlation;
                        bestLag = lag;
                    }
                }
            }

            // Calcular intensidad promedio de la sección
            let sectionIntensity = 0;
            for (let i = sStart; i < sEnd; i++) sectionIntensity += beatEnergies[i];
            sectionIntensity /= sLen;

            // Calcular el perfil de acentos normalizado dentro del compás detectado
            // (qué posiciones dentro del compás son naturalmente más fuertes)
            const accentProfile = new Float64Array(bestLag);
            const accentCounts = new Uint32Array(bestLag);
            for (let i = sStart; i < sEnd; i++) {
                const posInMeasure = (i - sStart) % bestLag;
                accentProfile[posInMeasure] += beatEnergies[i];
                accentCounts[posInMeasure]++;
            }
            for (let i = 0; i < bestLag; i++) {
                if (accentCounts[i] > 0) accentProfile[i] /= accentCounts[i];
            }

            // Encontrar el downbeat natural (posición con mayor acento)
            let downbeatOffset = 0;
            let maxAccent = -1;
            for (let i = 0; i < bestLag; i++) {
                if (accentProfile[i] > maxAccent) {
                    maxAccent = accentProfile[i];
                    downbeatOffset = i;
                }
            }

            detectedSections.push({
                startBeat: sStart,
                endBeat: sEnd,
                startTime: anchor + sStart * mainBeatStep,
                endTime: anchor + sEnd * mainBeatStep,
                measureLength: bestLag,        // beats por compás
                downbeatOffset: downbeatOffset, // qué beat dentro del compás es el más fuerte
                correlation: bestCorr,          // confianza de la detección
                intensity: sectionIntensity,    // intensidad promedio
                accentProfile: accentProfile    // perfil de acentos normalizado
            });
        }

        // Paso 3: Consolidar secciones solapadas
        // Si secciones consecutivas tienen el mismo compás, fusionarlas.
        // Si difieren, crear un punto de transición.
        const consolidatedSections = [];
        for (let i = 0; i < detectedSections.length; i++) {
            const s = detectedSections[i];
            const prev = consolidatedSections.length > 0 ? consolidatedSections[consolidatedSections.length - 1] : null;

            if (prev && prev.measureLength === s.measureLength && Math.abs(prev.intensity - s.intensity) < prev.intensity * 0.5) {
                // Misma firma y similar intensidad: extender la sección anterior
                prev.endBeat = s.endBeat;
                prev.endTime = s.endTime;
                // Promediar la intensidad
                prev.intensity = (prev.intensity + s.intensity) / 2;
            } else {
                consolidatedSections.push({ ...s });
            }
        }

        // Paso 4: Construir un array de timestamps reales de cada beat
        // y exportar getMeasureInfoAtTime usando búsqueda binaria para precisión sin drift.

        // Construir beatTimestamps: tiempos exactos de cada negra desde el anchor
        const beatTimestamps = new Float64Array(totalBeats);
        for (let b = 0; b < totalBeats; b++) {
            beatTimestamps[b] = anchor + b * mainBeatStep;
        }

        // Asignar a cada sección el índice de beat relativo de su inicio
        // para que el cálculo de beatInMeasure sea siempre local a la sección
        for (let i = 0; i < consolidatedSections.length; i++) {
            const s = consolidatedSections[i];
            // El beat de inicio de la sección en el array global
            s.startBeatIndex = s.startBeat; // ya es índice en beatTimestamps
            // Ajustar el downbeatOffset: dentro de la sección, ¿qué beat es el "1"?
            // downbeatOffset es la posición dentro del compás donde está la energía máxima
            // Para la sección, queremos que el "1" empiece en startBeat + (measureLen - downbeatOffset) % measureLen
            s.sectionDownbeatPhase = (s.measureLength - (s.downbeatOffset % s.measureLength)) % s.measureLength;
        }

        // getMeasureInfoAtTime usando búsqueda binaria sobre beatTimestamps
        const getMeasureInfoAtTime = (t) => {
            // 1. Encontrar la sección activa
            let section = consolidatedSections[0];
            for (let i = 0; i < consolidatedSections.length; i++) {
                if (t < consolidatedSections[i].startTime) break;
                section = consolidatedSections[i];
            }
            if (!section) section = { measureLength: 4, sectionDownbeatPhase: 0, startBeatIndex: 0, intensity: 1, accentProfile: new Float64Array([1, 0.5, 0.7, 0.5]) };

            const measureLen = section.measureLength;

            // 2. Búsqueda binaria del beat más cercano al tiempo t
            //    → esto evita cualquier drift matemático acumulado
            let lo = 0, hi = beatTimestamps.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (beatTimestamps[mid] < t) lo = mid + 1;
                else hi = mid;
            }
            // lo es el primer beat >= t; el beat "actual" es el anterior
            const beatIndex = Math.max(0, lo - 1);

            // 3. Calcular la posición dentro del compás relativa al inicio de la sección
            //    Usamos sectionDownbeatPhase para que el "1" caiga en el downbeat real
            const beatsIntoSection = beatIndex - section.startBeatIndex;
            const beatInMeasure = ((beatsIntoSection + section.sectionDownbeatPhase) % measureLen + measureLen) % measureLen;

            return {
                measureLength: measureLen,
                beatInMeasure: beatInMeasure,
                isDownbeat: beatInMeasure === 0,
                isStrongBeat: beatInMeasure === 0 || (measureLen >= 4 && beatInMeasure === Math.floor(measureLen / 2)),
                sectionIntensity: section.intensity,
                accentWeight: section.accentProfile ? (section.accentProfile[beatInMeasure] || 0) : 0,
                measureLenTicks: measureLen * (subdivision / 4),
                // Exponer el tiempo exacto del beat actual y del siguiente para animaciones suaves
                currentBeatTime: beatTimestamps[beatIndex] || 0,
                nextBeatTime: beatTimestamps[beatIndex + 1] || (beatTimestamps[beatIndex] + mainBeatStep)
            };
        };

        // Exportar globalmente para que game.js lo use en tiempo real
        window.getMeasureInfoAtTime = getMeasureInfoAtTime;
        window.beatTimestamps = beatTimestamps; // por si algún módulo externo los necesita

        // Log de diagnóstico
        const uniqueMeasures = [...new Set(consolidatedSections.map(s => s.measureLength))];
        statusText.innerText = `Compases detectados: ${uniqueMeasures.map(m => m + '/4').join(', ')} (${consolidatedSections.length} secciones). Cuantizando...`;

        // --- FASE 3: SMART SNAP (Cuantización Selectiva Inteligente) ---
        // Las notas cercanas a un tick de la rejilla se snappean (están "intentando" caer en el beat).
        // Las notas que están claramente entre ticks se dejan en su posición original (fills, ghost notes).
        // Esto replica cómo un charter humano coloca notas: en el grid, pero con excepciones musicales.

        // Umbral y fuerza de cuantización (estilo DAW): en dificultades bajas buscamos más "en el grid",
        // y en dificultades altas mantenemos un poco de micro-timing para que no suene robótico.
        const snapCfg =
            (difficulty === 'facil') ? { threshold: 0.62, strength: 1.0 } :
                (difficulty === 'normal') ? { threshold: 0.54, strength: 1.0 } :
                    (difficulty === 'dificil') ? { threshold: 0.46, strength: 0.96 } :
                        { threshold: 0.44, strength: 0.94 }; // inhumano

        const snapThreshold = snapCfg.threshold; // Si la desviación es ≤X% del step, cuantizar
        const snapStrength = snapCfg.strength; // 1.0 = snap perfecto, <1.0 = acercar al grid
        let snappedCount = 0;
        let preservedCount = 0;

        for (const note of map) {
            const relativeTime = note.time - anchor;
            const nearestTick = Math.round(relativeTime / step);
            const snappedTime = anchor + nearestTick * step;
            const deviation = Math.abs(note.time - snappedTime);
            const devRatio = deviation / step;

            if (devRatio <= snapThreshold) {
                // SNAP: Esta nota está cerca del beat, alinearla (con fuerza configurable)
                note.time = note.time + (snappedTime - note.time) * snapStrength;
                snappedCount++;
            } else {
                // PRESERVE: Esta nota está intencionalmente off-grid (fill, anticipación, ghost note)
                // La dejamos donde está — un charter humano también la pondría ahí
                preservedCount++;
            }
        }

        statusText.innerText = `Snap: ${snappedCount} notas al grid, ${preservedCount} preservadas`;

        // Limpieza de notas duplicadas post-snap
        map = map.filter((note, index, self) =>
            index === self.findIndex((t) => Math.abs(t.time - note.time) < 0.02 && t.col === note.col)
        );

        // --- PATRONES MANÍA (POST-CUANTIZACIÓN) ---
        // Re-asignar carriles para patrones tipo "manía": alternancia de manos, streams claros y jumps en beats fuertes.
        const applyManiaPatterns = (notes) => {
            if (!Array.isArray(notes) || notes.length === 0) return notes;

            notes.sort((a, b) => (a.time - b.time) || (a.col - b.col));

            const quarterTicks = subdivision / 4; // 2 (1/8) o 4 (1/16)
            const tickOf = (t) => Math.round((t - anchor) / step);

            const groups = new Map();
            for (const n of notes) {
                const tick = tickOf(n.time);
                let bucket = groups.get(tick);
                if (!bucket) {
                    bucket = [];
                    groups.set(tick, bucket);
                }
                bucket.push(n);
            }

            // --- LÍMITE DE ACORDES (SISTEMA DE JUMPSTREAMS ESTILO OSU!MANIA) ---
            // Solo los impactos fuertísimos con energía mayor a cierto umbral generan un doble,
            // integrándose armónicamente en escaleras simples o 'Handstreams'.
            const globalMaxChord = (difficulty === 'facil' || difficulty === 'normal') ? 1 : 2;
            const limitChords = () => {
                const deltas = [1, 2, 3, 4, -1, -2, -3, -4];

                for (let iter = 0; iter < 6; iter++) {
                    let movedAny = false;
                    const orderedTicks = Array.from(groups.keys()).sort((a, b) => a - b);

                    for (const tick of orderedTicks) {
                        const bucket = groups.get(tick);
                        if (!bucket || bucket.length <= 1) continue;

                        bucket.sort((a, b) => (b.rawEnergy || 0) - (a.rawEnergy || 0));

                        // Cálculo dinámico de capacidad:
                        // Solo permite dobles si el impacto pico tiene suficiente fuerza acústica.
                        let localMaxChord = 1;
                        if (globalMaxChord > 1) {
                            const peakEnergy = bucket[0].rawEnergy;
                            // En inhumano requerimos fuerza 7.5, en difícil 9.0 (para ser más excepcional)
                            const kickReq = (difficulty === 'inhumano') ? 7.5 : 9.0;
                            if (peakEnergy > kickReq) localMaxChord = 2;
                        }

                        if (bucket.length <= localMaxChord) continue;

                        while (bucket.length > localMaxChord) {
                            const overflow = bucket.pop();
                            let placed = false;

                            for (const delta of deltas) {
                                const targetTick = tick + delta;
                                if (targetTick < 0) continue;

                                let target = groups.get(targetTick);
                                if (!target) {
                                    target = [];
                                    groups.set(targetTick, target);
                                }

                                // Los empujes son estrictamente obligados a conformar streams simples (max=1)
                                if (target.length < 1) {
                                    target.push(overflow);
                                    placed = true;
                                    movedAny = true;
                                    break;
                                }
                            }

                            if (!placed) {
                                // no-op
                            }
                        }
                    }

                    if (!movedAny) break;
                }
            };

            limitChords();

            const ticks = Array.from(groups.keys()).sort((a, b) => a - b);

            let lastTick = null;
            let lastCol = -1;
            let lastSingleHand = -1; // 0=izq (0/1), 1=der (2/3)
            let stairDir = 1;
            let lastChordSig = '';

            const laneToHand = (col) => (col <= 1 ? 0 : 1);

            const chooseFrom = (options, seed) => {
                if (options.length <= 1) return options[0];
                const h = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0);
                return options[h % options.length];
            };

            const pickChordCols = (count, tick, beatIndex, inBeat) => {
                const isStrong = inBeat === 0;
                // Acordes limitados a dobles (2 teclas)
                const options = isStrong
                    ? [[0, 3], [1, 2]]
                    : [[1, 2], [0, 3], [0, 2], [1, 3]];

                let cols = chooseFrom(options, tick);
                const sig = cols.slice().sort((a, b) => a - b).join('');
                if (sig === lastChordSig && options.length > 1) {
                    cols = options[(options.indexOf(cols) + 1) % options.length];
                }
                lastChordSig = sig;
                return cols;
            };

            const pickSingleCol = (tick, beatPos, beatIndex, inBeat, isStream) => {
                const isStrong = inBeat === 0;
                const isDownbeat = beatPos === 0;
                const useStairs = (difficulty === 'dificil' || difficulty === 'inhumano');

                if (isStream) {
                    // Streams: Normal/Fácil (centro 1-2), Difícil+ (escalera 0-1-2-3)
                    // Streams rápidos: priorizar alternancia de manos para comodidad (evita escaleras largas a alta densidad).
                    if (useStairs && step <= 0.11) {
                        const lastHand = (lastCol === -1) ? -1 : laneToHand(lastCol);
                        const desiredHand = (lastHand === -1) ? (beatIndex % 2) : (1 - lastHand);
                        const accentEdge = isDownbeat && (tick % (quarterTicks * 2) === 0);

                        let col = -1;
                        if (desiredHand === 0) {
                            col = accentEdge ? 0 : 1;
                            if (col === lastCol) col = (col === 0) ? 1 : 0;
                        } else {
                            col = accentEdge ? 3 : 2;
                            if (col === lastCol) col = (col === 3) ? 2 : 3;
                        }

                        if (col === lastCol) col = (col + 1) % 4;
                        return col;
                    }

                    if (!useStairs) {
                        if (lastCol === 1) return 2;
                        if (lastCol === 2) return 1;
                        return (beatIndex % 2 === 0) ? 1 : 2;
                    }

                    let col = lastCol;
                    if (col === -1) {
                        col = (beatIndex % 2 === 0) ? 1 : 2;
                        stairDir = (beatIndex % 2 === 0) ? 1 : -1;
                    } else {
                        col = col + stairDir;
                        if (col > 3) { col = 2; stairDir = -1; }
                        else if (col < 0) { col = 1; stairDir = 1; }

                        if (isStrong && (tick % 8 === 0)) stairDir *= -1;
                    }

                    if (col === lastCol) col = (col + 1) % 4;
                    return col;
                }

                // No-stream: alternancia de manos + acentos
                const desiredHand = (lastSingleHand === -1) ? (beatIndex % 2) : (1 - lastSingleHand);

                let primary = desiredHand === 0 ? (isStrong ? 0 : 1) : (isStrong ? 3 : 2);
                let secondary = desiredHand === 0 ? (primary === 0 ? 1 : 0) : (primary === 3 ? 2 : 3);

                if (isDownbeat) {
                    primary = desiredHand === 0 ? 0 : 3;
                    secondary = desiredHand === 0 ? 1 : 2;
                }

                let col = primary;
                if (col === lastCol) col = secondary;
                if (col === lastCol) col = (col + 1) % 4;
                return col;
            };

            // Detección de streams: una "run" de ticks consecutivos (gap=1) que dure al menos 1 beat.
            // Esto evita tratar como stream solo 2 notas juntas (que se sienten como burst corto).
            const minStreamLen = Math.max(3, quarterTicks); // al menos 1 beat
            const isStreamAt = (idx) => {
                if (ticks.length < minStreamLen) return false;
                let start = idx;
                while (start > 0 && (ticks[start] - ticks[start - 1]) === 1) start--;
                let end = idx;
                while (end < ticks.length - 1 && (ticks[end + 1] - ticks[end]) === 1) end++;
                return (end - start + 1) >= minStreamLen;
            };

            for (let ti = 0; ti < ticks.length; ti++) {
                const tick = ticks[ti];
                const bucket = groups.get(tick) || [];

                // --- POSICIÓN DE BEAT DINÁMICA (COMPÁS DETECTADO) ---
                // En lugar de asumir subdivisión fija, usamos el compás real detectado
                const tickTime = anchor + tick * step;
                const mInfo = getMeasureInfoAtTime(tickTime);

                // beatPos relativo dentro del compás detectado (en ticks del grid)
                const measureLenTicks = mInfo.measureLenTicks || subdivision;
                const beatPos = ((tick % measureLenTicks) + measureLenTicks) % measureLenTicks;
                const inBeat = beatPos % quarterTicks;
                const beatIndex = mInfo.beatInMeasure; // posición real dentro del compás detectado
                const isStream = isStreamAt(ti);

                // Aplicador de Forma: Jumpstreams o Streams Simples
                if (bucket.length >= 2) {
                    const cols = pickChordCols(bucket.length, tick, beatIndex, inBeat);
                    const avgTime = bucket.reduce((sum, n) => sum + n.time, 0) / bucket.length;
                    for (let i = 0; i < bucket.length; i++) {
                        bucket[i].col = cols[i % cols.length];
                        bucket[i].time = avgTime;
                    }
                    lastCol = stairDir >= 0 ? cols[cols.length - 1] : cols[0];
                } else {
                    for (let i = 0; i < bucket.length; i++) {
                        // Preservar la columna original basada en el tono de la canción
                        // para que el mapa se sienta mucho más acorde a la música.
                        lastCol = bucket[i].col;
                        lastSingleHand = laneToHand(lastCol);
                    }
                }

                lastTick = tick;
            }

            // --- PATTERN MEMORY (FRASING MUSICAL) ---
            // Si la música repite el mismo patrón rítmico (loops de batería, estribillos),
            // el motor copia exactamente los mismos carriles que la última vez que lo escuchó.
            // Esto genera una "memoria muscular" increíble que hace sentir el mapa hecho por un humano.
            // Ahora usa los compases REALES detectados por autocorrelación.
            const getLocalMeasureDuration = (t) => {
                const info = getMeasureInfoAtTime(t);
                return mainBeatStep * info.measureLength; // duración real del compás en esta posición
            };

            const defaultMeasureDuration = step * subdivision; // fallback
            const measures = [];
            let currentMeasureNotes = [];
            let currentMeasureIndex = -1;
            let currentMeasureDur = defaultMeasureDuration;

            for (const n of notes) {
                const localMeasureDur = getLocalMeasureDuration(n.time);
                const measureIdx = Math.floor((n.time - anchor) / localMeasureDur);
                if (measureIdx !== currentMeasureIndex) {
                    if (currentMeasureNotes.length > 0) {
                        measures.push({ idx: currentMeasureIndex, notes: currentMeasureNotes, duration: currentMeasureDur });
                    }
                    currentMeasureNotes = [];
                    currentMeasureIndex = measureIdx;
                    currentMeasureDur = localMeasureDur;
                }
                currentMeasureNotes.push(n);
            }
            if (currentMeasureNotes.length > 0) measures.push({ idx: currentMeasureIndex, notes: currentMeasureNotes, duration: currentMeasureDur });

            for (let i = 1; i < measures.length; i++) {
                const m = measures[i];
                if (m.notes.length < 3 || m.notes.length > 16) continue; // No clonar compases demasiado simples o caóticos

                // Firma rítmica: posiciones exactas de los golpes dentro del compás (usando duración real)
                const mDur = m.duration || defaultMeasureDuration;
                const sig = m.notes.map(n => Math.round(((n.time - anchor) % mDur) / step)).join(',');

                // Buscar si este mismo patrón rítmico pasó en los últimos 16 compases
                for (let j = Math.max(0, i - 16); j < i; j++) {
                    const past = measures[j];
                    if (past.notes.length !== m.notes.length) continue;
                    // Solo comparar si tienen la misma duración de compás (misma sección rítmica)
                    if (Math.abs((past.duration || defaultMeasureDuration) - mDur) > step * 0.5) continue;

                    const pastSig = past.notes.map(n => Math.round(((n.time - anchor) % mDur) / step)).join(',');
                    if (sig === pastSig) {
                        // Coincidencia exacta! Copiamos el patrón de columnas para crear repetición musical
                        for (let k = 0; k < m.notes.length; k++) {
                            m.notes[k].col = past.notes[k].col;
                        }
                        break;
                    }
                }
            }

            notes = notes.filter((note, index, self) =>
                index === self.findIndex((t) => Math.abs(t.time - note.time) < 0.05 && t.col === note.col)
            );

            return notes;
        };

        map = applyManiaPatterns(map);

        // --- ASISTENTE DE SUSTAIN (MELODÍA LARGA) ---
        // Para instrumentos con notas largas (violín, pads, vientos), a veces hay energía sostenida
        // pero pocos transientes. Este asistente crea taps "de relleno" en ticks vacíos cuando hay
        // tono estable + energía treble suficiente; luego applyHoldNotes los condensará en holds.
        const injectSustainAssistNotes = (notes) => {
            if (!Array.isArray(notes) || notes.length === 0) return notes;
            if (!Array.isArray(energies) || energies.length < 10) return notes;
            if (!(typeof anchor === 'number' && Number.isFinite(anchor))) return notes;
            if (!(typeof step === 'number' && Number.isFinite(step)) || step <= 0) return notes;

            const durationSec = energies[energies.length - 1].time || 0;
            if (!(durationSec > 1.0)) return notes;

            notes.sort((a, b) => (a.time - b.time) || (a.col - b.col));

            const tickOf = (t) => Math.round((t - anchor) / step);
            const timeOfTick = (tick) => anchor + tick * step;

            const byTick = new Map();
            for (const n of notes) {
                const tick = tickOf(n.time);
                let bucket = byTick.get(tick);
                if (!bucket) {
                    bucket = [];
                    byTick.set(tick, bucket);
                }
                bucket.push(n);
            }

            // Umbrales adaptativos: buscar energía sostenida en treble y evitar transientes enormes.
            const baseTreble = (globalAvgTrebleVol || 1);
            const baseVol = (globalAvgVol || 1);
            const trebleMin =
                (difficulty === 'facil') ? baseTreble * 0.65 :
                    (difficulty === 'normal') ? baseTreble * 0.60 :
                        (difficulty === 'dificil') ? baseTreble * 0.62 :
                            baseTreble * 0.65; // Inhumano requiere más energía para inyectar en calma

            const volMin =
                (difficulty === 'facil') ? baseVol * 0.50 :
                    (difficulty === 'normal') ? baseVol * 0.45 :
                        (difficulty === 'dificil') ? baseVol * 0.48 :
                            baseVol * 0.50;

            const transientDiffMax =
                (difficulty === 'inhumano') ? (minNoiseFloor * 6.0) :
                    (difficulty === 'dificil') ? (minNoiseFloor * 7.0) :
                        (difficulty === 'normal') ? (minNoiseFloor * 8.0) :
                            (minNoiseFloor * 9.0);

            // Máximo de taps que inyectamos por segundo para evitar densidad absurda en temas largos.
            const maxInjectedPerSec =
                (difficulty === 'facil') ? 2.5 :
                    (difficulty === 'normal') ? 2.8 :
                        (difficulty === 'dificil') ? 3.0 :
                            3.2; // Reducido para evitar spam en partes melódicas
            const maxInjected = Math.floor(Math.max(20, durationSec * maxInjectedPerSec));

            const pitchTolRatio =
                (difficulty === 'facil') ? 0.10 :
                    (difficulty === 'normal') ? 0.12 :
                        (difficulty === 'dificil') ? 0.14 :
                            0.16;

            const minStablePitch = 70;
            const maxStablePitch = 1500;

            let lastBassCol = 0;
            const pickColFromPitch = (pitch, isBassOnly) => {
                if (isBassOnly || pitch < 180) {
                    lastBassCol = lastBassCol === 0 ? 3 : 0;
                    return lastBassCol;
                }
                if (pitch < 480) return 1;
                if (pitch < 1100) return 2;
                return 3;
            };

            const hasNoteNearTime = (t) => {
                for (let i = notes.length - 1; i >= 0; i--) {
                    const n = notes[i];
                    if (n.time < t - 0.09) break;
                    if (Math.abs(n.time - t) <= 0.045) return true;
                }
                return false;
            };

            // Iterar ticks en orden y muestrear energies con un puntero (O(n)).
            let ei = 0;
            let injected = 0;
            let lastPitch = null;
            let lastGoodTick = null;

            const firstTick = Math.max(0, tickOf(0));
            const lastTick = Math.max(firstTick, tickOf(durationSec));

            for (let tick = firstTick; tick <= lastTick; tick++) {
                if (injected >= maxInjected) break;

                const tickTime = timeOfTick(tick);
                if (tickTime < 0 || tickTime > durationSec) continue;

                // Si ya hay notas en este tick (o stack), no inyectar.
                const bucket = byTick.get(tick);
                if (bucket && bucket.length > 0) continue;
                if (hasNoteNearTime(tickTime)) continue;

                while (ei < energies.length - 2 && energies[ei].time < tickTime) ei++;
                const e = energies[ei];
                if (!e) continue;

                const hasTreble = (e.trebleVol || 0) >= trebleMin;
                const hasBass = (e.bassVol || 0) >= (baseVol * 0.55);
                if (!hasTreble && !hasBass) continue;
                if ((e.vol || 0) < volMin) continue;

                // Evitar impactos fuertes (kicks/platos) que ya deberían ser taps.
                const prev = energies[Math.max(0, ei - 1)];
                const diff = prev ? ((e.vol || 0) - (prev.vol || 0)) : 0;
                if (diff > transientDiffMax) continue;

                // Calcular pitch solo cuando pasa umbrales.
                const centerIdx = Math.max(0, Math.min(trebleData.length - 1, Math.floor(tickTime * sampleRate)));
                const corrSize = Math.floor(sampleRate * 0.025);
                const startIdx = Math.max(0, Math.floor(centerIdx - corrSize / 2));
                const endIdx = Math.min(trebleData.length, startIdx + corrSize);
                const corrData = trebleData.subarray(startIdx, endIdx);
                const pitch = autoCorrelate(corrData, sampleRate);

                if (!Number.isFinite(pitch) || pitch < minStablePitch || pitch > maxStablePitch) {
                    lastPitch = null;
                    lastGoodTick = null;
                    continue;
                }

                // Requerir estabilidad temporal: si el pitch cambia muchísimo entre ticks, no inyectar.
                if (typeof lastPitch === 'number' && Number.isFinite(lastPitch) && typeof lastGoodTick === 'number') {
                    const pitchRatio = Math.abs(pitch - lastPitch) / Math.max(1, lastPitch);
                    const tickGap = tick - lastGoodTick;
                    if (tickGap <= 2 && pitchRatio > pitchTolRatio) {
                        lastPitch = pitch;
                        lastGoodTick = tick;
                        continue;
                    }
                }

                const isBassOnly = hasBass && !hasTreble;
                const col = pickColFromPitch(pitch, isBassOnly);
                const newNote = {
                    time: tickTime,
                    endTime: null,
                    col,
                    type: 'tap',
                    active: true,
                    scored: false,
                    rawEnergy: (e.trebleVol || e.vol || 0),
                    rawPitch: pitch,
                    isSustainAssist: true
                };

                notes.push(newNote);
                byTick.set(tick, [newNote]);
                injected++;
                lastPitch = pitch;
                lastGoodTick = tick;
            }

            return notes;
        };

        map = injectSustainAssistNotes(map);

        // --- SISTEMA UNIFICADO DE NOTAS HOLD (SOSTENIDAS) PERSONALIZADO ---
        // Se analiza cada medio segundo (0.5s) de la canción para buscar dónde comienza una nota
        // que repite su mismo tono en un radio de 0.1s. Cuando deja de sonar su mismo tono
        // o se sale de la tolerancia, la nota mantenible deja de generarse. Cuando se detecta
        // la segunda nota del mismo tono, se conectan para formar la nota mantenible.
        // Solo puede haber una nota mantenible en los 4 carriles a la vez.
        const buildHolds = (currentMap) => {
            const allHolds = [];
            const durationSec = (buffer && buffer.duration) ? buffer.duration : 300;

            // Helper para obtener el pitch (tono) en un tiempo específico
            const getPitchAtTime = (t) => {
                const centerIdx = Math.max(0, Math.min(trebleData.length - 1, Math.floor(t * sampleRate)));
                const corrSize = Math.floor(sampleRate * 0.025);
                const startIdx = Math.max(0, Math.floor(centerIdx - corrSize / 2));
                const endIdx = Math.min(trebleData.length, startIdx + corrSize);
                const corrData = trebleData.subarray(startIdx, endIdx);
                return autoCorrelate(corrData, sampleRate);
            };

            // Helper para obtener la energía en un tiempo específico
            const getEnergyAtTime = (t) => {
                const idx = Math.floor((t * sampleRate) / windowSize);
                if (idx >= 0 && idx < energies.length) {
                    return energies[idx];
                }
                return null;
            };

            // Creamos un Set para rastrear los índices de notas que ya han sido convertidas o absorbidas por un Hold
            const processedNoteIndices = new Set();

            // Analizamos cada medio segundo de la canción
            for (let t_check = 0.5; t_check < durationSec; t_check += 0.5) {
                // Buscar dónde comienza una nota en un radio de 0.1s alrededor de t_check
                let bestNoteIdx = -1;
                let minDiff = Infinity;

                for (let idx = 0; idx < currentMap.length; idx++) {
                    const note = currentMap[idx];
                    if (processedNoteIndices.has(idx)) continue;
                    if (note.type === 'hold' || Number.isFinite(note.endTime)) continue;

                    const diff = Math.abs(note.time - t_check);
                    if (diff <= 0.1 && diff < minDiff) {
                        minDiff = diff;
                        bestNoteIdx = idx;
                    }
                }

                if (bestNoteIdx === -1) continue;

                const n1 = currentMap[bestNoteIdx];
                let P1 = n1.rawPitch;
                if (typeof P1 !== 'number' || !Number.isFinite(P1) || P1 <= 0) {
                    P1 = getPitchAtTime(n1.time);
                }

                // Si no se encuentra un tono claro, no podemos iniciar la nota mantenible por tono
                if (typeof P1 !== 'number' || !Number.isFinite(P1) || P1 <= 0) continue;

                // --- FILTRO DE INSTRUMENTOS NO PERCUSIVOS (SIN GOLPE) ---
                // Los violines, saxofones y sintetizadores tienen un ataque más suave y no causan
                // picos gigantescos en la diferencia de energía de volumen instantáneo (transientes).
                // Si la nota candidata tiene un ataque muy agresivo, la tratamos como instrumento de golpe (kicks, platos, cajas)
                // y evitamos crear un hold.
                const E_now = getEnergyAtTime(n1.time);
                const E_prev = getEnergyAtTime(n1.time - 0.04); // 40ms antes
                let isPercussiveHit = false;
                if (E_now && E_prev) {
                    const diff = E_now.vol - E_prev.vol;
                    // Los golpes de percusión tienen transientes marcados.
                    // Si el salto de volumen es superior al ruido base multiplicador, se considera percusión/golpe.
                    if (diff > minNoiseFloor * 1.3) {
                        isPercussiveHit = true;
                    }
                }

                if (isPercussiveHit) continue;

                // Escanear hacia adelante desde n1.time para ver cuánto dura el mismo tono
                let t_curr = n1.time;
                let t_max_active = n1.time;
                const maxHoldLen = 5.0; // Evitar notas mantenibles infinitas de más de 5 segundos

                while (t_curr < n1.time + maxHoldLen && t_curr < durationSec) {
                    t_curr += 0.05; // Muestrear cada 50ms

                    const P_curr = getPitchAtTime(t_curr);
                    const E_curr = getEnergyAtTime(t_curr);

                    // 1. "cuando deje de sonar su mismo tono" (volumen cae por debajo de la base de ruido)
                    const isSounding = E_curr && (E_curr.vol > minNoiseFloor);

                    // 2. "o se salga del radio" (si el tono se desvía más de 10% del tono original P1)
                    let sameTone = false;
                    if (isSounding && P_curr > 0) {
                        const pitchDiffRatio = Math.abs(P_curr - P1) / P1;
                        if (pitchDiffRatio <= 0.10) {
                            sameTone = true;
                        }
                    }

                    if (!sameTone) {
                        break;
                    }

                    t_max_active = t_curr;
                }

                // Buscar la segunda nota del mismo tono (en el mismo carril/columna) que esté dentro de t_max_active
                let bestN2Idx = -1;
                for (let idx = 0; idx < currentMap.length; idx++) {
                    const note = currentMap[idx];
                    if (idx === bestNoteIdx) continue;
                    if (processedNoteIndices.has(idx)) continue;
                    if (note.type === 'hold' || Number.isFinite(note.endTime)) continue;

                    // Debe estar en la misma columna (carril) y en el rango de tiempo activo [n1.time, t_max_active]
                    if (note.col === n1.col && note.time > n1.time && note.time <= t_max_active + 0.05) {
                        if (bestN2Idx === -1 || note.time < currentMap[bestN2Idx].time) {
                            bestN2Idx = idx;
                        }
                    }
                }

                if (bestN2Idx === -1) continue;

                const n2 = currentMap[bestN2Idx];
                const startTime = n1.time;
                const endTime = n2.time;
                const duration = endTime - startTime;

                // Las notas mantenibles de instrumentos continuos (violín, saxo, sinte) deben durar al menos 0.20s
                if (duration < 0.20) continue;

                // El usuario especificó: "(solo puede haber una nota mantenible en los 4 carriles) es decir, si se genera en el carril 1, en el 2 3 4 no se puede generar"
                // Verificamos si hay superposición global con algún hold ya creado
                const overlapsGlobal = allHolds.some(h =>
                    startTime < (h.endTime - 0.001) && endTime > (h.time + 0.001)
                );

                if (!overlapsGlobal) {
                    // Creamos la nota hold
                    const newHold = {
                        time: startTime,
                        endTime: endTime,
                        col: n1.col,
                        type: 'hold',
                        active: true,
                        scored: false,
                        rawEnergy: n1.rawEnergy,
                        rawPitch: P1
                    };

                    allHolds.push(newHold);

                    // Marcamos n1 y n2 como procesados
                    processedNoteIndices.add(bestNoteIdx);
                    processedNoteIndices.add(bestN2Idx);

                    // También absorbemos/marcamos como procesadas cualquier otra nota en el mismo carril que caiga dentro del intervalo del Hold
                    for (let idx = 0; idx < currentMap.length; idx++) {
                        const note = currentMap[idx];
                        if (idx === bestNoteIdx || idx === bestN2Idx) continue;
                        if (note.col === n1.col && note.time >= startTime && note.time <= endTime) {
                            processedNoteIndices.add(idx);
                        }
                    }
                }
            }

            // Construir el mapa final: agregamos todos los Holds creados, y todas las notas del mapa original que NO fueron procesadas (absorbidas)
            const finalMap = [...allHolds];
            for (let idx = 0; idx < currentMap.length; idx++) {
                if (!processedNoteIndices.has(idx)) {
                    finalMap.push(currentMap[idx]);
                }
            }

            return finalMap.sort((a, b) => (a.time - b.time) || (a.col - b.col));
        };

        map.sort((a, b) => (a.time - b.time) || (a.col - b.col));
        map = buildHolds(map);

        // --- BARRIDO FINAL ANTI-MINIJACKS (POST-CUANTIZACIÓN) ---
        // Después del snap al BPM, verificamos que las notas no hayan quedado peligrosamente juntas en el mismo carril
        const holdsByCol = [[], [], [], []];
        for (const n of map) {
            const isHold = (n && (n.type === 'hold' || Number.isFinite(n.endTime))) && Number.isFinite(n.endTime);
            if (isHold) {
                const col = Math.max(0, Math.min(3, n.col | 0));
                holdsByCol[col].push(n);
            }
        }
        for (const arr of holdsByCol) arr.sort((a, b) => a.time - b.time);

        const isColBlockedByHold = (col, time) => {
            const arr = holdsByCol[col | 0];
            if (!arr || arr.length === 0) return false;
            for (let i = 0; i < arr.length; i++) {
                const h = arr[i];
                if (h.time > time + 0.001) break;
                if (time >= h.time - 0.001 && time <= h.endTime + 0.001) return true;
            }
            return false;
        };

        // El usuario solicitó permitir minijacks rápidos, pero cortarlos si hay una pausa >= 0.5s.
        // Por lo tanto, eliminamos el jackThreshold estricto y usamos la regla dinámica de 0.5s en el bucle.

        // Orden estable para que el post-proceso sea determinista
        map.sort((a, b) => (a.time - b.time) || (a.col - b.col));

        const tickOf = (t) => Math.round((t - anchor) / step);
        const timeOfTick = (tick) => anchor + (tick * step);

        const groups = new Map();
        for (const n of map) {
            const tick = tickOf(n.time);
            let bucket = groups.get(tick);
            if (!bucket) {
                bucket = [];
                groups.set(tick, bucket);
            }
            bucket.push(n);
        }

        const ticks = Array.from(groups.keys()).sort((a, b) => a - b);
        const lastTimeByCol = [-1e9, -1e9, -1e9, -1e9];
        let absoluteLastCol = -1; // Rastrea globalmente la ultimísima nota
        let finalMiniJackCount = 0; // Rastrea cuantas veces seguidas se ha usado absoluteLastCol

        const getColPreference = (originCol, t) => {
            const seed = Math.floor(t * 1000);
            // Pseudo-randomizer basado en el tiempo exacto para mantener determinismo
            const randomizer = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296;

            let pref = [0, 1, 2, 3].sort((a, b) => {
                const da = Math.abs(a - originCol);
                const db = Math.abs(b - originCol);
                if (da !== db) return da - db;

                // Romper empates con pseudo-aleatoriedad para evitar bucles repetitivos
                return randomizer > 0.5 ? 1 : -1;
            });

            // A veces (25%) mezclar las opciones secundarias para fluidez orgánica
            if (randomizer > 0.75 && pref.length >= 3) {
                const temp = pref[1];
                pref[1] = pref[2];
                pref[2] = temp;
            }
            return pref;
        };

        const pickBestCol = (originCol, t, usedCols, forceAlternation) => {
            const pref = getColPreference(originCol, t);
            const minStackSeparation = 0.12;

            // Fase 1: Intentar buscar una columna libre que respete la regla de alternancia y evite notas súper juntas
            for (const col of pref) {
                if (usedCols.has(col)) continue;
                if (isColBlockedByHold(col, t)) continue;
                if (t - lastTimeByCol[col] < minStackSeparation) continue;
                if (col === absoluteLastCol && finalMiniJackCount >= 1) continue; // STRICT BLOCK
                if (forceAlternation && col === absoluteLastCol) continue;
                return col;
            }

            // Fase 2: Emergencia (permitir repetición de carril, pero evitar stacks visuales)
            for (const col of pref) {
                if (usedCols.has(col)) continue;
                if (isColBlockedByHold(col, t)) continue;
                if (t - lastTimeByCol[col] < minStackSeparation) continue;
                if (col === absoluteLastCol && finalMiniJackCount >= 1) continue; // STRICT BLOCK
                return col;
            }

            // Fase 3: Súper emergencia (ignorar separación)
            for (const col of pref) {
                if (usedCols.has(col)) continue;
                if (isColBlockedByHold(col, t)) continue;
                if (col === absoluteLastCol && finalMiniJackCount >= 1) continue; // STRICT BLOCK EVEN IN EMERGENCY
                return col;
            }

            // Fase 4: Fallback total
            return originCol;
        };

        for (const tick of ticks) {
            const bucket = groups.get(tick) || [];
            const t = timeOfTick(tick);

            // No hacemos snap visual destructivo, dejamos que el anti-minijack agrupe por cuartiles pero preservando el tiempo fino.
            // for (const n of bucket) n.time = t;

            // Orden: holds primero (ocupan carril), luego notas más energéticas
            bucket.sort((a, b) => {
                const aHold = (a && (a.type === 'hold' || Number.isFinite(a.endTime))) && Number.isFinite(a.endTime);
                const bHold = (b && (b.type === 'hold' || Number.isFinite(b.endTime))) && Number.isFinite(b.endTime);
                if (aHold !== bHold) return aHold ? -1 : 1;
                const ae = Number(a.rawEnergy) || 0;
                const be = Number(b.rawEnergy) || 0;
                if (be !== ae) return be - ae;
                return (a.col - b.col);
            });

            const used = new Set();

            // Fijar holds
            for (const n of bucket) {
                const isHold = (n && (n.type === 'hold' || Number.isFinite(n.endTime))) && Number.isFinite(n.endTime);
                if (!isHold) continue;
                used.add(n.col);
                lastTimeByCol[n.col] = t;
            }

            // Ajustar taps
            let lastNoteTime = absoluteLastCol !== -1 ? lastTimeByCol[absoluteLastCol] : 0;

            for (const n of bucket) {
                const isHold = (n && (n.type === 'hold' || Number.isFinite(n.endTime))) && Number.isFinite(n.endTime);
                if (isHold) continue;

                const origin = Math.max(0, Math.min(3, n.col | 0));

                // --- INTEGRACIÓN CON DETECCIÓN DE COMPASES ---
                // En downbeats, preferir carriles de borde (0 o 3) para acentuar la estructura rítmica.
                // En beats débiles, preferir carriles centrales (1 o 2) para contraste visual.
                const mInfoSweep = getMeasureInfoAtTime(t);
                const isDownbeatSweep = mInfoSweep.isDownbeat;
                const isStrongBeatSweep = mInfoSweep.isStrongBeat;

                // Si ha pasado 0.5s o más desde la ultimísima nota, OBLIGAMOS a cambiar de carril (cancelar minijack)
                const gapToLast = t - lastNoteTime;
                const forceAlternation = (gapToLast >= 0.5) && (absoluteLastCol !== -1);

                let canKeepOrigin = !used.has(origin) && !isColBlockedByHold(origin, t);

                // Evitar stacks visuales (notas demasiado juntas en el mismo carril)
                if (t - lastTimeByCol[origin] < 0.12) {
                    canKeepOrigin = false;
                }

                // Si debemos alternar y el carril de origen es el mismo que el anterior, forzamos reasignación
                if (forceAlternation && origin === absoluteLastCol) {
                    canKeepOrigin = false;
                }

                // LIMITAR ESTRICTAMENTE LOS MINI-JACKS A 1 (NINGUNO)
                if (origin === absoluteLastCol && finalMiniJackCount >= 1) {
                    canKeepOrigin = false;
                }

                let picked = canKeepOrigin ? origin : pickBestCol(origin, t, used, forceAlternation);

                // Bonus de compás: en downbeats fuertes, intentar empujar hacia carriles de borde
                // para dar un acento visual que refleje la estructura musical
                if (isDownbeatSweep && !used.has(0) && !used.has(3) && !isColBlockedByHold(0, t) && !isColBlockedByHold(3, t)) {
                    // Solo ajustar si el carril elegido es central y el borde está libre
                    if (picked === 1 || picked === 2) {
                        const preferredEdge = (picked <= 1) ? 0 : 3;
                        if (!used.has(preferredEdge) && !isColBlockedByHold(preferredEdge, t) && t - lastTimeByCol[preferredEdge] >= 0.12) {
                            if (!(preferredEdge === absoluteLastCol && finalMiniJackCount >= 1)) {
                                picked = preferredEdge;
                            }
                        }
                    }
                }
                
                n.col = picked;
                used.add(picked);
                lastTimeByCol[picked] = t;

                if (picked === absoluteLastCol) {
                    finalMiniJackCount++;
                } else {
                    finalMiniJackCount = 1;
                }
                
                absoluteLastCol = picked; // Actualizar el rastreador
                lastNoteTime = t;
            }
        }

        map.sort((a, b) => (a.time - b.time) || (a.col - b.col));

        // Dedupe final por si el barrido anti-minijacks provocó colisiones (misma columna/tiempo)
        map = map.filter((note, index, self) =>
            index === self.findIndex((t) => Math.abs(t.time - note.time) < 0.05 && t.col === note.col)
        );

        statusText.innerText += `\n[Tempo ${hasManualBPM ? 'Manual' : 'Detectado'}: ${bpm} BPM | Compases: ${uniqueMeasures.map(m => m + '/4').join(', ')}]`;
    }

    return map;
}

window.handleFile = handleFile;
