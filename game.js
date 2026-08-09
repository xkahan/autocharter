const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Variables Globales (Asegurar persistencia entre scripts)
window.audioContext = window.audioContext || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
window.audioBuffer = window.audioBuffer || null;
window.audioMap = window.audioMap || [];
window.currentFileName = window.currentFileName || '';
window.currentFileCover = window.currentFileCover || null;
window.savedSongs = window.savedSongs || [];
window.userKeys = window.userKeys || ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
window.forceSecondaryStyle = window.forceSecondaryStyle || false;

// Multiplayer Online Mode State (initialized BEFORE multiplayer.js loads)
window.onlineMode = window.onlineMode || {
    active: false,
    peer: null,
    conn: null,
    role: null,      // 'host' or 'client'
    roomId: null,
    localDied: false,
    opponentDied: false,
    localReadyToRetry: false,
    opponentReadyToRetry: false,
    opponent: {
        score: 0,
        combo: 0,
        maxCombo: 0,
        health: 50,
        countPerfect: 0,
        countGreat: 0,
        countOk: 0,
        countMiss: 0,
        heldKeys: new Set(),
        feedbackText: '',
        feedbackClass: '',
        feedbackTimeout: null,
        name: 'RIVAL'
    }
};

// Fallback global robusto para la detección de compases (en caso de que la canción no tenga un mapa analizado aún)
window.getMeasureInfoAtTime = window.getMeasureInfoAtTime || function (t) {
    const fallbackBPM = parseFloat(document.getElementById('bpm-input')?.value) || 120;
    const mainBeatStep = 60 / fallbackBPM;
    const beatInSong = Math.max(0, Math.floor(t / mainBeatStep));
    const beatInMeasure = (beatInSong % 4 + 4) % 4;
    return {
        measureLength: 4,
        beatInMeasure: beatInMeasure,
        isDownbeat: beatInMeasure === 0,
        isStrongBeat: beatInMeasure === 0 || beatInMeasure === 2,
        sectionIntensity: 1,
        accentWeight: beatInMeasure === 0 ? 1.0 : 0.5,
        measureLenTicks: 16
    };
};

// --- UI Elements ---
const btnPlayGame = document.getElementById('btn-play');
const btnPauseGame = document.getElementById('btn-pause');
const scoreDisplay = document.getElementById('score-display');
const comboDisplay = document.getElementById('combo-display');
const hitFeedback = document.getElementById('hit-feedback');
const healthBar = document.getElementById('health-bar');
// statusText is declared in audioAnalyzer.js (shared global scope)

// Settings Elements
const shapeSelect = document.getElementById('shape-select');
const splashSelect = document.getElementById('splash-select');
const sizeRange = document.getElementById('size-range');
const sizeVal = document.getElementById('size-val');
const speedRange = document.getElementById('speed-range');
const speedVal = document.getElementById('speed-val');
const volMusicInput = document.getElementById('vol-music');
const volMusicVal = document.getElementById('vol-music-val');
const volSfxInput = document.getElementById('vol-sfx');
const volSfxVal = document.getElementById('vol-sfx-val');
// bpmInput is declared in audioAnalyzer.js (shared global scope)
const scrollSelector = document.getElementById('scroll-selector');
const visualizerToggle = document.getElementById('visualizer-toggle');
const autoPlayToggle = document.getElementById('autoplay-toggle');
const hitsoundToggle = document.getElementById('hitsound-toggle');

// Panels
const btnTogglePanel = document.getElementById('btn-toggle-panel');
const leftPanel = document.querySelector('.left-panel');
const btnThemeMenu = document.getElementById('btn-theme-menu');
const themeMenu = document.getElementById('theme-menu');
const themeOpts = document.querySelectorAll('.theme-opt');
const btnCustomWindow = document.getElementById('btn-custom-window');
const customOverlayPanel = document.getElementById('custom-overlay-panel');
const btnCloseCustomWindow = document.getElementById('btn-close-custom-window');

// Canvas & Visualizer
const previewCanvas = document.getElementById('preview-canvas');
const pCtx = previewCanvas ? previewCanvas.getContext('2d') : null;
const visualizerCanvas = document.getElementById('visualizer-canvas');
const vCtx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;

// Now Playing Widget Elements
const npWidget = document.getElementById('now-playing-widget');
const npSongName = document.getElementById('np-song-name');
const npTimer = document.getElementById('np-timer');

// Visualizer State
let analyser = null;
let dataArray = null;
let bufferLength = 0;

// State globals
let noteShape = 'circle';
let splashStyle = 'rings';
let noteSize = 45;
let scrollDirection = 'down';
let isHitsoundEnabled = true;

// Game Modes Configuration
const modeIds = [
    'easier', 'nodeath', 'slowdown', 'harder', 'healthdrain',
    'speedup', 'nono', 'untouchable', 'internet', 'double', 'wannacry', 'swapinout', 'laser'
];
let showVisualizer = true; // NEW: Toggle visualizer
window.fallSpeed = 3.0;
window.audioOffset = 0; // Compensación de latencia en segundos
window.selectedDifficulty = 'normal';

window.isPlaying = false;
window.isPaused = false;
window.isGameOver = false;
let isAutoPlay = false;
let autoplayUsedThisSession = false; // Tracks if autoplay was active at any point during a song run
let startTime = 0;
let audioSourceNode = null;
let score = 0;
let combo = 0;
let health = 50;

// Game Modes State
const activeModes = {
    easier: false,
    nodeath: false,
    slowdown: false,
    harder: false,
    healthdrain: false,
    speedup: false,
    nono: false,
    untouchable: false,
    internet: false,
    double: false,
    wannacry: false,
    swapinout: false,
    laser: false
};

const btnLibrary = document.getElementById('btn-library');
const modeCheckboxes = document.querySelectorAll('.mode-checkbox input');

// UI Audio Elements
const uiAudioClick = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
const uiAudioSuccess = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
uiAudioClick.volume = 0.3;
uiAudioSuccess.volume = 0.4;

function playUIClick() {
    uiAudioClick.currentTime = 0;
    uiAudioClick.play().catch(() => { });
}

function playUISuccess() {
    uiAudioSuccess.currentTime = 0;
    uiAudioSuccess.play().catch(() => { });
}

window.showTypewriterTitle = function (artist, title) {
    // Lost In Snow: no title card and no typing click sounds
    if (window.currentFileName === "Lost In Snow.mp3") return;

    const titleContainer = document.getElementById('typewriter-title');
    const artistEl = document.getElementById('typewriter-artist');
    const songEl = document.getElementById('typewriter-song');
    if (!titleContainer || !artistEl || !songEl) return;

    artistEl.innerHTML = '';
    songEl.innerHTML = '';
    titleContainer.classList.remove('hidden');
    titleContainer.style.opacity = '1';

    const fullArtist = `- ${artist} -`;
    const fullSong = title;

    let aIndex = 0;
    let sIndex = 0;

    function typeArtist() {
        if (aIndex < fullArtist.length) {
            artistEl.innerHTML += fullArtist.charAt(aIndex);
            aIndex++;
            if (typeof window.playUIClick === 'function') window.playUIClick();
            setTimeout(typeArtist, 40);
        } else {
            setTimeout(typeSong, 1000);
        }
    }

    function typeSong() {
        if (sIndex < fullSong.length) {
            songEl.innerHTML += fullSong.charAt(sIndex);
            sIndex++;
            if (typeof window.playUIClick === 'function') window.playUIClick();
            setTimeout(typeSong, 40);
        } else {
            // Fade out after a few seconds
            setTimeout(() => {
                titleContainer.style.transition = "opacity 2s";
                titleContainer.style.opacity = "0";
                setTimeout(() => {
                    titleContainer.classList.add('hidden');
                    titleContainer.style.transition = "";
                }, 2000);
            }, 1400);
        }
    }

    typeArtist();
};

// Add UI click listeners
document.querySelectorAll('button, .mode-btn, .glass-select, input[type="range"], input[type="checkbox"]').forEach(el => {
    el.addEventListener('click', playUIClick);
});
let wannaCryTimer = 0;
let internetLagTimer = 0;
let isInternetLagging = false;
let doubleDoubleProcessed = false;
let lastMeasure = -1;

// Beat Detection for Wannacry
let wannacrySwitchPoints = [];
let wannacryPointIndex = 0;

const modeIcons = {
    easier: { icon: '👼', name: 'Easy' },
    nodeath: { icon: '🛡️', name: 'No Death' },
    slowdown: { icon: '🐢', name: 'Slowdown' },
    harder: { icon: '🔥', name: 'Hard' },
    healthdrain: { icon: '🧛', name: 'Drain' },
    speedup: { icon: '⚡', name: 'Speedup' },
    nono: { icon: '🔒', name: 'NO-NO' },
    untouchable: { icon: '🚫', name: 'UNTOUCHABLE' },
    internet: { icon: '📶', name: 'Bad Horrible Internet Connection' },
    double: { icon: '👥', name: 'Double-Double' },
    wannacry: { icon: '👁️', name: 'WannaCry' },
    swapinout: { icon: '🔄', name: 'Swap-In-Out' },
    laser: { icon: '⚡', name: 'Laser Danger' }
};

function updateActiveModeIcons() {
    const display = document.getElementById('active-modes-display');
    if (!display) return;

    display.innerHTML = '';

    modeIds.forEach(id => {
        if (activeModes[id]) {
            const mode = modeIcons[id];
            if (!mode) return;
            const badge = document.createElement('div');
            badge.className = 'mode-icon-badge';
            if (id === 'wannacry') badge.classList.add('active-wannacry');
            else badge.classList.add('active-primary');

            badge.innerHTML = `
                <span class="icon">${mode.icon}</span>
                <span class="name">${mode.name}</span>
            `;
            display.appendChild(badge);
        }
    });
}

function playClickSound() {
    if (!window.audioContext || !isHitsoundEnabled) return;
    const osc = window.audioContext.createOscillator();
    const gainNode = window.audioContext.createGain();

    // Un "click" mecánico claro (tono alto que decae rapidísimo)
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, window.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, window.audioContext.currentTime + 0.03);

    const volSfxInput = document.getElementById('vol-sfx');
    const baseVol = volSfxInput ? parseFloat(volSfxInput.value) : 0.4;
    gainNode.gain.setValueAtTime(baseVol, window.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, window.audioContext.currentTime + 0.03);

    osc.connect(gainNode);
    gainNode.connect(window.audioContext.destination);

    osc.start();
    osc.stop(window.audioContext.currentTime + 0.04);
}

function playTapWithEcho() {
    if (!window.audioContext) return;
    const now = window.audioContext.currentTime;
    const volSfxInput = document.getElementById('vol-sfx');
    const baseVol = volSfxInput ? parseFloat(volSfxInput.value) : 0.4;

    for (let i = 0; i < 4; i++) {
        const delayTime = i * 0.15; // 150ms delay
        const osc = window.audioContext.createOscillator();
        const gainNode = window.audioContext.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(700 - i * 80, now + delayTime);

        const echoVolume = baseVol * Math.pow(0.45, i);
        gainNode.gain.setValueAtTime(echoVolume, now + delayTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + delayTime + 0.08);

        osc.connect(gainNode);
        gainNode.connect(window.audioContext.destination);

        osc.start(now + delayTime);
        osc.stop(now + delayTime + 0.09);
    }
}

function triggerBlackFlash() {
    const flash = document.getElementById('black-flash-overlay');
    if (flash) {
        flash.classList.add('flash-active');
        flash.offsetHeight; // Force reflow
        setTimeout(() => {
            flash.classList.remove('flash-active');
        }, 80);
    }
}

// Swap-In-Out Modifiers Timing
let lastSwapTime = 0;
let nextSwapInterval = 5;

// Laser Danger Modifiers State
let activeLasers = [];
let lastLaserTime = 0;
let nextLaserInterval = 5;

function isLaserActiveOnLane(col) {
    if (!activeLasers || activeLasers.length === 0) return false;
    const elapsed = (window.lastInterpolatedTime || 0) - activeLasers[0].startTime;
    return activeLasers[0].col === col && elapsed >= 1.0 && elapsed < 3.0;
}

function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

function playLaserSound() {
    if (!window.audioContext) return;
    const now = window.audioContext.currentTime;
    const osc = window.audioContext.createOscillator();
    const gainNode = window.audioContext.createGain();
    const waveShaper = window.audioContext.createWaveShaper();
    const filter = window.audioContext.createBiquadFilter();

    // Base low-frequency buzzing saw sweep
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.55);

    // Biquad filter to cut high frequencies and make it deep/bassy
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.55);

    // Distortion
    waveShaper.curve = makeDistortionCurve(100);
    waveShaper.oversample = '4x';

    // Volume envelope
    const volSfxInput = document.getElementById('vol-sfx');
    const baseVol = volSfxInput ? parseFloat(volSfxInput.value) : 0.4;
    gainNode.gain.setValueAtTime(baseVol * 1.5, now);
    gainNode.gain.linearRampToValueAtTime(baseVol * 0.9, now + 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    // Chain: osc -> filter -> waveShaper -> gainNode -> destination
    osc.connect(filter);
    filter.connect(waveShaper);
    waveShaper.connect(gainNode);
    gainNode.connect(window.audioContext.destination);

    osc.start(now);
    osc.stop(now + 0.6);
}

function playHollowLaserHit() {
    if (!window.audioContext) return;
    const now = window.audioContext.currentTime;

    const numEchoes = 4;
    const delayTime = 0.12; // 120ms spacing

    for (let i = 0; i < numEchoes; i++) {
        const timeOffset = i * delayTime;
        const playTime = now + timeOffset;
        const volumeFactor = Math.pow(0.5, i); // decaying volume

        const osc = window.audioContext.createOscillator();
        const gainNode = window.audioContext.createGain();
        const filter = window.audioContext.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, playTime);

        // High Q bandpass for hollow hollow resonating click/thud
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(320, playTime);
        filter.Q.setValueAtTime(12, playTime);

        const volSfxInput = document.getElementById('vol-sfx');
        const baseVol = volSfxInput ? parseFloat(volSfxInput.value) : 0.4;

        gainNode.gain.setValueAtTime(baseVol * 1.6 * volumeFactor, playTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, playTime + 0.08);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(window.audioContext.destination);

        osc.start(playTime);
        osc.stop(playTime + 0.1);
    }
}

function drawLasers(ctx) {
    if (!activeLasers || activeLasers.length === 0) return;
    const laser = activeLasers[0];
    const elapsed = (window.lastInterpolatedTime || 0) - laser.startTime;
    const currentColWidth = colWidth;
    const x = localStartX + laser.col * currentColWidth;
    const centerX = x + currentColWidth / 2;

    // Trigger laser sound exactly once when Phase 2 starts
    if (elapsed >= 1.0 && !laser.soundTriggered) {
        laser.soundTriggered = true;
        playLaserSound();
    }

    // Generate unstable path with a soft wave (undulating plasma tube)
    const segments = 16;
    const stepY = canvas.height / segments;
    const time = window.lastInterpolatedTime || 0;
    const offsets = [];

    for (let j = 0; j <= segments; j++) {
        const posY = j * stepY;
        // Wavy plasma arc offset
        const wave = Math.sin(posY * 0.004 + time * 35) * 5;
        const noise = (Math.random() - 0.5) * 2;
        offsets.push(wave + noise);
    }

    function drawBeamPath(w, strokeStyle, globalAlpha) {
        ctx.save();
        ctx.globalAlpha = globalAlpha;
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let j = 0; j <= segments; j++) {
            const posY = j * stepY;
            const offset = offsets[j];
            if (j === 0) ctx.moveTo(centerX + offset, posY);
            else ctx.lineTo(centerX + offset, posY);
        }
        ctx.stroke();
        ctx.restore();
    }

    ctx.save();
    const color = colorMap[laser.col];

    if (elapsed < 1.0) {
        // Phase 1: Soft Warning Glow (Fades in, low height capsule or low opacity)
        // Pulsing scale for warning
        const warningPulse = 0.15 + Math.sin(time * 25) * 0.05;
        drawBeamPath(currentColWidth * 0.5, color, warningPulse);
        drawBeamPath(currentColWidth * 0.25, '#ffffff', warningPulse * 1.5);
    } else if (elapsed < 3.0) {
        // Calculate horizontal scale factor with ease-in-out (smoothstep) curves
        let scaleX = 1.0;
        if (elapsed < 1.5) {
            const t = (elapsed - 1.0) / 0.5;
            scaleX = t * t * (3 - 2 * t); // grow from 0 to 1 over 0.5s
        } else if (elapsed > 2.5) {
            const t = (3.0 - elapsed) / 0.5;
            scaleX = t * t * (3 - 2 * t); // shrink from 1 to 0 over 0.5s
        }

        // Phase 2: Thick, soft-edged volumetric glowing neon laser column
        // Layered strokes to achieve the exact fuzzy/soft glowing edge
        drawBeamPath(currentColWidth * 0.95 * scaleX, color, 0.06); // Outer aura
        drawBeamPath(currentColWidth * 0.75 * scaleX, color, 0.15); // Middle glow
        drawBeamPath(currentColWidth * 0.50 * scaleX, color, 0.35); // Inner intense color
        drawBeamPath(currentColWidth * 0.30 * scaleX, color, 0.65); // Core boundary
        drawBeamPath(currentColWidth * 0.18 * scaleX, '#ffffff', 0.95); // White hot core
    }
    ctx.restore();
}

// Performance Counters
let countPerfect = 0;
let countGreat = 0;
let countOk = 0;
let countMiss = 0;
let maxCombo = 0;

let fallDuration = 1500;
const columns = 4;
const keysList = ['D', 'F', 'J', 'K', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const colorMap = ['#e91e63', '#2196f3', '#4caf50', '#ffeb3b'];
let heldKeys = new Set();
let hitZoneY = 0;
let colWidth = 0;
let localStartX = 0;
let particles = [];

// -------- Library (Saved Songs) --------
const LIB_STORAGE_KEY = 'neonbeat.library.v1';
localStorage.removeItem(LIB_STORAGE_KEY); // Limpiar datos antiguos para cumplir con la petición de no persistencia

function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
}

function getLocalStorageSafe() {
    try { return window.localStorage; } catch { return null; }
}

function loadLibraryFromStorage() {
    // Devolvemos siempre vacío para que no persista al reiniciar
    return [];
}

function saveLibraryToStorage(songs) {
    // Ya no guardamos en localStorage por petición del usuario
}

// -------- Settings Persistence --------
const SETTINGS_KEY = 'neonbeat.settings.v1';
let isLoadingSettings = false;

function saveSettings() {
    if (isLoadingSettings) return;
    const activeTheme = Array.from(document.body.classList).find(c => c.startsWith('theme-')) || 'default';
    const settings = {
        theme: activeTheme,
        difficulty: window.selectedDifficulty || 'normal',
        bpm: document.getElementById('bpm-input')?.value || '',
        noteShape: noteShape,
        splashStyle: splashStyle,
        noteSize: noteSize,
        fallSpeed: window.fallSpeed || 3.0,
        musicVol: document.getElementById('vol-music')?.value || 1,
        sfxVol: document.getElementById('vol-sfx')?.value || 0.4,
        scrollDir: scrollDirection,
        showVisualizer: showVisualizer,
        isAutoPlay: isAutoPlay,
        isHitsoundEnabled: isHitsoundEnabled,
        audioOffset: window.audioOffset || 0,
        userKeys: window.userKeys,
        forceSecondaryStyle: !!window.forceSecondaryStyle
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    isLoadingSettings = true;
    try {
        const s = JSON.parse(raw);

        // Apply theme
        if (s.theme && s.theme !== 'default') {
            document.body.classList.remove('theme-heaven', 'theme-cyberpunk', 'theme-sunflower', 'theme-recreative', 'theme-city', 'theme-galaxy', 'theme-forest', 'theme-glass');
            document.body.classList.add(s.theme);
            const themeId = s.theme.replace('theme-', '');
            const opt = document.querySelector(`.theme-opt[data-theme="${themeId}"]`);
            if (opt) {
                document.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            }
            const recFigCont = document.getElementById('recreative-figures');
            if (recFigCont) {
                if (themeId === 'recreative') recFigCont.classList.remove('hidden');
                else recFigCont.classList.add('hidden');
            }
            updateColorMapFromCSS();
        }

        // Apply difficulty
        if (s.difficulty) setDifficultyUI(s.difficulty);

        // Apply BPM
        if (s.bpm) {
            const bpmInput = document.getElementById('bpm-input');
            if (bpmInput) bpmInput.value = s.bpm;
        }

        // Apply Visual Settings
        if (s.noteShape) {
            noteShape = s.noteShape;
            if (shapeSelect) shapeSelect.value = s.noteShape;
        }
        if (s.splashStyle) {
            splashStyle = s.splashStyle;
            if (splashSelect) splashSelect.value = s.splashStyle;
        }
        if (s.noteSize) {
            noteSize = parseInt(s.noteSize);
            if (sizeRange) sizeRange.value = s.noteSize;
            if (sizeVal) sizeVal.innerText = s.noteSize + 'px';
        }
        if (s.fallSpeed) {
            window.fallSpeed = parseFloat(s.fallSpeed);
            const speedRange = document.getElementById('speed-range');
            const speedVal = document.getElementById('speed-val');
            if (speedRange) speedRange.value = s.fallSpeed;
            if (speedVal) speedVal.innerText = window.fallSpeed.toFixed(1) + 'x';
        }

        // Apply Volume
        if (s.musicVol !== undefined) {
            const volMusic = document.getElementById('vol-music');
            const volMusicVal = document.getElementById('vol-music-val');
            if (volMusic) volMusic.value = s.musicVol;
            if (volMusicVal) volMusicVal.innerText = Math.round(s.musicVol * 100) + '%';
        }
        if (s.sfxVol !== undefined) {
            const volSfx = document.getElementById('vol-sfx');
            const volSfxVal = document.getElementById('vol-sfx-val');
            if (volSfx) volSfx.value = s.sfxVol;
            if (volSfxVal) volSfxVal.innerText = Math.round(s.sfxVol * 100) + '%';
        }

        // Apply Scroll
        if (s.scrollDir) {
            scrollDirection = s.scrollDir;
            const scrollBtns = document.querySelectorAll('#scroll-selector .mode-btn');
            scrollBtns.forEach(b => b.classList.toggle('active', b.dataset.dir === s.scrollDir));
            resizeCanvas();
        }

        // Apply Toggles
        if (s.showVisualizer !== undefined) {
            showVisualizer = s.showVisualizer;
            const vt = document.getElementById('visualizer-toggle');
            if (vt) vt.checked = s.showVisualizer;
        }
        if (s.isAutoPlay !== undefined) {
            isAutoPlay = s.isAutoPlay;
            const at = document.getElementById('autoplay-toggle');
            if (at) at.checked = s.isAutoPlay;
        }
        if (s.isHitsoundEnabled !== undefined) {
            isHitsoundEnabled = s.isHitsoundEnabled;
            const ht = document.getElementById('hitsound-toggle');
            if (ht) ht.checked = s.isHitsoundEnabled;
        }

        // Apply Offset
        if (s.audioOffset !== undefined) {
            window.audioOffset = parseFloat(s.audioOffset);
            const offsetRange = document.getElementById('offset-range');
            const offsetVal = document.getElementById('offset-val');
            if (offsetRange) offsetRange.value = Math.round(window.audioOffset * 1000);
            if (offsetVal) offsetVal.innerText = (window.audioOffset >= 0 ? '+' : '') + Math.round(window.audioOffset * 1000) + ' ms';
        } else {
            window.audioOffset = 0;
        }

        // Apply Keys
        if (Array.isArray(s.userKeys)) {
            window.userKeys = s.userKeys;
            const kBtns = document.querySelectorAll('.key-bind-btn');
            kBtns.forEach((btn, idx) => {
                let shortName = window.userKeys[idx].replace('Key', '').replace('Arrow', '');
                btn.innerText = shortName;
            });
        }
        if (s.hasOwnProperty('forceSecondaryStyle')) {
            window.forceSecondaryStyle = !!s.forceSecondaryStyle;
            const btnForce = document.getElementById('btn-force-secondary');
            if (btnForce) btnForce.classList.toggle('active', window.forceSecondaryStyle);
        }
    } catch (e) {
        console.warn('Error loading settings:', e);
    } finally {
        isLoadingSettings = false;
    }
}

function cloneMap(map) {
    if (!Array.isArray(map)) return [];
    return map.map(n => ({
        time: n.time,
        endTime: (typeof n.endTime === 'number' && Number.isFinite(n.endTime)) ? n.endTime : null,
        col: n.col,
        type: (n && (n.type === 'hold' || (typeof n.endTime === 'number' && Number.isFinite(n.endTime)))) ? 'hold' : 'tap',
        active: true,
        scored: false,
        holdStarted: false,
        holdJudged: false,
        holdStartDiff: null,
        rawEnergy: n.rawEnergy
    }));
}

function formatCreatedAt(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setDifficultyUI(difficulty) {
    const btns = document.querySelectorAll('.mode-btn[data-diff]');
    btns.forEach(b => b.classList.toggle('active', b.dataset.diff === difficulty));
    window.selectedDifficulty = difficulty;
    saveSettings();
}

function setSpeedUI(speed) {
    const sr = document.getElementById('speed-range');
    if (!sr) return;
    sr.value = String(speed);
    sr.dispatchEvent(new Event('input', { bubbles: true }));
}

function refreshSongUI(song) {
    const fileInfo = document.getElementById('file-info');
    const successLabel = document.getElementById('upload-success-label');
    const status = document.getElementById('status-text');

    if (fileInfo && successLabel) {
        const title = song.title || song.fileName || 'Canción';
        successLabel.innerText = `${title} se ha importado con exito`;
        fileInfo.classList.remove('hidden');
        fileInfo.style.opacity = '1';
    }


    if (status) {
        const playable = !!song.audioBuffer;
        status.innerText = playable
            ? `Mapa cargado desde biblioteca: ${song.title || song.fileName} (${song.noteCount} notas).`
            : 'Mapa cargado (sin audio). Vuelve a cargar el MP3 para poder jugar.';
    }

    const btnProcess = document.getElementById('btn-process');
    if (btnProcess) {
        btnProcess.classList.add('hidden');
        btnProcess.disabled = true;
    }

    if (btnPlayGame) {
        btnPlayGame.classList.remove('hidden');
        btnPlayGame.disabled = !song.audioBuffer;
        btnPlayGame.title = song.audioBuffer ? '' : 'Requiere volver a cargar el audio (MP3).';
    }

    if (typeof window.updateExtremeDiffMsg === 'function') {
        window.updateExtremeDiffMsg(song.noteCount, song.duration);
    }
}

// Global helper for the extreme difficulty message
window.isMapExtreme = function (noteCount, duration) {
    return noteCount > 3100;
};

window.updateExtremeDiffMsg = function (noteCount, duration) {
    const extremeMsg = document.getElementById('extreme-diff-msg');
    if (!extremeMsg) return;

    const dur = duration || (window.audioBuffer ? window.audioBuffer.duration : 0);

    if (window.isMapExtreme(noteCount, dur)) {
        extremeMsg.classList.remove('hidden');
    } else {
        extremeMsg.classList.add('hidden');
    }
};

window.addSongToLibrary = function (payload) {
    if (!payload || !payload.map) return;

    const now = Date.now();
    const id = `song_${now}_${Math.random().toString(16).slice(2)}`;
    const title = payload.fileName || 'Canción';

    const song = {
        id,
        fileName: payload.fileName || '',
        title,
        createdAt: now,
        difficulty: payload.difficulty || window.selectedDifficulty || 'normal',
        fallSpeed: payload.fallSpeed || window.fallSpeed || 1.5,
        noteCount: Array.isArray(payload.map) ? payload.map.length : 0,
        duration: payload.audioBuffer ? payload.audioBuffer.duration : null,
        audioBuffer: payload.audioBuffer || null, // solo memoria
        map: cloneMap(payload.map)
    };

    const existing = Array.isArray(window.savedSongs) ? window.savedSongs : [];
    window.savedSongs = [song, ...existing];
    saveLibraryToStorage(window.savedSongs);

    if (typeof window.renderLibrary === 'function') window.renderLibrary();
};

// Settings Events
// --- Event Listeners Setup ---
if (shapeSelect) shapeSelect.addEventListener('change', e => { noteShape = e.target.value; saveSettings(); });
if (splashSelect) splashSelect.addEventListener('change', e => { splashStyle = e.target.value; saveSettings(); });
if (sizeRange) {
    sizeRange.addEventListener('input', e => {
        noteSize = parseInt(e.target.value);
        if (sizeVal) sizeVal.innerText = noteSize + 'px';
        saveSettings();
    });
}

if (speedRange) {
    speedRange.addEventListener('input', e => {
        window.fallSpeed = parseFloat(e.target.value);
        if (speedVal) speedVal.innerText = window.fallSpeed.toFixed(1) + 'x';
        saveSettings();
    });
}

if (bpmInput) {
    bpmInput.addEventListener('input', () => {
        saveSettings();
    });
}

if (visualizerToggle) {
    visualizerToggle.addEventListener('change', e => {
        showVisualizer = e.target.checked;
        if (!showVisualizer && vCtx) {
            vCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        }
        saveSettings();
    });
}

if (autoPlayToggle) {
    autoPlayToggle.addEventListener('change', e => {
        isAutoPlay = e.target.checked;
        if (isAutoPlay && window.isPlaying) {
            autoplayUsedThisSession = true;
        }
        saveSettings();
    });
}

if (hitsoundToggle) {
    hitsoundToggle.addEventListener('change', e => {
        isHitsoundEnabled = e.target.checked;
        saveSettings();
    });
}

document.querySelectorAll('.mode-btn[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
        setDifficultyUI(btn.dataset.diff);
    });
});

if (scrollSelector) {
    const scrollBtns = scrollSelector.querySelectorAll('.mode-btn');
    scrollBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            scrollBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            scrollDirection = btn.dataset.dir;
            resizeCanvas();
            if (typeof window.drawReadyState === 'function') window.drawReadyState();
            saveSettings();
        });
    });
}

if (btnTogglePanel && leftPanel) {
    btnTogglePanel.addEventListener('click', () => {
        leftPanel.classList.toggle('collapsed');
        // Width snaps instantly; force layout and sync lanes immediately so notes
        // stay centered in the black window (no mid-animation coordinate freeze).
        void leftPanel.offsetWidth;
        window._panelAnimating = false;
        if (typeof resizeCanvas === 'function') resizeCanvas({ soft: true });
        if (!window.isPlaying && typeof window.drawReadyState === 'function') {
            window.drawReadyState();
        }
    });
}

if (btnCustomWindow && customOverlayPanel) {
    btnCustomWindow.addEventListener('click', () => {
        customOverlayPanel.classList.remove('hidden');
    });
}

if (btnCloseCustomWindow && customOverlayPanel) {
    btnCloseCustomWindow.addEventListener('click', () => {
        customOverlayPanel.classList.add('hidden');
    });
}

if (customOverlayPanel) {
    customOverlayPanel.addEventListener('click', (e) => {
        if (e.target === customOverlayPanel) {
            customOverlayPanel.classList.add('hidden');
        }
    });
}

const keyBindBtns = document.querySelectorAll('.key-bind-btn');
let activeBindCol = -1;

keyBindBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
        keyBindBtns.forEach(b => b.classList.remove('waiting'));
        btn.classList.add('waiting');
        btn.innerText = '?';
        activeBindCol = idx;
    });
});

// Re-vincular teclas cargadas si existen
if (Array.isArray(window.userKeys)) {
    keyBindBtns.forEach((btn, idx) => {
        if (window.userKeys[idx]) {
            let shortName = window.userKeys[idx].replace('Key', '').replace('Arrow', '');
            btn.innerText = shortName;
        }
    });
}

if (volMusicInput && volMusicVal) {
    volMusicInput.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        if (window.musicGainNode) window.musicGainNode.gain.value = v;
        volMusicVal.innerText = Math.round(v * 100) + '%';
        saveSettings();
    });
}

if (volSfxInput && volSfxVal) {
    volSfxInput.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        volSfxVal.innerText = Math.round(v * 100) + '%';
        saveSettings();
    });
}

const offsetRange = document.getElementById('offset-range');
const offsetVal = document.getElementById('offset-val');
if (offsetRange && offsetVal) {
    offsetRange.addEventListener('input', (e) => {
        const ms = parseInt(e.target.value);
        window.audioOffset = ms / 1000;
        offsetVal.innerText = (ms >= 0 ? '+' : '') + ms + ' ms';
        saveSettings();
    });
}

// GAME MODES LISTENERS

function toggleModesEnabled(enabled) {
    modeIds.forEach(id => {
        const el = document.getElementById('mode-' + id);
        if (el) el.disabled = !enabled;
    });
}

window.resetGameModes = function () {
    modeIds.forEach(id => {
        activeModes[id] = false;
        const el = document.getElementById('mode-' + id);
        if (el) el.checked = false;
    });
    updateActiveModeIcons();
}

modeIds.forEach(id => {
    const el = document.getElementById('mode-' + id);
    if (el) {
        el.addEventListener('change', e => {
            if (window.isPlaying) {
                e.target.checked = activeModes[id];
                return;
            }
            activeModes[id] = e.target.checked;

            // Incompatible modes logic
            if (id === 'speedup' && e.target.checked) {
                const sd = document.getElementById('mode-slowdown');
                if (sd && sd.checked) { sd.checked = false; activeModes.slowdown = false; }
            }
            if (id === 'slowdown' && e.target.checked) {
                const su = document.getElementById('mode-speedup');
                if (su && su.checked) { su.checked = false; activeModes.speedup = false; }
            }

            updateActiveModeIcons();
        });
    }
});

// LIBRARY TOGGLE (Robust Implementation)
function initLibraryToggle() {
    const libraryBtn = document.getElementById('btn-library');
    const libraryBox = document.getElementById('library-content');
    const openEditorBtn = document.getElementById('btn-open-editor');

    if (openEditorBtn) {
        openEditorBtn.onclick = () => {
            window.open('editor.html', '_blank');
        };
    }

    if (libraryBtn && libraryBox) {
        console.log('NeonBeat Library initialized.');

        libraryBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = libraryBox.classList.contains('hidden');

            // Cerrar otros dropdowns si los hubiera
            libraryBox.classList.toggle('hidden');
            console.log('Library toggled:', !isHidden);
        };

        document.addEventListener('click', (e) => {
            if (libraryBox && !libraryBox.contains(e.target) && e.target !== libraryBtn) {
                libraryBox.classList.add('hidden');
            }
        });
    } else {
        console.warn('Library elements NOT found in DOM!');
    }
}

// Global Library Refresh Function
window.renderLibrary = function () {
    const libraryCount = document.getElementById('library-count');
    const libraryList = document.getElementById('library-content');

    const songs = Array.isArray(window.savedSongs) ? window.savedSongs : [];
    if (libraryCount) {
        libraryCount.innerText = `(${songs.length})`;
    }

    if (!libraryList) return;

    if (songs.length === 0) {
        libraryList.innerHTML = `
            <div class="library-header-row">
                <div class="library-header-title">Librería</div>
                <button class="lib-btn lib-btn-primary" id="btn-open-editor-dropdown">🛠️ Abrir Editor</button>
            </div>
            <div class="library-empty">Aún no has generado canciones</div>
        `;
        const dropEditorBtn = document.getElementById('btn-open-editor-dropdown');
        if (dropEditorBtn) dropEditorBtn.onclick = () => window.open('editor.html', '_blank');
        return;
    }

    const itemsHtml = songs.map(s => {
        const playable = !!s.audioBuffer;
        const title = escapeHtml(s.title || s.fileName || 'Canción');

        const metaParts = [];
        if (s.difficulty) metaParts.push(`Diff: ${escapeHtml(s.difficulty)}`);
        if (typeof s.fallSpeed === 'number') metaParts.push(`Vel: ${s.fallSpeed.toFixed(1)}x`);
        if (typeof s.noteCount === 'number') metaParts.push(`${s.noteCount} notas`);
        if (s.createdAt) metaParts.push(escapeHtml(formatCreatedAt(s.createdAt)));
        const meta = metaParts.join(' • ');

        const audioTag = playable ? '' : '<span class="lib-badge">sin audio</span>';
        const playDisabled = playable ? '' : 'disabled';
        const songId = escapeHtml(s.id);

        return `
            <div class="library-item" data-song-id="${songId}">
                <div class="library-item-top">
                    <div class="library-item-title" title="${title}">${title}</div>
                    ${audioTag}
                </div>
                <div class="library-item-meta">${meta}</div>
                <div class="library-item-actions">
                    <button class="lib-btn" data-action="load">Cargar</button>
                    <button class="lib-btn lib-btn-primary" data-action="play" ${playDisabled}>Jugar</button>
                    <button class="lib-btn lib-btn-danger" data-action="delete">Borrar</button>
                </div>
            </div>
        `;
    }).join('');

    libraryList.innerHTML = `
        <div class="library-header-row">
            <div class="library-header-title">Tus mapas</div>
            <div style="display:flex; gap:6px;">
                <button class="lib-btn lib-btn-primary" id="btn-open-editor-dropdown">🛠️ Abrir Editor</button>
                <button class="lib-btn lib-btn-danger" data-action="clear-all">Limpiar</button>
            </div>
        </div>
        <div class="library-items">${itemsHtml}</div>
        <div class="library-footer-hint">Nota: el audio no se guarda. Si recargas la página, vuelve a subir el MP3.</div>
    `;

    const dropEditorBtn = document.getElementById('btn-open-editor-dropdown');
    if (dropEditorBtn) dropEditorBtn.onclick = () => window.open('editor.html', '_blank');
};

function ensureLibraryLoaded() {
    const stored = loadLibraryFromStorage();
    if (!Array.isArray(window.savedSongs) || window.savedSongs.length === 0) {
        window.savedSongs = stored;
        return;
    }

    if (stored.length === 0) return;

    const byId = new Map(window.savedSongs.map(s => [s.id, s]));
    for (const s of stored) {
        if (!byId.has(s.id)) byId.set(s.id, s);
    }
    window.savedSongs = Array.from(byId.values());
}

function getSongById(id) {
    if (!id || !Array.isArray(window.savedSongs)) return null;
    return window.savedSongs.find(s => s.id === id) || null;
}

function deleteSongById(id) {
    if (!id || !Array.isArray(window.savedSongs)) return;
    window.savedSongs = window.savedSongs.filter(s => s.id !== id);
    saveLibraryToStorage(window.savedSongs);
    window.renderLibrary();
}

function clearAllSongs() {
    window.savedSongs = [];
    saveLibraryToStorage([]);
    window.renderLibrary();
}

function loadSong(song) {
    if (!song) return;

    if (typeof window.resetGameModes === 'function') window.resetGameModes();
    if (typeof stopPreviousAudio === 'function') stopPreviousAudio();

    window.audioMap = cloneMap(song.map);
    window.audioBuffer = song.audioBuffer || null;
    window.currentFileName = song.fileName || song.title || '';

    refreshSongUI(song);

    if (typeof window.drawReadyState === 'function') window.drawReadyState();
}

function wireLibraryActions() {
    const libraryList = document.getElementById('library-content');
    if (!libraryList) return;

    // Evitar duplicar handlers si se vuelve a llamar
    if (libraryList.dataset.libraryWired === '1') return;
    libraryList.dataset.libraryWired = '1';

    libraryList.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;

        if (action === 'clear-all') {
            clearAllSongs();
            return;
        }

        const item = btn.closest('.library-item');
        const songId = item ? item.dataset.songId : null;
        const song = getSongById(songId);
        if (!song) return;

        if (action === 'delete') {
            deleteSongById(songId);
            return;
        }

        if (action === 'load') {
            loadSong(song);
            return;
        }

        if (action === 'play') {
            loadSong(song);
            if (song.audioBuffer) btnPlayGame.click();
            return;
        }
    });
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLibraryToggle);
} else {
    initLibraryToggle();
}

ensureLibraryLoaded();
wireLibraryActions();
window.renderLibrary();
loadSettings(); // Al final para sobreescribir defaults con seguridad

// Live Preview Animation Loop (paused when panel hidden / not on game screen)
let _previewRafId = 0;
function drawPreviewTick() {
    _previewRafId = 0;
    const panelVisible = leftPanel && !leftPanel.classList.contains('collapsed');
    const onGame = !document.querySelector('.app-container')?.classList.contains('hidden');
    if (!panelVisible || !onGame || document.hidden) {
        _previewRafId = requestAnimationFrame(drawPreviewTick);
        return;
    }

    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    pCtx.strokeStyle = 'rgba(255,255,255,0.3)';
    pCtx.lineWidth = 4;
    pCtx.beginPath();
    drawNotePath(pCtx, 100, 40, noteSize + 5, noteShape, 1);
    pCtx.closePath();
    pCtx.stroke();

    const time = Date.now() / 300;
    const pulseY = 40 + Math.sin(time) * 10;

    drawNoteShape(pCtx, 100, pulseY, noteSize, colorMap[1], noteShape, 1);

    _previewRafId = requestAnimationFrame(drawPreviewTick);
}
_previewRafId = requestAnimationFrame(drawPreviewTick);

// Resizing
let _resizeRafId = null;
let _resizeOptsSoft = true;

function scheduleResizeCanvas(options = {}) {
    if (window._panelAnimating) return;
    // Once any hard resize is queued, keep it hard (damage immunity)
    if (!options.soft) _resizeOptsSoft = false;
    if (_resizeRafId != null) return;
    _resizeRafId = requestAnimationFrame(() => {
        _resizeRafId = null;
        const soft = _resizeOptsSoft;
        _resizeOptsSoft = true;
        resizeCanvas({ soft });
    });
}

function resizeCanvas(options = {}) {
    // Skip mid-animation resizes — they clear the canvas every frame and make notes flicker
    if (window._panelAnimating) return;

    // Only hard window resizes grant brief damage immunity (not panel open/close)
    if (!options.soft) {
        window.lastResizeTime = Date.now();
    }

    const parent = canvas.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    // Round to whole CSS pixels — avoids subpixel stretch between bitmap and display size
    const cssW = Math.max(1, Math.round(parentRect.width));
    const cssH = Math.max(1, Math.round(parentRect.height));

    const sizeChanged = (canvas.width !== cssW) || (canvas.height !== cssH);
    if (sizeChanged) {
        canvas.width = cssW;
        canvas.height = cssH;
    }
    // CRITICAL: lock displayed size to the bitmap so CSS `width:100%` cannot
    // stretch a stale buffer while the window is being dragged.
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    const vizW = window.innerWidth;
    const vizH = window.innerHeight;
    if (visualizerCanvas.width !== vizW) visualizerCanvas.width = vizW;
    if (visualizerCanvas.height !== vizH) visualizerCanvas.height = vizH;
    visualizerCanvas.style.width = vizW + 'px';
    visualizerCanvas.style.height = vizH + 'px';

    const isOnline = window.onlineMode && window.onlineMode.active;
    const isLocalCoop = window.localMode && window.localMode.active;
    const isTwoPlayer = isOnline || isLocalCoop;

    const p1Window = document.getElementById('game-window-p1');
    const p2Window = document.getElementById('game-window-p2');
    const layoutContainer = document.getElementById('game-lanes-layout');

    if (p1Window && p2Window) {
        // Disable width transitions while measuring — animated lane widths
        // desync notes from the DOM windows during resize.
        p1Window.style.transition = 'none';
        p2Window.style.transition = 'none';

        if (isTwoPlayer) {
            p2Window.classList.remove('hidden');
            if (isLocalCoop) {
                p1Window.style.width = '440px';
                p2Window.style.width = '440px';
                if (layoutContainer) layoutContainer.style.gap = '140px';
            } else {
                p1Window.style.width = '500px';
                p2Window.style.width = '360px';
                if (layoutContainer) layoutContainer.style.gap = '80px';
            }
        } else {
            p2Window.classList.add('hidden');
            p1Window.style.width = '500px';
        }

        // Force layout, then measure against the same parent origin used for the canvas
        void parent.offsetWidth;
        const originLeft = parent.getBoundingClientRect().left;
        const p1Rect = p1Window.getBoundingClientRect();

        localStartX = p1Rect.left - originLeft;
        colWidth = p1Rect.width / columns;

        if (isTwoPlayer) {
            const p2Rect = p2Window.getBoundingClientRect();
            window._oppTrackWidth = p2Rect.width;
            window._oppStartX = p2Rect.left - originLeft;
            window._oppColWidth = p2Rect.width / columns;
        } else {
            window._oppTrackWidth = 0;
            window._oppStartX = cssW;
            window._oppColWidth = 0;
        }
    } else {
        localStartX = 0;
        colWidth = cssW / columns;
        window._oppTrackWidth = 0;
        window._oppStartX = cssW;
        window._oppColWidth = 0;
    }

    hitZoneY = (scrollDirection === 'down') ? (cssH - 120) : 120;
    window._oppNoteSize = isOnline ? (noteSize * 0.72) : (isLocalCoop ? noteSize : noteSize * 0.72);
    window._gameCssW = cssW;
    window._gameCssH = cssH;

    // When actively playing, the existing rAF loop will redraw with the new
    // layout — do NOT call drawGame here or we spawn duplicate loops.
    if (window.isPaused && window.isPlaying) {
        drawGame(performance.now(), true);
    } else if (!window.isPlaying) {
        if (typeof window.drawReadyState === 'function') window.drawReadyState();
    }
}
window.addEventListener('resize', () => scheduleResizeCanvas({ soft: false }));
window.resizeCanvas = resizeCanvas;
let _resizeObserverTimer = null;
const resizeObserver = new ResizeObserver(() => {
    if (window._panelAnimating) return;
    scheduleResizeCanvas({ soft: true });
});
resizeObserver.observe(canvas.parentElement);
resizeCanvas();

// Expose game internals for multiplayer.js access
window.getGameState = function () {
    return { score, combo, maxCombo, health, colWidth, hitZoneY, colorMap, splashStyle, noteSize, noteShape };
};
window.spawnParticles = spawnParticles;

function updateHealth(amount) {
    if (window.isGameOver) return;
    if (window.localMode && window.localMode.active && window.localMode.p1Died) return;

    // No death mode
    if (activeModes.nodeath && amount < 0) amount = 0;

    // Ignore damage during or immediately after window resizing/zooming (preventing deaths from lag/layout shifts)
    if (amount < 0 && window.lastResizeTime && (Date.now() - window.lastResizeTime < 1500)) {
        amount = 0;
    }

    // Ignore damage right after unpausing (prevents mass-miss death from a long pause)
    if (amount < 0 && window._resumeGraceUntil && performance.now() < window._resumeGraceUntil) {
        amount = 0;
    }

    // Health drain mode logic (if miss, health halves)
    if (activeModes.healthdrain && amount < 0) {
        if (health <= 55) { // If health was already low, it kills
            health = 0;
        } else {
            health = health / 2;
        }
    } else {
        health = Math.min(100, Math.max(0, health + amount));
    }

    if (healthBar) healthBar.style.width = health + '%';

    if (health > 60) {
        healthBar.style.backgroundColor = 'var(--success)';
        healthBar.style.boxShadow = '0 0 10px var(--success)';
    } else if (health > 30) {
        healthBar.style.backgroundColor = 'var(--color-lane-4)'; // Amarillo
        healthBar.style.boxShadow = '0 0 10px var(--color-lane-4)';
    } else {
        healthBar.style.backgroundColor = 'var(--color-lane-1)'; // Rojo
        healthBar.style.boxShadow = '0 0 10px var(--color-lane-1)';
    }

    if (health <= 0) {
        if (window.localMode && window.localMode.active) {
            window.localMode.p1Died = true;
            heldKeys.clear();
            showFeedback('DEATH', 'feedback-death');
            if (window.localMode.p2Died) {
                if (!window.isGameOver) gameOver();
            }
        } else {
            if (!window.isGameOver) gameOver();
        }
    }
}

function gameOver() {
    window.isGameOver = true;
    window.isPlaying = false;
    if (npWidget) npWidget.classList.remove('show');
    stopPreviousAudio();
    document.getElementById('status-text').innerText = '¡HAS FALLADO!';
    btnPlayGame.innerText = 'Reintentar';
    btnPlayGame.classList.remove('hidden');
    btnPauseGame.classList.add('hidden');
    showFeedback('DEATH', 'feedback-death');

    // Notify opponent of local player death in versus mode
    if (window.onlineMode && window.onlineMode.active) {
        window.onlineMode.localDied = true;

        // Draw DEATH under local player's track
        ctx.save();
        ctx.font = '900 48px Outfit, sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 25;
        const localX = localStartX + (colWidth * columns) / 2;
        ctx.fillText('DEATH', localX, canvas.height - 30);
        ctx.restore();

        if (window.onlineMode.conn) {
            window.onlineMode.conn.send({
                type: 'player-death',
                score: score,
                maxCombo: maxCombo
            });
        }
    }

    // Efecto oscuro/rojo generalizado para la pantalla de Falla final
    document.body.classList.add('extreme-mode', 'flash-miss');

    setTimeout(() => {
        showResults();
    }, 1200);
}

window.handleOpponentDeath = function () {
    window.isGameOver = true;
    window.isPlaying = false;
    if (npWidget) npWidget.classList.remove('show');
    // Keep music playing until a new song is imported/started
    detachAudioEndedHandler();

    document.getElementById('status-text').innerText = '¡EL RIVAL HA CAÍDO!';
    btnPlayGame.innerText = 'Continuar';
    btnPlayGame.classList.remove('hidden');
    btnPauseGame.classList.add('hidden');

    // Muestra "¡GANASTE!" gigante con el feedback perfecto (Neon e Indigo)
    showFeedback('¡GANASTE!', 'feedback-perfect');

    if (window.onlineMode && window.onlineMode.active) {
        // Draw (Muerte) under opponent player's track
        ctx.save();
        ctx.font = '900 48px Outfit, sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 25;
        const oppStartX = window._oppStartX || canvas.width;
        const oppColW = window._oppColWidth || 0;
        const oppX = oppStartX + (oppColW * columns) / 2;
        ctx.fillText('DEATH', oppX, canvas.height - 30);
        ctx.restore();
    }

    // Añade el efecto de celebración de victoria en la pantalla
    document.body.classList.add('extreme-mode');

    setTimeout(() => {
        showResults();
    }, 2000);
};

function drawNotePath(tCtx, cx, cy, radius, shape, colIndex = 0) {
    if (shape === 'circle') {
        tCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    } else if (shape === 'diamond') {
        tCtx.moveTo(cx, cy - radius);
        tCtx.lineTo(cx + radius, cy);
        tCtx.lineTo(cx, cy + radius);
        tCtx.lineTo(cx - radius, cy);
    } else if (shape === 'bar') {
        tCtx.rect(cx - radius * 1.2, cy - radius * 0.4, radius * 2.4, radius * 0.8);
    } else if (shape === 'arrow') {
        let angle = 0;
        if (colIndex === 0) angle = -Math.PI / 2;
        if (colIndex === 1) angle = Math.PI;
        if (colIndex === 3) angle = Math.PI / 2;

        tCtx.translate(cx, cy);
        tCtx.rotate(angle);

        tCtx.moveTo(0, -radius);
        tCtx.lineTo(radius, radius * 0.3);
        tCtx.lineTo(radius * 0.4, radius * 0.3);
        tCtx.lineTo(radius * 0.4, radius);
        tCtx.lineTo(-radius * 0.4, radius);
        tCtx.lineTo(-radius * 0.4, radius * 0.3);
        tCtx.lineTo(-radius, radius * 0.3);

        tCtx.rotate(-angle);
        tCtx.translate(-cx, -cy);
    } else if (shape === 'hexagon') {
        const a = Math.PI * 2 / 6;
        tCtx.moveTo(cx + radius * Math.cos(0), cy + radius * Math.sin(0));
        for (let i = 1; i <= 6; i++) {
            tCtx.lineTo(cx + radius * Math.cos(a * i), cy + radius * Math.sin(a * i));
        }
    } else if (shape === 'triangle') {
        const offset = (colIndex % 2 === 0) ? 1 : -1;
        tCtx.moveTo(cx, cy - radius * offset);
        tCtx.lineTo(cx + radius * 0.866, cy + radius * 0.5 * offset);
        tCtx.lineTo(cx - radius * 0.866, cy + radius * 0.5 * offset);
    } else if (shape === 'cross') {
        const w = radius * 0.35;
        tCtx.moveTo(cx - w, cy - radius);
        tCtx.lineTo(cx + w, cy - radius);
        tCtx.lineTo(cx + w, cy - w);
        tCtx.lineTo(cx + radius, cy - w);
        tCtx.lineTo(cx + radius, cy + w);
        tCtx.lineTo(cx + w, cy + w);
        tCtx.lineTo(cx + w, cy + radius);
        tCtx.lineTo(cx - w, cy + radius);
        tCtx.lineTo(cx - w, cy + w);
        tCtx.lineTo(cx - radius, cy + w);
        tCtx.lineTo(cx - radius, cy - w);
        tCtx.lineTo(cx - w, cy - w);
    }
}

// Draw util
function blendTwoColors(hexA, hexB, ratio) {
    if (!hexA || !hexA.startsWith('#')) return hexA;
    if (!hexB || !hexB.startsWith('#')) return hexB;
    let rA = parseInt(hexA.slice(1, 3), 16);
    let gA = parseInt(hexA.slice(3, 5), 16);
    let bA = parseInt(hexA.slice(5, 7), 16);

    let rB = parseInt(hexB.slice(1, 3), 16);
    let gB = parseInt(hexB.slice(3, 5), 16);
    let bB = parseInt(hexB.slice(5, 7), 16);

    let r = Math.round(rA * (1 - ratio) + rB * ratio);
    let g = Math.round(gA * (1 - ratio) + gB * ratio);
    let b = Math.round(bA * (1 - ratio) + bB * ratio);

    return `rgb(${r}, ${g}, ${b})`;
}

function getLostInSnowNoteBlendRatio() {
    if (window.currentFileName !== "Lost In Snow.mp3" || typeof lostInSnowStage === 'undefined') {
        return 0;
    }
    if (lostInSnowStage === 'moonZoom') {
        const elapsedZoom = (Date.now() - zoomStartTime) / 1000;
        return Math.min(1.0, elapsedZoom / 0.914);
    }
    if (lostInSnowStage === 'moonSurface') {
        return 1.0;
    }
    if (lostInSnowStage === 'moonZoomOut') {
        const elapsedZoom = (Date.now() - zoomOutStartTime) / 1000;
        return Math.max(0.0, 1.0 - Math.min(1.0, elapsedZoom / 0.914));
    }
    return 0;
}

function drawNoteShape(tCtx, cx, cy, radius, color, shape, colIndex = 0) {
    const blendRatio = getLostInSnowNoteBlendRatio();
    if (blendRatio > 0) {
        color = blendTwoColors(color, '#101010', blendRatio);
    }

    // Fast Fake Glow (replaces expensive shadowBlur)
    tCtx.fillStyle = color;
    tCtx.globalAlpha = blendRatio > 0 ? (0.3 + blendRatio * 0.15) : 0.3;
    tCtx.beginPath();
    drawNotePath(tCtx, cx, cy, radius * 1.35, shape, colIndex);
    tCtx.closePath();
    tCtx.fill();
    tCtx.globalAlpha = 1.0;

    // Core shape
    tCtx.lineWidth = 2;
    tCtx.strokeStyle = blendRatio > 0 ? blendTwoColors('#ffffff', '#555555', blendRatio) : '#fff';
    tCtx.beginPath();
    drawNotePath(tCtx, cx, cy, radius, shape, colIndex);
    tCtx.closePath();
    tCtx.fill();
    tCtx.stroke();
}

function isColumnHeld(col) {
    const arrowKeys = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
    return heldKeys.has(window.userKeys[col]) || heldKeys.has(arrowKeys[col]);
}

function timeToY(noteTime, currentTime, currentFallSec) {
    const timeUntilHit = noteTime - currentTime;
    const progress = 1 - (timeUntilHit / currentFallSec);
    if (scrollDirection === 'down') {
        return progress * hitZoneY;
    }
    return canvas.height - (progress * (canvas.height - hitZoneY));
}

function drawHoldTail(tCtx, x, yA, yB, col, held, customSize) {
    const y1 = Math.min(yA, yB);
    const y2 = Math.max(yA, yB);
    const h = y2 - y1;
    if (h < 2) return;

    const baseSize = typeof customSize === 'number' ? customSize : noteSize;
    const width = Math.max(6, baseSize * 0.55);

    tCtx.save();
    tCtx.lineCap = 'round';
    let holdColor = colorMap[col];
    const blendRatio = getLostInSnowNoteBlendRatio();
    if (blendRatio > 0) {
        holdColor = blendTwoColors(holdColor, '#101010', blendRatio);
    }
    tCtx.strokeStyle = held ? (holdColor + 'cc') : (holdColor + '66');
    tCtx.lineWidth = width;
    tCtx.beginPath();
    tCtx.moveTo(x, y1);
    tCtx.lineTo(x, y2);
    tCtx.stroke();

    // Borde brillante
    tCtx.strokeStyle = blendRatio > 0 ? blendTwoColors('#ffffff', '#555555', blendRatio) : 'rgba(255,255,255,0.55)';
    tCtx.lineWidth = 2;
    tCtx.beginPath();
    tCtx.moveTo(x, y1);
    tCtx.lineTo(x, y2);
    tCtx.stroke();
    tCtx.restore();
}

function spawnParticles(x, y, color, style) {
    window.lastHitColor = color;
    window.lastHitTime = Date.now();
    if (style === 'rings') {
        particles.push({ type: 'ring', x, y, radius: 10, maxRadius: 70, alpha: 1, color });
    } else if (style === 'sparks') {
        for (let i = 0; i < 12; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = 2 + Math.random() * 6;
            particles.push({ type: 'spark', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
        }
    } else if (style === 'stars') {
        for (let i = 0; i < 6; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = 1 + Math.random() * 3;
            particles.push({ type: 'star', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, rot: Math.random() * Math.PI, color });
        }
    } else if (style === 'firework') {
        for (let i = 0; i < 25; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = 4 + Math.random() * 8;
            particles.push({ type: 'firework', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
        }
    } else if (style === 'shockwave') {
        particles.push({ type: 'shockwave', x, y, radius: 5, alpha: 1, color });
    } else if (style === 'laser') {
        particles.push({ type: 'laser', x, y, h: 0, alpha: 1, color });
    } else if (style === 'break') {
        for (let i = 0; i < 10; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = 1.5 + Math.random() * 3.5;
            particles.push({
                type: 'shard',
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed + 1, // drift downwards slightly
                life: 1.0,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.15,
                size: 4 + Math.random() * 6,
                color
            });
        }
    }
}

function updateAndDrawParticles() {
    // Cap particles to avoid runaway lag on dense charts
    const MAX_PARTICLES = 180;
    if (particles.length > MAX_PARTICLES) {
        particles.splice(0, particles.length - MAX_PARTICLES);
    }

    // Disable expensive shadowBlur for the whole particle pass (huge GPU cost)
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];

        if (p.type === 'ring') {
            p.radius += 4;
            p.alpha -= 0.05;
            if (p.alpha <= 0) { particles.splice(i, 1); continue; }

            ctx.strokeStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

        } else if (p.type === 'spark') {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.04;
            if (p.life <= 0) { particles.splice(i, 1); continue; }

            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1, p.life * 5), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

        } else if (p.type === 'star') {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += 0.1;
            p.life -= 0.02;
            if (p.life <= 0) { particles.splice(i, 1); continue; }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;

            ctx.beginPath();
            for (let j = 0; j < 5; j++) {
                ctx.lineTo(Math.cos((18 + j * 72) / 180 * Math.PI) * 12, -Math.sin((18 + j * 72) / 180 * Math.PI) * 12);
                ctx.lineTo(Math.cos((54 + j * 72) / 180 * Math.PI) * 5, -Math.sin((54 + j * 72) / 180 * Math.PI) * 5);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();

        } else if (p.type === 'firework') {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.3; // Gravity pull
            p.life -= 0.035;
            if (p.life <= 0) { particles.splice(i, 1); continue; }

            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1, p.life * 4.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

        } else if (p.type === 'shockwave') {
            p.radius += 5;
            p.alpha -= 0.04;
            if (p.alpha <= 0) { particles.splice(i, 1); continue; }

            ctx.strokeStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.lineWidth = 6 * p.alpha;

            for (let r = 0; r < 4; r++) {
                let rad = p.radius - r * 15;
                if (rad > 0) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;

        } else if (p.type === 'laser') {
            p.h += 40; // Laser grows super fast
            p.alpha -= 0.06;
            if (p.alpha <= 0) { particles.splice(i, 1); continue; }

            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            let w = 16 * p.alpha; // Mantiene el as de luz con un borde soft

            // Halo glow for laser (cheap substitute — no shadowBlur)
            ctx.globalAlpha = p.alpha * 0.35;
            ctx.fillRect(p.x - w, p.y - p.h, w * 2, p.h * 2);
            ctx.globalAlpha = p.alpha;

            ctx.fillRect(p.x - w / 2, p.y - p.h, w, p.h * 2);
            ctx.globalAlpha = 1;
        } else if (p.type === 'shard') {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.rotSpeed;
            p.life -= 0.03;
            if (p.life <= 0) { particles.splice(i, 1); continue; }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;

            // Draw a tiny irregular triangle/glass fragment
            ctx.beginPath();
            ctx.moveTo(-p.size / 2, -p.size / 2);
            ctx.lineTo(p.size / 2, -p.size / 3);
            ctx.lineTo(0, p.size / 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.shadowBlur = 0;
    }
}

function switchWannaCryMode() {
    if (!activeModes.wannacry) return;

    const wannaCryPool = ['nono', 'untouchable', 'internet', 'swapinout'];
    const randomId = wannaCryPool[Math.floor(Math.random() * wannaCryPool.length)];

    // CLEANUP BEFORE SWITCHING SUBMODES
    if (activeModes.internet && isInternetLagging) {
        window.audioContext.resume();
        isInternetLagging = false;
    }

    modeIds.forEach(id => {
        activeModes[id] = false;
        const el = document.getElementById('mode-' + id);
        if (el) el.checked = false;
    });

    activeModes.wannacry = true;
    activeModes[randomId] = true;

    const el = document.getElementById('mode-' + randomId);
    if (el) el.checked = true;

    // Alternate scroll direction immediately
    scrollDirection = (scrollDirection === 'down') ? 'up' : 'down';

    // Update direction selector buttons in the UI
    const scrollBtns = document.querySelectorAll('#scroll-selector .mode-btn');
    scrollBtns.forEach(btn => {
        if (btn.dataset.dir === scrollDirection) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    resizeCanvas();

    // Trigger visual/audio feedback effects
    triggerBlackFlash();
    playTapWithEcho();

    // Reset internet lag timer if chosen
    if (randomId === 'internet') {
        internetLagTimer = Date.now();
        isInternetLagging = false;
    }

    // WannaCry Feedback Sequence
    showFeedback('WANNA CRY!', 'feedback-miss'); // Warning color
    setTimeout(() => {
        showFeedback(modeIcons[randomId].name.toUpperCase() + '!', 'feedback-perfect');
    }, 800);

    updateActiveModeIcons();
}

    // Game Loop
function drawGame(timestamp, forceRedraw = false) {
    if (!window.isPlaying || window.isGameOver) return;
    if (window.isPaused && !forceRedraw) return;

    // Layout coords come from resizeCanvas() only — never read layout every frame.

    // Internet Lag Mode
    if (activeModes.internet) {
        if (Date.now() - internetLagTimer > (isInternetLagging ? 500 : 3000 + Math.random() * 5000)) {
            isInternetLagging = !isInternetLagging;
            internetLagTimer = Date.now();
            if (isInternetLagging) {
                window.audioContext.suspend();
            } else {
                window.audioContext.resume();
            }
        }
        if (isInternetLagging) {
            requestAnimationFrame(drawGame);
            return;
        }
    }
    // High-precision interpolation for AudioContext block quantization (fixes low FPS notes on high Hz displays)
    if (!window.lastRawAudioTime) {
        window.lastRawAudioTime = window.audioContext.currentTime;
        window.lastAudioPerfTime = performance.now();
    }
    if (window.audioContext.currentTime !== window.lastRawAudioTime) {
        window.lastRawAudioTime = window.audioContext.currentTime;
        window.lastAudioPerfTime = performance.now();
    }
    // Interpolate exact sub-frame time and apply latency offset adjustment
    let currentTime;
    if (window.isPaused) {
        currentTime = window.lastInterpolatedTime || 0;
    } else {
        currentTime = (window.audioContext.currentTime - startTime) + ((performance.now() - window.lastAudioPerfTime) / 1000) - (window.audioOffset || 0);
        // Prevent time flowing backwards slightly due to interpolation jitter
        if (window.lastInterpolatedTime && currentTime < window.lastInterpolatedTime) {
            currentTime = window.lastInterpolatedTime;
        }
        // Cap forward jumps (e.g. first frame after a long pause before clocks re-sync)
        if (window.lastInterpolatedTime && currentTime - window.lastInterpolatedTime > 0.25) {
            currentTime = window.lastInterpolatedTime + 1 / 60;
        }
        window.lastInterpolatedTime = currentTime;
    }

    // Swap-In-Out randomizer: Switch scroll direction every 5 to 10 seconds (using song time)
    if (activeModes.swapinout && !activeModes.wannacry && !window.isPaused) {
        if (currentTime - lastSwapTime >= nextSwapInterval) {
            scrollDirection = (scrollDirection === 'down') ? 'up' : 'down';

            // Sync UI scroll-selector buttons
            const scrollBtns = document.querySelectorAll('#scroll-selector .mode-btn');
            scrollBtns.forEach(btn => {
                if (btn.dataset.dir === scrollDirection) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            resizeCanvas();

            triggerBlackFlash();
            lastSwapTime = currentTime;
            nextSwapInterval = 5 + Math.random() * 5;
        }
    }

    // Laser Danger logic: spawn and update lasers
    if ((activeModes.laser || activeModes.wannacry) && !window.isPaused) {
        if (activeLasers.length === 0) {
            if (currentTime - lastLaserTime >= nextLaserInterval) {
                activeLasers.push({
                    col: Math.floor(Math.random() * 4),
                    startTime: currentTime
                });
            }
        } else {
            const elapsed = currentTime - activeLasers[0].startTime;
            if (elapsed >= 3.0) {
                activeLasers = [];
                lastLaserTime = currentTime;
                nextLaserInterval = 4 + Math.random() * 2;
            }
        }
    }


    // Update Now Playing Timer (Remaining Time)
    if (npTimer && window.audioBuffer) {
        const remaining = Math.max(0, window.audioBuffer.duration - currentTime);
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        npTimer.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Title Typewriter Effect for Extreme Maps (skip Lost In Snow entirely)
    if (window.isExtremeMap && window.isPlaying && !window.typewriterTriggered) {
        if (window.currentFileName === "Lost In Snow.mp3") {
            window.typewriterTriggered = true;
        } else if (currentTime >= 15) {
            window.typewriterTriggered = true;
            if (typeof window.showTypewriterTitle === 'function') {
                let artist = String(window.currentArtist || 'Artista Desconocido');
                let rawTitle = String(window.currentSongTitle || window.currentFileName || 'Canción Desconocida');

                // Función avanzada para limpiar títulos sucios (nombres de archivo de YouTube, feats, etc)
                function cleanTitle(t, a) {
                    t = t.replace(/\.(mp3|wav|mpeg|m4a|ogg|flac)$/i, '');
                    t = t.replace(/_/g, ' '); // guiones bajos por espacios
                    t = t.replace(/\s*[\[\(\{<].*?[\]\)\}>]/g, ''); // Quita () [] {} <>

                    // Remover 'Artista - ' del principio si existe
                    if (a && a !== 'Artista Desconocido') {
                        const safeArtist = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const artistReg = new RegExp('^' + safeArtist + '\\s*[-~:]\\s*', 'i');
                        t = t.replace(artistReg, '');
                    } else if (t.includes(' - ')) {
                        // Si no hay artista definido pero hay un ' - ', asumimos 'Artista - Canción'
                        const parts = t.split(' - ');
                        if (parts.length >= 2) {
                            artist = parts[0].trim(); // Autocompletar artista
                            parts.shift();
                            t = parts.join(' - ');
                        }
                    }

                    // Remover feat. sueltos
                    t = t.replace(/\s+(ft\.|feat\.|featuring|prod\.).*$/i, '');

                    // Remover palabras basura comunes y bandas sonoras
                    const trash = ['official video', 'official audio', 'lyric video', 'lyrics', 'music video', 'hd', 'hq', '4k', 'audio', 'video', 'oficial', 'letra', 'audio oficial', 'video oficial'];
                    const trashRegex = new RegExp(`\\b(${trash.join('|')})\\b`, 'gi');
                    t = t.replace(trashRegex, '');

                    // Manejar sufijos de "Soundtrack" o "OST" que a veces están tras un guion
                    t = t.replace(/\s*[-|]\s*.*(soundtrack|ost).*$/i, '');

                    // Manejar formato "Canción | Artista" o "Canción - Artista" al final
                    if (t.includes(' | ')) {
                        const pipeParts = t.split(' | ');
                        if (!a || a === 'Artista Desconocido') {
                            artist = pipeParts[pipeParts.length - 1].trim();
                        }
                        pipeParts.pop();
                        t = pipeParts.join(' | ').trim();
                    }

                    // Limpieza final de espacios y guiones sueltos
                    t = t.replace(/^[-\s~:]+|[-\s~:]+$/g, '');
                    t = t.replace(/\s{2,}/g, ' ');

                    // Si aún así es gigante, recortar de forma segura
                    if (t.length > 45) {
                        t = t.substring(0, 42) + '...';
                    }
                    if (artist.length > 30) {
                        artist = artist.substring(0, 27) + '...';
                    }

                    return t || 'Canción Desconocida';
                }

                let title = cleanTitle(rawTitle, artist);
                window.showTypewriterTitle(artist, title);
            }
        }
    }

    // WannaCry randomizer: Switch on song drops or breaks
    if (activeModes.wannacry) {
        if (wannacryPointIndex < wannacrySwitchPoints.length) {
            if (currentTime >= wannacrySwitchPoints[wannacryPointIndex]) {
                wannacryPointIndex++;
                switchWannaCryMode();
            }
        }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw columns — local player uses left half (or full if not online)
    const isOnline = window.onlineMode && window.onlineMode.active;
    const isLocalCoop = window.localMode && window.localMode.active;
    const isTwoPlayer = isOnline || isLocalCoop;
    const currentColWidth = colWidth;

    // Opponent track dimensions
    const oppStartX = window._oppStartX || canvas.width;
    const oppColW = window._oppColWidth || 0;
    const oppNSize = window._oppNoteSize || noteSize;

    // Draw local lanes (left half)
    if (isTwoPlayer) {
        // Local username label at top
        ctx.save();
        ctx.font = '900 18px Outfit, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'center';
        const uInput = document.getElementById('online-username');
        const localName = isLocalCoop ? 'JUGADOR 1' : ((uInput && uInput.value.trim())
            ? uInput.value.trim().toUpperCase()
            : 'TÚ');
        ctx.fillText(localName, localStartX + (currentColWidth * columns) / 2, 35);
        ctx.restore();
    }

    for (let i = 0; i < columns; i++) {
        let x = localStartX + i * currentColWidth;

        if (window.currentFileName !== "Lost In Snow.mp3") {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        const isHeld = isColumnHeld(i);
        const blendRatio = getLostInSnowNoteBlendRatio();
        if (blendRatio > 0) {
            // Draw solid black receptor backing matching the transition progress
            ctx.fillStyle = `rgba(0, 0, 0, ${blendRatio})`;
            ctx.beginPath();
            drawNotePath(ctx, x + currentColWidth / 2, hitZoneY, noteSize + 5, noteShape, i);
            ctx.closePath();
            ctx.fill();

            // Blend border from transparent white/color to black
            let strokeColor = isHeld ? colorMap[i] : '#ffffff';
            let strokeAlpha = isHeld ? 1.0 : 0.3;

            let r = 255, g = 255, b = 255;
            if (strokeColor.startsWith('#')) {
                r = parseInt(strokeColor.slice(1, 3), 16);
                g = parseInt(strokeColor.slice(3, 5), 16);
                b = parseInt(strokeColor.slice(5, 7), 16);
            }

            r = Math.round(r * (1 - blendRatio) + 85 * blendRatio);
            g = Math.round(g * (1 - blendRatio) + 85 * blendRatio);
            b = Math.round(b * (1 - blendRatio) + 85 * blendRatio);
            const a = strokeAlpha * (1 - blendRatio) + blendRatio * 1.0;

            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            drawNotePath(ctx, x + currentColWidth / 2, hitZoneY, noteSize + 5, noteShape, i);
            ctx.closePath();
            ctx.stroke();

            // Draw hold glow fading out
            if (isHeld) {
                ctx.fillStyle = blendTwoColors(colorMap[i], '#101010', blendRatio) + '55';
                ctx.globalAlpha = 1 - blendRatio;
                ctx.beginPath();
                drawNotePath(ctx, x + currentColWidth / 2, hitZoneY, noteSize + 5, noteShape, i);
                ctx.closePath();
                ctx.fill();

                ctx.strokeStyle = blendTwoColors(colorMap[i], '#101010', blendRatio);
                ctx.lineWidth = 10;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        } else {
            ctx.strokeStyle = isHeld ? colorMap[i] : 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            drawNotePath(ctx, x + currentColWidth / 2, hitZoneY, noteSize + 5, noteShape, i);
            ctx.closePath();
            ctx.stroke();

            if (isHeld) {
                ctx.fillStyle = colorMap[i] + '55';
                ctx.fill();

                ctx.strokeStyle = colorMap[i];
                ctx.lineWidth = 10;
                ctx.globalAlpha = 0.4;
                ctx.stroke();

                ctx.lineWidth = 4;
                ctx.globalAlpha = 1.0;
                ctx.stroke();
            }
        }
    }

    // Draw active lasers for Laser Danger mode
    drawLasers(ctx);

    // Draw opponent track on the right side
    if (isTwoPlayer) {

        // Opponent custom username label at top
        ctx.save();
        ctx.font = '900 18px Outfit, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'center';
        const oppName = isLocalCoop ? 'JUGADOR 2' : ((window.onlineMode && window.onlineMode.opponent && window.onlineMode.opponent.name)
            ? window.onlineMode.opponent.name.toUpperCase()
            : 'RIVAL');
        ctx.fillText(oppName, oppStartX + (oppColW * columns) / 2, 35);
        ctx.restore();

        // Draw opponent receiver receptors (same size as local)
        for (let i = 0; i < columns; i++) {
            let x = oppStartX + i * oppColW;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();

            const isHeld = isLocalCoop
                ? window.localMode.p2HeldKeys.has(window.localMode.p2Keys[i])
                : window.onlineMode.opponent.heldKeys.has(i);

            ctx.strokeStyle = isHeld ? colorMap[i] : 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.drawNotePath ? ctx.drawNotePath(ctx, x + oppColW / 2, hitZoneY, oppNSize + 5, noteShape, i) : drawNotePath(ctx, x + oppColW / 2, hitZoneY, oppNSize + 5, noteShape, i);
            ctx.closePath();
            ctx.stroke();

            if (isHeld) {
                ctx.fillStyle = colorMap[i] + '55';
                ctx.fill();

                ctx.strokeStyle = colorMap[i];
                ctx.lineWidth = 10;
                ctx.globalAlpha = 0.4;
                ctx.stroke();

                ctx.lineWidth = 4;
                ctx.globalAlpha = 1.0;
                ctx.stroke();
            }
        }
    }

    const currentFallDuration = fallDuration / window.fallSpeed;
    const currentFallSec = currentFallDuration / 1000;

    // Draw lines and checks
    if (window.audioMap) {
        const mapLen = window.audioMap.length;
        // audioMap is sorted by time — skip far-future notes and cull past ones early
        const maxLookahead = currentFallSec + 0.75;
        for (let i = 0; i < mapLen; i++) {
            const note = window.audioMap[i];
            if (!note) continue;

            const isHold = (note.type === 'hold' || (typeof note.endTime === 'number' && Number.isFinite(note.endTime)));
            const timeUntilHit = note.time - currentTime;
            const timeUntilEnd = isHold ? (note.endTime - currentTime) : null;

            // Past notes that are fully resolved — skip without further work
            if (timeUntilHit < -1.0 && (!isHold || (timeUntilEnd !== null && timeUntilEnd < -1.0))) {
                if (!note.active && note.scored && (!isHold || note.holdJudged)) continue;
            }

            // Future notes not yet on screen — since map is sorted, we can stop
            if (timeUntilHit > maxLookahead) {
                break;
            }

            // Auto-explode notes inside an active laser hitbox at their current screen position
            if (note.active && !note.scored && isLaserActiveOnLane(note.col)) {
                const noteY = timeToY(note.time, currentTime, currentFallSec);
                if (noteY >= 0 && noteY <= canvas.height) {
                    note.scored = true;
                    note.active = false;
                    if (isHold) {
                        note.holdJudged = true;
                    }
                    const noteX = localStartX + note.col * currentColWidth + currentColWidth / 2;
                    spawnParticles(noteX, noteY, colorMap[note.col], 'break');
                    continue;
                }
            }

            // --- GRAY RHYTHM FLASH (EXTREME MODE) ---
            if (timeUntilHit <= 0 && !note.rhythmFlashTriggered) {
                note.rhythmFlashTriggered = true;
                if (window.isExtremeMap && (note.col === 1 || note.col === 3) && !document.body.classList.contains('theme-galaxy')) {
                    const bgOverlay = document.getElementById('red-bg-overlay');
                    if (bgOverlay) {
                        bgOverlay.classList.remove('rhythm-flash');
                        void bgOverlay.offsetWidth;
                        bgOverlay.classList.add('rhythm-flash');
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                bgOverlay.classList.remove('rhythm-flash');
                            });
                        });
                    }
                }
            }

            // --- RECREATIVE SPACE THEME VISUALIZER ---
            if (timeUntilHit <= 0 && !note.recBgTriggered) {
                note.recBgTriggered = true;
                if (document.body.classList.contains('theme-recreative')) {
                    const container = document.getElementById('recreative-figures');
                    if (container) {
                        // Random position generation without overlapping
                        if (!window.recFigPositions) window.recFigPositions = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

                        let safe = false;
                        let rx = 50, ry = 50;
                        let attempts = 0;
                        while (!safe && attempts < 15) {
                            rx = 10 + Math.random() * 80; // 10vw to 90vw
                            ry = 10 + Math.random() * 80; // 10vh to 90vh
                            safe = true;
                            for (let j = 0; j < 4; j++) {
                                if (j === note.col) continue;
                                const other = window.recFigPositions[j];
                                const dx = rx - other.x;
                                const dy = ry - other.y;
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                if (dist < 20) { // 20% viewport distance threshold
                                    safe = false;
                                    break;
                                }
                            }
                            attempts++;
                        }

                        window.recFigPositions[note.col] = { x: rx, y: ry };

                        const shapeClass = note.col === 0 ? 'rec-hexagon' :
                            note.col === 1 ? 'rec-square' :
                                note.col === 2 ? 'rec-circle' : 'rec-triangle';

                        const fig = document.createElement('div');
                        fig.className = `rec-fig ${shapeClass} active`;
                        fig.style.left = rx + 'vw';
                        fig.style.top = ry + 'vh';
                        container.appendChild(fig);

                        // Wait a frame and remove 'active' to trigger smooth CSS transition
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                fig.classList.remove('active');
                            });
                        });

                        // Clean up element after transition finishes
                        setTimeout(() => {
                            if (fig.parentNode) fig.parentNode.removeChild(fig);
                        }, 700);
                    }
                }
            }

            // DYNAMIC MODE FILTERING
            if (note.isDoubleClone && !activeModes.double) {
                if (timeUntilHit < -0.3) {
                    note.scored = true;
                    note.opponentScored = true;
                }
                continue;
            }
            if (note.isUntouchable && !activeModes.untouchable) {
                if (timeUntilHit < -0.3) {
                    note.scored = true;
                    note.opponentScored = true;
                }
                continue;
            }

            const isNoteActiveForLocal = note.active && (!note.scored || (isHold && !note.holdJudged));
            const isNoteActiveForOpponent = isTwoPlayer && note.active && (!note.opponentScored || (isHold && !note.opponentHoldJudged));
            if (!isNoteActiveForLocal && !isNoteActiveForOpponent) continue;

            // --- LOCAL PLAYER NOTE LOGIC & RENDER ---
            if (isNoteActiveForLocal) {
                // --- AUTO-PLAY (BOT MODE) ---
                if (!window.isPaused && isAutoPlay) {
                    if (isHold) {
                        const keyCode = window.userKeys[note.col];
                        if (!note.holdStarted && !note.scored && Math.abs(timeUntilHit) < 0.02) {
                            if (keyCode) heldKeys.add(keyCode);
                            playClickSound();
                            checkHit(note.col);
                        }
                        if (note.holdStarted && !note.holdJudged) {
                            if (keyCode) heldKeys.add(keyCode);
                        }
                        if (note.holdStarted && note.holdJudged) {
                            if (keyCode) heldKeys.delete(keyCode);
                        }
                    } else if (!note.scored && !note.isUntouchable) {
                        if (Math.abs(timeUntilHit) < 0.02) {
                            playClickSound();
                            checkHit(note.col);
                        }
                    }
                }

                // --- MISSES / RESOLUCIÓN (LOCAL) ---
                if (isHold) {
                    if (!window.isPaused && !note.scored && timeUntilHit < -0.3) {
                        note.scored = true;
                        note.holdJudged = true;
                        note.active = false;
                        if (isAutoPlay) {
                            const keyCode = window.userKeys[note.col];
                            if (keyCode) heldKeys.delete(keyCode);
                        }
                        if (isLaserActiveOnLane(note.col)) {
                            updateHealth(-2.0);
                        } else {
                            combo = 0;
                            comboDisplay.innerText = "0";
                            showFeedback('MISS', 'feedback-miss');
                            updateHealth(-8);
                        }

                        if (isOnline && window.onlineMode.conn) {
                            window.onlineMode.conn.send({
                                type: 'hit',
                                col: note.col,
                                diff: 0.3,
                                tier: 'miss',
                                noteTime: note.time
                            });
                            window.onlineMode.conn.send({
                                type: 'state',
                                score: score,
                                combo: combo,
                                health: health
                            });
                        }
                        continue;
                    }

                    if (!window.isPaused && note.holdStarted && !note.holdJudged) {
                        const releaseGrace = 0.07;
                        const remaining = note.endTime - currentTime;
                        if (remaining > releaseGrace && !isColumnHeld(note.col)) {
                            note.holdJudged = true;
                            note.active = false;
                            if (isAutoPlay) {
                                const keyCode = window.userKeys[note.col];
                                if (keyCode) heldKeys.delete(keyCode);
                            }
                            if (isLaserActiveOnLane(note.col)) {
                                updateHealth(-2.0);
                            } else {
                                comboDisplay.innerText = "0";
                                showFeedback('MISS', 'feedback-miss');
                                updateHealth(-10);
                            }

                            if (isOnline && window.onlineMode.conn) {
                                window.onlineMode.conn.send({
                                    type: 'hit',
                                    col: note.col,
                                    diff: 0.3,
                                    tier: 'miss',
                                    noteTime: note.time
                                });
                                window.onlineMode.conn.send({
                                    type: 'state',
                                    score: score,
                                    combo: combo,
                                    health: health
                                });
                            }
                            continue;
                        }

                        if (remaining <= 0) {
                            note.holdJudged = true;
                            note.active = false;
                            if (isAutoPlay) {
                                const keyCode = window.userKeys[note.col];
                                if (keyCode) heldKeys.delete(keyCode);
                            }
                            const diff = (typeof note.holdStartDiff === 'number' && Number.isFinite(note.holdStartDiff))
                                ? note.holdStartDiff
                                : 0.25;
                            applyJudgement(diff, note.col, { showText: false, spawnFx: true });
                            continue;
                        }
                    }

                    // Render hold local
                    if (timeUntilEnd !== null && timeUntilEnd > -0.6 && (timeUntilHit <= currentFallSec || note.holdStarted)) {
                        const x = localStartX + note.col * currentColWidth + currentColWidth / 2;
                        let headY = timeToY(note.time, currentTime, currentFallSec);
                        let tailY = timeToY(note.endTime, currentTime, currentFallSec);

                        if (currentTime >= note.time) headY = hitZoneY;
                        if (currentTime >= note.endTime) tailY = hitZoneY;

                        const clamp = (y) => Math.max(-noteSize, Math.min(canvas.height + noteSize, y));
                        headY = clamp(headY);
                        tailY = clamp(tailY);

                        drawHoldTail(ctx, x, headY, tailY, note.col, isColumnHeld(note.col));
                        drawNoteShape(ctx, x, headY, noteSize, colorMap[note.col], noteShape, note.col);
                    }
                } else {
                    // Tap note local miss & render
                    if (!window.isPaused && !note.scored && timeUntilHit < -0.3) {
                        note.scored = true;
                        if (isLaserActiveOnLane(note.col)) {
                            updateHealth(-2.0);
                        } else {
                            countMiss++;
                            combo = 0;
                            comboDisplay.innerText = "0";
                            showFeedback('MISS', 'feedback-miss');
                            updateHealth(-8);
                        }

                        if (isOnline && window.onlineMode.conn) {
                            window.onlineMode.conn.send({
                                type: 'hit',
                                col: note.col,
                                diff: 0.3,
                                tier: 'miss',
                                noteTime: note.time
                            });
                            window.onlineMode.conn.send({
                                type: 'state',
                                score: score,
                                combo: combo,
                                health: health
                            });
                        }
                    }

                    if (!window.isPaused && timeUntilHit < -0.5) {
                        note.active = false;
                    } else if (timeUntilHit <= currentFallSec && timeUntilHit > -0.5) {
                        const x = localStartX + note.col * currentColWidth + currentColWidth / 2;
                        let y = timeToY(note.time, currentTime, currentFallSec);

                        if (activeModes.nono) {
                            if (!note.randomSpeed) note.randomSpeed = 0.5 + Math.random() * 0.5;
                            y = timeToY(note.time, currentTime, currentFallSec / note.randomSpeed);
                        }

                        ctx.save();
                        let noteColor = note.isUntouchable ? '#ffffff' : colorMap[note.col];
                        drawNoteShape(ctx, x, y, noteSize, noteColor, noteShape, note.col);
                        if (note.isUntouchable) {
                            ctx.globalAlpha = 0.5;
                            ctx.strokeStyle = '#fff';
                            ctx.lineWidth = 8;
                            ctx.stroke();
                        }
                        ctx.restore();
                    }
                }
            }

            // --- OPPONENT PLAYER NOTE LOGIC & RENDER ---
            if (isNoteActiveForOpponent) {
                const oppFallSec = isLocalCoop ? currentFallSec : currentFallSec * 1.35; // Opponent notes fall same speed in local co-op
                if (isHold) {
                    // Miss/Hold release checking for Player 2
                    if (isLocalCoop && note.opponentHoldStarted && !note.opponentHoldJudged) {
                        const releaseGrace = 0.07;
                        const remaining = note.endTime - currentTime;
                        const p2Key = window.localMode.p2Keys[note.col];
                        const isP2Held = window.localMode.p2HeldKeys.has(p2Key);
                        if (remaining > releaseGrace && !isP2Held) {
                            note.opponentHoldJudged = true;
                            note.opponentScored = true;
                            window.localMode.p2Combo = 0;
                            window.localMode.p2CountMiss++;
                            showP2Feedback('MISS', 'feedback-miss');
                            updatePlayer2Health(-10);
                            if (typeof updateLocalCoopHUD === 'function') updateLocalCoopHUD();
                            continue;
                        }
                        if (remaining <= 0) {
                            note.opponentHoldJudged = true;
                            note.opponentScored = true;
                            const diff = (typeof note.opponentHoldStartDiff === 'number' && Number.isFinite(note.opponentHoldStartDiff))
                                ? note.opponentHoldStartDiff
                                : 0.25;
                            applyPlayer2Judgement(diff, note.col, { showText: false, spawnFx: true });
                            continue;
                        }
                    }

                    // Miss del oponente si se pasa
                    if (!note.opponentHoldStarted && timeUntilHit < -0.35) {
                        note.opponentScored = true;
                        if (isLocalCoop) {
                            window.localMode.p2Combo = 0;
                            window.localMode.p2CountMiss++;
                            showP2Feedback('MISS', 'feedback-miss');
                            updatePlayer2Health(-10);
                            if (typeof updateLocalCoopHUD === 'function') updateLocalCoopHUD();
                        } else {
                            window.onlineMode.opponent.combo = 0;
                            if (window.updateOpponentHUD) window.updateOpponentHUD();
                        }
                        continue;
                    }

                    // Render hold oponente
                    if (timeUntilEnd !== null && timeUntilEnd > -0.6 && (timeUntilHit <= oppFallSec || note.opponentHoldStarted)) {
                        const x = oppStartX + note.col * oppColW + oppColW / 2;
                        let headY = timeToY(note.time, currentTime, oppFallSec);
                        let tailY = timeToY(note.endTime, currentTime, oppFallSec);

                        if (currentTime >= note.time) headY = hitZoneY;
                        if (currentTime >= note.endTime) tailY = hitZoneY;

                        const clamp = (y) => Math.max(-oppNSize, Math.min(canvas.height + oppNSize, y));
                        headY = clamp(headY);
                        tailY = clamp(tailY);

                        const isHeld = isLocalCoop
                            ? window.localMode.p2HeldKeys.has(window.localMode.p2Keys[note.col])
                            : window.onlineMode.opponent.heldKeys.has(note.col);
                        drawHoldTail(ctx, x, headY, tailY, note.col, isHeld, oppNSize);

                        ctx.save();
                        ctx.globalAlpha = 0.95;
                        drawNoteShape(ctx, x, headY, oppNSize, colorMap[note.col], noteShape, note.col);
                        ctx.restore();
                    }
                } else {
                    // Tap note opponent miss & render
                    if (timeUntilHit < -0.35) {
                        note.opponentScored = true;
                        if (isLocalCoop) {
                            window.localMode.p2Combo = 0;
                            window.localMode.p2CountMiss++;
                            showP2Feedback('MISS', 'feedback-miss');
                            updatePlayer2Health(-10);
                            if (typeof updateLocalCoopHUD === 'function') updateLocalCoopHUD();
                        } else {
                            window.onlineMode.opponent.combo = 0;
                            if (window.updateOpponentHUD) window.updateOpponentHUD();
                        }
                    } else if (timeUntilHit <= oppFallSec && timeUntilHit > -0.5) {
                        const x = oppStartX + note.col * oppColW + oppColW / 2;
                        let y = timeToY(note.time, currentTime, oppFallSec);

                        if (activeModes.nono) {
                            if (!note.randomSpeed) note.randomSpeed = 0.5 + Math.random() * 0.5;
                            y = timeToY(note.time, currentTime, oppFallSec / note.randomSpeed);
                        }

                        ctx.save();
                        ctx.globalAlpha = 0.95;
                        let noteColor = note.isUntouchable ? '#ffffff' : colorMap[note.col];
                        drawNoteShape(ctx, x, y, oppNSize, noteColor, noteShape, note.col);
                        ctx.restore();
                    }
                }
            }
        }
    }

    // Opponent Floating Canvas Feedback (centered on right half)
    const opponentFeedbackText = isLocalCoop ? window.localMode.p2FeedbackText : (isOnline ? window.onlineMode.opponent.feedbackText : '');
    const opponentFeedbackClass = isLocalCoop ? window.localMode.p2FeedbackClass : (isOnline ? window.onlineMode.opponent.feedbackClass : '');

    if (opponentFeedbackText) {
        const feedbackX = oppStartX + (canvas.width - oppStartX) / 2;
        ctx.save();
        ctx.font = '900 32px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowBlur = 15;
        let color = '#ff4444';
        if (opponentFeedbackClass === 'feedback-perfect') {
            color = '#6366f1';
        } else if (opponentFeedbackClass === 'feedback-good') {
            color = '#10b981';
        }
        ctx.fillStyle = color;
        ctx.shadowColor = color;

        ctx.fillText(opponentFeedbackText, feedbackX, hitZoneY - 60);
        ctx.restore();
    }



    updateAndDrawParticles();
    requestAnimationFrame(drawGame);
}

window.drawReadyState = function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Keep lane alignment in sync with the same origin resizeCanvas uses
    const parent = canvas.parentElement;
    const p1Window = document.getElementById('game-window-p1');
    const p2Window = document.getElementById('game-window-p2');
    if (parent && p1Window) {
        const originLeft = parent.getBoundingClientRect().left;
        const p1Rect = p1Window.getBoundingClientRect();
        localStartX = p1Rect.left - originLeft;
        colWidth = p1Rect.width / columns;
        if (p2Window && !p2Window.classList.contains('hidden')) {
            const p2Rect = p2Window.getBoundingClientRect();
            window._oppStartX = p2Rect.left - originLeft;
            window._oppColWidth = p2Rect.width / columns;
        }
    }

    const isOnline = window.onlineMode && window.onlineMode.active;
    const isLocalCoop = window.localMode && window.localMode.active;
    const isTwoPlayer = isOnline || isLocalCoop;
    const currentColWidth = colWidth;

    // Track metrics
    const oppStartX = window._oppStartX || canvas.width;
    const oppColW = window._oppColWidth || 0;
    const oppNSize = window._oppNoteSize || noteSize;

    // Draw local lanes (left half)
    if (isTwoPlayer) {
        // Local username label at top
        ctx.save();
        ctx.font = '900 18px Outfit, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'center';
        const uInput = document.getElementById('online-username');
        const localName = isLocalCoop ? 'JUGADOR 1' : ((uInput && uInput.value.trim())
            ? uInput.value.trim().toUpperCase()
            : 'TÚ');
        ctx.fillText(localName, localStartX + (currentColWidth * columns) / 2, 35);
        ctx.restore();

        if (isLocalCoop && window.localMode.p1Died) {
            ctx.save();
            ctx.font = '900 36px Outfit, sans-serif';
            ctx.fillStyle = '#ef4444';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 20;
            const p1CenterX = localStartX + (currentColWidth * columns) / 2;
            ctx.fillText('DEATH', p1CenterX, canvas.height - 40);
            ctx.restore();
        }
    }

    for (let i = 0; i < columns; i++) {
        let x = localStartX + i * currentColWidth;

        if (window.currentFileName !== "Lost In Snow.mp3") {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        const blendRatio = getLostInSnowNoteBlendRatio();
        if (blendRatio > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${blendRatio})`;
            ctx.beginPath();
            drawNotePath(ctx, x + currentColWidth / 2, hitZoneY, noteSize + 5, noteShape, i);
            ctx.closePath();
            ctx.fill();

            // Blend border from transparent white to dark grey (#555555)
            const grey = Math.round(255 * (1 - blendRatio) + 85 * blendRatio);
            const a = 0.3 * (1 - blendRatio) + blendRatio * 1.0;

            ctx.strokeStyle = `rgba(${grey}, ${grey}, ${grey}, ${a})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            drawNotePath(ctx, x + currentColWidth / 2, hitZoneY, noteSize + 5, noteShape, i);
            ctx.closePath();
            ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            drawNotePath(ctx, x + currentColWidth / 2, hitZoneY, noteSize + 5, noteShape, i);
            ctx.closePath();
            ctx.stroke();
        }
    }

    // Draw opponent track if online
    if (isTwoPlayer) {

        // Opponent custom username label at top
        ctx.save();
        ctx.font = '900 18px Outfit, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'center';
        const oppName = isLocalCoop ? 'JUGADOR 2' : ((window.onlineMode && window.onlineMode.opponent && window.onlineMode.opponent.name)
            ? window.onlineMode.opponent.name.toUpperCase()
            : 'RIVAL');
        ctx.fillText(oppName, oppStartX + (oppColW * columns) / 2, 35);
        ctx.restore();

        if (isLocalCoop && window.localMode.p2Died) {
            ctx.save();
            ctx.font = '900 36px Outfit, sans-serif';
            ctx.fillStyle = '#ef4444';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 20;
            const p2CenterX = oppStartX + (oppColW * columns) / 2;
            ctx.fillText('DEATH', p2CenterX, canvas.height - 40);
            ctx.restore();
        }

        // Opponent receptors (same size as local)
        for (let i = 0; i < columns; i++) {
            let x = oppStartX + i * oppColW;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            drawNotePath(ctx, x + oppColW / 2, hitZoneY, oppNSize + 5, noteShape, i);
            ctx.closePath();
            ctx.stroke();
        }
    }

    // Render the notes corresponding to their initial spawn position before the song starts
    const currentFallSec = (fallDuration / window.fallSpeed) / 1000;
    let simulatedCurrentTime = -currentFallSec;

    if (window.audioMap) {
        for (let i = 0; i < window.audioMap.length; i++) {
            const note = window.audioMap[i];
            if (!note) continue;

            const isHold = (note.type === 'hold' || (typeof note.endTime === 'number' && Number.isFinite(note.endTime)));
            const timeUntilHit = note.time - simulatedCurrentTime;

            if (timeUntilHit > currentFallSec) continue;

            const clamp = (y) => Math.max(-noteSize, Math.min(canvas.height + noteSize, y));

            // Render local notes
            const xLocal = localStartX + note.col * currentColWidth + currentColWidth / 2;
            if (isHold) {
                const headY = clamp(timeToY(note.time, simulatedCurrentTime, currentFallSec));
                const tailY = clamp(timeToY(note.endTime, simulatedCurrentTime, currentFallSec));
                drawHoldTail(ctx, xLocal, headY, tailY, note.col, false);
                drawNoteShape(ctx, xLocal, headY, noteSize, colorMap[note.col], noteShape, note.col);
            } else {
                const y = clamp(timeToY(note.time, simulatedCurrentTime, currentFallSec));
                drawNoteShape(ctx, xLocal, y, noteSize, colorMap[note.col], noteShape, note.col);
            }

            // Render opponent notes
            if (isOnline) {
                const oppFallSec = currentFallSec * 1.35; // Opponent notes fall 35% slower
                // Re-check early bail-out using the new slower speed for opponent specifically
                if (timeUntilHit <= oppFallSec) {
                    const xOpp = oppStartX + note.col * oppColW + oppColW / 2;
                    ctx.save();
                    ctx.globalAlpha = 0.95;
                    if (isHold) {
                        const headY = clamp(timeToY(note.time, simulatedCurrentTime, oppFallSec));
                        const tailY = clamp(timeToY(note.endTime, simulatedCurrentTime, oppFallSec));
                        drawHoldTail(ctx, xOpp, headY, tailY, note.col, false, oppNSize);
                        drawNoteShape(ctx, xOpp, headY, oppNSize, colorMap[note.col], noteShape, note.col);
                    } else {
                        const y = clamp(timeToY(note.time, simulatedCurrentTime, oppFallSec));
                        drawNoteShape(ctx, xOpp, y, oppNSize, colorMap[note.col], noteShape, note.col);
                    }
                    ctx.restore();
                }
            }
        }
    }
};

function detachAudioEndedHandler() {
    if (!audioSourceNode) return;
    // Keep playing as menu BGM; when it finishes, just clean up (no results screen)
    audioSourceNode.onended = () => {
        audioSourceNode = null;
    };
}

/** End the rhythm game session but optionally keep the song playing as background music. */
function endGameplayKeepMusic() {
    const hadActiveAudio = !!audioSourceNode;
    const wasInSession = window.isPlaying || window.isGameOver || window.isPaused;

    window.isPlaying = false;
    window.isGameOver = false;
    window.isPaused = false;
    window.isPauseTransitioning = false;

    detachAudioEndedHandler();

    // If the game was paused, resume the AudioContext so BGM keeps audible
    if (hadActiveAudio && window.audioContext && window.audioContext.state === 'suspended') {
        window.audioContext.resume().catch(() => {});
    }

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.classList.remove('paused', 'lost-in-snow-active');
    }

    if (btnPauseGame) {
        btnPauseGame.classList.add('hidden');
        btnPauseGame.innerText = '⏸ Pausa / Reanudar (P)';
    }
    if (btnPlayGame && window.audioBuffer && Array.isArray(window.audioMap) && window.audioMap.length) {
        btnPlayGame.classList.remove('hidden');
        if (btnPlayGame.innerText === 'Reintentar' || btnPlayGame.innerText === 'Continuar') {
            btnPlayGame.innerText = 'Jugar';
        }
    }

    if (npWidget) npWidget.classList.remove('show');

    const resultsScreen = document.getElementById('results-screen');
    if (resultsScreen) resultsScreen.classList.add('hidden');

    document.body.classList.remove('extreme-mode', 'flash-miss', 'lost-in-snow-song');
    heldKeys.clear();

    if (wasInSession && typeof toggleModesEnabled === 'function') {
        toggleModesEnabled(true);
    }

    const statusEl = document.getElementById('status-text');
    if (statusEl && wasInSession) {
        statusEl.innerText = hadActiveAudio
            ? 'Música en segundo plano. Importa o juega otra canción para cambiarla.'
            : (statusEl.innerText || '');
    }
}
window.endGameplayKeepMusic = endGameplayKeepMusic;

function stopPreviousAudio() {
    if (audioSourceNode) {
        audioSourceNode.onended = null; // Importante: evitar que el evento 'onended' dispare lógica de fin de juego al detenerlo manualmente
        try {
            audioSourceNode.stop();
            audioSourceNode.disconnect();
        } catch (e) {
            // Ya estaba detenido o no iniciado
        }
        audioSourceNode = null;
    }

    // Resetear estado de pausa
    window.isPaused = false;
    window.isPauseTransitioning = false;
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.classList.remove('paused');
    if (btnPauseGame) btnPauseGame.innerText = '⏸ Pausa / Reanudar (P)';

    // Asegurar que la zona de subida sea visible si queremos cambiar de canción
    if (typeof window.resetUploaderUI === 'function') {
        window.resetUploaderUI(true);
    }

    document.body.classList.remove('extreme-mode', 'flash-miss');
    toggleModesEnabled(true);


}

// Iniciar Partida (Función modular globalizable)
window.startGameplay = async function (customStartTimeDelay = 0) {
    const statusEl = document.getElementById('status-text');

    if (leftPanel) leftPanel.classList.add('collapsed');
    if (themeMenu) themeMenu.classList.add('collapsed');

    const gameContainer = document.getElementById('game-container');
    const isLostInSnow = window.currentFileName === "Lost In Snow.mp3";
    document.body.classList.toggle('lost-in-snow-song', isLostInSnow);
    if (gameContainer) {
        if (isLostInSnow) {
            gameContainer.classList.add('lost-in-snow-active');
        } else {
            gameContainer.classList.remove('lost-in-snow-active');
        }
    }

    if (!window.audioBuffer) {
        if (statusEl) statusEl.innerText = 'Error: No hay audio cargado. Por favor, sube un MP3.';
        console.warn('Play attempt without audioBuffer');
        return;
    }

    if (!Array.isArray(window.audioMap) || window.audioMap.length === 0) {
        if (statusEl) statusEl.innerText = 'No hay notas para jugar. Genera el mapa primero.';
        return;
    }

    // Asegurar que el contexto esté activo
    if (!window.audioContext) {
        window.audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    }

    if (window.audioContext.state === 'suspended') {
        try {
            await window.audioContext.resume();
        } catch (e) {
            console.error('No se pudo reanudar el AudioContext:', e);
        }
    }

    btnPlayGame.classList.add('hidden');
    btnPauseGame.classList.remove('hidden');
    document.getElementById('status-text').innerText = '¡Juego en curso!';

    stopPreviousAudio();

    // Limpiar teclas atascadas del reinicio o pausa anterior
    heldKeys.clear();

    score = 0;
    combo = 0;
    health = 50;
    autoplayUsedThisSession = isAutoPlay;

    toggleModesEnabled(false);
    window.isPaused = false;
    window.isGameOver = false;
    particles = [];
    sandParticles = [];
    rainParticles = [];
    shootingStars = [];
    resetSunflowerStorm();
    lastSandComboTrigger = 0;
    scoreDisplay.innerText = score;
    comboDisplay.innerText = combo;
    updateHealth(0); // init ui

    // Reset Opponent Stats if online
    if (window.onlineMode && window.onlineMode.active) {
        window.onlineMode.opponent.score = 0;
        window.onlineMode.opponent.combo = 0;
        window.onlineMode.opponent.health = 50;
        window.onlineMode.opponent.countPerfect = 0;
        window.onlineMode.opponent.countGreat = 0;
        window.onlineMode.opponent.countOk = 0;
        window.onlineMode.opponent.countMiss = 0;
        window.onlineMode.opponent.heldKeys.clear();
        window.onlineMode.opponent.feedbackText = '';
        if (window.updateOpponentHUD) window.updateOpponentHUD();
    }

    // Reset Local Co-op Stats
    if (window.localMode && window.localMode.active) {
        window.localMode.p2Score = 0;
        window.localMode.p2Combo = 0;
        window.localMode.p2MaxCombo = 0;
        window.localMode.p2Health = 50;
        window.localMode.p1Died = false;
        window.localMode.p2Died = false;
        window.localMode.p2CountPerfect = 0;
        window.localMode.p2CountGreat = 0;
        window.localMode.p2CountOk = 0;
        window.localMode.p2CountMiss = 0;
        window.localMode.p2FeedbackText = '';
        window.localMode.p2FeedbackClass = '';
        window.localMode.p2HeldKeys.clear();
        if (typeof updateLocalCoopHUD === 'function') updateLocalCoopHUD();
    }

    // Ocultar mensaje de dificultad al empezar
    const extremeMsg = document.getElementById('extreme-diff-msg');
    if (extremeMsg) extremeMsg.classList.add('hidden');

    // Hard-reset visual
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (window.audioMap) {
        window.audioMap.forEach(n => {
            n.active = true;
            n.scored = false;
            n.opponentScored = false; // Reset multiplayer scored flag
            n.holdStarted = false;
            n.opponentHoldStarted = false;
            n.holdJudged = false;
            n.holdStartDiff = null;
        });
    }

    let fallSpeed = Number(window.fallSpeed);
    if (!Number.isFinite(fallSpeed) || fallSpeed <= 0) fallSpeed = 1.5;
    const leadInTime = (fallDuration / fallSpeed) / 1000;

    audioSourceNode = window.audioContext.createBufferSource();
    audioSourceNode.buffer = window.audioBuffer;

    // Configurar Analizador para Visualizer (con supresión de ruido)
    if (!analyser) {
        analyser = window.audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.85; // Suavizado para evitar brincos bruscos
        analyser.minDecibels = -85; // Supresión de ruido base (ignora sonidos muy débiles)
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    }

    audioSourceNode.connect(analyser);

    if (!window.musicGainNode && window.audioContext) {
        window.musicGainNode = window.audioContext.createGain();
        window.musicGainNode.connect(window.audioContext.destination);
    }
    const volMusicInputEl = document.getElementById('vol-music');
    window.musicGainNode.gain.value = volMusicInputEl ? parseFloat(volMusicInputEl.value) : 1.0;

    analyser.connect(window.musicGainNode);

    // Calcular Multiplicador de Score (100,000 pts limit)
    const totalMapNotes = (window.audioMap && window.audioMap.length > 0) ? window.audioMap.length : 1;
    window.pointsPerNote = 100000 / totalMapNotes;

    const redBg = document.getElementById('red-bg-overlay');
    if (redBg) redBg.classList.remove('expand-center');

    const isThemedMode = document.body.classList.contains('theme-heaven') ||
        document.body.classList.contains('theme-cyberpunk') ||
        document.body.classList.contains('theme-sunflower') ||
        document.body.classList.contains('theme-city') ||
        document.body.classList.contains('theme-galaxy') ||
        document.body.classList.contains('theme-forest') ||
        document.body.classList.contains('theme-glass');

    // EXTREME MODE BACKGROUND CHECK (Using baseNoteCount to ignore clones on Retry)
    const baseNoteCount = (window.audioMap && window.audioMap.length > 0) ?
        window.audioMap.filter(n => !n.isDoubleClone && !n.isUntouchable).length : 0;

    const duration = window.audioBuffer ? window.audioBuffer.duration : 0;
    if (window.isMapExtreme(baseNoteCount, duration) || !!window.forceSecondaryStyle) {
        document.body.classList.add('extreme-mode');
        window.isExtremeMap = true;
    } else {
        document.body.classList.remove('extreme-mode');
        window.isExtremeMap = false;
    }

    if (window.isExtremeMap) {
        // Set storm rain start time (15s after song begins)
        window.stormRainStartTime = null; // will be set after startTime is known

        const isNaturallyExtreme = window.isMapExtreme(baseNoteCount, duration);
        const luckMsg = document.getElementById('luck-msg');
        if (luckMsg) {
            luckMsg.classList.add('hidden');
            if (isNaturallyExtreme) {
                // Force a clean reflow and animation restart
                requestAnimationFrame(() => {
                    luckMsg.classList.remove('hidden');
                    luckMsg.style.animation = 'none';
                    luckMsg.offsetHeight;
                    luckMsg.style.animation = null;
                });
                setTimeout(() => { luckMsg.classList.add('hidden'); }, 3200);
            }
        }
    }

    // Critical fix: grab exactly one hardware time measurement and base everything off it.
    const startHardwareTime = window.audioContext.currentTime;
    audioSourceNode.start(startHardwareTime + leadInTime + customStartTimeDelay);
    startTime = startHardwareTime + leadInTime + customStartTimeDelay;
    if (window.isExtremeMap) window.stormRainStartTime = startTime + 15;

    window.isPlaying = true;
    window.isGameOver = false;
    window.typewriterTriggered = false;

    // Reset interpolation timers for sub-pixel rendering
    window.lastRawAudioTime = 0;
    window.lastAudioPerfTime = 0;
    window.lastInterpolatedTime = 0;
    window._pausedAtAudioTime = null;
    window._pausedAtSongTime = null;
    window._resumeGraceUntil = 0;

    // Show Now Playing Widget (hidden for Lost In Snow — no title overlay)
    if (npWidget) {
        if (window.currentFileName === "Lost In Snow.mp3") {
            npWidget.classList.remove('show');
        } else {
            if (npSongName) {
                let displayName = window.currentFileName || 'Canción';
                // Quitar extensión si existe
                displayName = displayName.replace(/\.(mp3|wav|mpeg)$/i, '');
                npSongName.innerText = displayName;
            }

            // Asegurar que el thumbnail esté actualizado con la carátula o el CD
            const thumbnailEl = document.getElementById('np-thumbnail');
            if (thumbnailEl) {
                if (window.currentFileCover) {
                    thumbnailEl.style.backgroundImage = 'none';
                    thumbnailEl.innerHTML = `<img src="${window.currentFileCover}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                } else {
                    thumbnailEl.style.backgroundImage = 'none';
                    thumbnailEl.innerHTML = '<div class="np-cd-icon"><div class="np-cd-inner"></div></div>';
                }
            }

            npWidget.classList.add('show');
        }
    }

    // Reset Counters
    score = 0; combo = 0; health = 50;
    if (window.onlineMode) {
        window.onlineMode.opponentDied = false;
        window.onlineMode.localDied = false;
        window.onlineMode.localReadyToRetry = false;
        window.onlineMode.opponentReadyToRetry = false;
    }
    countPerfect = 0; countGreat = 0; countOk = 0; countMiss = 0; maxCombo = 0;
    scoreDisplay.innerText = Math.round(score);
    comboDisplay.innerText = combo;
    updateHealth(0);
    document.getElementById('results-screen').classList.add('hidden');

    resizeCanvas();
    updateActiveModeIcons();

    // Initialize modes at start
    wannaCryTimer = Date.now();
    internetLagTimer = Date.now();
    isInternetLagging = false;
    lastSwapTime = 0;
    nextSwapInterval = 5 + Math.random() * 5;
    activeLasers = [];
    lastLaserTime = 0;
    nextLaserInterval = 4 + Math.random() * 2;

    // Process Double-Double and Special notes (Always pre-generate for dynamic toggling)
    if (window.audioMap) {
        // Clear previous clones if any to avoid exponential growth on retry
        const baseMap = window.audioMap.filter(n => !n.isDoubleClone && !n.isUntouchable);
        const newMap = [];
        baseMap.forEach(n => {
            const cleanNote = { ...n };
            delete cleanNote.recBgTriggered;
            delete cleanNote.rhythmFlashTriggered;
            cleanNote.scored = false;
            cleanNote.holdStarted = false;
            cleanNote.holdJudged = false;
            cleanNote.holdStartDiff = null;
            cleanNote.opponentScored = false;
            cleanNote.opponentHoldStarted = false;
            cleanNote.opponentHoldJudged = false;
            cleanNote.active = true;

            newMap.push({ ...cleanNote, isBase: true });
            // Clone for Double-Double
            newMap.push({ ...cleanNote, col: (cleanNote.col + 1) % 4, isDoubleClone: true });
            // Untouchable note (Re-balanced chance: 15% and multi-lane search)
            if (Math.random() < 0.15) {
                const untTime = cleanNote.time + 0.25;
                const lanesToTry = [(cleanNote.col + 2) % 4, (cleanNote.col + 1) % 4, (cleanNote.col + 3) % 4];

                for (let untCol of lanesToTry) {
                    let isSafe = true;
                    const checkWindow = 0.18; // 180ms minimum gap
                    const searchStart = Math.max(0, baseMap.indexOf(n) - 5);
                    const searchEnd = Math.min(baseMap.length, baseMap.indexOf(n) + 10);

                    for (let j = searchStart; j < searchEnd; j++) {
                        const other = baseMap[j];
                        if (other.col === untCol && Math.abs(other.time - untTime) < checkWindow) {
                            isSafe = false;
                            break;
                        }
                    }

                    if (isSafe) {
                        newMap.push({ ...cleanNote, time: untTime, col: untCol, isUntouchable: true, type: 'tap' });
                        break; // Lane found, stop searching
                    }
                }
            }
        });
        window.audioMap = newMap.sort((a, b) => a.time - b.time);

        // --- Wannacry: Pre-calculate Drop/Break switch points ---
        wannacrySwitchPoints = [];
        wannacryPointIndex = 0;

        if (window.audioMap.length > 10) {
            let avgEnergy = window.audioMap.reduce((sum, n) => sum + (n.rawEnergy || 0), 0) / window.audioMap.length;
            let lastState = 'normal'; // 'quiet', 'normal', 'loud'

            for (let i = 5; i < window.audioMap.length; i++) {
                const energy = window.audioMap[i].rawEnergy || 0;
                let currentState = 'normal';
                if (energy > avgEnergy * 2.0) currentState = 'loud';
                else if (energy < avgEnergy * 0.4) currentState = 'quiet';

                if (currentState !== lastState) {
                    // Significant change detected (Drop or Break)
                    // Ensure at least 3 seconds between switches
                    if (wannacrySwitchPoints.length === 0 || window.audioMap[i].time - wannacrySwitchPoints[wannacrySwitchPoints.length - 1] > 3) {
                        wannacrySwitchPoints.push(window.audioMap[i].time);
                        lastState = currentState;
                    }
                }
            }
        }
    }

    // Set Playback Rate
    let playbackRate = 1.0;
    if (activeModes.slowdown) playbackRate = 0.5;
    if (activeModes.speedup) playbackRate = 1.25;
    audioSourceNode.playbackRate.value = playbackRate;

    requestAnimationFrame(drawGame);
    requestAnimationFrame(drawVisualizer);

    audioSourceNode.onended = () => {
        audioSourceNode = null;
        // Already left to menu / game over with BGM — don't open results again
        if (window.isGameOver || !window.isPlaying) return;

        // Forzar resolución de notas pendientes al terminar el audio
        const endTime = window.audioContext.currentTime - startTime;
        if (Array.isArray(window.audioMap)) {
            for (const note of window.audioMap) {
                if (!note || !note.active) continue;

                const isHold = (note.type === 'hold' || (typeof note.endTime === 'number' && Number.isFinite(note.endTime)));

                if (isHold) {
                    if (note.holdStarted && !note.holdJudged) {
                        const remaining = note.endTime - endTime;
                        if (remaining <= 0.15) {
                            note.holdJudged = true;
                            note.active = false;
                            const diff = (typeof note.holdStartDiff === 'number' && Number.isFinite(note.holdStartDiff))
                                ? note.holdStartDiff
                                : 0.15;
                            applyJudgement(diff, note.col, { showText: false, spawnFx: false, applyHealth: false });
                        } else {
                            note.holdJudged = true;
                            note.active = false;
                            countMiss++;
                            combo = 0;
                        }
                    } else if (!note.scored) {
                        note.scored = true;
                        note.holdJudged = true;
                        note.active = false;
                        countMiss++;
                        combo = 0;
                    }
                } else if (!note.scored) {
                    note.scored = true;
                    note.active = false;
                    countMiss++;
                    combo = 0;
                }
            }
            scoreDisplay.innerText = Math.round(score);
            comboDisplay.innerText = combo;
        }

        window.isPlaying = false;
        if (npWidget) npWidget.classList.remove('show');

        // Notify multiplayer controller
        window.dispatchEvent(new CustomEvent('neonbeat-game-over'));

        // Mostrar Pantalla de Resultados
        setTimeout(() => showResults(), 1000);
    };

    // Show touch controls automatically in mobile layout
    if (document.body.classList.contains('mobile-version') && typeof window.showTouchControls === 'function') {
        window.showTouchControls();
    }
};

btnPlayGame.addEventListener('click', async () => {
    if (window.onlineMode && window.onlineMode.active) {
        if (window.onlineMode.active && window.onlineMode.role === 'host' && window.onlineMode.conn) {
            // Emit start signal with a perfect 1.5s countdown window
            window.onlineMode.conn.send({
                type: 'song-start',
                delayMs: 1500
            });

            // Local Countdown
            let countdownVal = 3;
            const statusEl = document.getElementById('status-text');
            if (statusEl) statusEl.innerHTML = `<span style="font-size: 1.4rem; color: var(--primary); font-weight: 900; text-shadow: 0 0 10px var(--primary);">EMPEZANDO EN ${countdownVal}...</span>`;
            if (typeof window.playUIClick === 'function') window.playUIClick();

            const interval = setInterval(() => {
                countdownVal--;
                if (countdownVal > 0) {
                    if (statusEl) statusEl.innerHTML = `<span style="font-size: 1.4rem; color: var(--primary); font-weight: 900; text-shadow: 0 0 10px var(--primary);">EMPEZANDO EN ${countdownVal}...</span>`;
                    if (typeof window.playUIClick === 'function') window.playUIClick();
                } else {
                    clearInterval(interval);
                }
            }, 500);

            setTimeout(() => {
                window.startGameplay(0);
            }, 1500);
        } else {
            // Block singleplayer start and show notification
            const statusEl = document.getElementById('status-text');
            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#ef4444; font-weight:800; font-size:1.1rem; text-shadow: 0 0 8px rgba(239, 68, 68, 0.4);">⚠️ DEBES ESPERAR A TU RIVAL PARA EMPEZAR</span>`;
                setTimeout(() => {
                    if (statusEl.innerHTML.includes('DEBES ESPERAR')) {
                        statusEl.innerHTML = '';
                    }
                }, 3000);
            }
        }
    } else {
        window.startGameplay(0);
    }
});

window.isPauseTransitioning = false;
async function togglePause() {
    if (!window.isPlaying || window.isGameOver || window.isPauseTransitioning) return;
    if (window.onlineMode && window.onlineMode.active) return; // Disable pause in multiplayer

    window.isPauseTransitioning = true;
    const gameContainer = document.getElementById('game-container');

    try {
        if (window.isPaused) {
            await window.audioContext.resume();

            // Re-sync clocks so a long pause cannot jump song time forward
            // (performance.now() interpolation would otherwise add the whole pause).
            const audioNow = window.audioContext.currentTime;
            if (typeof window._pausedAtAudioTime === 'number') {
                const audioDelta = audioNow - window._pausedAtAudioTime;
                if (audioDelta > 0.0005 && typeof startTime === 'number') {
                    // Some browsers advance currentTime while suspended — shift the song origin
                    startTime += audioDelta;
                }
            }
            window.lastRawAudioTime = audioNow;
            window.lastAudioPerfTime = performance.now();
            if (typeof window._pausedAtSongTime === 'number') {
                window.lastInterpolatedTime = window._pausedAtSongTime;
            }
            // Brief grace so notes aren't mass-missed on the first resumed frames
            window._resumeGraceUntil = performance.now() + 250;
            window._pausedAtAudioTime = null;
            window._pausedAtSongTime = null;

            btnPauseGame.innerText = '⏸ Pausa / Reanudar (P)';
            window.isPaused = false;
            gameContainer.classList.remove('paused');
            requestAnimationFrame(drawGame);
            requestAnimationFrame(drawVisualizer);
            document.getElementById('status-text').innerText = '¡Juego en curso!';
        } else {
            // Freeze song time snapshot before suspending audio
            window._pausedAtSongTime = window.lastInterpolatedTime || 0;
            window._pausedAtAudioTime = window.audioContext ? window.audioContext.currentTime : 0;

            await window.audioContext.suspend();
            btnPauseGame.innerText = '▶ Reanudar (P)';
            window.isPaused = true;
            gameContainer.classList.add('paused');
            document.getElementById('status-text').innerText = 'JUEGO PAUSADO';
        }
    } catch (e) {
        console.error("Pause failure", e);
    } finally {
        window.isPauseTransitioning = false;
    }
}
btnPauseGame.addEventListener('click', togglePause);

// Tab and window swapping will auto-pause exactly out-of-focus
window.addEventListener('blur', () => {
    if (window.onlineMode && window.onlineMode.active) return; // Prevent auto-pause in multiplayer
    if (window.isPlaying && !window.isPaused && !window.isGameOver && !window.isPauseTransitioning) {
        togglePause();
    }
});

// Manejo de Inputs (Hit Detection y GHOST TAPPING)
window.addEventListener('keydown', e => {
    if (e.repeat) return;

    if (activeBindCol !== -1) {
        e.preventDefault();
        window.userKeys[activeBindCol] = e.code;
        let shortName = e.code.replace('Key', '').replace('Arrow', '');
        if (!shortName || shortName.length > 5) shortName = e.key.toUpperCase().substring(0, 3);
        keyBindBtns[activeBindCol].innerText = shortName;
        keyBindBtns[activeBindCol].classList.remove('waiting');
        activeBindCol = -1;
        return;
    }

    if (!window.isPlaying && !btnPlayGame.classList.contains('hidden') && !btnPlayGame.disabled && e.code === 'Space') {
        e.preventDefault();
        btnPlayGame.click();
        return;
    }

    if (window.isPlaying && !window.isGameOver && (e.code === 'Escape' || e.code === 'KeyP' || e.key.toLowerCase() === 'p')) {
        togglePause();
        return;
    }

    if (window.isPaused || !window.isPlaying || window.isGameOver) return;

    // LOCAL COOP INPUTS HANDLING
    if (window.localMode && window.localMode.active) {
        let p1Col = window.localMode.p1Keys.indexOf(e.code);
        if (p1Col !== -1 && !heldKeys.has(e.code)) {
            heldKeys.add(e.code);
            checkHit(p1Col);
        }

        let p2Col = window.localMode.p2Keys.indexOf(e.code);
        if (p2Col !== -1 && !window.localMode.p2HeldKeys.has(e.code)) {
            window.localMode.p2HeldKeys.add(e.code);
            checkPlayer2Hit(p2Col);
        }
        return;
    }

    let col = window.userKeys.indexOf(e.code);
    if (col === -1) {
        const arrowIdx = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'].indexOf(e.code);
        if (arrowIdx !== -1) col = arrowIdx;
    }
    const keyIndex = e.code;

    if (col !== -1 && !heldKeys.has(keyIndex)) {
        heldKeys.add(keyIndex);
        checkHit(col);

        if (window.onlineMode && window.onlineMode.active && window.onlineMode.conn) {
            window.onlineMode.conn.send({
                type: 'keydown',
                col: col
            });
        }
    }
});

window.addEventListener('keyup', e => {
    // LOCAL COOP INPUTS HANDLING
    if (window.localMode && window.localMode.active) {
        if (heldKeys.has(e.code)) {
            heldKeys.delete(e.code);
        }
        if (window.localMode.p2HeldKeys.has(e.code)) {
            window.localMode.p2HeldKeys.delete(e.code);
        }
        return;
    }

    const keyIndex = e.code;
    let col = window.userKeys.indexOf(e.code);
    if (col === -1) {
        const arrowIdx = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'].indexOf(e.code);
        if (arrowIdx !== -1) col = arrowIdx;
    }

    if (heldKeys.has(keyIndex)) {
        heldKeys.delete(keyIndex);

        if (window.onlineMode && window.onlineMode.active && window.onlineMode.conn && col !== -1) {
            window.onlineMode.conn.send({
                type: 'keyup',
                col: col
            });
        }
    }
});


function getTimingFeedback(diff) {
    if (diff <= 0.08) return { css: 'feedback-perfect', tier: 'perfect' };
    if (diff <= 0.14) return { css: 'feedback-good', tier: 'great' };
    if (diff <= 0.20) return { css: 'feedback-good', tier: 'ok' };
    return { css: 'feedback-miss', tier: 'bad' };
}

function applyJudgement(diff, col, options = {}) {
    const showText = options.showText !== false;
    const spawnFx = options.spawnFx !== false;
    const applyHealth = options.applyHealth !== false;

    let pText = '';
    let pClass = '';

    if (diff <= 0.08) {
        score += window.pointsPerNote;
        combo++;
        countPerfect++;
        pText = 'PERFECT'; pClass = 'feedback-perfect';
        if (spawnFx) {
            spawnParticles(localStartX + col * colWidth + colWidth / 2, hitZoneY, colorMap[col], splashStyle);
            if (!isAutoPlay) playClickSound(); // AutoPlay already plays it on its own logic
        }
        if (applyHealth) updateHealth(2);
    } else if (diff <= 0.14) {
        score += window.pointsPerNote * 0.8;
        combo++;
        countGreat++;
        pText = 'GREAT'; pClass = 'feedback-good';
        if (spawnFx) {
            if (splashStyle === 'stars' || splashStyle === 'sparks') spawnParticles(localStartX + col * colWidth + colWidth / 2, hitZoneY, colorMap[col], splashStyle);
            if (!isAutoPlay) playClickSound();
        }
        if (applyHealth) updateHealth(1);
    } else if (diff <= 0.20) {
        score += window.pointsPerNote * 0.5;
        combo++;
        countOk++;
        pText = 'OK'; pClass = 'feedback-good';
        if (spawnFx && !isAutoPlay) playClickSound();
        if (applyHealth) updateHealth(0.5);
    } else {
        countMiss++;
        combo = 0;
        pText = 'BAD'; pClass = 'feedback-miss';
        if (applyHealth) {
            let penalty = -5;
            if (activeModes.untouchable && options.isUntouchable) penalty = -30; // Double penalty (from -15 to -30)
            updateHealth(penalty);
        }
    }

    if (combo > maxCombo) maxCombo = combo;

    scoreDisplay.innerText = Math.round(score);
    comboDisplay.innerText = combo;
    if (window.localMode && window.localMode.active) {
        if (typeof updateLocalCoopHUD === 'function') updateLocalCoopHUD();
    }
    if (showText) showFeedback(pText, pClass);

    // Shooting star effect for Sand Night mode
    if (diff <= 0.20 && spawnFx) {
        const isSandNight = document.body.classList.contains('theme-cyberpunk') && window.isPlaying && !window.isGameOver && !!window.isExtremeMap;
        if (isSandNight) spawnShootingStar();
    }

    return { text: pText, css: pClass };
}

function checkHit(columnClicked) {
    if (!window.isPlaying || window.isGameOver) return;
    if (window.localMode && window.localMode.active && window.localMode.p1Died) return;

    // Laser Danger active check
    if (isLaserActiveOnLane(columnClicked)) {
        showFeedback('LASER!', 'feedback-miss');
        playHollowLaserHit();
        if (health > 1) {
            updateHealth(1 - health); // Set health exactly to 1
        } else {
            updateHealth(-10); // Die
        }
        return;
    }

    const currentTime = window.audioContext.currentTime - startTime - (window.audioOffset || 0);
    let hitWindow = 0.25;

    // Easier / Harder Hitbox
    if (activeModes.easier) hitWindow = 0.35;
    if (activeModes.harder) hitWindow = 0.15;

    let closestNote = null;
    let closestDiff = Infinity;

    for (let i = 0; i < window.audioMap.length; i++) {
        let note = window.audioMap[i];

        // DYNAMIC MODE FILTERING
        if (note.isDoubleClone && !activeModes.double) continue;
        if (note.isUntouchable && !activeModes.untouchable) continue;

        // Nota viva en esa columna, que no haya marcado
        if (note.active && !note.scored && note.col === columnClicked) {
            let diff = Math.abs(note.time - currentTime);
            if (diff < closestDiff && (note.time - currentTime > -hitWindow)) {
                closestDiff = diff;
                closestNote = note;
            }
        }
    }

    if (closestNote && closestDiff <= hitWindow) {
        const isHold = (closestNote.type === 'hold' || (typeof closestNote.endTime === 'number' && Number.isFinite(closestNote.endTime)));

        if (isHold) {
            closestNote.scored = true;
            closestNote.holdStarted = true;
            closestNote.holdJudged = false;
            closestNote.holdStartDiff = closestDiff;

            const timing = getTimingFeedback(closestDiff);
            showFeedback('HOLD', timing.css);
            if (timing.tier === 'perfect' || timing.tier === 'great') {
                spawnParticles(localStartX + closestNote.col * colWidth + colWidth / 2, hitZoneY, colorMap[closestNote.col], splashStyle);
            }

            if (window.onlineMode && window.onlineMode.active && window.onlineMode.conn) {
                window.onlineMode.conn.send({
                    type: 'hold-start',
                    col: closestNote.col,
                    noteTime: closestNote.time
                });
                window.onlineMode.conn.send({
                    type: 'state',
                    score: score,
                    combo: combo,
                    health: health
                });
            }
            return;
        }

        closestNote.active = false;
        closestNote.scored = true;

        // If it was untouchable, it's a massive fail
        if (closestNote.isUntouchable) {
            countMiss++;
            combo = 0;
            showFeedback('UNTOUCHABLE!', 'feedback-miss');
            updateHealth(-50); // Double fail penalty (from -25 to -50)

            if (window.onlineMode && window.onlineMode.active && window.onlineMode.conn) {
                window.onlineMode.conn.send({
                    type: 'hit',
                    col: closestNote.col,
                    diff: closestDiff,
                    tier: 'miss',
                    noteTime: closestNote.time
                });
                window.onlineMode.conn.send({
                    type: 'state',
                    score: score,
                    combo: combo,
                    health: health
                });
            }
            return;
        }

        const jud = applyJudgement(closestDiff, closestNote.col, {
            showText: true,
            spawnFx: true,
            isUntouchable: closestNote.isUntouchable
        });

        if (window.onlineMode && window.onlineMode.active && window.onlineMode.conn) {
            window.onlineMode.conn.send({
                type: 'hit',
                col: closestNote.col,
                diff: closestDiff,
                tier: jud.text.toLowerCase(),
                noteTime: closestNote.time
            });
            window.onlineMode.conn.send({
                type: 'state',
                score: score,
                combo: combo,
                health: health
            });
        }

    } else {
        // GHOST TAPPING
        countMiss++;
        combo = 0;
        comboDisplay.innerText = combo;
        showFeedback('MISS', 'feedback-miss');
        updateHealth(-10);

        if (window.onlineMode && window.onlineMode.active && window.onlineMode.conn) {
            window.onlineMode.conn.send({
                type: 'hit',
                col: columnClicked,
                diff: 0.3,
                tier: 'miss',
                noteTime: -1
            });
            window.onlineMode.conn.send({
                type: 'state',
                score: score,
                combo: combo,
                health: health
            });
        }
    }
}

let feedbackTimeout;
function showFeedback(text, cssClass) {
    if (!hitFeedback) return;

    hitFeedback.innerText = text;
    hitFeedback.className = 'feedback-text ' + cssClass;
    void hitFeedback.offsetWidth;
    hitFeedback.classList.add('show');

    clearTimeout(feedbackTimeout);
    const holdMs = (cssClass === 'feedback-death') ? 1100 : 500;
    feedbackTimeout = setTimeout(() => {
        hitFeedback.classList.remove('show');
    }, holdMs);
}

window.updateRetryStatusUI = function () {
    const statusEl = document.getElementById('mp-retry-status');
    if (!statusEl) return;

    if (window.onlineMode && window.onlineMode.active) {
        const localReady = window.onlineMode.localReadyToRetry;
        const oppReady = window.onlineMode.opponentReadyToRetry;

        if (localReady && oppReady) {
            statusEl.innerText = '¡AMBOS LISTOS! INICIANDO... (2/2)';
            statusEl.style.color = '#34d399';
            statusEl.style.textShadow = '0 0 10px rgba(52, 211, 153, 0.6)';
        } else if (localReady) {
            statusEl.innerText = 'ESPERANDO AL RIVAL... (1/2)';
            statusEl.style.color = '#fbbf24';
            statusEl.style.textShadow = '0 0 10px rgba(251, 191, 36, 0.6)';
        } else if (oppReady) {
            const oppName = window.onlineMode.opponent.name || 'EL RIVAL';
            statusEl.innerText = `¡${oppName.toUpperCase()} QUIERE REINTENTAR! (1/2)`;
            statusEl.style.color = '#60a5fa';
            statusEl.style.textShadow = '0 0 10px rgba(96, 165, 250, 0.6)';
        } else {
            statusEl.innerText = '';
        }
    } else {
        statusEl.innerText = '';
    }
};

window.checkBothReadyToRetry = function () {
    if (window.onlineMode && window.onlineMode.active) {
        if (window.onlineMode.localReadyToRetry && window.onlineMode.opponentReadyToRetry) {
            // Both ready! Hide results and start countdown!
            setTimeout(() => {
                const resultsScreen = document.getElementById('results-screen');
                if (resultsScreen) resultsScreen.classList.add('hidden');
                document.body.classList.remove('extreme-mode', 'flash-miss');

                if (window.onlineMode.role === 'host') {
                    const playBtn = document.getElementById('btn-play');
                    if (playBtn) playBtn.click();
                }
            }, 1000); // 1s delay to let the user see the (2/2) status
        }
    }
};

window.handleLocalRetryClick = function () {
    if (window.onlineMode && window.onlineMode.active) {
        window.onlineMode.localReadyToRetry = true;

        // Visual update on retry buttons
        const rBtn = document.getElementById('btn-results-retry');
        if (rBtn) {
            rBtn.disabled = true;
            rBtn.style.opacity = '0.6';
            rBtn.style.cursor = 'not-allowed';
            rBtn.innerText = 'Listo ✔';
        }

        // Send ready state to opponent
        if (window.onlineMode.conn) {
            window.onlineMode.conn.send({
                type: 'retry-ready',
                ready: true
            });
        }

        if (window.updateRetryStatusUI) window.updateRetryStatusUI();
        if (window.checkBothReadyToRetry) window.checkBothReadyToRetry();
    } else {
        // Singleplayer: restart instantly
        document.getElementById('results-screen').classList.add('hidden');
        btnPlayGame.click();
    }
};

// RESULTADOS FINALES Y RANGOS
function showResults() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.classList.remove('lost-in-snow-active');
    document.body.classList.remove('lost-in-snow-song');

    const totalNotes = window.audioMap ? window.audioMap.length : 0;

    // Accuracy based on judged notes
    const totalJudged = countPerfect + countGreat + countOk + countMiss;
    const accuracy = totalJudged > 0
        ? ((countPerfect * 1.0 + countGreat * 0.8 + countOk * 0.5) / totalJudged) * 100
        : 0;

    let rank = 'C';
    let rankClass = 'rank-C';

    // Rangos por cantidad de fallos (MISS)
    if (countMiss <= 0) {
        rank = 'SS'; rankClass = 'rank-SS';
    } else if (countMiss <= 2) {
        rank = 'S++'; rankClass = 'rank-Spp';
    } else if (countMiss <= 5) {
        rank = 'S+'; rankClass = 'rank-Sp';
    } else if (countMiss <= 8) {
        rank = 'S'; rankClass = 'rank-S';
    } else if (countMiss <= 12) {
        rank = 'A'; rankClass = 'rank-A';
    } else if (countMiss <= 20) {
        rank = 'B'; rankClass = 'rank-B';
    } else {
        rank = 'C'; rankClass = 'rank-C';
    }

    // Calculate and apply points
    const hasFailed = health <= 0 || (window.localMode && window.localMode.active && window.localMode.p1Died) || (window.onlineMode && window.onlineMode.active && window.onlineMode.localDied);
    const usedAutoplay = isAutoPlay || autoplayUsedThisSession;

    let mult = 1.0;
    let heavenActive = false;
    if (activeModes.easier || activeModes.nodeath || activeModes.slowdown) {
        mult = 0.0;
        heavenActive = true;
    } else {
        if (activeModes.harder) mult += 0.05;
        if (activeModes.healthdrain) mult += 0.08;
        if (activeModes.speedup) mult += 0.10;
        if (activeModes.nono) mult += 0.20;
        if (activeModes.untouchable) mult += 0.12;
        if (activeModes.internet) mult += 0.30;
        if (activeModes.double) mult += 0.70;
        if (activeModes.swapinout) mult += 0.10;
        if (activeModes.laser) mult += 0.14;
        if (activeModes.wannacry) mult += 1.20;
    }

    let earnedPoints = 0;
    let pointsDisplayHTML = '';

    if (usedAutoplay) {
        earnedPoints = 0;
        pointsDisplayHTML = `
            <strong style="font-size: 1.2rem; color: #9ca3af; display: block; margin: 4px 0;">
                0 PTS (AUTOPLAY)
            </strong>
            <span style="font-size: 0.75rem; color: #ef4444; display: block; margin-top: 2px;">
                El modo Autoplay no otorga puntos
            </span>
        `;
    } else if (hasFailed) {
        earnedPoints = 0;
        pointsDisplayHTML = `
            <strong style="font-size: 1.2rem; color: #ef4444; display: block; margin: 4px 0;">
                0 PTS (FALLIDO)
            </strong>
            <span style="font-size: 0.75rem; color: #ef4444; display: block; margin-top: 2px;">
                No se otorgan puntos al morir
            </span>
        `;
    } else if (heavenActive) {
        earnedPoints = 0;
        pointsDisplayHTML = `
            <strong style="font-size: 1.2rem; color: #3b82f6; display: block; margin: 4px 0;">
                0 PTS (HEAVEN)
            </strong>
            <span style="font-size: 0.75rem; color: #9ca3af; display: block; margin-top: 2px;">
                Los modos Heaven no otorgan puntos
            </span>
        `;
    } else {
        const basePoints = calculatePoints(rank, totalNotes);
        earnedPoints = Math.round(basePoints * mult);
        pointsDisplayHTML = `
            <strong style="font-size: 1.35rem; color: ${earnedPoints >= 0 ? '#10b981' : '#ef4444'};">
                ${earnedPoints >= 0 ? '+' : ''}${earnedPoints} PTS
            </strong>
            ${mult !== 1.0 ? `
            <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 2px;">
                Multiplicador: x${mult.toFixed(2)}
            </span>
            ` : ''}
        `;
    }

    const updatedPointsInfo = addPlayerPoints(earnedPoints);

    // Default Singleplayer Results Content
    const resultsContentEl = document.querySelector('.results-content');
    if (resultsContentEl) {
        resultsContentEl.innerHTML = `
            <h2 class="results-title">RESULTADOS</h2>
            <div class="results-main">
                <div id="result-rank" class="result-rank ${rankClass}">${rank}</div>
                <div class="results-stats">
                    <div class="stat-row"><span class="stat-label">PERFECT</span><span id="res-perfect" class="stat-value color-perfect">${countPerfect}</span></div>
                    <div class="stat-row"><span class="stat-label">GREAT</span><span id="res-great" class="stat-value color-great">${countGreat}</span></div>
                    <div class="stat-row"><span class="stat-label">OK</span><span id="res-ok" class="stat-value color-ok">${countOk}</span></div>
                    <div class="stat-row"><span class="stat-label">MISS</span><span id="res-miss" class="stat-value color-miss">${countMiss}</span></div>
                </div>
            </div>
            <div class="results-footer">
                <div class="footer-item">
                    <span class="footer-label">COMBO MÁXIMO</span>
                    <span id="res-max-combo" class="footer-value">${maxCombo}</span>
                </div>
                <div class="footer-item">
                    <span class="footer-label">PUNTUACIÓN TOTAL</span>
                    <span id="res-score" class="footer-value">${Math.round(score)}</span>
                </div>
            </div>
            <div class="results-points-display" style="text-align: center; margin: 15px 0 5px 0; padding: 12px; background: rgba(0, 0, 0, 0.25); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="font-size: 0.8rem; color: var(--text-muted); display: block; text-transform: uppercase; letter-spacing: 0.5px;">Evolución de Puntos</span>
                ${pointsDisplayHTML}
                <span style="font-size: 0.85rem; color: var(--text-muted); display: block; margin-top: 3px;">
                    Total actual: <strong style="color: #fff;">${updatedPointsInfo.total} pts</strong> (<span style="color: var(--primary); font-weight: bold;">${getTierName(updatedPointsInfo.total)}</span>)
                </span>
            </div>
            <div class="results-actions">
                <button id="btn-results-retry" class="btn-success">REINTENTAR</button>
            </div>
        `;
    }

    // Dynamic Multiplayer / Local Coop head-to-head injection
    if ((window.onlineMode && window.onlineMode.active) || (window.localMode && window.localMode.active)) {
        const isLocal = window.localMode && window.localMode.active;
        const oppScoreVal = isLocal ? window.localMode.p2Score : window.onlineMode.opponent.score;
        const oppComboVal = isLocal ? window.localMode.p2MaxCombo : (window.onlineMode.opponent.maxCombo || window.onlineMode.opponent.combo);
        const oppPerfect = isLocal ? window.localMode.p2CountPerfect : window.onlineMode.opponent.countPerfect;
        const oppGreat = isLocal ? window.localMode.p2CountGreat : window.onlineMode.opponent.countGreat;
        const oppOk = isLocal ? window.localMode.p2CountOk : window.onlineMode.opponent.countOk;
        const oppMiss = isLocal ? window.localMode.p2CountMiss : window.onlineMode.opponent.countMiss;
        const oppName = isLocal ? 'JUGADOR 2' : (window.onlineMode.opponent.name || 'RIVAL');

        // Calculate opponent accuracy
        const totalOppJudged = oppPerfect + oppGreat + oppOk + oppMiss;
        const oppAccuracy = totalOppJudged > 0
            ? ((oppPerfect * 1.0 + oppGreat * 0.8 + oppOk * 0.5) / totalOppJudged) * 100
            : 0;

        let oppRank = 'C';
        let oppRankClass = 'rank-C';
        if (oppMiss <= 0) { oppRank = 'SS'; oppRankClass = 'rank-SS'; }
        else if (oppMiss <= 2) { oppRank = 'S++'; oppRankClass = 'rank-Spp'; }
        else if (oppMiss <= 5) { oppRank = 'S+'; oppRankClass = 'rank-Sp'; }
        else if (oppMiss <= 8) { oppRank = 'S'; oppRankClass = 'rank-S'; }
        else if (oppMiss <= 12) { oppRank = 'A'; oppRankClass = 'rank-A'; }
        else if (oppMiss <= 20) { oppRank = 'B'; oppRankClass = 'rank-B'; }
        else { oppRank = 'C'; oppRankClass = 'rank-C'; }

        let isWinner = score >= oppScoreVal;
        if (!isLocal && window.onlineMode && window.onlineMode.opponentDied) {
            isWinner = true;
        } else if (!isLocal && window.onlineMode && window.onlineMode.localDied) {
            isWinner = false;
        }

        let resultBannerText = isWinner ? "¡VICTORIA!" : "¡DERROTA!";
        if (isLocal) {
            if (score > oppScoreVal) {
                resultBannerText = "¡JUGADOR 1 GANA!";
            } else if (score < oppScoreVal) {
                resultBannerText = "¡JUGADOR 2 GANA!";
            } else {
                resultBannerText = "¡EMPATE!";
            }
        }
        const resultBannerClass = isLocal ? "winner-banner" : (isWinner ? "winner-banner" : "loser-banner");

        if (resultsContentEl) {
            resultsContentEl.innerHTML = `
                <div class="mp-results-header ${resultBannerClass}">${resultBannerText}</div>
                <div class="mp-results-versus-layout">
                    <!-- Player 1 -->
                    <div class="mp-results-column left ${(isLocal ? (score >= oppScoreVal) : isWinner) ? 'winner-card' : ''}">
                        <h3 class="mp-col-title">${isLocal ? 'JUGADOR 1' : 'TÚ'}</h3>
                        <div class="mp-col-rank ${rankClass}">${rank}</div>
                        <div class="mp-col-accuracy">${accuracy.toFixed(1)}% ACC</div>
                        <div style="font-size: 0.8rem; text-align: center; margin: 6px 0; color: ${earnedPoints >= 0 ? '#10b981' : '#ef4444'}; font-weight: 700;">
                            ${earnedPoints >= 0 ? '+' : ''}${earnedPoints} PTS (Total: ${updatedPointsInfo.total} pts)
                        </div>
                        <div class="mp-stats-list">
                            <div class="mp-stat-item"><span class="mp-label">Puntos:</span> <span class="mp-val">${Math.round(score)}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Max Combo:</span> <span class="mp-val">${maxCombo}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Perfects:</span> <span class="mp-val color-perfect">${countPerfect}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Greats:</span> <span class="mp-val color-great">${countGreat}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Oks:</span> <span class="mp-val color-ok">${countOk}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Misses:</span> <span class="mp-val color-miss">${countMiss}</span></div>
                        </div>
                    </div>
                    
                    <!-- Versus Separator -->
                    <div class="mp-results-vs">VS</div>
                    
                    <!-- Player 2 -->
                    <div class="mp-results-column right ${(isLocal ? (oppScoreVal >= score) : !isWinner) ? 'winner-card' : ''}">
                        <h3 class="mp-col-title">${oppName}</h3>
                        <div class="mp-col-rank ${oppRankClass}">${oppRank}</div>
                        <div class="mp-col-accuracy">${oppAccuracy.toFixed(1)}% ACC</div>
                        <div class="mp-stats-list">
                            <div class="mp-stat-item"><span class="mp-label">Puntos:</span> <span class="mp-val">${Math.round(oppScoreVal)}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Max Combo:</span> <span class="mp-val">${oppComboVal}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Perfects:</span> <span class="mp-val color-perfect">${oppPerfect}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Greats:</span> <span class="mp-val color-great">${oppGreat}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Oks:</span> <span class="mp-val color-ok">${oppOk}</span></div>
                            <div class="mp-stat-item"><span class="mp-label">Misses:</span> <span class="mp-val color-miss">${oppMiss}</span></div>
                        </div>
                    </div>
                </div>
                
                <div id="mp-retry-status" class="mp-retry-status"></div>
                <div class="results-actions" style="margin-top: 1.5rem;">
                    <button id="btn-results-retry" class="btn-success">REINTENTAR</button>
                </div>
            `;
        }
    }

    // Re-bind listeners for button actions (since innerHTML replacement erases original listeners)
    const btnRetry = document.getElementById('btn-results-retry');
    if (btnRetry) {
        btnRetry.addEventListener('click', () => {
            if (typeof window.handleLocalRetryClick === 'function') {
                window.handleLocalRetryClick();
            }
        });
    }

    if (window.updateRetryStatusUI) window.updateRetryStatusUI();
    document.getElementById('results-screen').classList.remove('hidden');

    // Al finalizar, permitir volver a jugar o subir otra
    btnPlayGame.innerText = 'Rejugar';
    btnPlayGame.classList.remove('hidden');
    btnPauseGame.classList.add('hidden');

    toggleModesEnabled(true);
}

// Botones de Resultados
document.getElementById('btn-results-retry').addEventListener('click', () => {
    if (typeof window.handleLocalRetryClick === 'function') {
        window.handleLocalRetryClick();
    }
});

// Continuar button removed


// BARRAS DE FONDO SIMÉTRICAS (TOTAL BACKGROUND VISUALIZER)
let _vizPrimaryColor = null;
let _vizPrimaryColorAt = 0;
function drawVisualizer() {
    if (!showVisualizer || !window.isPlaying || window.isPaused || window.isGameOver) return;

    if (window.currentFileName === "Lost In Snow.mp3") {
        vCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        requestAnimationFrame(drawVisualizer);
        return;
    }

    requestAnimationFrame(drawVisualizer);
    analyser.getByteFrequencyData(dataArray);

    vCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

    // Dibujo Simétrico: Barras desde el centro hacia afuera
    const halfWidth = visualizerCanvas.width / 2;
    const barWidth = halfWidth / (bufferLength * 0.8); // Ajustar para cubrir mejor
    let barHeight;

    // Cache CSS variable — getComputedStyle every bar was extremely expensive
    const now = performance.now();
    if (!_vizPrimaryColor || now - _vizPrimaryColorAt > 1000) {
        _vizPrimaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#6366f1';
        _vizPrimaryColorAt = now;
    }
    const primaryColor = _vizPrimaryColor;

    for (let i = 0; i < bufferLength; i++) {
        // --- SUPRESIÓN DE RUIDO MANUAL ---
        // Si el valor es muy bajo (ruido de fondo), lo forzamos a 0
        let val = dataArray[i];
        if (val < 15) val = 0;
        else val = (val - 15) * 1.1; // Re-escalar para mantener la fuerza

        barHeight = (val / 255) * visualizerCanvas.height * 0.45;

        const gradient = vCtx.createLinearGradient(0, visualizerCanvas.height, 0, visualizerCanvas.height - barHeight);
        gradient.addColorStop(0, `${primaryColor}0D`); // 0.05 alpha
        gradient.addColorStop(0.5, `${primaryColor}33`); // 0.2 alpha
        gradient.addColorStop(1, `${primaryColor}80`); // 0.5 alpha
        vCtx.fillStyle = gradient;

        // Derecha
        vCtx.fillRect(halfWidth + (i * barWidth), visualizerCanvas.height - barHeight, barWidth - 1, barHeight);
        // Izquierda (Espejo)
        vCtx.fillRect(halfWidth - (i * barWidth) - barWidth, visualizerCanvas.height - barHeight, barWidth - 1, barHeight);
    }
}

// THEME SYSTEM LOGIC
if (btnThemeMenu) {
    btnThemeMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        if (themeMenu) themeMenu.classList.toggle('collapsed');
        void (themeMenu && themeMenu.offsetWidth);
        if (typeof resizeCanvas === 'function') resizeCanvas({ soft: true });
        if (!window.isPlaying && typeof window.drawReadyState === 'function') {
            window.drawReadyState();
        }
    });
}

const btnForceSecondary = document.getElementById('btn-force-secondary');
if (btnForceSecondary) {
    btnForceSecondary.addEventListener('click', () => {
        window.forceSecondaryStyle = !window.forceSecondaryStyle;
        btnForceSecondary.classList.toggle('active', window.forceSecondaryStyle);
        saveSettings();



        // Re-initialize theme assets immediately to update their state/speed
        const activeTheme = Array.from(document.body.classList).find(c => c.startsWith('theme-')) || 'default';
        const themeId = activeTheme.replace('theme-', '');
        if (themeId === 'forest') {
            initForest();
        } else if (themeId === 'heaven') {
            initClouds();
        } else if (themeId === 'cyberpunk') {
            initPyramids();
            initDunes();
        } else if (themeId === 'sunflower') {
            resetSunflowerStorm();
            initSunflowers(true);
        } else if (themeId === 'city') {
            initCityBuildings();
        } else if (themeId === 'galaxy') {
            initGalaxyTheme();
        }
    });
}

// Remove the global document click listener as the sidebar is now persistent

themeOpts.forEach(opt => {
    opt.addEventListener('click', () => {
        const theme = opt.dataset.theme;

        // Remove current themes
        document.body.classList.remove('theme-heaven', 'theme-cyberpunk', 'theme-sunflower', 'theme-recreative', 'theme-city', 'theme-galaxy', 'theme-forest', 'theme-glass');
        themeOpts.forEach(o => o.classList.remove('active'));

        // Apply new theme
        if (theme !== 'default') {
            document.body.classList.add(`theme-${theme}`);
        }
        opt.classList.add('active');

        // Reset scroll variables for glass theme
        glassScrollX = 0;
        glassScrollY = 0;
        glassPatternCanvas = null;
        glassPattern = null;

        // Reset all theme particle systems
        sandParticles = [];
        rainParticles = [];
        shootingStars = [];
        resetSunflowerStorm();
        roadCars = [];
        lastSandComboTrigger = 0;
        galaxyStars = [];
        galaxyPlanets = [];
        galaxyStructures = [];
        galaxyDust = [];
        sunExplosionParticles = [];
        sunExplodedTriggered = false;
        galaxyNebulaRotation = 0;
        forestLayers = [];
        forestSnowParticles = [];
        forestDustParticles = [];

        // Re-init background arrays depending on selected theme
        if (theme === 'heaven') initClouds();
        if (theme === 'cyberpunk') { initPyramids(); initDunes(); }
        if (theme === 'sunflower') initSunflowers(true);
        if (theme === 'city') initCityBuildings();
        if (theme === 'galaxy') initGalaxyTheme();
        if (theme === 'forest') initForest();
        if (theme === 'glass') initGlassTheme();

        const recFigCont = document.getElementById('recreative-figures');
        if (recFigCont) {
            if (theme === 'recreative') recFigCont.classList.remove('hidden');
            else recFigCont.classList.add('hidden');
        }

        // Update colorMap based on new CSS variables
        updateColorMapFromCSS();
        saveSettings();
    });
});

function updateColorMapFromCSS() {
    const style = getComputedStyle(document.body);
    window.colorMap = [
        style.getPropertyValue('--color-lane-1').trim(),
        style.getPropertyValue('--color-lane-2').trim(),
        style.getPropertyValue('--color-lane-3').trim(),
        style.getPropertyValue('--color-lane-4').trim()
    ];
}

// Initial sync
updateColorMapFromCSS();

// ============================================================
// THEME BACKGROUND ENGINE — v2 (Realistic Parallax Clouds)
// ============================================================
const themeCanvas = document.getElementById('theme-canvas');
const tCtxBg = themeCanvas ? themeCanvas.getContext('2d') : null;

// --- Stained Glass (Glass Mosaic) Theme ---
let glassScrollX = 0;
let glassScrollY = 0;
let glassPatternCanvas = null;
let glassPattern = null;
let lastGlassFrameTime = Date.now();
let glassSeparationProgress = 0; // 0 = unified, 1 = separated

const glassTileW = 2048;
const glassTileH = 1024;
const glassCellW = 256;
const glassCellH = 256;
const glassCols = glassTileW / glassCellW;
const glassRows = glassTileH / glassCellH;

function getGlassHash(c, r) {
    const x = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

function getGlassDist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

const glassPalette = [
    { fill: 'rgba(220, 38, 38, 0.85)', bright: 'rgba(254, 202, 202, 1)', dark: 'rgba(153, 27, 27, 0.95)' },    // Rich Red
    { fill: 'rgba(249, 115, 22, 0.85)', bright: 'rgba(254, 240, 138, 1)', dark: 'rgba(154, 52, 18, 0.95)' },   // Warm Orange
    { fill: 'rgba(234, 179, 8, 0.85)', bright: 'rgba(254, 252, 191, 1)', dark: 'rgba(133, 77, 14, 0.95)' },    // Golden Yellow
    { fill: 'rgba(5, 150, 105, 0.85)', bright: 'rgba(167, 243, 208, 1)', dark: 'rgba(6, 95, 70, 0.95)' },     // Emerald Green
    { fill: 'rgba(13, 148, 136, 0.85)', bright: 'rgba(153, 246, 228, 1)', dark: 'rgba(17, 94, 89, 0.95)' },    // Deep Teal
    { fill: 'rgba(37, 99, 235, 0.85)', bright: 'rgba(191, 219, 254, 1)', dark: 'rgba(30, 58, 138, 0.95)' },    // Royal Blue
    { fill: 'rgba(124, 58, 237, 0.85)', bright: 'rgba(233, 213, 255, 1)', dark: 'rgba(76, 29, 149, 0.95)' },   // Deep Violet
    { fill: 'rgba(219, 39, 119, 0.85)', bright: 'rgba(251, 207, 232, 1)', dark: 'rgba(157, 23, 77, 0.95)' }    // Vivid Magenta
];

function getGlassNode(c, r) {
    const wrappedC = (c % glassCols + glassCols) % glassCols;
    const wrappedR = (r % glassRows + glassRows) % glassRows;

    const dx = (getGlassHash(wrappedC, wrappedR) - 0.5) * glassCellW * 0.55;
    const dy = (getGlassHash(wrappedC + 100, wrappedR + 500) - 0.5) * glassCellH * 0.55;

    let x = c * glassCellW + dx;
    let y = r * glassCellH + dy;

    return { x, y };
}

function initGlassTheme() {
    // Create offscreen canvas
    glassPatternCanvas = document.createElement('canvas');
    glassPatternCanvas.width = glassTileW;
    glassPatternCanvas.height = glassTileH;
    const ctx = glassPatternCanvas.getContext('2d');

    // First, draw the solid deep violet-black background fill
    ctx.fillStyle = '#0a0512';
    ctx.fillRect(0, 0, glassTileW, glassTileH);

    // Loop from -1 to cols/rows to overlap boundaries and achieve 100% seamless tiling
    for (let c = -1; c <= glassCols; c++) {
        for (let r = -1; r <= glassRows; r++) {
            const pTL = getGlassNode(c, r);
            const pTR = getGlassNode(c + 1, r);
            const pBR = getGlassNode(c + 1, r + 1);
            const pBL = getGlassNode(c, r + 1);

            const wrappedC = (c % glassCols + glassCols) % glassCols;
            const wrappedR = (r % glassRows + glassRows) % glassRows;

            const pCenter = {
                x: (c + 0.5) * glassCellW + (getGlassHash(wrappedC + 200, wrappedR + 300) - 0.5) * glassCellW * 0.4,
                y: (r + 0.5) * glassCellH + (getGlassHash(wrappedC + 400, wrappedR + 600) - 0.5) * glassCellH * 0.4
            };

            const triangles = [
                { p1: pTL, p2: pTR, p3: pCenter, idx: 0 },
                { p1: pTR, p2: pBR, p3: pCenter, idx: 1 },
                { p1: pBR, p2: pBL, p3: pCenter, idx: 2 },
                { p1: pBL, p2: pTL, p3: pCenter, idx: 3 }
            ];

            triangles.forEach(tri => {
                const hashVal = getGlassHash(wrappedC + tri.idx * 17, wrappedR + tri.idx * 31);
                const colorIdx = Math.floor(hashVal * glassPalette.length);
                const color = glassPalette[colorIdx];

                const cx = (tri.p1.x + tri.p2.x + tri.p3.x) / 3;
                const cy = (tri.p1.y + tri.p2.y + tri.p3.y) / 3;

                const radius = Math.max(
                    getGlassDist(cx, cy, tri.p1.x, tri.p1.y),
                    getGlassDist(cx, cy, tri.p2.x, tri.p2.y),
                    getGlassDist(cx, cy, tri.p3.x, tri.p3.y)
                ) || 1;

                const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, radius);
                grad.addColorStop(0, color.bright);
                grad.addColorStop(0.4, color.fill);
                grad.addColorStop(1, color.dark);

                ctx.beginPath();
                ctx.moveTo(tri.p1.x, tri.p1.y);
                ctx.lineTo(tri.p2.x, tri.p2.y);
                ctx.lineTo(tri.p3.x, tri.p3.y);
                ctx.closePath();

                ctx.fillStyle = grad;
                ctx.fill();

                ctx.strokeStyle = color.bright;
                ctx.lineWidth = 3.5;
                ctx.stroke();

                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        }
    }

    glassPattern = null; // Invalidate any previous pattern cache
}

function drawFractalZoom(elapsedTime) {
    if (!tCtxBg) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const centerX = W / 2;
    const centerY = H / 2;

    const numLayers = 6;
    tCtxBg.save();
    tCtxBg.lineCap = 'round';
    tCtxBg.shadowBlur = 12;

    // Helper to draw a glowing fractal shape (star, polygon, or circle)
    function drawFractalShape(x, y, radius, type, points, inset, angle, depth, maxDepth, hue) {
        if (radius < 3) return;

        tCtxBg.save();
        tCtxBg.translate(x, y);
        tCtxBg.rotate(angle);

        const alpha = Math.min(1.0, (maxDepth - depth) / maxDepth);
        tCtxBg.strokeStyle = `hsla(${hue}, 100%, 65%, ${alpha})`;
        tCtxBg.shadowColor = `hsla(${hue}, 100%, 65%, 0.45)`;
        tCtxBg.lineWidth = Math.max(1, 3.0 - depth * 0.8);

        tCtxBg.beginPath();
        if (type === 'circle') {
            tCtxBg.arc(0, 0, radius, 0, Math.PI * 2);
        } else if (type === 'star') {
            for (let i = 0; i < points * 2; i++) {
                const r = (i % 2 === 0) ? radius : radius * inset;
                const a = (Math.PI * 2 * i) / (points * 2);
                tCtxBg.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
        } else { // polygon
            for (let i = 0; i < points; i++) {
                const a = (Math.PI * 2 * i) / points;
                tCtxBg.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
            }
        }
        tCtxBg.closePath();
        tCtxBg.stroke();
        tCtxBg.restore();

        // Recursively draw child shapes at the outer points
        if (depth < maxDepth && radius > 45) {
            const nextRadius = radius * 0.35;
            const nextAngle = angle - 0.4; // Rotate children in opposite direction
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            for (let i = 0; i < points; i++) {
                const a = (Math.PI * 2 * i) / points;
                const vx = Math.cos(a) * radius;
                const vy = Math.sin(a) * radius;

                const rx = x + (vx * cos - vy * sin);
                const ry = y + (vx * sin + vy * cos);

                // Draw connecting lines
                tCtxBg.beginPath();
                tCtxBg.moveTo(x, y);
                tCtxBg.lineTo(rx, ry);
                tCtxBg.strokeStyle = `hsla(${hue}, 100%, 65%, ${alpha * 0.25})`;
                tCtxBg.lineWidth = 1;
                tCtxBg.stroke();

                // Alternate child shape type recursively
                const nextType = (type === 'star') ? 'polygon' : (type === 'polygon' ? 'circle' : 'star');
                const nextPoints = (points === 3) ? 5 : (points === 5 ? 6 : 3);

                drawFractalShape(rx, ry, nextRadius, nextType, nextPoints, 0.4, nextAngle, depth + 1, maxDepth, (hue + 50) % 360);
            }
        }
    }

    // Config for base shapes of each layer
    const baseShapes = [
        { type: 'star', points: 5, inset: 0.4 },
        { type: 'polygon', points: 6, inset: 1.0 }, // Hexagon
        { type: 'star', points: 8, inset: 0.35 },   // 8-point star
        { type: 'polygon', points: 3, inset: 1.0 }, // Triangle
        { type: 'circle', points: 4, inset: 1.0 },  // Circle with 4 children
        { type: 'polygon', points: 4, inset: 1.0 }  // Square
    ];

    // Draw the infinite zoom layers
    for (let i = 0; i < numLayers; i++) {
        // Zoom goes from 0 to 1
        const zoom = (elapsedTime * 0.22 + i / numLayers) % 1.0;

        // Exponential scale for perfect zoom tunnel depth
        const radius = Math.pow(5, zoom * 3.5) * 8;

        // Dynamic rotation
        const angle = elapsedTime * 0.18 + zoom * 1.5;

        // Cyclic hue
        const hue = (elapsedTime * 30 + i * 60) % 360;

        // Choose base shape config for this layer
        const cfg = baseShapes[i % baseShapes.length];

        drawFractalShape(centerX, centerY, radius, cfg.type, cfg.points, cfg.inset, angle, 0, 2, hue);
    }

    tCtxBg.restore();
}

function drawGlassBackground() {
    if (!tCtxBg) return;
    const W = window.innerWidth;
    const H = window.innerHeight;

    if (!glassPatternCanvas) {
        initGlassTheme();
    }

    const playing = window.isPlaying && !window.isPaused && !window.isGameOver;
    const isExtreme = !!window.isExtremeMap || !!window.forceSecondaryStyle;
    const elapsedSongTime = window.lastInterpolatedTime || 0;

    // Deceleration logic (12s to 14s) for extreme mode
    let speedMult = 1.0;
    if (playing && isExtreme) {
        if (elapsedSongTime >= 12 && elapsedSongTime <= 14) {
            const t = (elapsedSongTime - 12) / 2; // 0 to 1
            const ease = t * t * (3 - 2 * t); // smoothstep ease-in-out
            speedMult = 1.0 - ease;
        } else if (elapsedSongTime > 14) {
            speedMult = 0;
        }
    }

    // Slow speed when not playing, fast speed when playing
    const speed = (playing ? (window.fallSpeed || 3.0) * 1.5 : 0.4) * speedMult;

    // Movement: right to left (subtract X) and top to bottom (add Y)
    glassScrollX -= speed * 0.8;
    glassScrollY += speed * 0.6;

    // Wrap scroll offsets to keep them within tile boundaries
    glassScrollX = (glassScrollX % glassTileW + glassTileW) % glassTileW;
    glassScrollY = (glassScrollY % glassTileH + glassTileH) % glassTileH;

    // Handle separation effect starting at 15s in extreme mode, with smooth 1s transitions
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastGlassFrameTime) / 1000);
    lastGlassFrameTime = now;

    const targetProgress = (playing && isExtreme && elapsedSongTime >= 15) ? 1.0 : 0.0;
    if (glassSeparationProgress < targetProgress) {
        glassSeparationProgress = Math.min(targetProgress, glassSeparationProgress + dt);
    } else if (glassSeparationProgress > targetProgress) {
        glassSeparationProgress = Math.max(targetProgress, glassSeparationProgress - dt);
    }

    // Apply ease-in-out curve (smoothstep)
    const easeProgress = glassSeparationProgress * glassSeparationProgress * (3 - 2 * glassSeparationProgress);

    if (easeProgress > 0) {
        // Clear background to black void
        tCtxBg.fillStyle = '#000000';
        tCtxBg.fillRect(0, 0, W, H);

        // Draw Fractal Zoom inside the black void background with opacity
        tCtxBg.save();
        tCtxBg.globalAlpha = easeProgress;
        drawFractalZoom(elapsedSongTime);
        tCtxBg.restore();

        const startCol = Math.floor(-glassScrollX / glassCellW) - 1;
        const endCol = startCol + Math.ceil(W / glassCellW) + 2;
        const startRow = Math.floor(-glassScrollY / glassCellH) - 1;
        const endRow = startRow + Math.ceil(H / glassCellH) + 2;

        const scrCenterX = W / 2;
        const scrCenterY = H / 2;

        const sepElapsed = Math.max(0, elapsedSongTime - 15);
        // Exponential separation distance over time, scaled by our easeProgress transition
        const maxSeparationOffset = Math.pow(sepElapsed, 1.5) * 220;
        const separationOffset = maxSeparationOffset * easeProgress;

        for (let c = startCol; c <= endCol; c++) {
            for (let r = startRow; r <= endRow; r++) {
                const pTL = getGlassNode(c, r);
                const pTR = getGlassNode(c + 1, r);
                const pBR = getGlassNode(c + 1, r + 1);
                const pBL = getGlassNode(c, r + 1);

                const wrappedC = (c % glassCols + glassCols) % glassCols;
                const wrappedR = (r % glassRows + glassRows) % glassRows;

                const pCenter = {
                    x: (c + 0.5) * glassCellW + (getGlassHash(wrappedC + 200, wrappedR + 300) - 0.5) * glassCellW * 0.4,
                    y: (r + 0.5) * glassCellH + (getGlassHash(wrappedC + 400, wrappedR + 600) - 0.5) * glassCellH * 0.4
                };

                const triangles = [
                    { p1: pTL, p2: pTR, p3: pCenter, idx: 0 },
                    { p1: pTR, p2: pBR, p3: pCenter, idx: 1 },
                    { p1: pBR, p2: pBL, p3: pCenter, idx: 2 },
                    { p1: pBL, p2: pTL, p3: pCenter, idx: 3 }
                ];

                triangles.forEach(tri => {
                    const hashVal = getGlassHash(wrappedC + tri.idx * 17, wrappedR + tri.idx * 31);
                    const colorIdx = Math.floor(hashVal * glassPalette.length);
                    const color = glassPalette[colorIdx];

                    // Centroid with current scroll offset
                    const px1 = tri.p1.x + glassScrollX;
                    const py1 = tri.p1.y + glassScrollY;
                    const px2 = tri.p2.x + glassScrollX;
                    const py2 = tri.p2.y + glassScrollY;
                    const px3 = tri.p3.x + glassScrollX;
                    const py3 = tri.p3.y + glassScrollY;

                    const cx = (px1 + px2 + px3) / 3;
                    const cy = (py1 + py2 + py3) / 3;

                    // Rotation: deterministic direction and speed per shard based on hash, scaled by easeProgress
                    const rotSpeed = (hashVal - 0.5) * 1.5;
                    const theta = sepElapsed * rotSpeed * easeProgress;
                    const cos = Math.cos(theta);
                    const sin = Math.sin(theta);

                    // Rotate vertices around centroid
                    const rx1 = cx + (px1 - cx) * cos - (py1 - cy) * sin;
                    const ry1 = cy + (px1 - cx) * sin + (py1 - cy) * cos;
                    const rx2 = cx + (px2 - cx) * cos - (py2 - cy) * sin;
                    const ry2 = cy + (px2 - cx) * sin + (py2 - cy) * cos;
                    const rx3 = cx + (px3 - cx) * cos - (py3 - cy) * sin;
                    const ry3 = cy + (px3 - cx) * sin + (py3 - cy) * cos;

                    // Push direction from center of screen
                    const dx = cx - scrCenterX;
                    const dy = cy - scrCenterY;
                    const len = Math.hypot(dx, dy) || 1;
                    const dirX = dx / len;
                    const dirY = dy / len;

                    const pushX = dirX * separationOffset;
                    const pushY = dirY * separationOffset;

                    const x1 = rx1 + pushX;
                    const y1 = ry1 + pushY;
                    const x2 = rx2 + pushX;
                    const y2 = ry2 + pushY;
                    const x3 = rx3 + pushX;
                    const y3 = ry3 + pushY;

                    const gradX = cx + pushX;
                    const gradY = cy + pushY;

                    const radius = Math.max(
                        getGlassDist(gradX, gradY, x1, y1),
                        getGlassDist(gradX, gradY, x2, y2),
                        getGlassDist(gradX, gradY, x3, y3)
                    ) || 1;

                    const grad = tCtxBg.createRadialGradient(gradX, gradY, 1, gradX, gradY, radius);
                    grad.addColorStop(0, color.bright);
                    grad.addColorStop(0.4, color.fill);
                    grad.addColorStop(1, color.dark);

                    tCtxBg.beginPath();
                    tCtxBg.moveTo(x1, y1);
                    tCtxBg.lineTo(x2, y2);
                    tCtxBg.lineTo(x3, y3);
                    tCtxBg.closePath();

                    tCtxBg.fillStyle = grad;
                    tCtxBg.fill();

                    tCtxBg.strokeStyle = color.bright;
                    tCtxBg.lineWidth = 3.5;
                    tCtxBg.stroke();

                    tCtxBg.strokeStyle = '#000000';
                    tCtxBg.lineWidth = 1.5;
                    tCtxBg.stroke();
                });
            }
        }
    } else {
        // Completely unified: Draw pattern normally (tiling)
        if (!glassPattern) {
            glassPattern = tCtxBg.createPattern(glassPatternCanvas, 'repeat');
        }

        tCtxBg.save();
        if (glassPattern) {
            const matrix = new DOMMatrix().translateSelf(glassScrollX, glassScrollY);
            glassPattern.setTransform(matrix);
            tCtxBg.fillStyle = glassPattern;
            tCtxBg.fillRect(0, 0, W, H);
        } else {
            const startX = glassScrollX - glassTileW;
            const startY = glassScrollY - glassTileH;
            for (let x = startX; x < W + glassTileW; x += glassTileW) {
                for (let y = startY; y < H + glassTileH; y += glassTileH) {
                    tCtxBg.drawImage(glassPatternCanvas, x, y);
                }
            }
        }
        tCtxBg.restore();
    }
}
let sandParticles = [];
let lastSandComboTrigger = 0;

function spawnSandStorm() {
    for (let i = 0; i < 350; i++) {
        sandParticles.push({
            x: -20 + Math.random() * (window.innerWidth + 40),
            y: Math.random() * window.innerHeight,
            vx: 1.8 + Math.random() * 4,
            vy: -0.2 + Math.random() * 1.0,
            size: 0.8 + Math.random() * 2.8,
            alpha: 0.35 + Math.random() * 0.55,
            life: 1.0,
            decay: 0.001 + Math.random() * 0.0025
        });
    }
}

// --- Forest Parallax (Snowy Forest) ---
let forestLayers = [];
let forestSnowParticles = [];
let forestDustParticles = [];

const FOREST_LAYER_CFG = [
    {
        speed: 0.08,
        yRatio: 0.44,
        freq: 0.0012,
        amp: 16,
        phase: 0,
        treeW: 42,
        treeH: 140,
        treeCount: 14,
        treeColor: '#1d2736',
        snowColor: '#344155',
        groundColor: '#1d2736'
    },
    {
        speed: 0.16,
        yRatio: 0.51,
        freq: 0.0018,
        amp: 20,
        phase: 1.2,
        treeW: 55,
        treeH: 175,
        treeCount: 12,
        treeColor: '#313e54',
        snowColor: '#52637a',
        groundColor: '#313e54'
    },
    {
        speed: 0.28,
        yRatio: 0.58,
        freq: 0.0024,
        amp: 24,
        phase: 2.5,
        treeW: 70,
        treeH: 210,
        treeCount: 10,
        treeColor: '#4b5b75',
        snowColor: '#72849c',
        groundColor: '#4b5b75'
    },
    {
        speed: 0.48,
        yRatio: 0.65,
        freq: 0.003,
        amp: 28,
        phase: 3.8,
        treeW: 88,
        treeH: 250,
        treeCount: 8,
        treeColor: '#6b7e9b',
        snowColor: '#9bb0c9',
        groundColor: '#6b7e9b'
    },
    {
        speed: 0.8,
        yRatio: 0.73,
        freq: 0.0036,
        amp: 32,
        phase: 4.9,
        treeW: 108,
        treeH: 295,
        treeCount: 7,
        treeColor: '#93a9c7',
        snowColor: '#c6d8ec',
        groundColor: '#93a9c7'
    },
    {
        speed: 1.3,
        yRatio: 0.81,
        freq: 0.0042,
        amp: 36,
        phase: 0.5,
        treeW: 135,
        treeH: 345,
        treeCount: 6,
        treeColor: '#c2d7f2',
        snowColor: '#eef5fc',
        groundColor: '#c2d7f2'
    },
    {
        speed: 2.0,
        yRatio: 0.89,
        freq: 0.0048,
        amp: 40,
        phase: 1.8,
        treeW: 165,
        treeH: 400,
        treeCount: 5,
        treeColor: '#ffffff',
        snowColor: '#ffffff',
        groundColor: '#ffffff'
    }
];

const FOREST_LAYER_CFG_DAY = [
    { treeColor: '#d6c0cd', snowColor: '#f7ebf2', groundColor: '#d6c0cd' },
    { treeColor: '#b4ccd6', snowColor: '#ebf2f7', groundColor: '#b4ccd6' },
    { treeColor: '#96b8c7', snowColor: '#e3eff5', groundColor: '#96b8c7' },
    { treeColor: '#6f9cb0', snowColor: '#d7ebf5', groundColor: '#6f9cb0' },
    { treeColor: '#4d8096', snowColor: '#d2ebf5', groundColor: '#4d8096' },
    { treeColor: '#2b5a6e', snowColor: '#c7e6f2', groundColor: '#2b5a6e' },
    { treeColor: '#1d3b2e', snowColor: '#ffffff', groundColor: '#1d3b2e' }
];

function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function lerpColor(c1Hex, c2Hex, factor) {
    const c1 = hexToRgb(c1Hex);
    const c2 = hexToRgb(c2Hex);
    if (!c1 || !c2) return c2Hex;
    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);
    return `rgb(${r}, ${g}, ${b})`;
}

const SNOW_PARALLAX_CFG = [
    { treeCfgIdx: 1, minR: 0.6, maxR: 1.2, alphaMin: 0.20, alphaMax: 0.45, speedMult: 0.4 },
    { treeCfgIdx: 3, minR: 1.0, maxR: 1.8, alphaMin: 0.35, alphaMax: 0.65, speedMult: 0.7 },
    { treeCfgIdx: 4, minR: 1.6, maxR: 2.5, alphaMin: 0.50, alphaMax: 0.80, speedMult: 1.0 },
    { treeCfgIdx: 5, minR: 2.3, maxR: 3.8, alphaMin: 0.65, alphaMax: 0.90, speedMult: 1.4 },
    { treeCfgIdx: 6, minR: 3.5, maxR: 5.8, alphaMin: 0.80, alphaMax: 1.00, speedMult: 2.0 }
];

function makeSnowParticle(layerIdx, randomY = false) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cfg = SNOW_PARALLAX_CFG[layerIdx];
    const isExtreme = !!window.isExtremeMap || !!window.forceSecondaryStyle;
    const windRatio = isExtreme ? -1.0 : -0.25;

    return {
        layerIdx: layerIdx,
        x: Math.random() * (W + H * Math.abs(windRatio) + 300),
        y: randomY ? Math.random() * H : -20 - Math.random() * 40,
        r: cfg.minR + Math.random() * (cfg.maxR - cfg.minR),
        speed: (1.2 + Math.random() * 1.5) * cfg.speedMult,
        alpha: cfg.alphaMin + Math.random() * (cfg.alphaMax - cfg.alphaMin)
    };
}

function initForest() {
    forestLayers = [];
    forestSnowParticles = [];
    forestDustParticles = [];
    const W = window.innerWidth;
    const H = window.innerHeight;

    FOREST_LAYER_CFG.forEach((cfg, li) => {
        const layerTrees = [];
        const step = (W + cfg.treeW * 2) / cfg.treeCount;
        for (let i = 0; i < cfg.treeCount; i++) {
            const x = -cfg.treeW + i * step + (Math.random() - 0.5) * (step * 0.4);
            const w = cfg.treeW * (0.85 + Math.random() * 0.3);
            const h = cfg.treeH * (0.85 + Math.random() * 0.3);
            layerTrees.push({ x, w, h });
        }
        forestLayers.push({
            scroll: Math.random() * 5000,
            trees: layerTrees
        });
    });

    // Populate fixed snow particles pool (reduced for FPS)
    const countPerLayer = [50, 60, 50, 30, 10];
    for (let l = 0; l < 5; l++) {
        for (let i = 0; i < countPerLayer[l]; i++) {
            forestSnowParticles.push(makeSnowParticle(l, true));
        }
    }

    // Populate fixed dust particles pool (15 total)
    for (let i = 0; i < 15; i++) {
        forestDustParticles.push({
            x: Math.random() * W,
            y: Math.random() * H,
            r: 120 + Math.random() * 180,
            speed: 0.4 + Math.random() * 1.0,
            alpha: 0.008 + Math.random() * 0.022,
            life: Math.random(),
            decay: 0.0003 + Math.random() * 0.0007
        });
    }
}

const lostInSnowTreeImgs = [];
for (let _i = 1; _i <= 8; _i++) {
    const _img = new Image();
    _img.src = `assets/pino${_i}_chroma.png`;
    lostInSnowTreeImgs.push(_img);
}

// Assign a stable random tree index to each spawn slot
const _sunriseTreeVariants = [
    Math.floor(Math.random() * 8),
    Math.floor(Math.random() * 8),
    Math.floor(Math.random() * 8)
];

function drawPointedMountainRange(ctx, W, H, scrollX) {
    ctx.save();

    const baseOffsetY = H * 0.74;

    // A. DISTANT BACKDROP MOUNTAINS (Far layer with atmospheric haze)
    const farSpan = 1400;
    const farScroll = scrollX * 0.35;
    const farOffset = (farScroll % farSpan + farSpan) % farSpan;
    const startFar = Math.floor(-farOffset / farSpan) - 1;
    const endFar = Math.ceil((W - farOffset) / farSpan) + 1;

    const farPeaks = [
        { xFrac: 0.10, h: H * 0.28 },
        { xFrac: 0.32, h: H * 0.38 },
        { xFrac: 0.55, h: H * 0.26 },
        { xFrac: 0.78, h: H * 0.36 },
        { xFrac: 0.94, h: H * 0.22 }
    ];

    ctx.fillStyle = '#6b415a'; // Soft atmospheric purple-pink distant peak tint
    for (let t = startFar; t <= endFar; t++) {
        const tileX = t * farSpan - farOffset;
        farPeaks.forEach(p => {
            const apexX = tileX + p.xFrac * farSpan;
            const apexY = baseOffsetY - p.h;
            const mW = farSpan * 0.24;
            ctx.beginPath();
            ctx.moveTo(apexX, apexY);
            ctx.lineTo(apexX + mW * 0.6, baseOffsetY);
            ctx.lineTo(apexX - mW * 0.6, baseOffsetY);
            ctx.closePath();
            ctx.fill();
        });
    }

    // B. MAIN DETAILED ALPINE MOUNTAIN RANGE (Mid layer)
    const mountainSpan = 1800;
    const mainScroll = scrollX * 0.7;
    const mainOffset = (mainScroll % mountainSpan + mountainSpan) % mountainSpan;
    const startMain = Math.floor(-mainOffset / mountainSpan) - 1;
    const endMain = Math.ceil((W - mainOffset) / mountainSpan) + 1;

    const peakDefs = [
        { xFrac: 0.08, h: H * 0.38, shadowSide: 'right', snowH: 0.45 },
        { xFrac: 0.22, h: H * 0.28, shadowSide: 'right', snowH: 0.38 },
        { xFrac: 0.38, h: H * 0.46, shadowSide: 'left', snowH: 0.52 }, // Tall dramatic peak
        { xFrac: 0.52, h: H * 0.32, shadowSide: 'left', snowH: 0.40 },
        { xFrac: 0.68, h: H * 0.52, shadowSide: 'right', snowH: 0.55 }, // Main majestic apex peak
        { xFrac: 0.82, h: H * 0.36, shadowSide: 'right', snowH: 0.42 },
        { xFrac: 0.95, h: H * 0.26, shadowSide: 'right', snowH: 0.35 }
    ];

    for (let t = startMain; t <= endMain; t++) {
        const tileOffsetX = t * mountainSpan - mainOffset;

        peakDefs.forEach(p => {
            const apexX = tileOffsetX + p.xFrac * mountainSpan;
            const apexY = baseOffsetY - p.h;
            const mountainW = mountainSpan * 0.26;
            const leftBaseX = apexX - mountainW * 0.55;
            const rightBaseX = apexX + mountainW * 0.55;
            const baseBottomY = baseOffsetY;

            // Ridge midpoints for multi-faceted rock geometry
            const midX1 = apexX + (p.shadowSide === 'right' ? 1 : -1) * (mountainW * 0.13);
            const midY1 = apexY + p.h * 0.48;

            // 1. Deep Shadow Face
            ctx.fillStyle = '#302219'; // Rich dark rocky brown shadow
            ctx.beginPath();
            ctx.moveTo(apexX, apexY);
            if (p.shadowSide === 'right') {
                ctx.lineTo(apexX + mountainW * 0.15, apexY + p.h * 0.34);
                ctx.lineTo(apexX + mountainW * 0.30, apexY + p.h * 0.56);
                ctx.lineTo(rightBaseX, baseBottomY);
            } else {
                ctx.lineTo(apexX - mountainW * 0.18, apexY + p.h * 0.38);
                ctx.lineTo(apexX - mountainW * 0.28, apexY + p.h * 0.52);
                ctx.lineTo(leftBaseX, baseBottomY);
            }
            ctx.lineTo(apexX, baseBottomY);
            ctx.lineTo(midX1, midY1);
            ctx.closePath();
            ctx.fill();

            // 2. Ambient Shadow Transition Sub-Facet
            ctx.fillStyle = '#423124';
            ctx.beginPath();
            ctx.moveTo(apexX, apexY);
            ctx.lineTo(midX1, midY1);
            ctx.lineTo(apexX, baseBottomY);
            ctx.closePath();
            ctx.fill();

            // 3. Golden Sunlit Face
            const lightGrad = ctx.createLinearGradient(apexX, apexY, apexX, baseBottomY);
            lightGrad.addColorStop(0.0, '#e5ab5d'); // Warm sunlit golden peak
            lightGrad.addColorStop(0.5, '#b0793b'); // Warm rock middle
            lightGrad.addColorStop(1.0, '#593a1c'); // Dark rock base
            ctx.fillStyle = lightGrad;
            ctx.beginPath();
            ctx.moveTo(apexX, apexY);
            ctx.lineTo(midX1, midY1);
            ctx.lineTo(apexX, baseBottomY);
            if (p.shadowSide === 'right') {
                ctx.lineTo(leftBaseX, baseBottomY);
                ctx.lineTo(apexX - mountainW * 0.28, apexY + p.h * 0.52);
                ctx.lineTo(apexX - mountainW * 0.18, apexY + p.h * 0.38);
            } else {
                ctx.lineTo(rightBaseX, baseBottomY);
                ctx.lineTo(apexX + mountainW * 0.30, apexY + p.h * 0.56);
                ctx.lineTo(apexX + mountainW * 0.15, apexY + p.h * 0.34);
            }
            ctx.closePath();
            ctx.fill();

            // 4. Detailed Snow Cap & Glacier Veins (Clamped to exact slope outer boundaries)
            const snowCutY = apexY + p.h * p.snowH;
            const snowW = mountainW * 0.55 * p.snowH;

            // Interpolate exact X on craggy slopes at snowCutY to avoid hollow gaps
            let snowLeftX;
            if (p.snowH <= 0.38) {
                const t = p.snowH / 0.38;
                snowLeftX = apexX + t * ((apexX - mountainW * 0.18) - apexX);
            } else if (p.snowH <= 0.52) {
                const t = (p.snowH - 0.38) / (0.52 - 0.38);
                snowLeftX = (apexX - mountainW * 0.18) + t * ((apexX - mountainW * 0.28) - (apexX - mountainW * 0.18));
            } else {
                const t = (p.snowH - 0.52) / (1.0 - 0.52);
                snowLeftX = (apexX - mountainW * 0.28) + t * (leftBaseX - (apexX - mountainW * 0.28));
            }

            let snowRightX;
            if (p.snowH <= 0.34) {
                const t = p.snowH / 0.34;
                snowRightX = apexX + t * ((apexX + mountainW * 0.15) - apexX);
            } else if (p.snowH <= 0.56) {
                const t = (p.snowH - 0.34) / (0.56 - 0.34);
                snowRightX = (apexX + mountainW * 0.15) + t * ((apexX + mountainW * 0.30) - (apexX + mountainW * 0.15));
            } else {
                const t = (p.snowH - 0.56) / (1.0 - 0.56);
                snowRightX = (apexX + mountainW * 0.30) + t * (rightBaseX - (apexX + mountainW * 0.30));
            }

            // Sunlit snow side
            ctx.fillStyle = '#fffdfa'; // Glowing crisp white snow
            ctx.beginPath();
            ctx.moveTo(apexX, apexY);
            if (p.shadowSide === 'right') {
                // Light is on the Left side
                if (p.snowH > 0.38) {
                    ctx.lineTo(apexX - mountainW * 0.18, apexY + p.h * 0.38);
                }
                ctx.lineTo(snowLeftX, snowCutY);
                ctx.lineTo(apexX - (apexX - snowLeftX) * 0.5, snowCutY - p.h * 0.08);
                ctx.lineTo(apexX - (apexX - snowLeftX) * 0.3, snowCutY + p.h * 0.04);
            } else {
                // Light is on the Right side
                if (p.snowH > 0.34) {
                    ctx.lineTo(apexX + mountainW * 0.15, apexY + p.h * 0.34);
                }
                ctx.lineTo(snowRightX, snowCutY);
                ctx.lineTo(apexX + (snowRightX - apexX) * 0.5, snowCutY - p.h * 0.08);
                ctx.lineTo(apexX + (snowRightX - apexX) * 0.3, snowCutY + p.h * 0.04);
            }
            ctx.lineTo(apexX, apexY + p.h * p.snowH * 0.65);
            ctx.closePath();
            ctx.fill();

            // Shadowed snow side (cool ice-blue shaded snow cap)
            ctx.fillStyle = '#d1e6f5';
            ctx.beginPath();
            ctx.moveTo(apexX, apexY);
            if (p.shadowSide === 'right') {
                // Shadow is on the Right side
                if (p.snowH > 0.34) {
                    ctx.lineTo(apexX + mountainW * 0.15, apexY + p.h * 0.34);
                }
                ctx.lineTo(snowRightX, snowCutY);
                ctx.lineTo(apexX + (snowRightX - apexX) * 0.5, snowCutY - p.h * 0.06);
            } else {
                // Shadow is on the Left side
                if (p.snowH > 0.38) {
                    ctx.lineTo(apexX - mountainW * 0.18, apexY + p.h * 0.38);
                }
                ctx.lineTo(snowLeftX, snowCutY);
                ctx.lineTo(apexX - (apexX - snowLeftX) * 0.5, snowCutY - p.h * 0.06);
            }
            ctx.lineTo(apexX, apexY + p.h * p.snowH * 0.65);
            ctx.closePath();
            ctx.fill();

            // 5. Crisp Dark Ridge Outlines & Rock Texture Lines
            ctx.strokeStyle = '#1a110a';
            ctx.lineWidth = 3.0;
            ctx.lineJoin = 'miter';
            ctx.miterLimit = 4;

            // Outer peak silhouette outline
            ctx.beginPath();
            ctx.moveTo(leftBaseX, baseBottomY);
            ctx.lineTo(apexX - mountainW * 0.28, apexY + p.h * 0.52);
            ctx.lineTo(apexX - mountainW * 0.18, apexY + p.h * 0.38);
            ctx.lineTo(apexX, apexY); // Apex pointed tip
            ctx.lineTo(apexX + mountainW * 0.15, apexY + p.h * 0.34);
            ctx.lineTo(apexX + mountainW * 0.30, apexY + p.h * 0.56);
            ctx.lineTo(rightBaseX, baseBottomY);
            ctx.stroke();

            // Central craggy ridge line
            ctx.beginPath();
            ctx.moveTo(apexX, apexY);
            ctx.lineTo(midX1, midY1);
            ctx.lineTo(apexX + (p.shadowSide === 'right' ? 24 : -24), baseBottomY);
            ctx.stroke();

            // Craggy cliff texture branch lines
            ctx.strokeStyle = 'rgba(26, 17, 10, 0.75)';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(midX1, midY1);
            ctx.lineTo(midX1 - 28, midY1 + 48);
            ctx.moveTo(apexX - mountainW * 0.18, apexY + p.h * 0.38);
            ctx.lineTo(apexX - mountainW * 0.06, apexY + p.h * 0.58);
            ctx.moveTo(apexX + mountainW * 0.15, apexY + p.h * 0.34);
            ctx.lineTo(apexX + mountainW * 0.05, apexY + p.h * 0.52);
            ctx.stroke();

            // --- Watercolor Paint Texture Overlay inside the Mountain Facets ---
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(leftBaseX, baseBottomY);
            ctx.lineTo(apexX - mountainW * 0.28, apexY + p.h * 0.52);
            ctx.lineTo(apexX - mountainW * 0.18, apexY + p.h * 0.38);
            ctx.lineTo(apexX, apexY);
            ctx.lineTo(apexX + mountainW * 0.15, apexY + p.h * 0.34);
            ctx.lineTo(apexX + mountainW * 0.30, apexY + p.h * 0.56);
            ctx.lineTo(rightBaseX, baseBottomY);
            ctx.closePath();
            ctx.clip();

            const paintSeed = Math.floor(Math.abs(t) * 7919 + p.xFrac * 104729) || 1;
            const pRand = mulberry32(paintSeed);

            // Draw 16 textured watercolor splotches per peak
            for (let s = 0; s < 16; s++) {
                const sY = apexY + pRand() * p.h;
                const sX = leftBaseX + pRand() * (rightBaseX - leftBaseX);
                const r = 25 + pRand() * 60;

                const colorType = pRand();
                let color;
                if (colorType < 0.3) {
                    color = `rgba(130, 85, 45, ${0.12 + pRand() * 0.12})`; // brown wash
                } else if (colorType < 0.6) {
                    color = `rgba(60, 45, 35, ${0.15 + pRand() * 0.15})`; // dark shadow wash
                } else if (colorType < 0.8) {
                    color = `rgba(255, 245, 220, ${0.10 + pRand() * 0.15})`; // light highlight wash
                } else {
                    color = `rgba(107, 65, 90, ${0.12 + pRand() * 0.12})`; // purple wash (distant peak ambient)
                }

                const radGrad = ctx.createRadialGradient(sX, sY, r * 0.1, sX, sY, r);
                radGrad.addColorStop(0, color);
                radGrad.addColorStop(0.5, color);
                radGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = radGrad;

                ctx.beginPath();
                ctx.arc(sX, sY, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // Paint Splatter/Dust dots inside the mountain (hand-spattered look)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            for (let d = 0; d < 18; d++) {
                const dY = apexY + pRand() * p.h;
                const dX = leftBaseX + pRand() * (rightBaseX - leftBaseX);
                const size = 1.0 + pRand() * 2.2;
                ctx.beginPath();
                ctx.arc(dX, dY, size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        });
    }

    // C. Thick Fluffy Watercolor Fog/Cloud Bank at base of mountains
    const fogSeed = 54321;
    const fRand = mulberry32(fogSeed);
    for (let c = 0; c < 45; c++) {
        const cX = fRand() * W;
        const driftY = Math.sin(Date.now() * 0.0012 + c) * 6;
        const cY = baseOffsetY - H * 0.03 + fRand() * (H * 0.05) + driftY;
        const r = 24 + fRand() * 32;

        const fogGrad = ctx.createRadialGradient(cX, cY, r * 0.2, cX, cY, r);
        fogGrad.addColorStop(0, 'rgba(255, 250, 245, 0.18)');
        fogGrad.addColorStop(0.6, 'rgba(255, 248, 240, 0.08)');
        fogGrad.addColorStop(1.0, 'rgba(255, 248, 240, 0.0)');
        ctx.fillStyle = fogGrad;

        ctx.beginPath();
        ctx.arc(cX, cY, r, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawMountainReflection(ctx, W, H, scrollX, lakeY) {
    ctx.save();

    // Set composite operation to blend reflection onto water gradient
    ctx.globalAlpha = 0.25;

    // Move to lake level and invert drawing vertically for reflection
    ctx.translate(0, lakeY);
    ctx.scale(1, -0.22);

    const baseOffsetY = 0;
    const mountainSpan = 1800;
    const mainScroll = scrollX * 0.7;
    const mainOffset = (mainScroll % mountainSpan + mountainSpan) % mountainSpan;
    const startMain = Math.floor(-mainOffset / mountainSpan) - 1;
    const endMain = Math.ceil((W - mainOffset) / mountainSpan) + 1;

    const peakDefs = [
        { xFrac: 0.08, h: H * 0.38 },
        { xFrac: 0.22, h: H * 0.28 },
        { xFrac: 0.38, h: H * 0.46 },
        { xFrac: 0.52, h: H * 0.32 },
        { xFrac: 0.68, h: H * 0.52 },
        { xFrac: 0.82, h: H * 0.36 },
        { xFrac: 0.95, h: H * 0.26 }
    ];

    ctx.fillStyle = '#22150e'; // Very dark silhouette for mirror reflection

    // Draw reflection in horizontal strips to animate liquid distortion
    const numStrips = 16;
    for (let s = 0; s < numStrips; s++) {
        const stripFrac = s / numStrips;
        // Vertically scaled coordinate range in the inverted space
        const stripY1 = -H * 0.6 * stripFrac;
        const stripY2 = -H * 0.6 * (s + 1) / numStrips;

        ctx.save();

        // Wobble the strip horizontally with a sine wave based on time and vertical position
        const waveOffset = Math.sin(s * 0.58 + Date.now() * 0.0038) * 16 * (1.0 - stripFrac * 0.4);
        ctx.translate(waveOffset, 0);

        // Define clipping region for this horizontal slice of the reflection
        ctx.beginPath();
        ctx.rect(0, stripY2, W, stripY1 - stripY2);
        ctx.clip();

        for (let t = startMain; t <= endMain; t++) {
            const tileOffsetX = t * mountainSpan - mainOffset;
            peakDefs.forEach(p => {
                const apexX = tileOffsetX + p.xFrac * mountainSpan;
                const apexY = baseOffsetY - p.h;
                const mountainW = mountainSpan * 0.26;
                const leftBaseX = apexX - mountainW * 0.55;
                const rightBaseX = apexX + mountainW * 0.55;

                ctx.beginPath();
                ctx.moveTo(apexX, apexY);
                ctx.lineTo(rightBaseX, baseOffsetY);
                ctx.lineTo(leftBaseX, baseOffsetY);
                ctx.closePath();
                ctx.fill();
            });
        }
        ctx.restore();
    }

    ctx.restore();
}

function drawSunrisePineTree(ctx, x, y, width, height, treeColor, snowColor, variantIdx) {
    // Use the new detailed tall conifer vector model (no PNG clipping)
    drawTallConiferPineTree(ctx, x, y, width, height, treeColor, snowColor, variantIdx);
}

function drawTallConiferPineTree(ctx, x, y, width, height, treeColor, snowColor, variantIdx) {
    ctx.save();

    const seed = ((variantIdx !== undefined ? variantIdx : 0) + 1) * 157 + 31;
    function rand(i) {
        const s = Math.sin(seed + i * 17.1234) * 43758.5453;
        return s - Math.floor(s);
    }

    const topY = y - height;
    const trunkW = width * 0.14;
    const baseBorderY = Math.max(y + 200, (window.innerHeight || 900) + 150);

    // 1. Solid Dark Trunk extending down into the floor
    ctx.fillStyle = treeColor || '#0c1613';
    ctx.fillRect(x - trunkW * 0.5, topY + height * 0.2, trunkW, baseBorderY - (topY + height * 0.2));

    // 2. Layered Triangular Branch Tiers
    const tiers = 15;
    const foliageTop = topY;
    const foliageBottom = y - height * 0.06;
    const foliageH = foliageBottom - foliageTop;

    ctx.fillStyle = treeColor || '#0c1613';

    // Top sharp cap
    const topCapH = foliageH * 0.15;
    ctx.beginPath();
    ctx.moveTo(x, foliageTop);
    ctx.lineTo(x + width * 0.18, foliageTop + topCapH);
    ctx.lineTo(x - width * 0.18, foliageTop + topCapH);
    ctx.closePath();
    ctx.fill();

    // Overlapping tier blocks below top cap
    for (let t = 1; t < tiers; t++) {
        const progress = t / (tiers - 1);
        const tierTopY = foliageTop + Math.pow(progress, 0.92) * foliageH * 0.84;
        const tierH = (foliageH / tiers) * (1.35 + progress * 0.45);
        const tierBottomY = tierTopY + tierH;

        // Width expands gradually down the tree
        const targetW = width * (0.16 + Math.pow(progress, 0.85) * 0.42);

        // Randomization for left/right branch points
        const leftW = targetW * (0.88 + rand(t * 5) * 0.24);
        const rightW = targetW * (0.88 + rand(t * 5 + 1) * 0.24);

        const leftAngle = (rand(t * 5 + 2) - 0.5) * tierH * 0.22;
        const rightAngle = (rand(t * 5 + 3) - 0.5) * tierH * 0.22;

        ctx.beginPath();
        ctx.moveTo(x, tierTopY - tierH * 0.2);

        // Right side tip
        ctx.lineTo(x + rightW, tierBottomY + rightAngle);
        // Step back inward toward trunk base
        ctx.lineTo(x + trunkW * 0.3, tierBottomY - tierH * 0.15);
        // Left side step back
        ctx.lineTo(x - trunkW * 0.3, tierBottomY - tierH * 0.15);
        // Left side tip
        ctx.lineTo(x - leftW, tierBottomY + leftAngle);

        ctx.closePath();
        ctx.fill();

        // Highlight / Snow edge
        if (snowColor) {
            ctx.fillStyle = snowColor;
            ctx.globalAlpha = 0.15 + (1 - progress) * 0.20;
            ctx.beginPath();
            ctx.moveTo(x, tierTopY - tierH * 0.18);
            ctx.lineTo(x + rightW * 0.9, tierBottomY + rightAngle - tierH * 0.15);
            ctx.lineTo(x + rightW * 0.8, tierBottomY + rightAngle - tierH * 0.05);
            ctx.lineTo(x, tierTopY + tierH * 0.1);
            ctx.lineTo(x - leftW * 0.8, tierBottomY + leftAngle - tierH * 0.05);
            ctx.lineTo(x - leftW * 0.9, tierBottomY + leftAngle - tierH * 0.15);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = treeColor || '#0c1613';
            ctx.globalAlpha = 1.0;
        }
    }

    ctx.restore();
}

function drawPineTree(ctx, x, y, width, height, treeColor, snowColor) {
    ctx.save();
    const trunkW = width * 0.14;
    const trunkH = height * 0.18;
    ctx.fillStyle = 'rgba(10, 8, 12, 0.9)';
    ctx.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH * 2.5);

    const leafH = height - trunkH;
    const startY = y - trunkH;
    const sections = 4;
    const sectionH = leafH / sections;

    for (let i = 0; i < sections; i++) {
        const secY = startY - i * (sectionH * 0.76);
        const secW = width * (1 - (i / sections) * 0.85);
        const secH = sectionH * 1.25;

        ctx.fillStyle = treeColor;
        ctx.beginPath();
        ctx.moveTo(x, secY - secH);
        ctx.lineTo(x - secW / 2, secY);
        ctx.lineTo(x + secW / 2, secY);
        ctx.closePath();
        ctx.fill();

        if (snowColor) {
            ctx.fillStyle = snowColor;
            ctx.beginPath();
            ctx.moveTo(x, secY - secH);
            ctx.lineTo(x - secW * 0.18, secY - secH * 0.62);
            ctx.lineTo(x + secW * 0.18, secY - secH * 0.62);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(x - secW / 2, secY);
            ctx.lineTo(x - secW * 0.38, secY - secH * 0.12);
            ctx.lineTo(x - secW * 0.18, secY);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(x + secW / 2, secY);
            ctx.lineTo(x + secW * 0.38, secY - secH * 0.12);
            ctx.lineTo(x + secW * 0.18, secY);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.restore();
}

// --- Cloud Layers for Parallax ---
// Layer 0 = far (slow, small, faint)   speedMult 0.12
// Layer 1 = mid (medium)               speedMult 0.40
// Layer 2 = near (fast, large, vivid)  speedMult 1.00
const LAYER_CFG = [
    { count: 18, minW: 90, maxW: 160, minA: 0.20, maxA: 0.38, speedMult: 0.12 },
    { count: 14, minW: 150, maxW: 270, minA: 0.45, maxA: 0.62, speedMult: 0.40 },
    { count: 10, minW: 230, maxW: 400, minA: 0.65, maxA: 0.85, speedMult: 1.00 }
];

let cloudLayers = [[], [], []];

// --- Pyramid Parallax (Shifting Sand) ---
let pyramidLayers = [[], [], [], []];
const PYRAMID_LAYER_CFG = [
    { count: 4, size: 150, speed: 0.05, light: '#b8a478', shadow: '#8a7850', mid: '#a08b60' }, // Very distant
    { count: 3, size: 280, speed: 0.12, light: '#c5b085', shadow: '#9a855a', mid: '#b09b70' }, // Distant
    { count: 2, size: 450, speed: 0.25, light: '#dcc69a', shadow: '#b29d71', mid: '#c7b185' }, // Mid-range
    { count: 1, size: 700, speed: 0.45, light: '#e8d4a9', shadow: '#bcab7d', mid: '#d2bf93' }  // "Hero" pyramid
];

let duneLayers = [];
function initDunes() {
    const W = window.innerWidth;
    duneLayers = [
        { y: 0.74, speed: 0.08, color: '#3d2b1a', ripples: [], amp: 14, freq: 0.0042, phase: Math.random() * Math.PI * 2, scroll: 0 }, // Far dunes
        { y: 0.82, speed: 0.25, color: '#5c432d', ripples: [], amp: 26, freq: 0.0034, phase: Math.random() * Math.PI * 2, scroll: 0 }, // Mid dunes
        { y: 0.90, speed: 0.60, color: '#7a5c3e', ripples: [], amp: 38, freq: 0.0027, phase: Math.random() * Math.PI * 2, scroll: 0 }, // Near dunes
        { y: 0.97, speed: 1.10, color: '#96744a', ripples: [], amp: 22, freq: 0.0032, phase: Math.random() * Math.PI * 2, scroll: 0 }  // Foreground floor
    ];
    duneLayers.forEach((d, di) => {
        const rippleCount = 10 + di * 10;
        for (let i = 0; i < rippleCount; i++) {
            d.ripples.push({
                x: Math.random() * W,
                yOff: 10 + Math.random() * 80,
                w: 80 + Math.random() * 250,
                h: 1.5 + Math.random() * 4,
                alpha: 0.03 + Math.random() * 0.08
            });
        }
    });
}

function initPyramids() {
    const W = window.innerWidth;
    pyramidLayers = [[], [], [], []];
    PYRAMID_LAYER_CFG.forEach((cfg, li) => {
        for (let i = 0; i < cfg.count; i++) {
            pyramidLayers[li].push({
                x: Math.random() * W * 1.5,
                size: cfg.size * (0.9 + Math.random() * 0.4),
                speed: cfg.speed,
                offset: Math.random() * 0.3 // Randomize peak shift
            });
        }
    });
}

let sunflowerCanvases = [];
let sunflowerForeground = [];
let sunflowerPatterns = [];
let sunflowerPatternMeta = [];
let sunflowerScrollX = [];
let sunflowerPatternKey = '';
let roadCars = [];
let sunflowerCloudPattern = null;
let sunflowerCloudMeta = null;
let sunflowerCloudScrollX = 0;
let sunflowerCloudKey = '';
let sunflowerPoles = [];
let sunflowerPolesKey = '';
let sunflowerRainParticles = [];
let sunflowerGlowParticles = [];
let sunflowerLightningBolts = [];
let sunflowerNextLightningTime = 0;
let sunflowerLightningFlash = 0;
let sunflowerSkyGrad = null;
let sunflowerSunGrad = null;
let sunflowerGradKey = '';

const SUNFLOWER_SPRITE_W = 180;
const SUNFLOWER_SPRITE_H = 270;

const SUNFLOWER_CLOUD_CFG = {
    tileHFrac: 0.20,
    yTopFrac: 0.30,
    speed: 0.22,
    alpha: 0.95
};

const SUNFLOWER_POLE_CFG = {
    count: 3,
    baseY: 0.63,
    minHFrac: 0.20,
    maxHFrac: 0.30,
    speed: 0.10
};

const SUNFLOWER_LAYER_CFG = [
    { count: 70, speed: 0.35, scaleMin: 0.18, scaleMax: 0.28, baseY: 0.66 }, // Back layer (pattern)
    { count: 56, speed: 0.65, scaleMin: 0.30, scaleMax: 0.42, baseY: 0.72 }, // Mid-back (pattern)
    { count: 40, speed: 1.05, scaleMin: 0.46, scaleMax: 0.60, baseY: 0.80 }, // Mid (pattern)
    { count: 26, speed: 1.55, scaleMin: 0.72, scaleMax: 0.90, baseY: 0.87 }, // Near (pattern)
    { count: 0, speed: 2.20, isRoad: true, baseY: 0.88 }, // Road layer
    { count: 9, speed: 3.40, scaleMin: 1.35, scaleMax: 1.85, baseY: 1.15, isForeground: true } // Foreground overlapping
];

function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function generateSunflowerCanvas(seed = 1) {
    const w = SUNFLOWER_SPRITE_W;
    const h = SUNFLOWER_SPRITE_H;
    const oc = document.createElement('canvas');
    oc.width = w;
    oc.height = h;
    const ctx = oc.getContext('2d');

    const rand = mulberry32(seed);
    const cx = w * 0.5;
    const headY = h * 0.34;
    const headR = w * 0.18;

    // --- Stem (slightly curved) ---
    const stemGrad = ctx.createLinearGradient(cx, headY, cx, h);
    stemGrad.addColorStop(0, '#2f7a33');
    stemGrad.addColorStop(1, '#1f4d21');
    ctx.strokeStyle = stemGrad;
    ctx.lineWidth = Math.max(4, Math.round(w * 0.06));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.02, headY + headR * 0.7);
    ctx.bezierCurveTo(cx + w * 0.10, headY + h * 0.35, cx - w * 0.05, h * 0.80, cx + w * 0.01, h);
    ctx.stroke();

    // --- Leaves (two bezier teardrops) ---
    function drawLeaf(side = -1) {
        const leafW = w * (0.20 + rand() * 0.05);
        const leafH = h * (0.10 + rand() * 0.04);
        const lx = cx + side * w * (0.12 + rand() * 0.03);
        const ly = headY + h * (0.34 + rand() * 0.08);

        const leafGrad = ctx.createLinearGradient(lx, ly - leafH, lx + side * leafW, ly + leafH);
        leafGrad.addColorStop(0, '#3aa33f');
        leafGrad.addColorStop(1, '#1b5e20');

        ctx.fillStyle = leafGrad;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx + side * leafW * 0.9, ly - leafH * 0.9, lx + side * leafW, ly);
        ctx.quadraticCurveTo(lx + side * leafW * 0.7, ly + leafH * 0.9, lx, ly);
        ctx.fill();

        // Midrib
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx + side * leafW * 0.55, ly, lx + side * leafW * 0.95, ly);
        ctx.stroke();
    }
    drawLeaf(-1);
    drawLeaf(1);

    // --- Petals (gradient per petal for volume) ---
    const petals = 18 + Math.floor(rand() * 3);
    for (let i = 0; i < petals; i++) {
        const angle = (Math.PI * 2 * i) / petals + (rand() - 0.5) * 0.08;
        const petalLen = w * (0.34 + rand() * 0.08);
        const petalW = w * (0.10 + rand() * 0.03);

        ctx.save();
        ctx.translate(cx, headY);
        ctx.rotate(angle);
        ctx.translate(0, headR * 0.25);

        const g = ctx.createLinearGradient(0, 0, 0, petalLen);
        g.addColorStop(0, '#b45309'); // darker base
        g.addColorStop(0.4, '#f59e0b');
        g.addColorStop(1, '#fde047'); // bright tip
        ctx.fillStyle = g;

        ctx.beginPath();
        ctx.ellipse(0, petalLen * 0.55, petalW * 0.55, petalLen * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        // Subtle edge highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    // --- Center disc (radial gradient + seed texture) ---
    const diskGrad = ctx.createRadialGradient(cx, headY, headR * 0.15, cx, headY, headR * 1.15);
    diskGrad.addColorStop(0, '#7c2d12');
    diskGrad.addColorStop(0.7, '#431407');
    diskGrad.addColorStop(1, '#2a0a04');
    ctx.fillStyle = diskGrad;
    ctx.beginPath();
    ctx.arc(cx, headY, headR * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // Seeds (Vogel model / Fermat spiral feel)
    const seedCount = 110;
    const golden = Math.PI * (3 - Math.sqrt(5)); // golden angle
    ctx.fillStyle = 'rgba(254, 240, 138, 0.14)';
    for (let n = 0; n < seedCount; n++) {
        const r = Math.sqrt(n / seedCount) * (headR * 0.95);
        const a = n * golden;
        const sx = cx + r * Math.cos(a);
        const sy = headY + r * Math.sin(a);
        const s = 0.9 + rand() * 0.8;
        ctx.beginPath();
        ctx.arc(sx, sy, s, 0, Math.PI * 2);
        ctx.fill();
    }

    // Outer ring shadow for depth
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, headY, headR * 1.05, 0, Math.PI * 2);
    ctx.stroke();

    return oc;
}

function buildSunflowerPatterns(tileW, tileH, variants, layerCfg, seed) {
    if (!tCtxBg) return { pattern: null, tile: null };

    const oc = document.createElement('canvas');
    oc.width = tileW;
    oc.height = tileH;
    const ctx = oc.getContext('2d');

    // Keep background transparent; only sunflowers are drawn
    const rand = mulberry32(seed);
    const count = layerCfg.count;
    for (let i = 0; i < count && sunflowerRainParticles.length < 900; i++) {
        const scale = layerCfg.scaleMin + rand() * (layerCfg.scaleMax - layerCfg.scaleMin);
        const sprite = variants[Math.floor(rand() * variants.length)] || variants[0];
        const sw = SUNFLOWER_SPRITE_W * scale;
        const sh = SUNFLOWER_SPRITE_H * scale;

        const x = Math.floor(rand() * (tileW + sw)) - Math.floor(sw);
        const jitter = (rand() - 0.5) * Math.min(70, tileH * 0.22);
        const y = Math.floor(tileH - sh + jitter);

        ctx.drawImage(sprite, x, y, Math.max(1, Math.floor(sw)), Math.max(1, Math.floor(sh)));
    }

    const pattern = tCtxBg.createPattern(oc, 'repeat-x');
    return { pattern, tile: oc };
}

function buildSunsetCloudPattern(tileW, tileH, seed = 777) {
    if (!tCtxBg) return { pattern: null, tile: null };

    const oc = document.createElement('canvas');
    oc.width = tileW;
    oc.height = tileH;
    const ctx = oc.getContext('2d');

    const rand = mulberry32(seed);
    ctx.clearRect(0, 0, tileW, tileH);

    const canFilter = typeof ctx.filter === 'string';

    // Base fluffy bank (soft, large blobs)
    if (canFilter) ctx.filter = 'blur(14px)';
    for (let i = 0; i < 34; i++) {
        const x = rand() * tileW;
        const y = tileH * (0.52 + rand() * 0.30);
        const r = tileH * (0.14 + rand() * 0.34);
        const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.45, 'rgba(255,241,226,0.55)');
        g.addColorStop(1, 'rgba(255,241,226,0)');
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Highlights (less blur, warmer edges)
    if (canFilter) ctx.filter = 'blur(6px)';
    for (let i = 0; i < 14; i++) {
        const x = rand() * tileW;
        const y = tileH * (0.50 + rand() * 0.25);
        const r = tileH * (0.08 + rand() * 0.22);
        const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.55, 'rgba(255,220,200,0.35)');
        g.addColorStop(1, 'rgba(255,220,200,0)');
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    if (canFilter) ctx.filter = 'none';
    ctx.globalAlpha = 1;

    // Feather edges so it blends into the sky
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createLinearGradient(0, 0, 0, tileH);
    fade.addColorStop(0, 'rgba(255,255,255,0)');
    fade.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    fade.addColorStop(0.82, 'rgba(255,255,255,0.92)');
    fade.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, tileW, tileH);
    ctx.globalCompositeOperation = 'source-over';

    const pattern = tCtxBg.createPattern(oc, 'repeat-x');
    return { pattern, tile: oc };
}

function renderLostInSnowForest(playing, fallMult) {
    if (!tCtxBg) return;

    const W = tCtxBg.canvas.width;
    const H = tCtxBg.canvas.height;
    let elapsed = 0;

    let whiteAlpha = 0;
    if (lostInSnowStage === 'transition') {
        elapsed = (Date.now() - transitionStartTime) / 1000;
        if (elapsed < 0.8) {
            whiteAlpha = Math.min(1.0, elapsed / 0.8);
        } else {
            lostInSnowStage = 'forest';
            // Blizzard particle burst
            lostInSnowParticles.forEach(p => {
                p.alpha = 0.8 + Math.random() * 0.2;
                p.speedY = 3.0 + Math.random() * 3.0;
                p.speedX = -2.0 - Math.random() * 2.0;
            });
        }
    }

    if (lostInSnowStage === 'sunrise') {
        // 1. Sky Gradient Background (pink to yellow)
        const skyGrad = tCtxBg.createLinearGradient(0, 0, 0, H * 0.75);
        skyGrad.addColorStop(0, '#ff1af3'); // vibrant pink
        skyGrad.addColorStop(0.35, '#ff4bf1'); // magenta-pink
        skyGrad.addColorStop(0.7, '#ffac4b'); // orange-yellow
        skyGrad.addColorStop(1.0, '#ffd15c'); // golden yellow
        tCtxBg.fillStyle = skyGrad;
        tCtxBg.fillRect(0, 0, W, H);

        // 2. Rising Sun behind mountains
        const sunX = W * 0.5;
        const sunY = H * 0.52;
        const sunGlow = tCtxBg.createRadialGradient(sunX, sunY, 10, sunX, sunY, 280);
        sunGlow.addColorStop(0, 'rgba(255, 255, 230, 1.0)');
        sunGlow.addColorStop(0.3, 'rgba(255, 230, 150, 0.85)');
        sunGlow.addColorStop(0.6, 'rgba(255, 140, 180, 0.35)');
        sunGlow.addColorStop(1.0, 'rgba(255, 75, 241, 0)');
        tCtxBg.fillStyle = sunGlow;
        tCtxBg.beginPath();
        tCtxBg.arc(sunX, sunY, 280, 0, Math.PI * 2);
        tCtxBg.fill();

        // Sky watercolor wash splotches & splatters (painterly imperfections matching user's image)
        const skySplatterSeed = 8888;
        const sRand = mulberry32(skySplatterSeed);

        // 12 soft watercolor sky washes
        for (let s = 0; s < 12; s++) {
            const sX = sRand() * W;
            const sY = sRand() * H * 0.6;
            const r = 80 + sRand() * 150;

            const colorType = sRand();
            let color;
            if (colorType < 0.5) {
                color = `rgba(255, 75, 200, ${0.08 + sRand() * 0.08})`; // soft magenta-pink wash
            } else {
                color = `rgba(255, 172, 75, ${0.08 + sRand() * 0.08})`; // soft orange-yellow wash
            }

            const radGrad = tCtxBg.createRadialGradient(sX, sY, r * 0.1, sX, sY, r);
            radGrad.addColorStop(0, color);
            radGrad.addColorStop(0.5, color);
            radGrad.addColorStop(1, 'rgba(0,0,0,0)');
            tCtxBg.fillStyle = radGrad;

            tCtxBg.beginPath();
            tCtxBg.arc(sX, sY, r, 0, Math.PI * 2);
            tCtxBg.fill();
        }

        // Tiny white splatter speckles in sky
        tCtxBg.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let i = 0; i < 24; i++) {
            const sx = sRand() * W;
            const sy = sRand() * H * 0.52;
            const size = 1.0 + sRand() * 2.5;
            tCtxBg.beginPath();
            tCtxBg.arc(sx, sy, size, 0, Math.PI * 2);
            tCtxBg.fill();
        }

        // 3. Parallax Layer 1: Multi-layered Detailed Mountain Ranges with Fixed Parallax
        if (typeof window.sunriseScroll1 === 'undefined') { window.sunriseScroll1 = 0; }
        window.sunriseScroll1 += 1.2 * fallMult * 3;

        drawPointedMountainRange(tCtxBg, W, H, window.sunriseScroll1);

        // 4. Parallax Layer 2: Ultra-Detailed Animated Lake / Water
        const lakeY = H * 0.72;
        const lakeH = H * 0.14;

        // Deep sky/sun reflection gradient in water
        const lakeGrad = tCtxBg.createLinearGradient(0, lakeY, 0, lakeY + lakeH);
        lakeGrad.addColorStop(0.0, '#355c70'); // Deep reflection near mountains
        lakeGrad.addColorStop(0.4, '#447b8f'); // Turquoise mid
        lakeGrad.addColorStop(0.8, '#5998ab'); // Shimmering teal
        lakeGrad.addColorStop(1.0, '#6daab9'); // Bright shore water edge
        tCtxBg.fillStyle = lakeGrad;
        tCtxBg.fillRect(0, lakeY, W, lakeH);

        // Mountain reflection silhouette in water near far shore
        drawMountainReflection(tCtxBg, W, H, window.sunriseScroll1, lakeY);

        // Extra wavy reflection blending
        tCtxBg.fillStyle = 'rgba(30, 20, 15, 0.15)';
        tCtxBg.beginPath();
        tCtxBg.moveTo(0, lakeY);
        for (let x = 0; x <= W + 50; x += 40) {
            const ry = lakeY + Math.sin(x * 0.008 + Date.now() * 0.001) * 6 + 12;
            tCtxBg.lineTo(x, ry);
        }
        tCtxBg.lineTo(W, lakeY);
        tCtxBg.closePath();
        tCtxBg.fill();

        // Multi-layered perspective water ripples
        if (typeof window.waterScroll === 'undefined') { window.waterScroll = 0; }
        window.waterScroll += 0.8 * fallMult * 3;

        for (let layer = 0; layer < 5; layer++) {
            const layerFrac = layer / 4;
            const lineY = lakeY + 4 + layerFrac * (lakeH - 8);
            const lineH = 1.5 + layerFrac * 2.0; // Thicker lines in foreground
            const speedMult = 0.5 + layerFrac * 1.5;

            for (let j = 0; j < 8; j++) {
                const width = (80 + (j * 23 + layer * 47) % 140) * (0.8 + layerFrac * 0.6);
                const lineX = ((j * 220 + layer * 110 - window.waterScroll * speedMult) % (W + 300)) - 150;

                // Draw a wavy bezier wavelet
                const amp = 1.0 + layerFrac * 3.0;
                const driftY = Math.sin(Date.now() * 0.0008 + j * 0.5 + layer) * (0.4 + layerFrac * 1.0);
                const finalY = lineY + driftY;

                tCtxBg.beginPath();
                tCtxBg.moveTo(lineX, finalY);
                tCtxBg.bezierCurveTo(
                    lineX + width * 0.25, finalY - amp,
                    lineX + width * 0.75, finalY + amp,
                    lineX + width, finalY
                );
                tCtxBg.strokeStyle = layer % 2 === 0 ? 'rgba(180, 230, 245, 0.45)' : 'rgba(70, 120, 140, 0.35)';
                tCtxBg.lineWidth = lineH;
                tCtxBg.lineCap = 'round';
                tCtxBg.stroke();
            }
        }

        // Spectacular Golden Sun Reflection Column on Water (Glistening Sun Path)
        // Draw main golden glow background for the sun reflection path
        const sunPathGrad = tCtxBg.createLinearGradient(sunX - 150, lakeY, sunX + 150, lakeY);
        sunPathGrad.addColorStop(0, 'rgba(255, 172, 75, 0)');
        sunPathGrad.addColorStop(0.5, 'rgba(255, 234, 159, 0.22)');
        sunPathGrad.addColorStop(1, 'rgba(255, 172, 75, 0)');
        tCtxBg.fillStyle = sunPathGrad;
        tCtxBg.fillRect(sunX - 250, lakeY, 500, lakeH);

        // Render detailed glistening specular reflection bars
        for (let i = 0; i < 28; i++) {
            const frac = i / 27;
            const lineY = lakeY + 4 + frac * (lakeH - 8);

            // Calculate width and position with perspective (wider at the foreground/bottom)
            const baseW = 100 + frac * 220;
            const waveW = baseW + Math.sin(Date.now() * 0.0008 + i * 1.1) * 25;

            const lineH = 1.2 + frac * 2.2;
            const lineX = sunX - waveW * 0.5 + Math.cos(Date.now() * 0.0005 + i * 0.7) * 10;

            // Draw wave bar as a smooth double-bezier wavy line
            const waveAmp = 1.5 + frac * 3.5;
            tCtxBg.beginPath();
            tCtxBg.moveTo(lineX, lineY);
            tCtxBg.bezierCurveTo(
                lineX + waveW * 0.25, lineY - waveAmp * Math.sin(Date.now() * 0.001 + i),
                lineX + waveW * 0.75, lineY + waveAmp * Math.sin(Date.now() * 0.001 + i),
                lineX + waveW, lineY
            );
            tCtxBg.strokeStyle = `rgba(255, 238, 175, ${0.78 - frac * 0.42})`;
            tCtxBg.lineWidth = lineH;
            tCtxBg.lineCap = 'round';
            tCtxBg.stroke();

            // Draw center hot-spot highlight
            const centerW = waveW * (0.22 + Math.sin(Date.now() * 0.0012 + i) * 0.06);
            const centerX = sunX - centerW * 0.5 + Math.cos(Date.now() * 0.0006 + i * 0.9) * 4;
            tCtxBg.beginPath();
            tCtxBg.moveTo(centerX, lineY);
            tCtxBg.bezierCurveTo(
                centerX + centerW * 0.25, lineY - waveAmp * 0.5 * Math.sin(Date.now() * 0.001 + i),
                centerX + centerW * 0.75, lineY + waveAmp * 0.5 * Math.sin(Date.now() * 0.001 + i),
                centerX + centerW, lineY
            );
            tCtxBg.strokeStyle = `rgba(255, 255, 245, ${0.9 - frac * 0.25})`;
            tCtxBg.lineWidth = lineH * 1.1;
            tCtxBg.lineCap = 'round';
            tCtxBg.stroke();

            // Add extra small glistening sub-sparkles on the sides of the path
            if (i % 2 === 0) {
                const sp1X = lineX - 25 - (Math.sin(Date.now() * 0.001 + i) * 8);
                const sp1W = 12 + (Math.cos(Date.now() * 0.0015 + i) * 5); tCtxBg.fillStyle = `rgba(255, 225, 150, ${0.45 - frac * 0.2})`;
                tCtxBg.fillRect(sp1X, lineY, sp1W, lineH * 0.8);

                const sp2X = lineX + waveW + 10 + (Math.sin(Date.now() * 0.0012 + i) * 8);
                const sp2W = 12 + (Math.cos(Date.now() * 0.0018 + i) * 5);
                tCtxBg.fillRect(sp2X, lineY, sp2W, lineH * 0.8);
            }
        }

        // Shoreline foam glow edge between water and mountains
        tCtxBg.fillStyle = 'rgba(255, 245, 220, 0.5)';
        tCtxBg.fillRect(0, lakeY, W, 2);

        // Lake Watercolor Wash Overlay (gaining painterly textures matching user's image)
        tCtxBg.save();
        tCtxBg.beginPath();
        tCtxBg.rect(0, lakeY, W, lakeH);
        tCtxBg.clip();

        const lakeSeed = 999;
        const lRand = mulberry32(lakeSeed);
        for (let s = 0; s < 30; s++) {
            const sX = lRand() * W;
            const sY = lakeY + lRand() * lakeH;
            const r = 40 + lRand() * 95;

            const colorType = lRand();
            let color;
            if (colorType < 0.38) {
                color = `rgba(165, 218, 192, ${0.14 + lRand() * 0.12})`; // soft light mint-green wash
            } else if (colorType < 0.72) {
                color = `rgba(255, 238, 170, ${0.10 + lRand() * 0.10})`; // warm yellow-cream wash
            } else {
                color = `rgba(60, 110, 125, ${0.12 + lRand() * 0.12})`; // teal depth wash
            }

            const radGrad = tCtxBg.createRadialGradient(sX, sY, r * 0.15, sX, sY, r);
            radGrad.addColorStop(0, color);
            radGrad.addColorStop(0.5, color);
            radGrad.addColorStop(1, 'rgba(0,0,0,0)');
            tCtxBg.fillStyle = radGrad;

            tCtxBg.beginPath();
            tCtxBg.arc(sX, sY, r, 0, Math.PI * 2);
            tCtxBg.fill();
        }
        tCtxBg.restore();

        // 5. Parallax Layer 3: Ultra-Detailed Snowy Shoreline & Rolling Snow Banks
        if (typeof window.sunriseScroll2 === 'undefined') { window.sunriseScroll2 = 0; }
        window.sunriseScroll2 += 4.5 * fallMult * 3;

        // Far rolling snow hill layer (soft blue-shaded snow bank)
        tCtxBg.fillStyle = '#a6c6d9';
        tCtxBg.beginPath();
        tCtxBg.moveTo(0, H);
        tCtxBg.lineTo(0, H * 0.83);
        for (let x = 0; x <= W + 100; x += 50) {
            const y = H * 0.83 + Math.sin((x + window.sunriseScroll2 * 0.5) * 0.003) * 14;
            tCtxBg.lineTo(x, y);
        }
        tCtxBg.lineTo(W, H);
        tCtxBg.closePath();
        tCtxBg.fill();

        // Main foreground crisp snowy ground fill
        const snowGrad = tCtxBg.createLinearGradient(0, H * 0.85, 0, H);
        snowGrad.addColorStop(0.0, '#ffffff'); // Golden sunlit snow top
        snowGrad.addColorStop(0.3, '#dcedf7'); // Crisp blue-white snow mid
        snowGrad.addColorStop(1.0, '#abc5d6'); // Shaded snow base
        tCtxBg.fillStyle = snowGrad;

        tCtxBg.beginPath();
        tCtxBg.moveTo(0, H);
        tCtxBg.lineTo(0, H * 0.86);
        for (let x = 0; x <= W + 100; x += 40) {
            const y = H * 0.86 + Math.sin((x + window.sunriseScroll2) * 0.004) * 10;
            tCtxBg.lineTo(x, y);
        }
        tCtxBg.lineTo(W, H);
        tCtxBg.closePath();
        tCtxBg.fill();

        // Wind-swept snow ridge lines (Sastrugi highlights)
        tCtxBg.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        tCtxBg.lineWidth = 2.5;
        tCtxBg.beginPath();
        for (let x = 0; x <= W + 100; x += 40) {
            const y = H * 0.86 + Math.sin((x + window.sunriseScroll2) * 0.004) * 10;
            if (x === 0) tCtxBg.moveTo(x, y);
            else tCtxBg.lineTo(x, y);
        }
        tCtxBg.stroke();

        // Sparkling ice crystals on snow surface
        tCtxBg.fillStyle = '#ffffff';
        for (let s = 0; s < 15; s++) {
            const sx = ((s * 137 + window.sunriseScroll2 * 2) % (W + 100)) - 50;
            const sy = H * 0.86 + Math.sin((sx + window.sunriseScroll2) * 0.004) * 10 + (s % 5) * 4;
            const glint = Math.sin(Date.now() * 0.005 + s) * 0.5 + 0.5;
            if (glint > 0.3) {
                tCtxBg.globalAlpha = glint;
                tCtxBg.fillRect(sx, sy, 2.5, 2.5);
            }
        }
        tCtxBg.globalAlpha = 1.0;

        // 6. Parallax Layer 4: Foreground Tall Pine Trees scrolling fast (spawning with wide & irregular spacing)
        if (typeof window.sunriseTreeScroll === 'undefined') { window.sunriseTreeScroll = 0; }
        window.sunriseTreeScroll += 7.5 * fallMult * 3;

        const span = W + 1800;
        const groundY = H * 0.94;

        // Tree slots with irregular spacing, varied moderate heights, and distinct widths
        const treeConfigs = [
            { baseOff: 150, w: 210, hMult: 1.25, variant: _sunriseTreeVariants[0] },
            { baseOff: 880, w: 165, hMult: 0.95, variant: _sunriseTreeVariants[1] },
            { baseOff: 1650, w: 230, hMult: 1.35, variant: _sunriseTreeVariants[2] },
            { baseOff: 2420, w: 180, hMult: 1.10, variant: (_sunriseTreeVariants[0] + 3) % 8 }
        ];

        treeConfigs.forEach(cfg => {
            let tx = (cfg.baseOff - window.sunriseTreeScroll) % span;
            if (tx < -350) tx += span;

            if (tx >= -350 && tx <= W + 350) {
                const treeH = H * cfg.hMult;
                drawSunrisePineTree(tCtxBg, tx, groundY, cfg.w, treeH, '#0c1613', '#ffffff', cfg.variant);
            }
        });
    }
}

function resetSunflowerStorm() {
    sunflowerRainParticles = [];
    sunflowerGlowParticles = [];
    sunflowerLightningBolts = [];
    sunflowerNextLightningTime = 0;
    sunflowerLightningFlash = 0;
}

function spawnSunflowerStormRain(count, glowCount) {
    const W = window.innerWidth;
    const H = window.innerHeight;

    for (let i = 0; i < count; i++) {
        sunflowerRainParticles.push({
            x: Math.random() * (W + 260) - 130,
            y: -80 - Math.random() * H * 0.25,
            len: 25 + Math.random() * 40,
            speed: 20 + Math.random() * 22,
            wind: -7 - Math.random() * 6,
            alpha: 0.15 + Math.random() * 0.25,
            width: 1 + Math.random() * 1.4
        });
    }

    for (let i = 0; i < glowCount && sunflowerGlowParticles.length < 80; i++) {
        sunflowerGlowParticles.push({
            x: Math.random() * W,
            y: -60 - Math.random() * H * 0.15,
            size: 38 + Math.random() * 95,
            vx: -1.6 - Math.random() * 2.4,
            vy: 3.2 + Math.random() * 7.5,
            alpha: 0.035 + Math.random() * 0.08,
            life: 0.7 + Math.random() * 0.4,
            decay: 0.006 + Math.random() * 0.006
        });
    }
}

function spawnSunflowerLightning(W, H) {
    const startX = W * (0.18 + Math.random() * 0.64);
    const endY = H * (0.46 + Math.random() * 0.20);
    const segments = 8 + Math.floor(Math.random() * 5);
    const points = [{ x: startX, y: -20 }];

    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        points.push({
            x: startX + (Math.random() - 0.5) * W * 0.12 * t,
            y: -20 + endY * t
        });
    }

    const branches = [];
    for (let i = 2; i < points.length - 2; i += 2) {
        if (Math.random() < 0.62) {
            const base = points[i];
            const dir = Math.random() > 0.5 ? 1 : -1;
            branches.push([
                base,
                { x: base.x + dir * (28 + Math.random() * 70), y: base.y + 24 + Math.random() * 45 },
                { x: base.x + dir * (55 + Math.random() * 110), y: base.y + 54 + Math.random() * 70 }
            ]);
        }
    }

    sunflowerLightningBolts.push({
        points,
        branches,
        life: 1,
        decay: 0.055 + Math.random() * 0.02
    });
    sunflowerLightningFlash = 1;
}

function initSunflowers(forceRebuild = false) {
    if (!tCtxBg) return;

    // Sprites (a few variants to reduce obvious repetition)
    if (sunflowerCanvases.length === 0) {
        sunflowerCanvases.push(generateSunflowerCanvas(1));
        sunflowerCanvases.push(generateSunflowerCanvas(2));
        sunflowerCanvases.push(generateSunflowerCanvas(3));

        // Pre-render a blurred variant for foreground overlap
        const blurred = document.createElement('canvas');
        blurred.width = SUNFLOWER_SPRITE_W;
        blurred.height = SUNFLOWER_SPRITE_H;
        const bCtx = blurred.getContext('2d');
        bCtx.filter = 'blur(4px)';
        bCtx.drawImage(sunflowerCanvases[0], 0, 0);
        bCtx.filter = 'none';
        sunflowerCanvases.push(blurred);
    }

    const W = window.innerWidth;
    const H = window.innerHeight;
    const key = `${W}x${H}`;
    const expectedCloudKey = `cloud:${W}x${H}`;
    const expectedPolesKey = `poles:${W}x${H}`;
    if (!forceRebuild &&
        sunflowerPatternKey === key &&
        sunflowerPatterns.length > 0 &&
        sunflowerCloudPattern && sunflowerCloudMeta && sunflowerCloudKey === expectedCloudKey &&
        sunflowerPoles && sunflowerPoles.length > 0 && sunflowerPolesKey === expectedPolesKey) {
        return;
    }

    sunflowerPatternKey = key;
    sunflowerPatterns = [];
    sunflowerPatternMeta = [];
    sunflowerScrollX = [];
    sunflowerForeground = [];
    roadCars = [];
    sunflowerCloudPattern = null;
    sunflowerCloudMeta = null;
    sunflowerCloudScrollX = 0;
    sunflowerCloudKey = '';
    sunflowerPoles = [];
    sunflowerPolesKey = '';
    sunflowerSkyGrad = null;
    sunflowerSunGrad = null;
    sunflowerGradKey = '';

    const baseTileW = Math.min(2048, Math.max(768, Math.ceil(W * 1.15)));

    // Build patterns for layers 0-3, keep road dynamic, foreground as a small sprite set
    SUNFLOWER_LAYER_CFG.forEach((cfg, li) => {
        if (cfg.isRoad || cfg.isForeground) return;

        const tileH = Math.ceil(SUNFLOWER_SPRITE_H * cfg.scaleMax + Math.min(90, H * 0.10));
        const baseY = Math.floor(H * cfg.baseY);
        const yTop = Math.floor(baseY - tileH);

        const variants = sunflowerCanvases.slice(0, 3);
        const built = buildSunflowerPatterns(baseTileW, tileH, variants, cfg, 1000 + li * 777);

        sunflowerPatterns[li] = built.pattern;
        sunflowerPatternMeta[li] = { tileW: baseTileW, tileH, yTop, baseY };
        sunflowerScrollX[li] = Math.floor(Math.random() * baseTileW);
    });

    // Foreground sparse sprites (still cheap: 9 drawImage per frame max)
    const fgIdx = SUNFLOWER_LAYER_CFG.findIndex(c => c.isForeground);
    if (fgIdx >= 0) {
        const cfg = SUNFLOWER_LAYER_CFG[fgIdx];
        for (let i = 0; i < cfg.count; i++) {
            sunflowerForeground.push({
                x: Math.random() * W * 1.4,
                scale: cfg.scaleMin + Math.random() * (cfg.scaleMax - cfg.scaleMin),
                yOff: (Math.random() - 0.5) * H * 0.06,
                speed: cfg.speed * (0.9 + Math.random() * 0.2)
            });
        }
    }

    // Horizon cloud band pattern (pre-rendered, repeat-x)
    const cloudKey = `cloud:${W}x${H}`;
    if (forceRebuild || sunflowerCloudKey !== cloudKey || !sunflowerCloudPattern) {
        sunflowerCloudKey = cloudKey;
        const tileW = Math.min(2048, Math.max(1024, Math.ceil(W * 1.15)));
        const tileH = Math.max(140, Math.floor(H * SUNFLOWER_CLOUD_CFG.tileHFrac));
        const built = buildSunsetCloudPattern(tileW, tileH, 424242 + Math.floor(W * 3 + H * 7));
        sunflowerCloudPattern = built.pattern;
        sunflowerCloudMeta = { tileW, tileH, yTop: Math.floor(H * SUNFLOWER_CLOUD_CFG.yTopFrac) };
        sunflowerCloudScrollX = Math.floor(Math.random() * tileW);
    }

    // Power poles (sparse, far distance)
    const polesKey = `poles:${W}x${H}`;
    if (forceRebuild || sunflowerPolesKey !== polesKey) {
        sunflowerPolesKey = polesKey;
        sunflowerPoles = [];
        const rand = mulberry32(101010 + Math.floor(W * 13 + H * 17));
        const count = SUNFLOWER_POLE_CFG.count;
        for (let i = 0; i < count; i++) {
            const x = rand() * (W * 1.2);
            const hFrac = SUNFLOWER_POLE_CFG.minHFrac + rand() * (SUNFLOWER_POLE_CFG.maxHFrac - SUNFLOWER_POLE_CFG.minHFrac);
            sunflowerPoles.push({
                x,
                yBase: H * SUNFLOWER_POLE_CFG.baseY + (rand() - 0.5) * H * 0.02,
                h: H * hFrac,
                w: 5 + rand() * 4,
                cross: 55 + rand() * 40,
                lean: (rand() - 0.5) * Math.min(22, H * 0.02)
            });
        }
    }
}

// --- CITY THEME LOGIC ---
let cityLayers = [];
let cityPoles = [];
let cityRoadOffset = 0;
function initCityBuildings() {
    cityLayers = [[], [], []];
    cityPoles = [];
    roadCars = [];
    cityRoadOffset = 0;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const layerConfigs = [
        { count: 12, speed: 0.2, color: '#0d1322', hMin: 0.3, hMax: 0.6, wMin: 80, wMax: 200, yOff: 0.65 },
        { count: 15, speed: 0.5, color: '#131b2f', hMin: 0.2, hMax: 0.5, wMin: 60, wMax: 150, yOff: 0.72 },
        { count: 18, speed: 1.0, color: '#1a243d', hMin: 0.1, hMax: 0.35, wMin: 50, wMax: 120, yOff: 0.85 }
    ];

    layerConfigs.forEach((cfg, li) => {
        let currentX = 0;
        for (let i = 0; i < cfg.count; i++) {
            const width = cfg.wMin + Math.random() * (cfg.wMax - cfg.wMin);
            const height = H * (cfg.hMin + Math.random() * (cfg.hMax - cfg.hMin));
            cityLayers[li].push({
                x: currentX,
                w: width,
                h: height,
                y: H * cfg.yOff - height,
                speed: cfg.speed,
                color: cfg.color,
                cfg: cfg,
                seed: Math.random() * 1000
            });
            currentX += width + (Math.random() * 50);
        }
    });

    let poleX = 0;
    while (poleX < W * 2) {
        cityPoles.push(poleX);
        poleX += 300 + Math.random() * 200;
    }
}

function drawCityBackground() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const playing = window.isPlaying && !window.isPaused && !window.isGameOver;
    const fallMult = playing ? (window.fallSpeed || 3.0) / 3.0 : 0.05;
    const isExtreme = !!window.isExtremeMap || !!window.forceSecondaryStyle;

    // Dark sky
    const skyGrad = tCtxBg.createLinearGradient(0, 0, 0, H * 0.8);
    skyGrad.addColorStop(0, '#05060a');
    skyGrad.addColorStop(1, '#14192d');
    tCtxBg.fillStyle = skyGrad;
    tCtxBg.fillRect(0, 0, W, H);

    // Stars
    if (!starCanvas || starCanvas.width !== W || starCanvas.height !== H) {
        starCanvas = generateStarfield(W, H);
    }
    tCtxBg.globalCompositeOperation = 'screen';
    tCtxBg.drawImage(starCanvas, 0, 0);

    // --- FAIRGROUND SEARCHLIGHTS (EXTREME MODE) ---
    const elapsedSongTime = window.lastInterpolatedTime || 0;
    if (isExtreme && elapsedSongTime >= 15) {
        const lightAlpha = Math.min(1.0, (elapsedSongTime - 15) / 5.0);
        tCtxBg.save();
        const numBeams = 6;
        const time = Date.now() / 1000;
        for (let i = 0; i < numBeams; i++) {
            const baseX = W * (0.2 + (i / numBeams) * 0.6);
            const baseY = H * 0.8;
            const angle = Math.sin(time * 0.7 + i * 2.1) * 0.6 - Math.PI / 2;
            const beamLength = H * 1.5;
            const beamWidth = 80 + Math.sin(time * 1.5 + i) * 30;

            const endX = baseX + Math.cos(angle) * beamLength;
            const endY = baseY + Math.sin(angle) * beamLength;

            const dx = -Math.sin(angle) * beamWidth;
            const dy = Math.cos(angle) * beamWidth;

            const beamGrad = tCtxBg.createLinearGradient(baseX, baseY, endX, endY);
            const hue = (time * 30 + i * 60) % 360;
            beamGrad.addColorStop(0, `hsla(${hue}, 100%, 75%, ${0.4 * lightAlpha})`);
            beamGrad.addColorStop(1, `hsla(${hue}, 100%, 75%, 0)`);

            tCtxBg.fillStyle = beamGrad;
            tCtxBg.beginPath();
            tCtxBg.moveTo(baseX, baseY);
            tCtxBg.lineTo(endX + dx, endY + dy);
            tCtxBg.lineTo(endX - dx, endY - dy);
            tCtxBg.fill();
        }
        tCtxBg.restore();
    }

    tCtxBg.globalCompositeOperation = 'source-over';

    // Draw Parallax Buildings
    if (cityLayers.length === 0) initCityBuildings();

    cityLayers.forEach((layer, li) => {
        layer.forEach(b => {
            b.x -= b.speed * fallMult * 8.0;
            if (b.x + b.w < 0) {
                let maxX = 0;
                layer.forEach(o => { if (o.x + o.w > maxX) maxX = o.x + o.w; });
                b.x = Math.max(W, maxX) + Math.random() * 50;
                b.h = H * (b.cfg.hMin + Math.random() * (b.cfg.hMax - b.cfg.hMin));
                b.y = H * b.cfg.yOff - b.h;
                b.seed = Math.random() * 1000;
            }

            tCtxBg.fillStyle = b.color;
            tCtxBg.fillRect(b.x, b.y, b.w, H - b.y);

            // Neon windows
            if (li > 0) {
                const seed = Math.floor(b.seed);
                const randomVal = (seed % 100) / 100;

                let winColor = (randomVal > 0.5) ? '#00f0ff' : '#ff0055';
                let alpha = 0.5;
                const timeSinceHit = Date.now() - (window.lastHitTime || 0);
                if (timeSinceHit < 300 && window.lastHitColor) {
                    winColor = window.lastHitColor;
                    alpha = 0.5 + 0.5 * (1.0 - timeSinceHit / 300);
                }

                tCtxBg.fillStyle = winColor;
                tCtxBg.globalAlpha = alpha;
                if (b.w > 40 && b.h > 100) {
                    const cols = Math.floor(b.w / 20);
                    const rows = Math.floor(b.h / 30);
                    for (let c = 0; c < cols; c++) {
                        for (let r = 0; r < rows; r++) {
                            const wSeed = (seed + c * 10 + r) % 100;
                            if (wSeed > 70) {
                                tCtxBg.fillRect(b.x + 10 + c * 20, b.y + 20 + r * 30, 8, 12);
                            }
                        }
                    }
                }
                tCtxBg.globalAlpha = 1.0;
            }
        });
    });

    // --- FOREGROUND STREET ---
    const streetY = H * 0.85;
    tCtxBg.fillStyle = '#0a0b10';
    tCtxBg.fillRect(0, streetY, W, H - streetY);

    // Street markings (moving)
    tCtxBg.fillStyle = 'rgba(255, 255, 255, 0.15)';
    const markW = 80;
    const markSpace = 120;
    // Increase road parallax speed to be strictly faster than the front buildings
    const roadSpeed = 16.0 * fallMult;
    cityRoadOffset = (cityRoadOffset + roadSpeed) % (markW + markSpace);

    for (let x = -cityRoadOffset - markW; x < W + markW; x += (markW + markSpace)) {
        tCtxBg.fillRect(x, streetY + (H - streetY) * 0.5 - 2, markW, 4);
    }

    // Spawn Cars
    if (playing && Math.random() < 0.04) {
        const toRight = Math.random() > 0.5;
        roadCars.push({
            x: toRight ? -200 : W + 200,
            y: streetY + (toRight ? 15 : 45),
            w: 80 + Math.random() * 60,
            h: 12 + Math.random() * 8,
            speed: (toRight ? 1 : -1) * (18 + Math.random() * 12),
            color: Math.random() > 0.5 ? '#00f0ff' : '#ff0055',
            isRight: toRight
        });
    }

    // Draw Cars
    for (let i = roadCars.length - 1; i >= 0; i--) {
        const c = roadCars[i];
        c.x += c.speed - (roadSpeed * 0.5);
        if (c.x < -400 || c.x > W + 400) {
            roadCars.splice(i, 1);
            continue;
        }

        // Underglow
        tCtxBg.shadowColor = c.color;
        tCtxBg.shadowBlur = 20;
        tCtxBg.fillStyle = c.color;
        tCtxBg.fillRect(c.x, c.y + c.h - 4, c.w, 4);
        tCtxBg.shadowBlur = 0;

        // Car Body (Chassis)
        tCtxBg.fillStyle = '#0f172a';
        tCtxBg.beginPath();
        if (tCtxBg.roundRect) tCtxBg.roundRect(c.x, c.y, c.w, c.h, 6);
        else tCtxBg.fillRect(c.x, c.y, c.w, c.h);
        tCtxBg.fill();

        // Neon Accent Line
        tCtxBg.fillStyle = c.color;
        tCtxBg.fillRect(c.x, c.y + c.h * 0.5, c.w, 2);

        // Cabin / Windows
        tCtxBg.fillStyle = '#1e293b';
        tCtxBg.beginPath();
        if (c.isRight) {
            tCtxBg.moveTo(c.x + c.w * 0.2, c.y);
            tCtxBg.lineTo(c.x + c.w * 0.4, c.y - c.h * 0.6);
            tCtxBg.lineTo(c.x + c.w * 0.7, c.y - c.h * 0.6);
            tCtxBg.lineTo(c.x + c.w * 0.85, c.y);
        } else {
            tCtxBg.moveTo(c.x + c.w * 0.8, c.y);
            tCtxBg.lineTo(c.x + c.w * 0.6, c.y - c.h * 0.6);
            tCtxBg.lineTo(c.x + c.w * 0.3, c.y - c.h * 0.6);
            tCtxBg.lineTo(c.x + c.w * 0.15, c.y);
        }
        tCtxBg.fill();

        // Wheels
        tCtxBg.fillStyle = '#000000';
        tCtxBg.strokeStyle = c.color;
        tCtxBg.lineWidth = 2;
        const wheelR = c.h * 0.4;
        tCtxBg.beginPath(); tCtxBg.arc(c.x + c.w * 0.25, c.y + c.h, wheelR, 0, Math.PI * 2); tCtxBg.fill(); tCtxBg.stroke();
        tCtxBg.beginPath(); tCtxBg.arc(c.x + c.w * 0.75, c.y + c.h, wheelR, 0, Math.PI * 2); tCtxBg.fill(); tCtxBg.stroke();

        // Headlights & Beams
        if (c.isRight) {
            tCtxBg.fillStyle = '#ffffff';
            tCtxBg.fillRect(c.x + c.w - 6, c.y + 2, 6, c.h * 0.4);
            tCtxBg.fillStyle = '#ff0055';
            tCtxBg.fillRect(c.x, c.y + 2, 6, c.h * 0.4);

            const grad = tCtxBg.createLinearGradient(c.x + c.w, c.y, c.x + c.w + 120, c.y);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            tCtxBg.fillStyle = grad;
            tCtxBg.beginPath();
            tCtxBg.moveTo(c.x + c.w, c.y + 2);
            tCtxBg.lineTo(c.x + c.w + 120, c.y - 15);
            tCtxBg.lineTo(c.x + c.w + 120, c.y + c.h + 15);
            tCtxBg.lineTo(c.x + c.w, c.y + c.h * 0.4);
            tCtxBg.fill();
        } else {
            tCtxBg.fillStyle = '#ffffff';
            tCtxBg.fillRect(c.x, c.y + 2, 6, c.h * 0.4);
            tCtxBg.fillStyle = '#ff0055';
            tCtxBg.fillRect(c.x + c.w - 6, c.y + 2, 6, c.h * 0.4);

            const grad = tCtxBg.createLinearGradient(c.x, c.y, c.x - 120, c.y);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            tCtxBg.fillStyle = grad;
            tCtxBg.beginPath();
            tCtxBg.moveTo(c.x, c.y + 2);
            tCtxBg.lineTo(c.x - 120, c.y - 15);
            tCtxBg.lineTo(c.x - 120, c.y + c.h + 15);
            tCtxBg.lineTo(c.x, c.y + c.h * 0.4);
            tCtxBg.fill();
        }
    }

    // Draw Streetlights
    tCtxBg.fillStyle = '#05060a';
    for (let i = 0; i < cityPoles.length; i++) {
        // Poles are slightly slower than the street marks, but faster than buildings
        cityPoles[i] -= roadSpeed * 0.9;
        if (cityPoles[i] < -100) {
            let maxP = 0;
            cityPoles.forEach(p => { if (p > maxP) maxP = p; });
            cityPoles[i] = Math.max(W, maxP) + 300 + Math.random() * 200;
        }

        const px = cityPoles[i];
        tCtxBg.fillRect(px, streetY - 150, 8, 150 + (H - streetY));
        tCtxBg.fillRect(px - 20, streetY - 150, 40, 6);

        tCtxBg.fillStyle = '#ffffff';
        tCtxBg.shadowColor = '#ffb84d';
        tCtxBg.shadowBlur = 40;
        tCtxBg.beginPath();
        tCtxBg.arc(px, streetY - 146, 8, 0, Math.PI * 2);
        tCtxBg.fill();
        tCtxBg.shadowBlur = 0;

        tCtxBg.fillStyle = '#05060a';
    }
}
function initThemeAssets() {
    // Initialize lightweight defaults; heavier assets are initialized when the theme is selected.
    initClouds();
    initPyramids();
    if (document.body.classList.contains('theme-cyberpunk')) initDunes();
    if (document.body.classList.contains('theme-sunflower')) initSunflowers(false);
    if (document.body.classList.contains('theme-city')) initCityBuildings();
    if (document.body.classList.contains('theme-forest')) initForest();
}

// Pre-render a single cloud to an offscreen canvas for performance
function prerenderCloud(baseW, alpha) {
    const pad = 120;                        // generous padding so nothing gets clipped
    const cw = Math.ceil(baseW * 3.2 + pad * 2);
    const ch = Math.ceil(baseW * 1.3 + pad * 2);

    const oc = document.createElement('canvas');
    oc.width = cw;
    oc.height = ch;
    const ox = oc.getContext('2d');

    const cx = cw / 2;
    const cy = ch * 0.62; // anchor point: flat bottom sits here

    // ---- Build puff catalogue ----
    const puffs = [];

    // 1) WISPY TENDRILS — very faint, scattered far out
    const wispN = 18 + Math.floor(Math.random() * 10);
    for (let i = 0; i < wispN; i++) {
        puffs.push({
            x: (Math.random() - 0.5) * baseW * 2.4,
            y: (Math.random() - 0.4) * baseW * 0.9,
            rx: baseW * (0.04 + Math.random() * 0.14),
            ry: baseW * (0.03 + Math.random() * 0.09),
            t: 'wisp'
        });
    }

    // 2) WIDE BODY ELLIPSES — flat, overlapping base
    for (let b = 0; b < 4; b++) {
        puffs.push({
            x: (Math.random() - 0.5) * baseW * 0.35,
            y: baseW * 0.04 * b,
            rx: baseW * (0.55 + Math.random() * 0.20),
            ry: baseW * (0.26 + Math.random() * 0.09),
            t: 'body'
        });
    }

    // 3) SECONDARY FILL PUFFS — medium bumps bridging towers
    const secN = 10 + Math.floor(Math.random() * 7);
    for (let i = 0; i < secN; i++) {
        puffs.push({
            x: (Math.random() - 0.5) * baseW * 1.6,
            y: -(baseW * (0.04 + Math.random() * 0.32)),
            rx: baseW * (0.07 + Math.random() * 0.20),
            ry: baseW * (0.06 + Math.random() * 0.16),
            t: 'secondary'
        });
    }

    // 4) CUMULUS TOWERS — tallest puffs, height follows an arch across the cloud
    const towerN = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < towerN; i++) {
        const frac = (i / (towerN - 1)) - 0.5;          // −0.5 … +0.5
        const hf = 1 - Math.abs(frac) * 0.75;          // taller in center
        const xOff = frac * baseW * 1.45 + (Math.random() - 0.5) * baseW * 0.12;
        const yOff = -(baseW * (0.22 + Math.random() * 0.50) * hf);
        const r = baseW * (0.20 + Math.random() * 0.28) * (0.55 + hf * 0.45);
        puffs.push({ x: xOff, y: yOff, rx: r, ry: r * (0.78 + Math.random() * 0.22), t: 'tower' });
    }

    // 5) FINE DETAIL PUFFS — tiny, high on top for texture
    const detN = 12 + Math.floor(Math.random() * 8);
    for (let i = 0; i < detN; i++) {
        puffs.push({
            x: (Math.random() - 0.5) * baseW * 1.3,
            y: -(baseW * (0.30 + Math.random() * 0.40)),
            rx: baseW * (0.03 + Math.random() * 0.10),
            ry: baseW * (0.025 + Math.random() * 0.08),
            t: 'detail'
        });
    }

    // Draw order: wisps → body → secondary → towers → detail
    const Z = { wisp: 0, body: 1, secondary: 2, tower: 3, detail: 4 };
    puffs.sort((a, b) => Z[a.t] - Z[b.t]);

    // ---- Underside shadow ----
    const shadowGrad = ox.createLinearGradient(0, cy - baseW * 0.12, 0, cy + baseW * 0.38);
    shadowGrad.addColorStop(0.0, 'rgba(140,162,200, 0)');
    shadowGrad.addColorStop(0.4, 'rgba(115,138,180, 0.32)');
    shadowGrad.addColorStop(0.8, 'rgba( 95,120,165, 0.14)');
    shadowGrad.addColorStop(1.0, 'rgba( 85,110,155, 0)');
    ox.fillStyle = shadowGrad;
    ox.fillRect(0, cy - baseW * 0.12, cw, baseW * 0.55);

    // ---- Draw puffs ----
    puffs.forEach(p => {
        const gx = cx + p.x;
        const gy = cy + p.y;

        let stops;
        switch (p.t) {
            case 'wisp':
                stops = [[0, 'rgba(255,255,255,0.45)'], [0.45, 'rgba(240,248,255,0.20)'],
                [0.75, 'rgba(220,238,255,0.05)'], [1, 'rgba(200,225,245,0)']];
                break;
            case 'body':
                stops = [[0, 'rgba(255,255,255,0.98)'], [0.35, 'rgba(252,254,255,0.90)'],
                [0.65, 'rgba(238,248,255,0.50)'], [0.85, 'rgba(218,236,252,0.15)'],
                [1, 'rgba(200,225,245,0)']];
                break;
            default: // secondary, tower, detail
                stops = [[0, 'rgba(255,255,255,0.98)'], [0.30, 'rgba(253,255,255,0.92)'],
                [0.60, 'rgba(242,251,255,0.60)'], [0.80, 'rgba(224,240,255,0.20)'],
                [0.95, 'rgba(208,230,250,0.05)'], [1, 'rgba(200,225,245,0)']];
        }

        ox.save();
        ox.translate(gx, gy);
        const scaleY = p.ry / p.rx;
        ox.scale(1, scaleY);

        const r = p.rx * 1.1; // Extend slightly to ensure soft edge
        // Offset inner focal point slightly upward for volumetric illusion
        const grad = ox.createRadialGradient(0, -r * 0.15, r * 0.05, 0, 0, r);
        stops.forEach(([s, c]) => grad.addColorStop(s, c));

        ox.fillStyle = grad;
        ox.beginPath();
        ox.arc(0, 0, r, 0, Math.PI * 2);
        ox.fill();
        ox.restore();
    });

    // ---- Sun highlight (top-right) ----
    const hl = ox.createRadialGradient(
        cx + baseW * 0.12, cy - baseW * 0.38, 0,
        cx, cy - baseW * 0.18, baseW * 0.60
    );
    hl.addColorStop(0, 'rgba(255,255,255, 0.48)');
    hl.addColorStop(0.4, 'rgba(255,255,255, 0.18)');
    hl.addColorStop(1, 'rgba(255,255,255, 0)');
    ox.fillStyle = hl;
    ox.beginPath();
    ox.ellipse(cx + baseW * 0.07, cy - baseW * 0.28, baseW * 0.56, baseW * 0.34, 0, 0, Math.PI * 2);
    ox.fill();

    // ---- Inner volumetric glow ----
    const ig = ox.createRadialGradient(cx, cy - baseW * 0.08, 0, cx, cy, baseW * 0.48);
    ig.addColorStop(0, 'rgba(255,255,255, 0.14)');
    ig.addColorStop(1, 'rgba(255,255,255, 0)');
    ox.fillStyle = ig;
    ox.fillRect(0, 0, cw, ch);

    return { canvas: oc, w: cw, h: ch, alpha };
}

function makeCloud(layerIdx, startAtTop = false) {
    const cfg = LAYER_CFG[layerIdx];
    const baseW = cfg.minW + Math.random() * (cfg.maxW - cfg.minW);
    const alpha = cfg.minA + Math.random() * (cfg.maxA - cfg.minA);
    const pre = prerenderCloud(baseW, alpha);
    const maxY = window.innerHeight * 0.88;

    return {
        x: Math.random() * (window.innerWidth + pre.w) - pre.w * 0.5,
        y: startAtTop ? -(pre.h + Math.random() * 300) : Math.random() * maxY,
        pre,
        baseSpeed: 0.18 + Math.random() * 0.20,
        speedMult: cfg.speedMult
    };
}

function initClouds() {
    cloudLayers = [[], [], []];
    LAYER_CFG.forEach((cfg, li) => {
        for (let i = 0; i < cfg.count; i++) {
            cloudLayers[li].push(makeCloud(li, false));
        }
    });
}

// --- Rain Particles (Heaven Storm) ---
let rainParticles = [];

function spawnRainBurst(count) {
    for (let i = 0; i < count; i++) {
        rainParticles.push({
            x: Math.random() * (window.innerWidth + 200) - 100,
            y: -20 - Math.random() * window.innerHeight * 0.3,
            len: 18 + Math.random() * 28,
            speed: 14 + Math.random() * 10,
            alpha: 0.25 + Math.random() * 0.45,
            wind: 1.5 + Math.random() * 2  // slight horizontal drift
        });
    }
}

let starCanvas = null;
let shootingStars = [];

function spawnShootingStar() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const fromTop = Math.random() > 0.5;
    shootingStars.push({
        x: fromTop ? Math.random() * W : W + Math.random() * 200,
        y: fromTop ? -Math.random() * 100 : Math.random() * H * 0.4,
        vx: -15 - Math.random() * 15, // Fast left
        vy: 8 + Math.random() * 8,    // Fast down
        life: 1.0,
        decay: 0.02 + Math.random() * 0.03,
        size: 1 + Math.random() * 1.5
    });
}

function generateStarfield(w, h) {
    const oc = document.createElement('canvas');
    oc.width = w;
    oc.height = h;
    const ctx = oc.getContext('2d');

    // Milky Way Base (subtle blueish/purple dust)
    ctx.globalCompositeOperation = 'source-over';
    const dustColors = ['rgba(30, 60, 150, 0.08)', 'rgba(60, 20, 100, 0.05)', 'rgba(20, 80, 120, 0.06)'];
    for (let i = 0; i < 6; i++) {
        const cx = w * 0.2 + Math.random() * w * 0.6;
        const cy = h * 0.1 + Math.random() * h * 0.4;
        const r = 300 + Math.random() * 500;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, dustColors[i % dustColors.length]);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }

    // Stars
    for (let i = 0; i < 400; i++) {
        const sx = Math.random() * w;
        const sy = Math.random() * h * 0.76; // Above horizon
        const sSize = Math.random() * 1.5 + 0.5;
        const opacity = Math.random() * 0.8 + 0.2;

        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        if (Math.random() > 0.8) {
            ctx.fillStyle = `rgba(180, 210, 255, ${opacity})`; // blueish star
        } else if (Math.random() > 0.8) {
            ctx.fillStyle = `rgba(255, 210, 180, ${opacity})`; // reddish star
        }

        // Add glow for larger stars
        if (sSize > 1.2) {
            ctx.shadowBlur = 4;
            ctx.shadowColor = '#fff';
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(sx, sy, sSize, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowBlur = 0;
    return oc;
}

// --- GALAXY THEME SYSTEM ---
let galaxyStars = [];
let galaxyPlanets = [];
let galaxyStructures = [];
let galaxyDust = [];
let sunExplosionParticles = [];
let sunExplodedTriggered = false;
let galaxyNebulaRotation = 0;

function initGalaxyTheme() {
    const W = window.innerWidth || 800;
    const H = window.innerHeight || 600;

    sunExplodedTriggered = false;
    sunExplosionParticles = [];

    // 1. Initialize 3D Starfield
    galaxyStars = [];
    for (let i = 0; i < 250; i++) {
        galaxyStars.push({
            x: (Math.random() - 0.5) * W * 3.5,
            y: (Math.random() - 0.5) * H * 3.5,
            z: Math.random() * 990 + 10,
            size: Math.random() * 1.5 + 0.5,
            color: Math.random() > 0.7 ? (Math.random() > 0.5 ? '#a5b4fc' : '#f472b6') : '#ffffff'
        });
    }

    // 2. Initialize Planets (Astros)
    galaxyPlanets = [
        {
            type: 'saturn',
            x: -W * 0.45,
            y: -H * 0.15,
            z: 800,
            size: 90,
            baseColor: '#eab308',
            ringColor: '#ca8a04',
            angle: 0.2
        },
        {
            type: 'planet',
            name: 'mars',
            x: W * 0.42,
            y: H * 0.28,
            z: 450,
            size: 55,
            baseColor: '#f97316'
        },
        {
            type: 'planet',
            name: 'neptune',
            x: -W * 0.3,
            y: H * 0.35,
            z: 1100,
            size: 70,
            baseColor: '#3b82f6'
        }
    ];

    // 3. Initialize Floating structures (ruins)
    galaxyStructures = [];
    const structCount = 12;
    for (let i = 0; i < structCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = W * 0.38 + Math.random() * W * 0.45;
        galaxyStructures.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius + (Math.random() - 0.5) * H * 0.3,
            z: Math.random() * 950 + 50,
            w: 35 + Math.random() * 55,
            h: 35 + Math.random() * 55,
            d: 35 + Math.random() * 55,
            rx: Math.random() * Math.PI,
            ry: Math.random() * Math.PI,
            rz: Math.random() * Math.PI,
            vx: (Math.random() - 0.5) * 0.1,
            vy: (Math.random() - 0.5) * 0.1,
            rotSpeedX: 0.003 + Math.random() * 0.01,
            rotSpeedY: 0.003 + Math.random() * 0.01,
            rotSpeedZ: 0.003 + Math.random() * 0.01,
            style: Math.random() > 0.6 ? 'checkered' : (Math.random() > 0.4 ? 'neon' : 'stone')
        });
    }

    // 4. Initialize Galactic Dust
    galaxyDust = [];
    const dustColors = [
        'rgba(168, 85, 247, 0.08)', // Purple
        'rgba(236, 72, 153, 0.08)', // Pink
        'rgba(6, 182, 212, 0.06)',  // Cyan
        'rgba(124, 58, 237, 0.07)'  // Violet
    ];
    for (let i = 0; i < 8; i++) {
        galaxyDust.push({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.08,
            vy: (Math.random() - 0.5) * 0.08,
            size: W * 0.35 + Math.random() * W * 0.25,
            color: dustColors[i % dustColors.length]
        });
    }
}


// --- Custom Theme: Lost In Snow ---
let lostInSnowLayers = [];
let lostInSnowParticles = [];
let lostInSnowFogCanvas = null;
let lostInSnowFogWidth = 0;
let lostInSnowFogHeight = 0;
let lostInSnowLamps = [];
let lastLampSpawnTime = 0;

// Stage and Forest variables
let lostInSnowStage = 'mountains'; // 'mountains', 'transition', 'forest', 'moonZoom', 'moonSurface', 'sunrise'
let transitionTriggered = false;
let transitionStartTime = 0;
let lostInSnowForestLayers = [];
let lostInSnowForegroundTreeX = -500;
let lastForegroundTreeSpawnTime = 0;
let lostInSnowMoonStars = [];
let zoomStartTime = 0;
let zoomOutStartTime = 0;
let moonSurfaceStartTime = 0;
let lostInSnowSunriseLayers = [];
let lostInSnowSunriseParticles = [];
let sunriseFlashStartTime = 0;
let sunriseTriggered = false;

function initLostInSnowTheme(W, H) {
    lostInSnowStage = 'mountains';
    transitionTriggered = false;
    lostInSnowForegroundTreeX = -500;
    lastForegroundTreeSpawnTime = 0;
    zoomOutStartTime = 0;
    zoomStartTime = 0;
    moonSurfaceStartTime = 0;
    sunriseFlashStartTime = 0;
    sunriseTriggered = false;

    // Reset window-scoped scroll variables
    window.sunriseScroll1 = 0;
    window.sunriseScroll2 = 0;
    window.sunriseTreeScroll = 0;
    window.waterScroll = [0, 0, 0, 0];

    lostInSnowLayers = [
        {
            scroll: 0,
            speed: 1.2,
            color: '#0e121a',
            snowColor: '#1a212e',
            baseY: H * 0.5,
            amp: 60,
            freq: 0.002
        },
        {
            scroll: 0,
            speed: 2.6,
            color: '#151b26',
            snowColor: '#273245',
            baseY: H * 0.68,
            amp: 40,
            freq: 0.004
        },
        {
            scroll: 0,
            speed: 5.5,
            color: '#1d2533',
            snowColor: '#34435c',
            baseY: H * 0.82,
            amp: 25,
            freq: 0.008
        }
    ];

    lostInSnowForestLayers = [
        {
            scroll: 0,
            speed: 1.2,
            color: '#111b2d',
            snowColor: '#283e5f',
            baseY: H * 0.48,
            treeW: 55,
            treeH: 110
        },
        {
            scroll: 0,
            speed: 2.6,
            color: '#1a2b47',
            snowColor: '#3c5a87',
            baseY: H * 0.62,
            treeW: 85,
            treeH: 170
        },
        {
            scroll: 0,
            speed: 4.8,
            color: '#28416c',
            snowColor: '#5376ab',
            baseY: H * 0.74,
            treeW: 125,
            treeH: 250
        },
        {
            scroll: 0,
            speed: 7.5,
            color: '#395b94',
            snowColor: '#ffffff',
            baseY: H * 0.85,
            treeW: 180,
            treeH: 360
        }
    ];

    lostInSnowForestLayers.forEach(cfg => {
        cfg.trees = [];
        const count = 15;
        for (let t = 0; t < count; t++) {
            cfg.trees.push({
                x: (t / count) * W * 1.5 + Math.random() * 80,
                w: cfg.treeW * (0.8 + Math.random() * 0.4),
                h: cfg.treeH * (0.8 + Math.random() * 0.4)
            });
        }
    });

    lostInSnowParticles = [];
    const centerX = W / 2;
    for (let i = 0; i < 50; i++) {
        lostInSnowParticles.push({
            x: centerX - 350 + Math.random() * 700,
            y: Math.random() * H,
            r: 1 + Math.random() * 2.2,
            speedY: 1.0 + Math.random() * 1.5,
            speedX: -0.4 - Math.random() * 0.8,
            alpha: 0.5 + Math.random() * 0.5
        });
    }

    lostInSnowLamps = [
        { x: W * 0.12, baseY: H * 0.82, scale: 1.0, speed: 5.5, layerIdx: 2 },
        { x: W * 0.45, baseY: H * 0.82, scale: 1.0, speed: 5.5, layerIdx: 2 },
        { x: W * 0.8, baseY: H * 0.82, scale: 1.0, speed: 5.5, layerIdx: 2 }
    ];
    lastLampSpawnTime = Date.now();

    // Populate Moon surface stars
    lostInSnowMoonStars = [];
    const moonRadius = H * 0.95;
    for (let i = 0; i < 70; i++) {
        const isLarge = Math.random() < 0.3;
        lostInSnowMoonStars.push({
            angle: Math.random() * Math.PI * 2,
            radius: moonRadius + 20 + Math.random() * (Math.max(W, H) * 0.65),
            speed: isLarge ? (0.045 + Math.random() * 0.035) : (0.015 + Math.random() * 0.025),
            size: isLarge ? (3.5 + Math.random() * 2.5) : (1.0 + Math.random() * 1.8),
            alpha: isLarge ? (0.6 + Math.random() * 0.4) : (0.4 + Math.random() * 0.6)
        });
    }

    // Populate Sunrise particles
    sunriseTriggered = false;
    lostInSnowSunriseParticles = [];
    for (let i = 0; i < 40; i++) {
        lostInSnowSunriseParticles.push({
            x: Math.random() * W,
            y: Math.random() * H,
            size: 1.5 + Math.random() * 3.5,
            speedX: (Math.random() - 0.5) * 0.5,
            speedY: -0.3 - Math.random() * 0.6,
            alpha: 0.3 + Math.random() * 0.7,
            twinkleSpeed: 0.008 + Math.random() * 0.015,
            twinklePhase: Math.random() * Math.PI * 2
        });
    }
}

function drawIndividualLamppost(x, y, scale) {
    const groundY = y;
    const lampY = y - 220 * scale; // Scale the height

    // 1. Draw Lamp Glow (additive light)
    tCtxBg.save();
    tCtxBg.globalCompositeOperation = 'screen';
    const glowRadius = 180 * scale;
    const glowGrad = tCtxBg.createRadialGradient(x, lampY, 8 * scale, x, lampY, glowRadius);
    glowGrad.addColorStop(0, 'rgba(255, 243, 160, 0.7)');
    glowGrad.addColorStop(0.2, 'rgba(254, 215, 100, 0.4)');
    glowGrad.addColorStop(0.5, 'rgba(253, 186, 116, 0.15)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    tCtxBg.fillStyle = glowGrad;
    tCtxBg.beginPath();
    tCtxBg.arc(x, lampY, glowRadius, 0, Math.PI * 2);
    tCtxBg.fill();
    tCtxBg.restore();

    // 2. Draw Lamppost Silhouette
    tCtxBg.fillStyle = '#020205'; // Near black silhouette

    // Base
    const baseW = 35 * scale;
    const baseH = 50 * scale;
    tCtxBg.beginPath();
    tCtxBg.moveTo(x - baseW / 2, groundY);
    tCtxBg.lineTo(x - baseW / 2 + 5 * scale, groundY - baseH);
    tCtxBg.lineTo(x + baseW / 2 - 5 * scale, groundY - baseH);
    tCtxBg.lineTo(x + baseW / 2, groundY);
    tCtxBg.closePath();
    tCtxBg.fill();

    // Base curves
    tCtxBg.fillRect(x - 10 * scale, groundY - baseH - 10 * scale, 20 * scale, 10 * scale);

    // Main thin pole
    const poleW = 8 * scale;
    tCtxBg.fillRect(x - poleW / 2, lampY + 25 * scale, poleW, groundY - baseH - lampY - 35 * scale);

    // Collar below lamp
    tCtxBg.fillRect(x - 12 * scale, lampY + 20 * scale, 24 * scale, 6 * scale);

    // Support brackets
    tCtxBg.beginPath();
    tCtxBg.moveTo(x - 18 * scale, lampY + 12 * scale);
    tCtxBg.lineTo(x + 18 * scale, lampY + 12 * scale);
    tCtxBg.lineTo(x, lampY + 20 * scale);
    tCtxBg.closePath();
    tCtxBg.fill();

    // 3. Draw Lantern Glass (Lit)
    tCtxBg.fillStyle = '#eab308'; // Warm yellow glass
    tCtxBg.beginPath();
    tCtxBg.moveTo(x - 15 * scale, lampY - 15 * scale); // Top left
    tCtxBg.lineTo(x + 15 * scale, lampY - 15 * scale); // Top right
    tCtxBg.lineTo(x + 9 * scale, lampY + 12 * scale);  // Bottom right
    tCtxBg.lineTo(x - 9 * scale, lampY + 12 * scale);  // Bottom left
    tCtxBg.closePath();
    tCtxBg.fill();

    // Lantern frame details (lines)
    tCtxBg.strokeStyle = '#020205';
    tCtxBg.lineWidth = 3 * scale;
    tCtxBg.stroke();

    // Center divider line
    tCtxBg.beginPath();
    tCtxBg.moveTo(x, lampY - 15 * scale);
    tCtxBg.lineTo(x, lampY + 12 * scale);
    tCtxBg.stroke();

    // 4. Lantern Cap (Top cover)
    tCtxBg.fillStyle = '#020205';
    tCtxBg.beginPath();
    tCtxBg.moveTo(x - 18 * scale, lampY - 15 * scale);
    tCtxBg.lineTo(x + 18 * scale, lampY - 15 * scale);
    tCtxBg.lineTo(x, lampY - 32 * scale);
    tCtxBg.closePath();
    tCtxBg.fill();

    // Little ball on top of cap
    tCtxBg.beginPath();
    tCtxBg.arc(x, lampY - 34 * scale, 4 * scale, 0, Math.PI * 2);
    tCtxBg.fill();
}

function updateAndDrawLamps(layerIdx, fallMult, W, H) {
    for (let i = lostInSnowLamps.length - 1; i >= 0; i--) {
        const lamp = lostInSnowLamps[i];
        if (lamp.layerIdx !== layerIdx) continue;

        // Update position (scrolling left)
        if (window.isPlaying && !window.isPaused && !window.isGameOver) {
            lamp.x -= lamp.speed * fallMult * 3;
        }

        // Draw the lamppost
        drawIndividualLamppost(lamp.x, lamp.baseY, lamp.scale);

        // Remove if offscreen left
        if (lamp.x < -150 * lamp.scale) {
            lostInSnowLamps.splice(i, 1);
        }
    }
}

function drawLostInSnowMoon(W, H, moonX, moonY, moonR) {
    tCtxBg.save();
    // Moon Glow based on moonR
    const moonGlow = tCtxBg.createRadialGradient(moonX, moonY, Math.max(1, moonR - 10), moonX, moonY, moonR + 50);
    moonGlow.addColorStop(0, 'rgba(255, 245, 170, 0.45)');
    moonGlow.addColorStop(0.3, 'rgba(255, 235, 120, 0.15)');
    moonGlow.addColorStop(1, 'rgba(255, 235, 120, 0.0)');
    tCtxBg.fillStyle = moonGlow;
    tCtxBg.beginPath();
    tCtxBg.arc(moonX, moonY, moonR + 50, 0, Math.PI * 2);
    tCtxBg.fill();

    // Moon Body
    const moonGrad = tCtxBg.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR);
    moonGrad.addColorStop(0, '#ffffff');
    moonGrad.addColorStop(0.7, '#fff7c2');
    moonGrad.addColorStop(1.0, '#ffe885');
    tCtxBg.fillStyle = moonGrad;
    tCtxBg.beginPath();
    tCtxBg.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    tCtxBg.fill();
    tCtxBg.restore();
}

function drawLostInSnowBackground(W, H) {
    const progressTime = window.lastInterpolatedTime || 0;

    // Reset backgrounds if song is restarted or rewound to the beginning
    if (progressTime < 1.0 && (lostInSnowStage !== 'mountains' || transitionTriggered || sunriseTriggered)) {
        initLostInSnowTheme(W, H);
    }

    if (lostInSnowLayers.length === 0) {
        initLostInSnowTheme(W, H);
    }

    const playing = window.isPlaying && !window.isPaused && !window.isGameOver;
    const fallMult = playing ? (window.fallSpeed || 3.0) / 3.0 : 0.05;

    // Check transition triggers
    if (progressTime >= 19.0 && !transitionTriggered && playing) {
        transitionTriggered = true;
        lostInSnowStage = 'transition';
        transitionStartTime = Date.now();
    }
    if (progressTime >= 42.983 && lostInSnowStage === 'forest' && playing) {
        lostInSnowStage = 'moonZoom';
        zoomStartTime = Date.now();
    }
    if (progressTime >= 43.897 && lostInSnowStage === 'moonZoom' && playing) {
        lostInSnowStage = 'moonSurface';
        moonSurfaceStartTime = Date.now();
    }
    if (progressTime >= 52.983 && lostInSnowStage === 'moonSurface' && playing) {
        lostInSnowStage = 'moonZoomOut';
        zoomOutStartTime = Date.now();
    }
    if (progressTime >= 53.897 && lostInSnowStage === 'moonZoomOut' && playing) {
        lostInSnowStage = 'forest';
    }
    if (progressTime >= 63.383 && !sunriseTriggered && playing) {
        sunriseTriggered = true;
        lostInSnowStage = 'sunrise';
        sunriseFlashStartTime = Date.now();
    }

    let elapsed = 0;
    let whiteAlpha = 0;
    if (lostInSnowStage === 'transition') {
        elapsed = (Date.now() - transitionStartTime) / 1000;
        if (elapsed < 0.8) {
            whiteAlpha = Math.min(1.0, elapsed / 0.8);
        } else {
            lostInSnowStage = 'forest';
            // Blizzard particle burst
            lostInSnowParticles.forEach(p => {
                p.alpha = 0.8 + Math.random() * 0.2;
                p.speedY = 3.0 + Math.random() * 3.0;
                p.speedX = -2.0 - Math.random() * 2.0;
            });
        }
    }

    if (lostInSnowStage === 'sunrise') {
        // 1. Sky Gradient Background (pink to yellow)
        const skyGrad = tCtxBg.createLinearGradient(0, 0, 0, H * 0.75);
        skyGrad.addColorStop(0, '#ff1af3'); // vibrant pink
        skyGrad.addColorStop(0.35, '#ff4bf1'); // magenta-pink
        skyGrad.addColorStop(0.7, '#ffac4b'); // orange-yellow
        skyGrad.addColorStop(1.0, '#ffd15c'); // golden yellow
        tCtxBg.fillStyle = skyGrad;
        tCtxBg.fillRect(0, 0, W, H);

        // 2. Rising Sun behind mountains
        const sunX = W * 0.5;
        const sunY = H * 0.52;
        const sunGlow = tCtxBg.createRadialGradient(sunX, sunY, 10, sunX, sunY, 280);
        sunGlow.addColorStop(0, 'rgba(255, 255, 230, 1.0)');
        sunGlow.addColorStop(0.25, 'rgba(255, 240, 150, 0.9)');
        sunGlow.addColorStop(0.55, 'rgba(255, 172, 75, 0.45)');
        sunGlow.addColorStop(1.0, 'rgba(255, 26, 243, 0.0)');
        tCtxBg.fillStyle = sunGlow;
        tCtxBg.beginPath();
        tCtxBg.arc(sunX, sunY, 280, 0, Math.PI * 2);
        tCtxBg.fill();

        // Calculate speed multiplier for parallax in this final section
        let sunriseSpeedMult = 0;
        if (progressTime >= 84.421) {
            sunriseSpeedMult = 1.5; // a bit faster
        } else if (progressTime >= 73.792) {
            sunriseSpeedMult = 1.0; // normal speed
        }

        // 3. Parallax Layer 1: Pointed Mountain Range with sharp peaks & rock outlines
        if (typeof window.sunriseScroll1 === 'undefined') { window.sunriseScroll1 = 0; }
        window.sunriseScroll1 += 0.8 * fallMult * 3 * sunriseSpeedMult;

        drawPointedMountainRange(tCtxBg, W, H, window.sunriseScroll1);

        // 4. Parallax Layer 2: Lake / Water (Mid)
        tCtxBg.fillStyle = '#4f808f'; // teal lake base
        tCtxBg.fillRect(0, H * 0.72, W, H * 0.14);

        // Water reflection detail lines (Parallax layered ripples)
        for (let layer = 0; layer < 4; layer++) {
            const layerY = H * 0.72 + (H * 0.14) * (layer / 4);
            const layerH = (H * 0.14) / 4;
            const layerSpeed = (1.2 + layer * 0.7) * fallMult * 3 * sunriseSpeedMult;

            if (typeof window.waterScroll === 'undefined') { window.waterScroll = []; }
            if (typeof window.waterScroll[layer] === 'undefined') { window.waterScroll[layer] = 0; }
            window.waterScroll[layer] += layerSpeed;

            for (let j = 0; j < 6; j++) {
                const width = 60 + ((j * 17 + layer * 31) % 110);
                const lineX = ((j * 160 + layer * 95 - window.waterScroll[layer]) % (W + 200)) - 100;
                const lineY = layerY + ((j * 7 + layer * 13) % (layerH - 4));

                const isLighter = (j + layer) % 2 === 0;
                tCtxBg.fillStyle = isLighter ? 'rgba(115, 174, 191, 0.5)' : 'rgba(59, 98, 110, 0.4)';
                tCtxBg.fillRect(lineX, lineY, width, 2.5);
            }
        }

        // Main golden sun reflections on water surface
        tCtxBg.fillStyle = 'rgba(255, 234, 159, 0.55)';
        for (let i = 0; i < 7; i++) {
            const lineY = H * 0.73 + i * 12;
            const width = 120 + Math.sin(Date.now() * 0.0012 + i) * 60;
            const lineX = (W * 0.5 - width * 0.5) + Math.cos(Date.now() * 0.0018 + i) * 40;
            tCtxBg.fillRect(lineX, lineY, width, 4);
        }

        // 5. Parallax Layer 3: Snowy Ground Bank (Close)
        if (typeof window.sunriseScroll2 === 'undefined') { window.sunriseScroll2 = 0; }
        window.sunriseScroll2 += 4.5 * fallMult * 3 * sunriseSpeedMult;

        tCtxBg.fillStyle = '#cbdde8'; // snowy white
        tCtxBg.beginPath();
        tCtxBg.moveTo(0, H);
        tCtxBg.lineTo(0, H * 0.86);
        for (let x = 0; x <= W + 100; x += 60) {
            const y = H * 0.86 + Math.sin((x + window.sunriseScroll2) * 0.004) * 8;
            tCtxBg.lineTo(x, y);
        }
        tCtxBg.lineTo(W, H);
        tCtxBg.closePath();
        tCtxBg.fill();

        // 6. Parallax Layer 4: Foreground Tall Pine Trees scrolling fast (spawning with wide & irregular spacing)
        if (typeof window.sunriseTreeScroll === 'undefined') { window.sunriseTreeScroll = 0; }
        window.sunriseTreeScroll += 7.5 * fallMult * 3 * sunriseSpeedMult;

        const span = W + 1800;
        const groundY = H * 0.94;

        // Tree slots with irregular spacing, varied moderate heights, and distinct widths
        const treeConfigs = [
            { baseOff: 150, w: 210, hMult: 1.25, variant: _sunriseTreeVariants[0] },
            { baseOff: 880, w: 165, hMult: 0.95, variant: _sunriseTreeVariants[1] },
            { baseOff: 1650, w: 230, hMult: 1.35, variant: _sunriseTreeVariants[2] },
            { baseOff: 2420, w: 180, hMult: 1.10, variant: (_sunriseTreeVariants[0] + 3) % 8 }
        ];

        treeConfigs.forEach(cfg => {
            let tx = (cfg.baseOff - window.sunriseTreeScroll) % span;
            if (tx < -350) tx += span;

            if (tx >= -350 && tx <= W + 350) {
                const treeH = H * cfg.hMult;
                drawSunrisePineTree(tCtxBg, tx, groundY, cfg.w, treeH, '#0c1613', '#ffffff', cfg.variant);
            }
        });

        // 7. Drifting Sunrise Particles
        tCtxBg.fillStyle = '#ffffff';
        lostInSnowSunriseParticles.forEach(p => {
            p.y += p.speedY * (playing ? 1.0 : 0.2);
            p.x += p.speedX * (playing ? 1.0 : 0.2);
            p.twinklePhase += p.twinkleSpeed;

            if (p.y < -10) {
                p.y = H + 10;
                p.x = Math.random() * W;
            }
            if (p.x < -10 || p.x > W + 10) {
                p.x = Math.random() * W;
            }

            tCtxBg.globalAlpha = p.alpha * (0.6 + Math.sin(p.twinklePhase) * 0.4);
            tCtxBg.beginPath();
            tCtxBg.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            tCtxBg.fill();
        });
        tCtxBg.globalAlpha = 1.0;

        // 8. White Sunrise Flash overlay
        const elapsedFlash = (Date.now() - sunriseFlashStartTime) / 1000;
        const flashAlpha = Math.max(0.0, 1.0 - elapsedFlash / 1.5);
        if (flashAlpha > 0) {
            tCtxBg.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            tCtxBg.fillRect(0, 0, W, H);
        }

    } else if (lostInSnowStage === 'moonSurface') {
        // 1. Dark blue space background
        tCtxBg.fillStyle = '#030822';
        tCtxBg.fillRect(0, 0, W, H);

        const centerX = W * 0.5;
        const centerY = -H * 0.1;
        const moonRadius = H * 0.95;

        // 2. Draw fast orbiting stars around moon center
        tCtxBg.fillStyle = '#fffae0';
        lostInSnowMoonStars.forEach(s => {
            s.angle += s.speed * (playing ? 1.0 : 0.1);
            const sx = centerX + s.radius * Math.cos(s.angle);
            const sy = centerY + s.radius * Math.sin(s.angle);

            tCtxBg.globalAlpha = s.alpha * (0.6 + Math.sin(Date.now() * 0.005 + s.radius) * 0.4);
            tCtxBg.beginPath();
            tCtxBg.arc(sx, sy, s.size, 0, Math.PI * 2);
            tCtxBg.fill();
        });
        tCtxBg.globalAlpha = 1.0;

        // 3. Draw giant moon body
        const moonGrad = tCtxBg.createRadialGradient(centerX, centerY, moonRadius * 0.2, centerX, centerY, moonRadius);
        moonGrad.addColorStop(0, '#ffffff');
        moonGrad.addColorStop(0.7, '#fff7c2');
        moonGrad.addColorStop(1.0, '#ffe885');
        tCtxBg.fillStyle = moonGrad;
        tCtxBg.beginPath();
        tCtxBg.arc(centerX, centerY, moonRadius, 0, Math.PI * 2);
        tCtxBg.fill();

    } else if (lostInSnowStage === 'forest' || lostInSnowStage === 'moonZoom' || lostInSnowStage === 'moonZoomOut') {
        let moonX = W * 0.75;
        let moonY = H * 0.22;
        let moonR = 45;
        let slideOffset = 0;

        if (lostInSnowStage === 'moonZoom') {
            const elapsedZoom = (Date.now() - zoomStartTime) / 1000;
            const t = Math.min(1.0, elapsedZoom / 0.914);
            const tEased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            // Interpolate position and radius to match giant moon exactly at t = 1
            moonX = (W * 0.75) * (1 - tEased) + (W * 0.5) * tEased;
            moonY = (H * 0.22) * (1 - tEased) + (-H * 0.1) * tEased;
            moonR = 45 * (1 - tEased) + (H * 0.95) * tEased;

            // Slide trees and hills downwards off the bottom of the screen with ease-in-out
            slideOffset = H * tEased;
        } else if (lostInSnowStage === 'moonZoomOut') {
            const elapsedZoom = (Date.now() - zoomOutStartTime) / 1000;
            const t = Math.min(1.0, elapsedZoom / 0.914);
            const tEased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            // Reverse interpolation from giant moon to small moon
            moonX = (W * 0.75) * tEased + (W * 0.5) * (1 - tEased);
            moonY = (H * 0.22) * tEased + (-H * 0.1) * (1 - tEased);
            moonR = 45 * tEased + (H * 0.95) * (1 - tEased);

            // Reverse slide from off-screen to original height
            slideOffset = H * (1 - tEased);
        }

        // 1. Sky background (deep forest night)
        tCtxBg.fillStyle = '#010206';
        tCtxBg.fillRect(0, 0, W, H);

        // Draw Moon
        drawLostInSnowMoon(W, H, moonX, moonY, moonR);

        // 2. Parallax layers (scrolling left)
        lostInSnowForestLayers.forEach(cfg => {
            const scrollSpeed = cfg.speed * fallMult * 3;
            cfg.scroll += scrollSpeed;

            // Draw ground hill base
            tCtxBg.fillStyle = cfg.color;
            tCtxBg.beginPath();
            tCtxBg.moveTo(0, H);
            tCtxBg.lineTo(0, cfg.baseY + slideOffset);
            for (let x = 0; x <= W + 100; x += 60) {
                const y = cfg.baseY + slideOffset + Math.sin((x + cfg.scroll) * 0.005) * 15;
                tCtxBg.lineTo(x, y);
            }
            tCtxBg.lineTo(W, H);
            tCtxBg.closePath();
            tCtxBg.fill();

            // Draw trees in this layer
            cfg.trees.forEach(t => {
                t.x -= scrollSpeed;
                if (t.x < -t.w * 2) {
                    t.x = W + Math.random() * 150;
                }
                const treeY = cfg.baseY + slideOffset + Math.sin((t.x + cfg.scroll) * 0.005) * 15;
                drawPineTree(tCtxBg, t.x, treeY + 10, t.w, t.h, cfg.color, cfg.snowColor);
            });
        });

        // --- FOREGROUND OBSTACLE TREE DRAWN ON BACKGROUND CANVAS ---
        if (playing) {
            if (lostInSnowForegroundTreeX < -400 && Date.now() - lastForegroundTreeSpawnTime >= 5000) {
                lostInSnowForegroundTreeX = W + 100;
                lastForegroundTreeSpawnTime = Date.now();
            }
            if (lostInSnowForegroundTreeX >= -400) {
                lostInSnowForegroundTreeX -= 6.0 * fallMult * 3;
                drawPineTree(tCtxBg, lostInSnowForegroundTreeX, H + slideOffset, 380, H * 1.1, '#020205', '#ffffff');
            }
        }

        // Calculate transition fadeout
        if (transitionTriggered) {
            const transElapsed = (Date.now() - transitionStartTime) / 1000;
            const fadeElapsed = transElapsed - 0.8;
            whiteAlpha = Math.max(0.0, 1.0 - fadeElapsed / 1.2);
        }
    } else {
        // Spawn lamps every 2s
        if (playing && Date.now() - lastLampSpawnTime >= 2000) {
            lastLampSpawnTime = Date.now();
            // Spawn a foreground lamp
            lostInSnowLamps.push({
                x: W + 150,
                baseY: H * 0.82,
                scale: 1.0,
                speed: 5.5,
                layerIdx: 2
            });
        }

        // 1. Sky background (deep cold dark blue)
        tCtxBg.fillStyle = '#02040a';
        tCtxBg.fillRect(0, 0, W, H);

        // 2. Parallax layers (scrolling left)
        // LAYER 1 (Far)
        {
            const cfg = lostInSnowLayers[0];
            const scrollSpeed = cfg.speed * fallMult * 3;
            cfg.scroll += scrollSpeed;

            tCtxBg.fillStyle = cfg.color;
            tCtxBg.beginPath();
            const startY = cfg.baseY + Math.sin(cfg.scroll * cfg.freq) * cfg.amp;
            tCtxBg.moveTo(0, H);
            tCtxBg.lineTo(0, startY);
            for (let x = 0; x <= W + 100; x += 50) {
                const y = cfg.baseY + Math.sin((x + cfg.scroll) * cfg.freq) * cfg.amp;
                tCtxBg.lineTo(x, y);
            }
            tCtxBg.lineTo(W, H);
            tCtxBg.closePath();
            tCtxBg.fill();

            tCtxBg.fillStyle = cfg.snowColor;
            tCtxBg.beginPath();
            tCtxBg.moveTo(0, startY);
            for (let x = 0; x <= W + 100; x += 50) {
                const y = cfg.baseY + Math.sin((x + cfg.scroll) * cfg.freq) * cfg.amp;
                tCtxBg.lineTo(x, y);
            }
            for (let x = W + 100; x >= 0; x -= 50) {
                const y = cfg.baseY + 8 + Math.sin((x + cfg.scroll) * cfg.freq) * cfg.amp;
                tCtxBg.lineTo(x, y);
            }
            tCtxBg.closePath();
            tCtxBg.fill();

            updateAndDrawLamps(0, fallMult, W, H);
        }

        // LAYER 2 (Mid)
        {
            const cfg = lostInSnowLayers[1];
            const scrollSpeed = cfg.speed * fallMult * 3;
            cfg.scroll += scrollSpeed;

            tCtxBg.fillStyle = cfg.color;
            tCtxBg.beginPath();
            const startY = cfg.baseY + Math.sin(cfg.scroll * cfg.freq) * cfg.amp;
            tCtxBg.moveTo(0, H);
            tCtxBg.lineTo(0, startY);
            for (let x = 0; x <= W + 100; x += 50) {
                const y = cfg.baseY + Math.sin((x + cfg.scroll) * cfg.freq) * cfg.amp;
                tCtxBg.lineTo(x, y);
            }
            tCtxBg.lineTo(W, H);
            tCtxBg.closePath();
            tCtxBg.fill();

            tCtxBg.fillStyle = cfg.snowColor;
            tCtxBg.beginPath();
            tCtxBg.moveTo(0, startY);
            for (let x = 0; x <= W + 100; x += 50) {
                const y = cfg.baseY + Math.sin((x + cfg.scroll) * cfg.freq) * cfg.amp;
                tCtxBg.lineTo(x, y);
            }
            for (let x = W + 100; x >= 0; x -= 50) {
                const y = cfg.baseY + 8 + Math.sin((x + cfg.scroll) * cfg.freq) * cfg.amp;
                tCtxBg.lineTo(x, y);
            }
            tCtxBg.closePath();
            tCtxBg.fill();

            updateAndDrawLamps(1, fallMult, W, H);
        }

        // LAYER 3 (Close)
        {
            const cfg = lostInSnowLayers[2];
            const scrollSpeed = cfg.speed * fallMult * 3;
            cfg.scroll += scrollSpeed;

            tCtxBg.fillStyle = cfg.color;
            tCtxBg.beginPath();
            const startY = cfg.baseY + Math.sin(cfg.scroll * cfg.freq) * cfg.amp;
            tCtxBg.moveTo(0, H);
            tCtxBg.lineTo(0, startY);
            for (let x = 0; x <= W + 100; x += 50) {
                const y = cfg.baseY + Math.sin((x + cfg.scroll) * cfg.freq) * cfg.amp;
                tCtxBg.lineTo(x, y);
            }
            tCtxBg.lineTo(W, H);
            tCtxBg.closePath();
            tCtxBg.fill();

            tCtxBg.fillStyle = cfg.snowColor;
            tCtxBg.beginPath();
            tCtxBg.moveTo(0, startY);
            for (let x = 0; x <= W + 100; x += 50) {
                const y = cfg.baseY + Math.sin((x + cfg.scroll) * cfg.freq) * cfg.amp;
                tCtxBg.lineTo(x, y);
            }
            for (let x = W + 100; x >= 0; x -= 50) {
                const y = cfg.baseY + 8 + Math.sin((x + cfg.scroll) * cfg.freq) * cfg.amp;
                tCtxBg.lineTo(x, y);
            }
            tCtxBg.closePath();
            tCtxBg.fill();

            updateAndDrawLamps(2, fallMult, W, H);
        }
    }

    // 3. Falling Snow Particles (concentrated near playfield)
    tCtxBg.fillStyle = '#ffffff';
    const centerX = W / 2;
    lostInSnowParticles.forEach(p => {
        p.y += p.speedY * (playing ? 1.5 : 0.5);
        p.x += p.speedX;

        // Reset if offscreen or too far left
        if (p.y > H + 10 || p.x < centerX - 400) {
            p.x = centerX + 400 + Math.random() * 50;
            p.y = -10;
            if (lostInSnowStage === 'forest' && Math.abs(p.speedX) > 1.8) {
                p.speedY = 1.0 + Math.random() * 1.5;
                p.speedX = -0.4 - Math.random() * 0.8;
                p.alpha = 0.5 + Math.random() * 0.5;
            }
        }

        tCtxBg.globalAlpha = p.alpha;
        tCtxBg.beginPath();
        tCtxBg.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        tCtxBg.fill();
    });
    tCtxBg.globalAlpha = 1.0;

    // 4. Cache and draw border cold fog vignette (centered on the playfield)
    if (!lostInSnowFogCanvas || lostInSnowFogWidth !== W || lostInSnowFogHeight !== H) {
        lostInSnowFogWidth = W;
        lostInSnowFogHeight = H;
        lostInSnowFogCanvas = document.createElement('canvas');
        lostInSnowFogCanvas.width = W;
        lostInSnowFogCanvas.height = H;
        const fogCtx = lostInSnowFogCanvas.getContext('2d');

        const centerY = H * 0.6;
        const innerR = 40;
        const outerR = Math.max(W, H) * 0.5;

        const fogGrad = fogCtx.createRadialGradient(centerX, centerY, innerR, centerX, centerY, outerR);
        fogGrad.addColorStop(0, 'rgba(2, 3, 8, 0.45)');
        fogGrad.addColorStop(0.12, 'rgba(1, 2, 5, 0.78)');
        fogGrad.addColorStop(0.28, 'rgba(1, 2, 5, 0.94)');
        fogGrad.addColorStop(0.48, 'rgba(0, 0, 2, 1.0)');
        fogGrad.addColorStop(1.0, 'rgba(0, 0, 1, 1.0)');

        fogCtx.fillStyle = fogGrad;
        fogCtx.fillRect(0, 0, W, H);
    }

    // Calculate dynamic fog intensity (dips instantly at 10.583s, resets climb and recovers slowly)
    let fogIntensity = 1.0;
    if (lostInSnowStage === 'forest') {
        fogIntensity = 0.85;
    } else if (lostInSnowStage === 'moonZoom') {
        const elapsedZoom = (Date.now() - zoomStartTime) / 1000;
        const t = Math.min(1.0, elapsedZoom / 0.914);
        fogIntensity = 0.85 * (1 - t) + 0.15 * t;
    } else if (lostInSnowStage === 'moonZoomOut') {
        const elapsedZoom = (Date.now() - zoomOutStartTime) / 1000;
        const t = Math.min(1.0, elapsedZoom / 0.914);
        fogIntensity = 0.15 * (1 - t) + 0.85 * t;
    } else if (lostInSnowStage === 'moonSurface') {
        fogIntensity = 0.15;
    } else if (lostInSnowStage === 'sunrise') {
        fogIntensity = 0.0;
    } else {
        if (progressTime < 10.583) {
            // Thickens from 0.5 to 0.8
            fogIntensity = 0.5 + (progressTime / 10.583) * 0.3;
        } else {
            // Resets the climb: starts at 0.5 and climbs back to 1.0 at 19.0s
            const climbRatio = Math.min(1.0, (progressTime - 10.583) / (19.0 - 10.583));
            const baseClimbAfter = 0.5 + climbRatio * 0.5;

            // Dip factor: drops to 0.7 (making the drop less drastic/noticeable) and recovers over 3.5s
            const recoverDuration = 3.5;
            const t = Math.min(1.0, (progressTime - 10.583) / recoverDuration);
            const dipFactor = 0.7 + t * 0.3;

            fogIntensity = baseClimbAfter * dipFactor;
        }
    }

    tCtxBg.globalAlpha = fogIntensity * 0.85;
    tCtxBg.drawImage(lostInSnowFogCanvas, 0, 0);
    tCtxBg.globalAlpha = 1.0;

    // 5. Draw White Transition Overlay
    if (whiteAlpha > 0) {
        tCtxBg.fillStyle = `rgba(255, 255, 255, ${whiteAlpha})`;
        tCtxBg.fillRect(0, 0, W, H);
    }
}


// --- Main Theme Background Loop ---
let _themeLastFrame = 0;
function drawThemeBackground(ts) {
    if (!tCtxBg || !themeCanvas) { requestAnimationFrame(drawThemeBackground); return; }

    const playing = window.isPlaying && !window.isPaused && !window.isGameOver;
    // Throttle idle theme to ~30fps; full rate only while playing
    const minDelta = playing ? 0 : 33;
    if (ts && _themeLastFrame && (ts - _themeLastFrame) < minDelta) {
        requestAnimationFrame(drawThemeBackground);
        return;
    }
    _themeLastFrame = ts || performance.now();

    // Skip heavy theme redraw when tab is hidden
    if (document.hidden) {
        requestAnimationFrame(drawThemeBackground);
        return;
    }

    const W = window.innerWidth;
    const H = window.innerHeight;
    if (themeCanvas.width !== W) themeCanvas.width = W;
    if (themeCanvas.height !== H) themeCanvas.height = H;
    tCtxBg.clearRect(0, 0, W, H);

    const isLostInSnow = window.currentFileName === "Lost In Snow.mp3";
    if (isLostInSnow) {
        drawLostInSnowBackground(W, H);
        requestAnimationFrame(drawThemeBackground);
        return;
    }

    const isHeavenly = document.body.classList.contains('theme-heaven');
    const isSand = document.body.classList.contains('theme-cyberpunk');
    const isSunflower = document.body.classList.contains('theme-sunflower');
    const isCity = document.body.classList.contains('theme-city');
    const isGalaxy = document.body.classList.contains('theme-galaxy');
    const isForest = document.body.classList.contains('theme-forest');
    const isGlass = document.body.classList.contains('theme-glass');
    const isExtreme = !!window.isExtremeMap || !!window.forceSecondaryStyle;

    // Storm progression (0 = clear, 1 = full storm)
    let stormT = 0;
    const rainActive = isExtreme && window.stormRainStartTime != null &&
        window.audioContext && window.audioContext.currentTime >= window.stormRainStartTime;
    if (rainActive) {
        const elapsed = window.audioContext.currentTime - window.stormRainStartTime;
        stormT = Math.min(1, elapsed / 6); // 6s fade-in to full storm
    }

    if (isHeavenly) {
        // Sky: interpolate from clear blue → dark stormy grey
        const r1 = Math.round(10 + stormT * (50 - 10));
        const g1 = Math.round(130 + stormT * (55 - 130));
        const b1 = Math.round(210 + stormT * (65 - 210));
        const r2 = Math.round(56 + stormT * (40 - 56));
        const g2 = Math.round(172 + stormT * (45 - 172));
        const b2 = Math.round(236 + stormT * (50 - 236));

        const skyGrad = tCtxBg.createLinearGradient(0, 0, 0, H);
        skyGrad.addColorStop(0, `rgba(${r1},${g1},${b1}, 0.80)`);
        skyGrad.addColorStop(0.6, `rgba(${r2},${g2},${b2}, 0.55)`);
        skyGrad.addColorStop(1, `rgba(186, 230, 253, ${0.28 - stormT * 0.22})`);
        tCtxBg.fillStyle = skyGrad;
        tCtxBg.fillRect(0, 0, W, H);

        // Parallax clouds
        const fallMult = playing ? (window.fallSpeed || 3.0) / 3.0 : 0;
        cloudLayers.forEach((layer, li) => {
            for (let i = layer.length - 1; i >= 0; i--) {
                const c = layer[i];
                c.y += c.baseSpeed * c.speedMult * fallMult * 1.6;
                if (c.y > H + c.pre.h + 20) {
                    layer.splice(i, 1);
                    layer.push(makeCloud(li, true));
                    continue;
                }
                tCtxBg.globalAlpha = c.pre.alpha;
                tCtxBg.drawImage(c.pre.canvas, c.x - c.pre.w / 2, c.y);
            }
        });
        tCtxBg.globalAlpha = 1;

        // Storm grey tint over clouds
        if (stormT > 0) {
            tCtxBg.globalAlpha = stormT * 0.55;
            tCtxBg.fillStyle = 'rgba(40, 42, 55, 1)';
            tCtxBg.fillRect(0, 0, W, H);
            tCtxBg.globalAlpha = 1;
        }

        // Rain
        if (rainActive && playing) spawnRainBurst(Math.round(6 + stormT * 14));

        tCtxBg.save();
        tCtxBg.strokeStyle = `rgba(180, 210, 240, ${0.35 + stormT * 0.3})`;
        tCtxBg.lineWidth = 1;
        for (let i = rainParticles.length - 1; i >= 0; i--) {
            const p = rainParticles[i];
            if (!playing) { rainParticles.splice(i, 1); continue; }
            p.x += p.wind;
            p.y += p.speed;
            if (p.y > H + 30) { rainParticles.splice(i, 1); continue; }
            tCtxBg.globalAlpha = p.alpha * stormT;
            tCtxBg.beginPath();
            tCtxBg.moveTo(p.x, p.y);
            tCtxBg.lineTo(p.x + p.wind * (p.len / p.speed), p.y + p.len);
            tCtxBg.stroke();
        }
        tCtxBg.globalAlpha = 1;
        tCtxBg.restore();

    } else if (isSand) {
        // Night should persist if playing, even while paused, until Game Over or stopped
        const isNight = window.isPlaying && !window.isGameOver && isExtreme;

        const sunX = W * 0.2;
        const sunY = H * 0.45;
        const sunR = 180;

        if (isNight) {
            // 1. Dark Sky Haze
            const skyHaze = tCtxBg.createLinearGradient(0, 0, 0, H);
            skyHaze.addColorStop(0, '#050a14');
            skyHaze.addColorStop(0.5, '#0b132b');
            skyHaze.addColorStop(1, '#1c2541');
            tCtxBg.fillStyle = skyHaze;
            tCtxBg.fillRect(0, 0, W, H);

            // 2. Starfield & Milky Way
            if (!starCanvas || starCanvas.width !== W || starCanvas.height !== H) {
                starCanvas = generateStarfield(W, H);
            }
            tCtxBg.globalCompositeOperation = 'screen';
            tCtxBg.drawImage(starCanvas, 0, 0);

            // 2.5 Shooting Stars (Player Feedback)
            tCtxBg.lineCap = 'round';
            for (let i = shootingStars.length - 1; i >= 0; i--) {
                const ss = shootingStars[i];
                ss.x += ss.vx;
                ss.y += ss.vy;
                ss.life -= ss.decay;

                if (ss.life <= 0) {
                    shootingStars.splice(i, 1);
                    continue;
                }

                tCtxBg.globalAlpha = ss.life;
                tCtxBg.strokeStyle = `rgba(255, 255, 255, ${ss.life})`;
                tCtxBg.lineWidth = ss.size;
                tCtxBg.beginPath();
                tCtxBg.moveTo(ss.x, ss.y);
                tCtxBg.lineTo(ss.x - ss.vx * 4, ss.y - ss.vy * 4); // Stretch tail for speed illusion
                tCtxBg.stroke();
            }
            tCtxBg.globalAlpha = 1.0;
            tCtxBg.globalCompositeOperation = 'source-over';

            // 3. Moon & Moon Glow
            const sunGlow = tCtxBg.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 10);
            sunGlow.addColorStop(0, 'rgba(150, 180, 255, 0.3)');
            sunGlow.addColorStop(0.3, 'rgba(50, 80, 200, 0.1)');
            sunGlow.addColorStop(1, 'rgba(10, 15, 30, 0)');
            tCtxBg.fillStyle = sunGlow;
            tCtxBg.fillRect(0, 0, W, H);

            tCtxBg.fillStyle = '#e0e5ff';
            tCtxBg.shadowColor = '#a0b0ff';
            tCtxBg.shadowBlur = 150;
            tCtxBg.beginPath();
            tCtxBg.arc(sunX, sunY, sunR * 0.4, 0, Math.PI * 2);
            tCtxBg.fill();
            tCtxBg.shadowBlur = 0;

        } else {
            // DAY MODE (Original Order)
            // 1. Sun & Sun Glow
            const sunGlow = tCtxBg.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 10);
            sunGlow.addColorStop(0, 'rgba(255, 230, 150, 0.5)');
            sunGlow.addColorStop(0.3, 'rgba(255, 150, 50, 0.15)');
            sunGlow.addColorStop(1, 'rgba(50, 20, 5, 0)');
            tCtxBg.fillStyle = sunGlow;
            tCtxBg.fillRect(0, 0, W, H);

            tCtxBg.fillStyle = '#fff9d6';
            tCtxBg.shadowColor = '#fff';
            tCtxBg.shadowBlur = 150;
            tCtxBg.beginPath();
            tCtxBg.arc(sunX, sunY, sunR * 0.4, 0, Math.PI * 2);
            tCtxBg.fill();
            tCtxBg.shadowBlur = 0;

            // 2. Bright Sky Haze
            const skyHaze = tCtxBg.createLinearGradient(0, 0, 0, H);
            skyHaze.addColorStop(0, '#f2e8c4');
            skyHaze.addColorStop(0.5, '#d9c58d');
            skyHaze.addColorStop(1, '#8b7355');
            tCtxBg.globalCompositeOperation = 'overlay';
            tCtxBg.fillStyle = skyHaze;
            tCtxBg.globalAlpha = 0.4;
            tCtxBg.fillRect(0, 0, W, H);
            tCtxBg.globalAlpha = 1.0;
            tCtxBg.globalCompositeOperation = 'source-over';
        }

        // --- DISTANT PYRAMIDS ---
        const fallMult = playing ? (window.fallSpeed || 3.0) / 3.0 : 0.05;
        pyramidLayers.forEach((layer, li) => {
            const cfg = PYRAMID_LAYER_CFG[li];
            layer.forEach(p => {
                p.x -= p.speed * fallMult * 2.0;
                if (p.x < -p.size) p.x = W + Math.random() * 500;

                const peakX = p.x + p.size * (0.4 + (p.offset || 0));
                const horizonY = H * 0.76;
                const peakY = horizonY - p.size * 0.85;
                const baseMidX = p.x + p.size * 0.7;

                const lightColor = isNight ? '#2d3748' : cfg.light;
                const shadowColor = isNight ? '#1a202c' : cfg.shadow;

                tCtxBg.fillStyle = lightColor;
                tCtxBg.beginPath();
                tCtxBg.moveTo(p.x, horizonY);
                tCtxBg.lineTo(peakX, peakY);
                tCtxBg.lineTo(baseMidX, horizonY);
                tCtxBg.fill();

                tCtxBg.fillStyle = shadowColor;
                tCtxBg.beginPath();
                tCtxBg.moveTo(peakX, peakY);
                tCtxBg.lineTo(p.x + p.size, horizonY);
                tCtxBg.lineTo(baseMidX, horizonY);
                tCtxBg.fill();

                tCtxBg.strokeStyle = isNight ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
                tCtxBg.lineWidth = 1;
                const steps = Math.floor(p.size / 30);
                for (let s = 1; s < steps; s++) {
                    const ratio = s / steps;
                    const y = peakY + (horizonY - peakY) * ratio;
                    const xL = p.x + (peakX - p.x) * (1 - ratio);
                    const xR = (p.x + p.size) - ((p.x + p.size) - peakX) * (1 - ratio);
                    tCtxBg.beginPath(); tCtxBg.moveTo(xL, y); tCtxBg.lineTo(xR, y); tCtxBg.stroke();
                }
            });
        });

        // --- MINIMALIST FLAT SAND FLOOR ---
        const groundY = H * 0.72;
        tCtxBg.fillStyle = isNight ? '#2d3748' : '#e5d5a1';
        tCtxBg.fillRect(0, groundY, W, H - groundY);

        // --- PARALLAX DUNES (was initialized but never drawn) ---
        if (duneLayers.length === 0) initDunes();
        const duneFallMult = playing ? (window.fallSpeed || 3.0) / 3.0 : 0.05;
        duneLayers.forEach((d, di) => {
            d.scroll = (d.scroll || 0) + d.speed * duneFallMult * 22;
            const baseY = H * d.y;
            const amp = (d.amp || 30) * (isNight ? 0.85 : 1.0);
            const freq = d.freq || 0.0032;
            const step = Math.max(90, 150 - di * 18);

            tCtxBg.fillStyle = d.color;
            tCtxBg.beginPath();
            tCtxBg.moveTo(0, H);
            tCtxBg.lineTo(0, baseY);
            for (let x = 0; x <= W + step; x += step) {
                const y = baseY + Math.sin((x * freq) + (d.phase || 0) + d.scroll * 0.02) * amp;
                tCtxBg.lineTo(x, y);
            }
            tCtxBg.lineTo(W, H);
            tCtxBg.closePath();
            tCtxBg.fill();

            // subtle ripples / highlights
            tCtxBg.globalAlpha = Math.min(0.18, isNight ? 0.06 : 0.10);
            tCtxBg.fillStyle = '#ffffff';
            (d.ripples || []).forEach(r => {
                r.x -= d.speed * duneFallMult * 40;
                if (r.x < -r.w) r.x = W + Math.random() * 180;
                tCtxBg.fillRect(Math.floor(r.x), Math.floor(baseY + r.yOff), Math.floor(r.w), Math.floor(r.h));
            });
            tCtxBg.globalAlpha = 1;
        });

        // COMBO-BASED BLOWING SAND ONLY (Persistent sand removed)
        tCtxBg.shadowBlur = 0;
        for (let i = sandParticles.length - 1; i >= 0; i--) {
            const p = sandParticles[i];
            p.x += p.vx * (isNight ? 1.8 : 1.1);
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0 || p.x > W + 50) { sandParticles.splice(i, 1); continue; }
            tCtxBg.globalAlpha = p.alpha * p.life;
            tCtxBg.fillStyle = isNight ? '#a0b0ff' : '#fceabb';
            tCtxBg.beginPath();
            tCtxBg.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            tCtxBg.fill();
        }
        tCtxBg.globalAlpha = 1;
    } else if (isCity) {
        drawCityBackground();
    } else if (isSunflower) {
        // Ensure sunflower assets are ready (patterns + sparse foreground sprites)
        initSunflowers(false);

        const sunflowerStormActive = isExtreme && window.stormRainStartTime != null &&
            window.audioContext && window.audioContext.currentTime >= window.stormRainStartTime;
        const sunflowerStormT = sunflowerStormActive
            ? Math.min(1, (window.audioContext.currentTime - window.stormRainStartTime) / 5)
            : 0;

        // Sunset sky background (cached gradients)
        const gradKey = `${W}x${H}`;
        const skyH = Math.max(1, H * 0.6);
        if (sunflowerGradKey !== gradKey || !sunflowerSkyGrad || !sunflowerSunGrad) {
            sunflowerGradKey = gradKey;

            const skyG = tCtxBg.createLinearGradient(0, 0, 0, skyH);
            skyG.addColorStop(0, '#f472b6'); // Pinkish top
            skyG.addColorStop(0.4, '#fb923c'); // Vivid orange
            skyG.addColorStop(1, '#fef08a'); // Bright yellow horizon
            sunflowerSkyGrad = skyG;

            const sunX = W * 0.7;
            const sunY = H * 0.5;
            const sunR = Math.max(1, H * 0.4);
            const sunG = tCtxBg.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
            sunG.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            sunG.addColorStop(0.2, 'rgba(253, 224, 71, 0.4)');
            sunG.addColorStop(1, 'rgba(253, 224, 71, 0)');
            sunflowerSunGrad = sunG;
        }

        tCtxBg.fillStyle = sunflowerSkyGrad;
        tCtxBg.fillRect(0, 0, W, skyH);

        // Horizon haze band (helps match warm, hazy sunset depth)
        const hazeY = Math.floor(H * 0.52);
        const hazeH = Math.max(1, Math.floor(H * 0.18));
        const hazeG = tCtxBg.createLinearGradient(0, hazeY, 0, hazeY + hazeH);
        hazeG.addColorStop(0, 'rgba(255, 255, 255, 0)');
        hazeG.addColorStop(0.35, 'rgba(255, 210, 175, 0.18)');
        hazeG.addColorStop(1, 'rgba(255, 180, 140, 0)');
        tCtxBg.fillStyle = hazeG;
        tCtxBg.fillRect(0, hazeY, W, hazeH);

        // Haze flash
        if (sunflowerLightningFlash > 0) {
            tCtxBg.save();
            tCtxBg.globalAlpha = Math.min(0.8, sunflowerLightningFlash * 1.8);
            tCtxBg.fillStyle = '#ffffff';
            tCtxBg.fillRect(0, hazeY, W, hazeH);
            tCtxBg.restore();
        }

        // Horizon clouds (pre-rendered pattern)
        if (sunflowerCloudPattern && sunflowerCloudMeta) {
            const fallMultCloud = playing ? (window.fallSpeed || 3.0) / 1.5 : 0.02;
            sunflowerCloudScrollX = (sunflowerCloudScrollX + SUNFLOWER_CLOUD_CFG.speed * fallMultCloud * 2.6) % sunflowerCloudMeta.tileW;

            tCtxBg.save();
            tCtxBg.globalAlpha = SUNFLOWER_CLOUD_CFG.alpha;
            const pat = sunflowerCloudPattern;
            const yTop = sunflowerCloudMeta.yTop;
            if (typeof pat.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
                const m = new DOMMatrix();
                m.translateSelf(-sunflowerCloudScrollX, yTop);
                pat.setTransform(m);
                tCtxBg.fillStyle = pat;
                tCtxBg.fillRect(0, yTop, W, sunflowerCloudMeta.tileH);
            } else {
                tCtxBg.translate(-sunflowerCloudScrollX, yTop);
                tCtxBg.fillStyle = pat;
                tCtxBg.fillRect(0, 0, W + sunflowerCloudMeta.tileW, sunflowerCloudMeta.tileH);
            }
            tCtxBg.restore();
        }

        if (sunflowerStormT > 0) {
            const stormSky = tCtxBg.createLinearGradient(0, 0, 0, H * 0.68);
            stormSky.addColorStop(0, 'rgba(12, 25, 30, 0.96)');
            stormSky.addColorStop(0.48, 'rgba(25, 42, 48, 0.88)');
            stormSky.addColorStop(1, 'rgba(40, 45, 42, 0.74)');
            tCtxBg.globalAlpha = sunflowerStormT;
            tCtxBg.fillStyle = stormSky;
            tCtxBg.fillRect(0, 0, W, H * 0.68);
            tCtxBg.globalAlpha = 1;
        }

        // (Sky flash moved below sun glow)

        // Ground field (Darkened during lightning)
        tCtxBg.fillStyle = '#3f6212';
        tCtxBg.fillRect(0, H * 0.6, W, H * 0.4);
        if (sunflowerLightningFlash > 0) {
            tCtxBg.save();
            tCtxBg.globalAlpha = Math.min(0.75, sunflowerLightningFlash * 1.5);
            tCtxBg.fillStyle = '#000000';
            tCtxBg.fillRect(0, H * 0.6, W, H * 0.4);
            tCtxBg.restore();
        }

        // Diffuse Sun Glow
        tCtxBg.save();
        tCtxBg.globalAlpha = 1 - sunflowerStormT * 0.86;
        tCtxBg.fillStyle = sunflowerSunGrad;
        tCtxBg.fillRect(0, 0, W, H);
        tCtxBg.restore();

        // --- FLASH CIELO REALISTA ---
        // Se dibuja después del sol para taparlo durante el rayo
        if (sunflowerLightningFlash > 0) {
            tCtxBg.save();
            tCtxBg.globalAlpha = Math.min(1, sunflowerLightningFlash * 2.2);
            tCtxBg.fillStyle = '#ffffff';
            tCtxBg.fillRect(0, 0, W, H * 0.68);
            tCtxBg.restore();
        }

        const fallMult = playing ? (window.fallSpeed || 3.0) / 1.5 : 0.05;
        const fieldScrollMult = 1.9; // global pacing for sunflower parallax

        // Sun shafts / bloom (subtle, additive)
        tCtxBg.save();
        tCtxBg.globalCompositeOperation = 'screen';
        tCtxBg.globalAlpha = 0.16 * (1 - sunflowerStormT);
        const sunX = W * 0.7;
        const sunY = H * 0.5;
        const rays = 8;
        for (let i = 0; i < rays; i++) {
            // Avoid perfectly vertical beams (they read as a "white bar")
            const baseA = -0.52 + i * (1.04 / (rays - 1));
            const a = baseA + 0.03 * Math.sin((Date.now() * 0.001) + i);
            const len = Math.max(W, H) * 1.2;
            const halfW = 14 + i * 4;
            tCtxBg.save();
            tCtxBg.translate(sunX, sunY);
            tCtxBg.rotate(a);
            const g = tCtxBg.createLinearGradient(0, 0, len, 0);
            g.addColorStop(0, 'rgba(255,255,255,0.16)');
            g.addColorStop(0.25, 'rgba(255,210,160,0.08)');
            g.addColorStop(1, 'rgba(255,210,160,0)');
            tCtxBg.fillStyle = g;
            tCtxBg.beginPath();
            tCtxBg.moveTo(0, 0);
            tCtxBg.lineTo(len, -halfW);
            tCtxBg.lineTo(len, halfW);
            tCtxBg.closePath();
            tCtxBg.fill();
            tCtxBg.restore();
        }
        tCtxBg.restore();

        // Poles + wires: push them to the very back (draw before any sunflower layers)
        if (sunflowerPoles && sunflowerPoles.length > 0) {
            const poleFallMult = playing ? (window.fallSpeed || 3.0) / 1.5 : 0.02;
            const poleSpeedPx = SUNFLOWER_POLE_CFG.speed * poleFallMult * fieldScrollMult * 1.0;
            const poleClipY = Math.floor(H * (SUNFLOWER_POLE_CFG.baseY + 0.04));

            // Move / recycle poles
            for (let i = 0; i < sunflowerPoles.length; i++) sunflowerPoles[i].x -= poleSpeedPx;
            for (let i = 0; i < sunflowerPoles.length; i++) {
                const p = sunflowerPoles[i];
                if (p.x < -260) {
                    p.x = W + Math.random() * 520;
                    p.yBase = H * SUNFLOWER_POLE_CFG.baseY + (Math.random() - 0.5) * H * 0.012;
                    p.h = H * (SUNFLOWER_POLE_CFG.minHFrac + Math.random() * (SUNFLOWER_POLE_CFG.maxHFrac - SUNFLOWER_POLE_CFG.minHFrac));
                    p.w = 5 + Math.random() * 4;
                    p.cross = 55 + Math.random() * 40;
                    p.lean = (Math.random() - 0.5) * Math.min(22, H * 0.02);
                }
            }

            // Draw in sky band only
            tCtxBg.save();
            tCtxBg.beginPath();
            tCtxBg.rect(0, 0, W, poleClipY);
            tCtxBg.clip();

            // Wires
            const sorted = sunflowerPoles.slice().sort((a, b) => a.x - b.x);
            const wireCount = 3;
            tCtxBg.save();
            tCtxBg.strokeStyle = 'rgba(60, 45, 40, 0.28)';
            tCtxBg.lineWidth = 1;
            tCtxBg.globalAlpha = 0.75;
            for (let w = 0; w < wireCount; w++) {
                tCtxBg.beginPath();
                for (let i = 0; i < sorted.length - 1; i++) {
                    const p1 = sorted[i];
                    const p2 = sorted[i + 1];
                    const y1 = (p1.yBase - p1.h) + 16 + w * 6;
                    const y2 = (p2.yBase - p2.h) + 16 + w * 6;
                    const x1 = (p1.x + (p1.lean || 0)) + p1.cross * 0.5;
                    const x2 = (p2.x + (p2.lean || 0)) + p2.cross * 0.5;
                    const cx = (x1 + x2) * 0.5;
                    const sag = 11 + w * 2;
                    const cy = (y1 + y2) * 0.5 + sag;
                    if (i === 0) tCtxBg.moveTo(x1, y1);
                    tCtxBg.quadraticCurveTo(cx, cy, x2, y2);
                }
                tCtxBg.stroke();
            }
            tCtxBg.restore();

            // Poles
            tCtxBg.save();
            tCtxBg.globalAlpha = 0.58;
            sunflowerPoles.forEach(p => {
                const topY = p.yBase - p.h;
                const x = p.x;
                const w = p.w;
                const lean = p.lean || 0;

                tCtxBg.fillStyle = 'rgba(55, 36, 28, 0.85)';
                tCtxBg.beginPath();
                tCtxBg.moveTo(x, p.yBase);
                tCtxBg.lineTo(x + w, p.yBase);
                tCtxBg.lineTo(x + w + lean, topY);
                tCtxBg.lineTo(x + lean, topY);
                tCtxBg.closePath();
                tCtxBg.fill();

                if (sunflowerLightningFlash > 0) {
                    tCtxBg.save();
                    tCtxBg.globalAlpha = Math.min(0.75, sunflowerLightningFlash * 1.5);
                    tCtxBg.fillStyle = '#000000';
                    tCtxBg.fill();
                    tCtxBg.restore();
                }

                tCtxBg.fillStyle = 'rgba(75, 50, 38, 0.75)';
                const crossY = topY + 20;
                tCtxBg.fillRect((x + lean) - p.cross * 0.5, crossY, p.cross, 5);

                if (sunflowerLightningFlash > 0) {
                    tCtxBg.save();
                    tCtxBg.globalAlpha = Math.min(0.75, sunflowerLightningFlash * 1.5);
                    tCtxBg.fillStyle = '#000000';
                    tCtxBg.fillRect((x + lean) - p.cross * 0.5, crossY, p.cross, 5);
                    tCtxBg.restore();
                }

                // Light rim (very subtle because it's far)
                tCtxBg.globalCompositeOperation = 'screen';
                tCtxBg.globalAlpha = 0.12;
                tCtxBg.fillStyle = 'rgba(255, 210, 160, 1)';
                tCtxBg.fillRect((x + lean) + w * 0.7, topY, Math.max(1, w * 0.5), p.h);
                tCtxBg.globalCompositeOperation = 'source-over';
                tCtxBg.globalAlpha = 0.58;
            });
            tCtxBg.restore();

            tCtxBg.restore();
        }

        // Draw Layers
        SUNFLOWER_LAYER_CFG.forEach((cfg, li) => {

            if (cfg.isRoad) {
                // Draw Road
                const roadY = H * cfg.baseY;
                const roadH = H * 0.12;
                tCtxBg.fillStyle = '#292524'; // Dark asphalt
                tCtxBg.fillRect(0, roadY, W, roadH);

                if (sunflowerLightningFlash > 0) {
                    tCtxBg.save();
                    tCtxBg.globalAlpha = Math.min(0.75, sunflowerLightningFlash * 1.5);
                    tCtxBg.fillStyle = '#000000';
                    tCtxBg.fillRect(0, roadY, W, roadH);
                    tCtxBg.restore();
                }

                // Road lines
                tCtxBg.fillStyle = '#facc15';
                const lineW = 60;
                const lineGap = 40;
                const roadSpeed = cfg.speed * fallMult * 7.2;
                const totalW = lineW + lineGap;
                const offset = (Date.now() * roadSpeed * 0.02) % totalW;

                for (let lx = -offset; lx < W; lx += totalW) {
                    tCtxBg.fillRect(lx, roadY + roadH / 2 - 2, lineW, 4);
                }

                // Guardrails
                tCtxBg.fillStyle = '#a8a29e';
                tCtxBg.fillRect(0, roadY - 5, W, 5); // top rail

                // Spawn Cars
                if (playing && Math.random() < 0.005) {
                    const toRight = Math.random() > 0.5;
                    const carW = 175 + Math.random() * 70;
                    const carH = 42 + Math.random() * 20;
                    roadCars.push({
                        x: toRight ? -260 : W + 260,
                        y: roadY + (toRight ? roadH * 0.12 : roadH * 0.48),
                        w: carW,
                        h: carH,
                        speed: (toRight ? 1 : -1) * (58 + Math.random() * 30),
                        color: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#f9fafb'][Math.floor(Math.random() * 5)]
                    });
                }

                // Draw Cars
                for (let i = roadCars.length - 1; i >= 0; i--) {
                    const c = roadCars[i];
                    // Move car. Road moves left by roadSpeed, car moves by its speed
                    c.x += c.speed - roadSpeed;
                    if (c.x < -400 || c.x > W + 400) {
                        roadCars.splice(i, 1);
                        continue;
                    }

                    tCtxBg.fillStyle = c.color;
                    tCtxBg.fillRect(c.x, c.y, c.w, c.h);

                    if (sunflowerLightningFlash > 0) {
                        tCtxBg.save();
                        tCtxBg.globalAlpha = Math.min(0.75, sunflowerLightningFlash * 1.5);
                        tCtxBg.fillStyle = '#000000';
                        tCtxBg.fillRect(c.x, c.y, c.w, c.h);
                        tCtxBg.restore();
                    }
                    // Cabin
                    tCtxBg.fillStyle = '#0ea5e9'; // window
                    tCtxBg.fillRect(c.x + c.w * 0.2, c.y - c.h * 0.4, c.w * 0.5, c.h * 0.4);
                    // Wheels
                    tCtxBg.fillStyle = '#1c1917';
                    tCtxBg.beginPath();
                    tCtxBg.arc(c.x + c.w * 0.2, c.y + c.h, c.h * 0.4, 0, Math.PI * 2);
                    tCtxBg.arc(c.x + c.w * 0.8, c.y + c.h, c.h * 0.4, 0, Math.PI * 2);
                    tCtxBg.fill();
                    // Headlight
                    const dir = c.speed > 0 ? 1 : -1;
                    tCtxBg.fillStyle = 'rgba(255,255,200,0.5)';
                    tCtxBg.beginPath();
                    const hx = dir > 0 ? c.x + c.w : c.x;
                    tCtxBg.moveTo(hx, c.y + c.h / 2);
                    tCtxBg.lineTo(hx + dir * 150, c.y - 20);
                    tCtxBg.lineTo(hx + dir * 150, c.y + c.h + 20);
                    tCtxBg.fill();
                }

            } else {
                if (cfg.isForeground) {
                    // Sparse foreground overlap (kept as sprites; very low draw-call count)
                    const sCanvas = sunflowerCanvases.length >= 4 ? sunflowerCanvases[3] : sunflowerCanvases[0];
                    sunflowerForeground.forEach(p => {
                        p.x -= p.speed * fallMult * fieldScrollMult;
                        const actualW = SUNFLOWER_SPRITE_W * p.scale;
                        if (p.x < -actualW * 2) p.x = W + Math.random() * 250;

                        const py = H * cfg.baseY + p.yOff - (SUNFLOWER_SPRITE_H * p.scale);
                        tCtxBg.drawImage(
                            sCanvas,
                            Math.floor(p.x),
                            Math.floor(py),
                            Math.max(1, Math.floor(SUNFLOWER_SPRITE_W * p.scale)),
                            Math.max(1, Math.floor(SUNFLOWER_SPRITE_H * p.scale))
                        );
                        if (sunflowerLightningFlash > 0) {
                            tCtxBg.save();
                            tCtxBg.globalCompositeOperation = 'source-atop';
                            tCtxBg.globalAlpha = Math.min(0.75, sunflowerLightningFlash * 1.5);
                            tCtxBg.fillStyle = '#000000';
                            tCtxBg.fillRect(Math.floor(p.x), Math.floor(py), Math.floor(SUNFLOWER_SPRITE_W * p.scale), Math.floor(SUNFLOWER_SPRITE_H * p.scale));
                            tCtxBg.restore();
                        }
                    });
                } else {
                    // Pattern-based layers (massively reduces per-frame draw calls)
                    const pat = sunflowerPatterns[li];
                    const meta = sunflowerPatternMeta[li];
                    if (!pat || !meta) return;

                    sunflowerScrollX[li] = (sunflowerScrollX[li] + cfg.speed * fallMult * fieldScrollMult) % meta.tileW;
                    const scrollX = sunflowerScrollX[li];

                    if (typeof pat.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
                        const m = new DOMMatrix();
                        m.translateSelf(-scrollX, meta.yTop);
                        pat.setTransform(m);
                        tCtxBg.fillStyle = pat;
                        tCtxBg.fillRect(0, meta.yTop, W, meta.tileH);

                        if (sunflowerLightningFlash > 0) {
                            tCtxBg.save();
                            tCtxBg.globalAlpha = Math.min(0.75, sunflowerLightningFlash * 1.5);
                            tCtxBg.fillStyle = '#000000';
                            tCtxBg.fillRect(0, meta.yTop, W, meta.tileH);
                            tCtxBg.restore();
                        }
                    } else {
                        tCtxBg.save();
                        tCtxBg.translate(-scrollX, meta.yTop);
                        tCtxBg.fillStyle = pat;
                        tCtxBg.fillRect(0, 0, W + meta.tileW, meta.tileH);

                        if (sunflowerLightningFlash > 0) {
                            tCtxBg.save();
                            tCtxBg.globalAlpha = Math.min(0.75, sunflowerLightningFlash * 1.5);
                            tCtxBg.fillStyle = '#000000';
                            tCtxBg.fillRect(0, 0, W + meta.tileW, meta.tileH);
                            tCtxBg.restore();
                        }
                        tCtxBg.restore();
                    }
                }
            }
        });

        if (sunflowerStormT > 0) {
            // Darken the complete scene once the extreme "Buena suerte" storm starts.
            tCtxBg.save();
            tCtxBg.globalAlpha = 0.18 + sunflowerStormT * 0.50;
            tCtxBg.fillStyle = 'rgba(8, 18, 20, 1)';
            tCtxBg.fillRect(0, 0, W, H);
            tCtxBg.restore();

            if (sunflowerStormActive && playing) {
                spawnSunflowerStormRain(
                    Math.round(6 + sunflowerStormT * 14),
                    Math.round(0.5 + sunflowerStormT * 1.5)
                );

                const now = window.audioContext.currentTime;
                if (!sunflowerNextLightningTime) sunflowerNextLightningTime = now + 5 + Math.random() * 2;
                if (now >= sunflowerNextLightningTime) {
                    spawnSunflowerLightning(W, H);
                    sunflowerNextLightningTime = now + 5 + Math.random() * 2;
                }
            }

            // Large graphite-white glow particles
            tCtxBg.save();
            tCtxBg.globalCompositeOperation = 'screen';
            for (let i = sunflowerGlowParticles.length - 1; i >= 0; i--) {
                const p = sunflowerGlowParticles[i];
                if (!playing) { sunflowerGlowParticles.splice(i, 1); continue; }
                p.x += p.vx;
                p.y += p.vy;
                p.life -= p.decay;
                if (p.life <= 0 || p.y > H + p.size) {
                    sunflowerGlowParticles.splice(i, 1);
                    continue;
                }

                const glow = tCtxBg.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                glow.addColorStop(0, `rgba(245, 248, 248, ${p.alpha * p.life * sunflowerStormT})`);
                glow.addColorStop(0.45, `rgba(175, 188, 188, ${p.alpha * 0.45 * p.life * sunflowerStormT})`);
                glow.addColorStop(1, 'rgba(80, 90, 90, 0)');
                tCtxBg.fillStyle = glow;
                tCtxBg.beginPath();
                tCtxBg.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                tCtxBg.fill();
            }
            tCtxBg.restore();

            // Heavy rain lines
            tCtxBg.save();
            tCtxBg.lineCap = 'round';
            for (let i = sunflowerRainParticles.length - 1; i >= 0; i--) {
                const p = sunflowerRainParticles[i];
                if (!playing) { sunflowerRainParticles.splice(i, 1); continue; }
                p.x += p.wind;
                p.y += p.speed;
                if (p.y > H + 80 || p.x < -220) {
                    sunflowerRainParticles.splice(i, 1);
                    continue;
                }

                tCtxBg.globalAlpha = p.alpha * sunflowerStormT;
                tCtxBg.strokeStyle = 'rgba(215, 230, 235, 0.85)';
                tCtxBg.lineWidth = p.width;
                tCtxBg.beginPath();
                tCtxBg.moveTo(p.x, p.y);
                tCtxBg.lineTo(p.x + p.wind * 1.6, p.y + p.len);
                tCtxBg.stroke();
            }
            tCtxBg.globalAlpha = 1;
            tCtxBg.restore();

            // Lightning bolts + screen flash
            // Lightning flash logic (handled via silhouettes and sky flash above)
            if (sunflowerLightningFlash > 0) {
                sunflowerLightningFlash *= 0.82;
                if (sunflowerLightningFlash < 0.02) sunflowerLightningFlash = 0;
            }

            tCtxBg.save();
            tCtxBg.globalCompositeOperation = 'screen';
            tCtxBg.lineCap = 'round';
            tCtxBg.lineJoin = 'round';
            for (let i = sunflowerLightningBolts.length - 1; i >= 0; i--) {
                const bolt = sunflowerLightningBolts[i];
                bolt.life -= bolt.decay;
                if (bolt.life <= 0) {
                    sunflowerLightningBolts.splice(i, 1);
                    continue;
                }

                const alpha = bolt.life * sunflowerStormT;
                tCtxBg.strokeStyle = `rgba(190, 220, 255, ${0.42 * alpha})`;
                tCtxBg.lineWidth = 9;
                tCtxBg.beginPath();
                bolt.points.forEach((pt, idx) => idx === 0 ? tCtxBg.moveTo(pt.x, pt.y) : tCtxBg.lineTo(pt.x, pt.y));
                tCtxBg.stroke();

                tCtxBg.strokeStyle = `rgba(255, 255, 255, ${0.95 * alpha})`;
                tCtxBg.lineWidth = 2.2;
                tCtxBg.beginPath();
                bolt.points.forEach((pt, idx) => idx === 0 ? tCtxBg.moveTo(pt.x, pt.y) : tCtxBg.lineTo(pt.x, pt.y));
                tCtxBg.stroke();

                bolt.branches.forEach(branch => {
                    tCtxBg.strokeStyle = `rgba(220, 238, 255, ${0.58 * alpha})`;
                    tCtxBg.lineWidth = 1.4;
                    tCtxBg.beginPath();
                    branch.forEach((pt, idx) => idx === 0 ? tCtxBg.moveTo(pt.x, pt.y) : tCtxBg.lineTo(pt.x, pt.y));
                    tCtxBg.stroke();
                });
            }
            tCtxBg.restore();
        } else if (sunflowerRainParticles.length || sunflowerGlowParticles.length || sunflowerLightningBolts.length || sunflowerNextLightningTime) {
            resetSunflowerStorm();
        }
    } else if (isGalaxy) {
        const songSec = (window.isPlaying && !window.isPaused && window.audioContext && typeof startTime === 'number')
            ? (window.audioContext.currentTime - startTime)
            : 0;

        // Ensure galaxy variables are initialized
        if (galaxyStars.length === 0) {
            initGalaxyTheme();
        }

        const sunX = W * 0.85;
        const sunY = H * 0.5;
        const sunR = Math.max(30, Math.min(W, H) * 0.15);
        const sunTime = Date.now() * 0.001;

        // 0. Paint completely black background
        tCtxBg.fillStyle = '#000000';
        tCtxBg.fillRect(0, 0, W, H);

        // 0.5 Draw galactic dust
        galaxyDust.forEach(d => {
            d.x += d.vx;
            d.y += d.vy;
            if (d.x < -d.size) d.x = W + d.size;
            if (d.x > W + d.size) d.x = -d.size;
            if (d.y < -d.size) d.y = H + d.size;
            if (d.y > H + d.size) d.y = -d.size;

            const g = tCtxBg.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.size);
            g.addColorStop(0, d.color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            tCtxBg.fillStyle = g;
            tCtxBg.beginPath();
            tCtxBg.arc(d.x, d.y, d.size, 0, Math.PI * 2);
            tCtxBg.fill();
        });

        // --- BACKGROUND NEBULA & SPIRAL GALAXY ---
        galaxyNebulaRotation += 0.0006; // Rotate very slowly

        tCtxBg.save();
        const galX = W * 0.35;
        const galY = H * 0.3;
        tCtxBg.translate(galX, galY);
        tCtxBg.rotate(galaxyNebulaRotation);

        // 1. Core glow
        const coreG = tCtxBg.createRadialGradient(0, 0, 0, 0, 0, 240);
        coreG.addColorStop(0, 'rgba(255, 220, 245, 0.45)');
        coreG.addColorStop(0.25, 'rgba(219, 39, 119, 0.2)');   // Pink
        coreG.addColorStop(0.55, 'rgba(124, 58, 237, 0.08)');  // Purple
        coreG.addColorStop(1, 'rgba(0, 0, 0, 0)');
        tCtxBg.fillStyle = coreG;
        tCtxBg.beginPath();
        tCtxBg.arc(0, 0, 240, 0, Math.PI * 2);
        tCtxBg.fill();

        // 2. Logarithmic spiral arms (gas & small stars)
        for (let arm = 0; arm < 2; arm++) {
            const offset = arm * Math.PI;
            for (let i = 0; i < 160; i++) {
                const theta = (i / 160) * Math.PI * 3.8;
                const r = 25 + Math.pow(theta, 1.45) * 25;
                const x = Math.cos(theta + offset) * r;
                const y = Math.sin(theta + offset) * r * 0.6; // Flattened perspective

                tCtxBg.fillStyle = i % 3 === 0 ? 'rgba(253, 224, 71, 0.65)' : (i % 2 === 0 ? 'rgba(236, 72, 153, 0.55)' : 'rgba(168, 85, 247, 0.55)');
                tCtxBg.beginPath();
                tCtxBg.arc(x, y, Math.max(0.5, 3.2 - theta * 0.35 + Math.random() * 0.8), 0, Math.PI * 2);
                tCtxBg.fill();
            }
        }
        tCtxBg.restore();

        // --- GLOWING GIANT SUN ON THE RIGHT ---
        const isExtreme = !!window.isExtremeMap || !!window.forceSecondaryStyle;
        let sunVisible = true;
        let sunExplosionOpacity = 1.0;

        if (isExtreme && songSec >= 15.0) {
            const explT = songSec - 15.0;
            if (explT >= 0.8) {
                sunVisible = false;
            } else {
                sunExplosionOpacity = Math.max(0, 1.0 - explT / 0.6);
            }

            // Trigger particle crumble explosion and spawn galactic dust
            if (!sunExplodedTriggered) {
                sunExplodedTriggered = true;
                sunExplosionParticles = [];
                const sunColors = ['#ffffff', '#fef08a', '#f97316', '#ef4444', '#ca8a04'];
                // Spawn crumbling solar particles
                for (let i = 0; i < 220; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 1.2 + Math.random() * 6.5;
                    sunExplosionParticles.push({
                        x: sunX + (Math.random() - 0.5) * sunR,
                        y: sunY + (Math.random() - 0.5) * sunR,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        size: 1.2 + Math.random() * 3.8,
                        color: sunColors[Math.floor(Math.random() * sunColors.length)],
                        alpha: 1.0,
                        decay: 0.007 + Math.random() * 0.012
                    });
                }
                // Spawn persistent galactic dust remnants
                galaxyDust.push({
                    x: sunX,
                    y: sunY,
                    vx: (Math.random() - 0.5) * 0.04,
                    vy: (Math.random() - 0.5) * 0.04,
                    size: sunR * 2.2,
                    color: 'rgba(249, 115, 22, 0.16)' // Orange dust residue
                });
                galaxyDust.push({
                    x: sunX - sunR * 0.4,
                    y: sunY + sunR * 0.4,
                    vx: (Math.random() - 0.5) * 0.03,
                    vy: (Math.random() - 0.5) * 0.03,
                    size: sunR * 1.7,
                    color: 'rgba(239, 68, 68, 0.12)' // Red dust residue
                });
            }
        }

        if (sunVisible) {
            // 1. Fiery Corona Background (Turbulent outer flames in 3 layers)
            const layers = [
                { color: `rgba(220, 38, 38, ${0.42 * sunExplosionOpacity})`, scale: 1.5, speed: 2.8, count: 45 },  // Red outer
                { color: `rgba(249, 115, 22, ${0.52 * sunExplosionOpacity})`, scale: 1.3, speed: 3.8, count: 55 }, // Orange mid
                { color: `rgba(253, 224, 71, ${0.62 * sunExplosionOpacity})`, scale: 1.15, speed: 5.0, count: 65 } // Yellow inner
            ];
            tCtxBg.save();
            tCtxBg.translate(sunX, sunY);
            layers.forEach((l) => {
                tCtxBg.fillStyle = l.color;
                tCtxBg.beginPath();
                for (let i = 0; i <= l.count; i++) {
                    const angle = (i * Math.PI * 2 / l.count);
                    const wave = Math.sin(angle * 7 + sunTime * l.speed) * Math.cos(angle * 3 - sunTime * l.speed * 0.7);
                    const extraR = sunR * (0.05 + 0.16 * Math.abs(wave) + Math.random() * 0.02) * l.scale;
                    const sr = sunR + extraR;
                    const sx_val = Math.cos(angle) * sr;
                    const sy_val = Math.sin(angle) * sr;
                    if (i === 0) tCtxBg.moveTo(sx_val, sy_val);
                    else tCtxBg.lineTo(sx_val, sy_val);
                }
                tCtxBg.closePath();
                tCtxBg.fill();
            });
            tCtxBg.restore();

            // 2. Coronal Loops (arcs popping out and back)
            tCtxBg.save();
            tCtxBg.translate(sunX, sunY);
            tCtxBg.strokeStyle = `rgba(251, 191, 36, ${0.42 * sunExplosionOpacity})`; // Warm golden yellow
            tCtxBg.lineWidth = 3.5;
            for (let i = 0; i < 8; i++) {
                const loopAngle = (i * Math.PI / 4) + sunTime * 0.12;
                const startR = sunR * 0.95;
                const endR = sunR * 0.95;
                const height = sunR * (0.12 + Math.sin(sunTime + i * 1.5) * 0.06);

                const x1 = Math.cos(loopAngle - 0.12) * startR;
                const y1 = Math.sin(loopAngle - 0.12) * startR;
                const x2 = Math.cos(loopAngle + 0.12) * endR;
                const y2 = Math.sin(loopAngle + 0.12) * endR;

                const ctrlAngle = loopAngle;
                const ctrlR = sunR + height;
                const cx = Math.cos(ctrlAngle) * ctrlR;
                const cy = Math.sin(ctrlAngle) * ctrlR;

                tCtxBg.beginPath();
                tCtxBg.moveTo(x1, y1);
                tCtxBg.quadraticCurveTo(cx, cy, x2, y2);
                tCtxBg.stroke();
            }
            tCtxBg.restore();

            // 3. Sun outer soft glow
            const sunG = tCtxBg.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 1.6);
            sunG.addColorStop(0, `rgba(255, 255, 220, ${0.95 * sunExplosionOpacity})`);
            sunG.addColorStop(0.2, `rgba(234, 179, 8, ${0.45 * sunExplosionOpacity})`);  // Yellow
            sunG.addColorStop(0.55, `rgba(249, 115, 22, ${0.15 * sunExplosionOpacity})`); // Orange
            sunG.addColorStop(1, 'rgba(0, 0, 0, 0)');
            tCtxBg.fillStyle = sunG;
            tCtxBg.beginPath();
            tCtxBg.arc(sunX, sunY, sunR * 1.6, 0, Math.PI * 2);
            tCtxBg.fill();

            // 4. Sun main solid core with white-hot radial gradient
            const bodyGrad = tCtxBg.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
            bodyGrad.addColorStop(0, `rgba(255, 255, 255, ${sunExplosionOpacity})`); // White-hot core
            bodyGrad.addColorStop(0.35, `rgba(254, 240, 138, ${sunExplosionOpacity})`); // Soft yellow
            bodyGrad.addColorStop(0.7, `rgba(249, 115, 22, ${sunExplosionOpacity})`); // Intense orange
            bodyGrad.addColorStop(0.92, `rgba(234, 88, 12, ${sunExplosionOpacity})`); // Deep orange-red edge
            bodyGrad.addColorStop(1.0, `rgba(124, 45, 18, ${0.1 * sunExplosionOpacity})`);  // Dark boundary

            tCtxBg.fillStyle = bodyGrad;
            tCtxBg.beginPath();
            tCtxBg.arc(sunX, sunY, sunR, 0, Math.PI * 2);
            tCtxBg.fill();

            // 5. Sunspots and solar convective cells
            tCtxBg.save();
            tCtxBg.translate(sunX, sunY);

            // 5.1 Dark filaments / spots
            tCtxBg.fillStyle = `rgba(124, 45, 18, ${0.45 * sunExplosionOpacity})`; // deep reddish-orange
            for (let i = 0; i < 22; i++) {
                const angle = (i * 1.7) + sunTime * 0.05;
                const dist = sunR * (0.15 + (i % 7) * 0.1);
                const size = sunR * (0.05 + (i % 3) * 0.04);
                const x = Math.cos(angle) * dist;
                const y = Math.sin(angle) * dist;
                tCtxBg.beginPath();
                tCtxBg.arc(x, y, size, 0, Math.PI * 2);
                tCtxBg.fill();
            }

            // 5.2 Bright hot convective currents (white/yellow plagues)
            tCtxBg.fillStyle = `rgba(255, 255, 255, ${0.38 * sunExplosionOpacity})`;
            for (let i = 0; i < 26; i++) {
                const angle = (i * 2.3) - sunTime * 0.07;
                const dist = sunR * (0.1 + (i % 8) * 0.09);
                const size = sunR * (0.04 + (i % 4) * 0.05);
                const x = Math.cos(angle) * dist;
                const y = Math.sin(angle) * dist;
                tCtxBg.beginPath();
                tCtxBg.arc(x, y, size, 0, Math.PI * 2);
                tCtxBg.fill();
            }

            // 5.3 Turbulent convection ring boundaries
            tCtxBg.strokeStyle = `rgba(254, 240, 138, ${0.22 * sunExplosionOpacity})`;
            tCtxBg.lineWidth = 3;
            for (let rOffset = 0; rOffset < 0.95; rOffset += 0.15) {
                tCtxBg.beginPath();
                for (let a = 0; a <= 20; a++) {
                    const angle = a * Math.PI * 2 / 20;
                    const wave = Math.sin(angle * 6 + sunTime * 2);
                    const r = sunR * rOffset + wave * 5;
                    const x = Math.cos(angle) * r;
                    const y = Math.sin(angle) * r;
                    if (a === 0) tCtxBg.moveTo(x, y);
                    else tCtxBg.lineTo(x, y);
                }
                tCtxBg.closePath();
                tCtxBg.stroke();
            }
            tCtxBg.restore();
        }

        // 5.4 Update and draw crumbling sun explosion particles
        if (sunExplosionParticles.length > 0) {
            tCtxBg.save();
            for (let i = sunExplosionParticles.length - 1; i >= 0; i--) {
                const p = sunExplosionParticles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.alpha -= p.decay;
                if (p.alpha <= 0) {
                    sunExplosionParticles.splice(i, 1);
                    continue;
                }
                tCtxBg.globalAlpha = p.alpha;
                tCtxBg.fillStyle = p.color;
                tCtxBg.beginPath();
                tCtxBg.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                tCtxBg.fill();
            }
            tCtxBg.restore();
        }

        // --- 3D STARFIELD (FRONTAL PARALLAX) WITH HYPERDRIVE WARP ---
        let speedMult = 1.0;
        if (isExtreme && songSec >= 17.0) {
            const warpT = Math.min(1.0, (songSec - 17.0) / 2.0);
            speedMult = 1.0 + warpT * 3.5; // reaches 4.5x speed
        }
        const zSpeed = playing ? (window.fallSpeed || 3.0) * 0.32 * speedMult : 0.04;

        galaxyStars.forEach(s => {
            s.z -= zSpeed;
            if (s.z <= 10) {
                s.z = 1000;
                s.x = (Math.random() - 0.5) * W * 3.5;
                s.y = (Math.random() - 0.5) * H * 3.5;
            }

            const fov = 400;
            const px = (s.x / s.z) * fov + W / 2;
            const py = (s.y / s.z) * fov + H / 2;

            if (px >= 0 && px < W && py >= 0 && py < H) {
                const alpha = Math.min(1.0, (1000 - s.z) / 200) * (s.z > 200 ? 1.0 : s.z / 200);
                tCtxBg.fillStyle = s.color;
                tCtxBg.globalAlpha = alpha;

                if (speedMult > 1.05) {
                    // Warp stretch lines
                    tCtxBg.strokeStyle = s.color;
                    tCtxBg.lineWidth = Math.max(0.5, (s.size * fov) / s.z);
                    tCtxBg.beginPath();
                    const prevPx = ((s.x) / (s.z + zSpeed * 2.5)) * fov + W / 2;
                    const prevPy = ((s.y) / (s.z + zSpeed * 2.5)) * fov + H / 2;
                    tCtxBg.moveTo(px, py);
                    tCtxBg.lineTo(prevPx, prevPy);
                    tCtxBg.stroke();
                } else {
                    tCtxBg.beginPath();
                    tCtxBg.arc(px, py, Math.max(0.5, (s.size * fov) / s.z), 0, Math.PI * 2);
                    tCtxBg.fill();
                }
            }
        });
        tCtxBg.globalAlpha = 1.0;

        // --- CELESTIAL PLANETS ---
        galaxyPlanets.forEach(p => {
            p.z -= zSpeed * 0.85; // Move slightly slower for depth
            if (p.z <= 20) {
                p.z = 1200;
                p.x = (Math.random() - 0.5) * W * 2.2;
                p.y = (Math.random() - 0.5) * H * 2.2;
            }

            const fov = 400;
            const px = (p.x / p.z) * fov + W / 2;
            const py = (p.y / p.z) * fov + H / 2;
            const radius = (p.size * fov) / p.z;

            if (radius > 1 && px > -radius * 2 && px < W + radius * 2 && py > -radius * 2 && py < H + radius * 2) {
                tCtxBg.save();

                // Shade away from the sun at (W*0.95, H*0.5)
                const dx = W * 0.95 - px;
                const dy = H * 0.5 - py;
                const angleToSun = Math.atan2(dy, dx);

                const grad = tCtxBg.createRadialGradient(
                    px + Math.cos(angleToSun) * radius * 0.35,
                    py + Math.sin(angleToSun) * radius * 0.35,
                    0,
                    px,
                    py,
                    radius
                );
                grad.addColorStop(0, p.baseColor);
                grad.addColorStop(0.65, p.baseColor);
                grad.addColorStop(1, '#020008'); // Dark back side

                tCtxBg.fillStyle = grad;
                tCtxBg.beginPath();
                tCtxBg.arc(px, py, radius, 0, Math.PI * 2);
                tCtxBg.fill();

                if (p.type === 'saturn') {
                    tCtxBg.translate(px, py);
                    tCtxBg.rotate(p.angle);

                    // Ring back half
                    tCtxBg.strokeStyle = p.ringColor;
                    tCtxBg.lineWidth = radius * 0.22;
                    tCtxBg.beginPath();
                    tCtxBg.ellipse(0, 0, radius * 1.8, radius * 0.35, 0, Math.PI, 0);
                    tCtxBg.stroke();

                    // Ring front half
                    tCtxBg.beginPath();
                    tCtxBg.ellipse(0, 0, radius * 1.8, radius * 0.35, 0, 0, Math.PI);
                    tCtxBg.stroke();
                }
                tCtxBg.restore();
            }
        });

        // --- FLOATING 3D STRUCTURES (SPACE RUINS) ---
        galaxyStructures.forEach(s => {
            s.z -= zSpeed * 1.35; // Ruins move faster to feel closer
            s.rx += s.rotSpeedX;
            s.ry += s.rotSpeedY;
            s.rz += s.rotSpeedZ;

            s.x += s.vx;
            s.y += s.vy;

            if (s.z <= 20) {
                s.z = 1000;
                const angle = Math.random() * Math.PI * 2;
                const radius = W * 0.4 + Math.random() * W * 0.5;
                s.x = Math.cos(angle) * radius;
                s.y = Math.sin(angle) * radius + (Math.random() - 0.5) * H * 0.3;
            }

            const fov = 400;
            const sizeScale = fov / s.z;
            const cx = (s.x / s.z) * fov + W / 2;
            const cy = (s.y / s.z) * fov + H / 2;

            if (sizeScale > 0.05 && cx > -200 && cx < W + 200 && cy > -200 && cy < H + 200) {
                const w = s.w;
                const h = s.h;
                const d = s.d;

                const vertices = [
                    { x: -w, y: -h, z: -d },
                    { x: w, y: -h, z: -d },
                    { x: w, y: h, z: -d },
                    { x: -w, y: h, z: -d },
                    { x: -w, y: -h, z: d },
                    { x: w, y: -h, z: d },
                    { x: w, y: h, z: d },
                    { x: -w, y: h, z: d }
                ];

                const cosX = Math.cos(s.rx), sinX = Math.sin(s.rx);
                const cosY = Math.cos(s.ry), sinY = Math.sin(s.ry);
                const cosZ = Math.cos(s.rz), sinZ = Math.sin(s.rz);

                const projected = vertices.map(v => {
                    const y1 = v.y * cosX - v.z * sinX;
                    const z1 = v.y * sinX + v.z * cosX;
                    const x2 = v.x * cosY + z1 * sinY;
                    const z2 = -v.x * sinY + z1 * cosY;
                    const x3 = x2 * cosZ - y1 * sinZ;
                    const y3 = x2 * sinZ + y1 * cosZ;

                    const absX = s.x + x3;
                    const absY = s.y + y3;
                    const absZ = s.z + z2;

                    return {
                        x: (absX / absZ) * fov + W / 2,
                        y: (absY / absZ) * fov + H / 2,
                        z: absZ
                    };
                });

                const faces = [
                    { indices: [0, 1, 2, 3], normal: { x: 0, y: 0, z: -1 } },
                    { indices: [1, 5, 6, 2], normal: { x: 1, y: 0, z: 0 } },
                    { indices: [5, 4, 7, 6], normal: { x: 0, y: 0, z: 1 } },
                    { indices: [4, 0, 3, 7], normal: { x: -1, y: 0, z: 0 } },
                    { indices: [4, 5, 1, 0], normal: { x: 0, y: -1, z: 0 } },
                    { indices: [3, 2, 6, 7], normal: { x: 0, y: 1, z: 0 } }
                ];

                faces.forEach(f => {
                    f.avgZ = f.indices.reduce((sum, idx) => sum + projected[idx].z, 0) / 4;
                });
                faces.sort((a, b) => b.avgZ - a.avgZ);

                faces.forEach(f => {
                    const shadeFactor = 0.4 + (f.normal.x * 0.4) + (f.normal.y * 0.1);
                    const alpha = Math.min(1.0, (1000 - s.z) / 150) * (s.z > 50 ? 1.0 : s.z / 50);

                    tCtxBg.beginPath();
                    tCtxBg.moveTo(projected[f.indices[0]].x, projected[f.indices[0]].y);
                    for (let k = 1; k < 4; k++) {
                        tCtxBg.lineTo(projected[f.indices[k]].x, projected[f.indices[k]].y);
                    }
                    tCtxBg.closePath();

                    if (s.style === 'checkered') {
                        const brightness = Math.round(95 * shadeFactor + 30);
                        tCtxBg.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${alpha})`;
                        tCtxBg.fill();

                        tCtxBg.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.22})`;
                        tCtxBg.lineWidth = 1.5;
                        tCtxBg.stroke();

                        tCtxBg.beginPath();
                        tCtxBg.moveTo((projected[f.indices[0]].x + projected[f.indices[1]].x) / 2, (projected[f.indices[0]].y + projected[f.indices[1]].y) / 2);
                        tCtxBg.lineTo((projected[f.indices[2]].x + projected[f.indices[3]].x) / 2, (projected[f.indices[2]].y + projected[f.indices[3]].y) / 2);
                        tCtxBg.moveTo((projected[f.indices[1]].x + projected[f.indices[2]].x) / 2, (projected[f.indices[1]].y + projected[f.indices[2]].y) / 2);
                        tCtxBg.lineTo((projected[f.indices[3]].x + projected[f.indices[0]].x) / 2, (projected[f.indices[3]].y + projected[f.indices[0]].y) / 2);
                        tCtxBg.stroke();
                    } else if (s.style === 'neon') {
                        const neonCol = s.w % 2 === 0 ? '6, 182, 212' : '236, 72, 153';
                        tCtxBg.fillStyle = `rgba(${neonCol}, ${alpha * 0.08 * shadeFactor})`;
                        tCtxBg.fill();
                        tCtxBg.strokeStyle = `rgba(${neonCol}, ${alpha})`;
                        tCtxBg.lineWidth = 2.0;
                        tCtxBg.stroke();
                    } else {
                        const brightness = Math.round(75 * shadeFactor + 20);
                        tCtxBg.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness + 4}, ${alpha})`;
                        tCtxBg.fill();
                        tCtxBg.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.08})`;
                        tCtxBg.lineWidth = 1;
                        tCtxBg.stroke();
                    }
                });
            }
        });
    } else if (isForest) {
        if (forestLayers.length === 0) {
            initForest();
        }

        const fallMult = playing ? (window.fallSpeed || 3.0) / 3.0 : 0.05;

        // Calculate daytime transition based on the half-length of the song and return to night in the last 15s
        const duration = window.audioBuffer ? window.audioBuffer.duration : 0;
        const currentTime = window.lastInterpolatedTime || 0;
        const halfDuration = duration / 2;
        let daytimeFactor = 0;

        if (duration > 0) {
            if (currentTime >= halfDuration && currentTime < duration - 15) {
                // Smoothly transition from night to day over 3 seconds once past the half-length
                daytimeFactor = Math.min(1, (currentTime - halfDuration) / 3);
            } else if (currentTime >= duration - 15) {
                // Smoothly transition back to night over 3 seconds during the last 15 seconds
                daytimeFactor = Math.max(0, 1 - (currentTime - (duration - 15)) / 3);
            }
        }

        // 1. Draw Day/Night Sky Gradient
        const skyGrad = tCtxBg.createLinearGradient(0, 0, 0, H * 0.6);

        // Night gradient colors
        const nightTop = '#010204';
        const nightMid = '#040810';
        const nightBottom = '#0c1322';

        // Day gradient colors matching the user image
        const dayTop = '#ff5ee8';     // Pink/magenta
        const dayMid = '#ffa620';     // Orange/yellow
        const dayBottom = '#fff8b0';  // Light yellow/white

        const topColor = lerpColor(nightTop, dayTop, daytimeFactor);
        const midColor = lerpColor(nightMid, dayMid, daytimeFactor);
        const bottomColor = lerpColor(nightBottom, dayBottom, daytimeFactor);

        skyGrad.addColorStop(0, topColor);
        skyGrad.addColorStop(0.5, midColor);
        skyGrad.addColorStop(1, bottomColor);
        tCtxBg.fillStyle = skyGrad;
        tCtxBg.fillRect(0, 0, W, H);

        // Draw stars fading out as daytime progresses
        if (daytimeFactor < 1) {
            if (!starCanvas || starCanvas.width !== W || starCanvas.height !== H) {
                starCanvas = generateStarfield(W, H);
            }
            tCtxBg.save();
            tCtxBg.globalAlpha = 1 - daytimeFactor;
            tCtxBg.globalCompositeOperation = 'screen';
            tCtxBg.drawImage(starCanvas, 0, 0);
            tCtxBg.restore();
        }

        // Draw the bright sun and sunset-like glowing ring behind mountains (Daytime)
        if (daytimeFactor > 0) {
            tCtxBg.save();
            tCtxBg.globalAlpha = daytimeFactor;

            const sunX = W / 2;
            const sunY = H * 0.42;
            const sunGlowRadius = H * 0.45;

            const sunGlow = tCtxBg.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunGlowRadius);
            sunGlow.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
            sunGlow.addColorStop(0.12, 'rgba(255, 246, 170, 0.95)');
            sunGlow.addColorStop(0.35, 'rgba(255, 170, 60, 0.50)');
            sunGlow.addColorStop(0.65, 'rgba(255, 94, 232, 0.18)');
            sunGlow.addColorStop(1, 'rgba(255, 94, 232, 0)');

            tCtxBg.fillStyle = sunGlow;
            tCtxBg.beginPath();
            tCtxBg.arc(sunX, sunY, sunGlowRadius, 0, Math.PI * 2);
            tCtxBg.fill();

            tCtxBg.restore();
        }

        // 2. Draw Parallax Layers (Trees + ground hills)
        forestLayers.forEach((layer, li) => {
            const cfg = FOREST_LAYER_CFG[li];
            const cfgDay = FOREST_LAYER_CFG_DAY[li];

            const treeColor = lerpColor(cfg.treeColor, cfgDay.treeColor, daytimeFactor);
            const snowColor = lerpColor(cfg.snowColor, cfgDay.snowColor, daytimeFactor);
            const groundColor = lerpColor(cfg.groundColor, cfgDay.groundColor, daytimeFactor);

            const scrollSpeed = cfg.speed * fallMult * (isExtreme ? 2.2 : 1.1) * 6;

            layer.scroll += scrollSpeed;

            const baseY = H * cfg.yRatio;
            const freq = cfg.freq;
            const amp = cfg.amp;
            const phase = cfg.phase;

            tCtxBg.fillStyle = groundColor;
            tCtxBg.beginPath();
            tCtxBg.moveTo(0, H);

            const startY = baseY + Math.sin(layer.scroll * freq + phase) * amp;
            tCtxBg.lineTo(0, startY);

            for (let x = 0; x <= W + 40; x += 40) {
                const y = baseY + Math.sin((x + layer.scroll) * freq + phase) * amp;
                tCtxBg.lineTo(x, y);
            }
            tCtxBg.lineTo(W, H);
            tCtxBg.closePath();
            tCtxBg.fill();

            layer.trees.forEach(t => {
                t.x -= scrollSpeed;
                if (t.x < -t.w * 2) {
                    t.x = W + Math.random() * 200;
                    t.w = cfg.treeW * (0.85 + Math.random() * 0.3);
                    t.h = cfg.treeH * (0.85 + Math.random() * 0.3);
                }

                const treeY = baseY + Math.sin((t.x + layer.scroll) * freq + phase) * amp;
                drawPineTree(tCtxBg, t.x, treeY, t.w, t.h, treeColor, snowColor);
            });
        });

        // 3. Snowfall Particles (Fixed Pool)
        const maxSnow = isExtreme ? 400 : 120;
        tCtxBg.fillStyle = '#ffffff';
        const windRatio = isExtreme ? -1.0 : -0.25;
        const speedScale = isExtreme ? 4.5 : 1.5;

        for (let i = 0; i < maxSnow; i++) {
            const p = forestSnowParticles[i];
            if (!p) continue;

            const cfg = SNOW_PARALLAX_CFG[p.layerIdx];
            const treeCfg = FOREST_LAYER_CFG[cfg.treeCfgIdx];

            const scrollSpeed = treeCfg.speed * fallMult * (isExtreme ? 2.2 : 1.1) * 6;
            const currentSpeed = p.speed * speedScale;
            const currentWind = (currentSpeed * windRatio) - scrollSpeed;

            p.y += currentSpeed;
            p.x += currentWind;

            if (p.y > H + 10 || p.x < -p.r * 2) {
                const fresh = makeSnowParticle(p.layerIdx, false);
                p.x = fresh.x;
                p.y = fresh.y;
                p.r = fresh.r;
                p.speed = fresh.speed;
                p.alpha = fresh.alpha;
            }

            tCtxBg.globalAlpha = p.alpha;
            tCtxBg.beginPath();
            tCtxBg.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            tCtxBg.fill();
        }
        tCtxBg.globalAlpha = 1.0;

        // 4. Draw Dust/Mist Particles (Storm only, Fixed Pool of 15)
        if (isExtreme) {
            for (let i = 0; i < forestDustParticles.length; i++) {
                const p = forestDustParticles[i];
                p.x -= p.speed;
                p.life -= p.decay;

                if (p.x < -p.r * 2 || p.life <= 0) {
                    p.x = W + p.r + Math.random() * 150;
                    p.y = Math.random() * H;
                    p.r = 120 + Math.random() * 180;
                    p.speed = 0.4 + Math.random() * 1.0;
                    p.alpha = 0.008 + Math.random() * 0.022;
                    p.life = 1.0;
                    p.decay = 0.0003 + Math.random() * 0.0007;
                }

                const currentAlpha = p.alpha * p.life;
                const grad = tCtxBg.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
                grad.addColorStop(0, `rgba(224, 231, 255, ${currentAlpha})`);
                grad.addColorStop(1, 'rgba(224, 231, 255, 0)');
                tCtxBg.fillStyle = grad;
                tCtxBg.beginPath();
                tCtxBg.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                tCtxBg.fill();
            }
        }
    } else if (isGlass) {
        drawGlassBackground();
    }

    requestAnimationFrame(drawThemeBackground);
}

window.addEventListener('neonbeat-game-start', () => {
    lastSandComboTrigger = 0;
    sandParticles = [];
    rainParticles = [];
    shootingStars = [];
    resetSunflowerStorm();
    roadCars = [];
    galaxyStars = [];
    galaxyPlanets = [];
    galaxyStructures = [];
    galaxyDust = [];
    sunExplosionParticles = [];
    sunExplodedTriggered = false;
    galaxyNebulaRotation = 0;
    forestLayers = [];
    forestSnowParticles = [];
    forestDustParticles = [];
    window.stormRainStartTime = null;
    window.isExtremeMap = false;
});

// Theme listener has been merged into the top one

// Initialize and start the loop
initThemeAssets();
drawThemeBackground();

function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

window.loadPreloadedSong = async function (songKey, songName) {
    const statusText = document.getElementById('status-text');
    const customOverlayPanel = document.getElementById('custom-overlay-panel');
    try {
        if (statusText) statusText.innerText = `Decodificando "${songName}"...`;

        const base64Data = window.preloadedSongs ? window.preloadedSongs[songKey] : null;
        if (!base64Data) throw new Error("Datos de canción no precargados o no encontrados.");

        const arrayBuffer = base64ToArrayBuffer(base64Data);
        const file = new File([arrayBuffer], songName + ".mp3", { type: "audio/mp3" });

        if (typeof window.handleFile === 'function') {
            window.handleFile(file);
        } else {
            throw new Error("window.handleFile no está definida.");
        }

        // Cierra la ventana modal automáticamente
        if (customOverlayPanel) {
            customOverlayPanel.classList.add('hidden');
        }

        // Muestra la pantalla del autocharter
        if (typeof window.showScreen === 'function') {
            window.showScreen('game');
        }
    } catch (err) {
        console.error("Error al precargar la canción:", err);
        if (statusText) {
            statusText.innerHTML = `<span style="color: #ef4444; font-weight: 700;">Error al cargar la canción: ${err.message}</span>`;
        }
    }
};

// ==========================================================
// NEW NAVIGATION & SCREENS STATE SYSTEM
// ==========================================================

window.showScreen = function (screenName) {
    const overlay = document.getElementById('black-flash-overlay');
    if (overlay) {
        // Step 1: Fade to black
        overlay.classList.add('flash-active');

        setTimeout(() => {
            // Step 2: Swap the actual screen contents while black
            changeActualScreen(screenName);

            // Step 3: Fade back to transparent
            setTimeout(() => {
                overlay.classList.remove('flash-active');
            }, 50); // small delay to let DOM render
        }, 250); // wait for fade to black (250ms)
    } else {
        changeActualScreen(screenName);
    }
};

function changeActualScreen(screenName) {
    window.currentScreenName = screenName;
    const mainMenu = document.getElementById('main-menu-screen');
    const settingsScreen = document.getElementById('settings-screen');
    const onlineLobby = document.getElementById('online-lobby-screen');
    const leaderboardsScreen = document.getElementById('leaderboards-screen');
    const appContainer = document.querySelector('.app-container');

    if (mainMenu) mainMenu.classList.add('hidden');
    if (settingsScreen) settingsScreen.classList.add('hidden');
    if (onlineLobby) onlineLobby.classList.add('hidden');
    if (leaderboardsScreen) leaderboardsScreen.classList.add('hidden');
    if (appContainer) appContainer.classList.add('hidden');

    // Toggle expensive backdrop blurs while in-game for better FPS
    document.body.classList.toggle('playing-perf', screenName === 'game');

    if (screenName === 'main-menu') {
        // Stop gameplay but keep current song as menu BGM
        if (typeof endGameplayKeepMusic === 'function') {
            endGameplayKeepMusic();
        }
        if (window.onlineMode && (window.onlineMode.active || window.onlineMode.roomId || window.onlineMode.peer)) {
            if (typeof window.leaveRoom === 'function') {
                window.leaveRoom();
            }
        }
        if (mainMenu) mainMenu.classList.remove('hidden');
        refreshProfileUI();
        syncThemesTabSelection();
    } else if (screenName === 'settings') {
        if (settingsScreen) settingsScreen.classList.remove('hidden');
        initSettingsTabValues();
    } else if (screenName === 'leaderboards') {
        if (leaderboardsScreen) leaderboardsScreen.classList.remove('hidden');
        refreshLeaderboardUI();
    } else if (screenName === 'online-lobby') {
        if (onlineLobby) onlineLobby.classList.remove('hidden');
        if (typeof window.refreshRoomsLobby === 'function') {
            window.refreshRoomsLobby();
        }
    } else if (screenName === 'game') {
        if (appContainer) appContainer.classList.remove('hidden');
        // Touch controls stay hidden until a real touch input is detected
        const touchContainer = document.getElementById('mobile-touch-container');
        if (touchContainer) touchContainer.classList.add('hidden');
        // trigger resize after a brief delay to let layout reflow and calculate dimensions correctly
        setTimeout(() => {
            if (typeof window.resizeCanvas === 'function') {
                window.resizeCanvas();
            }
        }, 50);
    }

    if (screenName !== 'game') {
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.classList.remove('online-active');
        const touchContainer = document.getElementById('mobile-touch-container');
        if (touchContainer) touchContainer.classList.add('hidden');
    }
}

window.openCustomMaps = function () {
    const customOverlay = document.getElementById('custom-overlay-panel');
    if (customOverlay) {
        customOverlay.classList.remove('hidden');
    }
};

// --- Profile Customization Storage & Logic ---
function loadProfile() {
    let name = localStorage.getItem('neonbeat-username');
    if (!name) {
        name = 'Jugador' + Math.floor(100 + Math.random() * 900);
        localStorage.setItem('neonbeat-username', name);
    }

    let avatar = localStorage.getItem('neonbeat-avatar') || '🎮';
    let avatarType = localStorage.getItem('neonbeat-avatar-type') || 'emoji';

    return { name, avatar, avatarType };
}

// --- Rankings & Tiers System ---
function getTierName(points) {
    if (points >= 50000) return 'LUNARIUM';
    if (points >= 25000) return 'SOLARIUM';
    if (points >= 10000) return 'Emerald';
    if (points >= 8000) return 'Diamond';
    if (points >= 7000) return 'Steel';
    if (points >= 4000) return 'Bronze';
    return 'Dirt';
}

function calculatePoints(rank, totalNotes) {
    if (totalNotes < 1500) {
        const basePoints = {
            'SS': 100,
            'S++': 200,
            'S+': 100,
            'S': 50,
            'A': 10,
            'B': -10,
            'C': -20
        };
        return basePoints[rank] || 0;
    } else {
        // >= 1500 notes
        const basePoints = {
            'SS': 1500,
            'S++': 700,
            'S+': 300,
            'S': 150,
            'A': 50,
            'B': 5,
            'C': -15
        };
        // Canción con 3000 notas: El doble de puntos que las de 1500 notas (linear scaling)
        const multiplier = totalNotes / 1500;
        return Math.round((basePoints[rank] || 0) * multiplier);
    }
}

// ===== REMOTE DATABASE SYNC SYSTEM (Node.js API Integration) =====
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

async function fetchRemoteAccounts() {
    try {
        const response = await fetch(`${API_BASE}/api/leaderboard`, { cache: 'no-store' });
        if (!response.ok) throw new Error('leaderboard HTTP ' + response.status);
        const players = await response.json();
        
        const accounts = {};
        players.forEach(p => {
            accounts[p.username] = {
                points: p.points,
                avatar: p.avatar,
                avatarType: p.avatarType
            };
        });
        
        localStorage.setItem('neonbeat-accounts', JSON.stringify(accounts));
        return accounts;
    } catch (e) {
        console.error('[NeonBeat DB] Error fetching remote accounts:', e);
        return JSON.parse(localStorage.getItem('neonbeat-accounts') || '{}') || {};
    }
}

async function registerRemoteUser(username, password) {
    const response = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
        const errData = await response.json();
        return { success: false, error: errData.error || 'Registration failed' };
    }
    return { success: true };
}

async function loginRemoteUser(username, password) {
    const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
        const errData = await response.json();
        return { success: false, error: errData.error || 'Login failed' };
    }
    const resData = await response.json();
    return { success: true, userData: resData.userData };
}

async function updateRemoteUser(username, pointsDelta, avatar, avatarType) {
    try {
        if (pointsDelta !== null && pointsDelta !== 0) {
            await fetch(`${API_BASE}/api/add-points`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, points: pointsDelta })
            });
        }
        if (avatar !== null || avatarType !== null) {
            await fetch(`${API_BASE}/api/update-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, avatar, avatarType })
            });
        }
        return true;
    } catch (e) {
        console.error('[NeonBeat DB] Error updating remote user:', e);
        return false;
    }
}

function addPlayerPoints(pts) {
    const currentUser = localStorage.getItem('neonbeat-current-user');
    let newPoints = 0;
    
    if (currentUser) {
        // 1. Sync remote points in background
        updateRemoteUser(currentUser, pts, null, null).then(() => {
            refreshProfileUI();
        }).catch(err => {
            console.error('Failed to sync remote points:', err);
        });

        // 2. Instant local update
        const localAccounts = JSON.parse(localStorage.getItem('neonbeat-accounts') || '{}') || {};
        if (localAccounts[currentUser]) {
            localAccounts[currentUser].points = (localAccounts[currentUser].points || 0) + pts;
            newPoints = localAccounts[currentUser].points;
            localStorage.setItem('neonbeat-accounts', JSON.stringify(localAccounts));
        }
    } else {
        // Guest mode
        let guestPts = parseInt(localStorage.getItem('neonbeat-guest-points')) || 0;
        guestPts += pts;
        newPoints = guestPts;
        localStorage.setItem('neonbeat-guest-points', guestPts);
    }
    
    refreshProfileUI();
    return { earned: pts, total: newPoints };
}

function updateModalAccountView() {
    const currentUser = localStorage.getItem('neonbeat-current-user');
    const loggedInView = document.getElementById('account-logged-in-view');
    const loggedOutView = document.getElementById('account-logged-out-view');
    
    if (!loggedInView || !loggedOutView) return;

    if (currentUser) {
        loggedInView.classList.remove('hidden');
        loggedOutView.classList.add('hidden');

        const loggedUsername = document.getElementById('logged-username');
        const loggedUserTier = document.getElementById('logged-user-tier');
        const loggedUserPoints = document.getElementById('logged-user-points');

        const accounts = JSON.parse(localStorage.getItem('neonbeat-accounts') || '{}') || {};
        const userAcc = accounts[currentUser] || { points: 0 };
        
        if (loggedUsername) loggedUsername.innerText = currentUser;
        if (loggedUserTier) loggedUserTier.innerText = getTierName(userAcc.points);
        if (loggedUserPoints) loggedUserPoints.innerText = userAcc.points || 0;
    } else {
        loggedInView.classList.add('hidden');
        loggedOutView.classList.remove('hidden');
    }
}

function getTierColor(points) {
    if (points >= 50000) return '#c084fc'; // LUNARIUM - Purple/light violet
    if (points >= 25000) return '#f59e0b'; // SOLARIUM - Amber/Orange
    if (points >= 10000) return '#10b981'; // Emerald - Emerald Green
    if (points >= 8000) return '#38bdf8'; // Diamond - Light Blue
    if (points >= 7000) return '#94a3b8'; // Steel - Slate/Grey
    if (points >= 4000) return '#b45309'; // Bronze - Brown/Bronze
    return '#6b7280'; // Dirt - Grey
}

function refreshLeaderboardUI() {
    const modalList = document.getElementById('leaderboard-list');
    const pageList = document.getElementById('leaderboard-page-list');
    const mainMenuList = document.getElementById('main-menu-leaderboard-list');
    if (!modalList && !pageList && !mainMenuList) return;

    // Render instantly using cached local storage
    const cachedAccounts = JSON.parse(localStorage.getItem('neonbeat-accounts') || '{}') || {};
    renderPlayersList(cachedAccounts, modalList, pageList, mainMenuList);

    // Fetch remote accounts and update UI asynchronously
    fetchRemoteAccounts().then(freshAccounts => {
        renderPlayersList(freshAccounts, modalList, pageList, mainMenuList);
    }).catch(err => {
        console.error('[NeonBeat DB] Async leaderboard update failed:', err);
    });
}

function renderPlayersList(accounts, modalList, pageList, mainMenuList) {
    const players = Object.entries(accounts).map(([username, data]) => ({
        username,
        points: data.points || 0,
        avatar: data.avatar || '🎮',
        avatarType: data.avatarType || 'emoji'
    }));

    // Sort descending by points
    players.sort((a, b) => b.points - a.points);

    // 1. Render in profile edit modal (smaller card style)
    if (modalList) {
        modalList.innerHTML = '';
        if (players.length === 0) {
            modalList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 15px 0;">No hay cuentas registradas.</div>`;
        } else {
            players.forEach((player, index) => {
                let rankSymbol = `#${index + 1}`;
                let rankColor = 'var(--text-muted)';
                if (index === 0) { rankSymbol = '🥇'; rankColor = '#fbbf24'; }
                else if (index === 1) { rankSymbol = '🥈'; rankColor = '#cbd5e1'; }
                else if (index === 2) { rankSymbol = '🥉'; rankColor = '#b45309'; }

                const avatarHTML = player.avatarType === 'image'
                    ? `<img src="${player.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                    : player.avatar;

                const tierName = getTierName(player.points);
                const tierColor = getTierColor(player.points);

                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.02); transition: transform 0.2s;';
                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-weight: 800; font-size: 0.95rem; min-width: 22px; text-align: center; color: ${rankColor};">${rankSymbol}</span>
                        <span style="font-size: 1.1rem; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 50%; overflow: hidden;">${avatarHTML}</span>
                        <span style="font-weight: bold; font-size: 0.9rem; color: #fff;">${player.username}</span>
                    </div>
                    <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
                        <span style="font-size: 0.8rem; font-weight: 800; color: ${tierColor}; text-transform: uppercase; letter-spacing: 0.5px;">${tierName}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${player.points} pts</span>
                    </div>
                `;
                modalList.appendChild(row);
            });
        }
    }

    // 2. Render in main dedicated page (matching the layout mockup diagram exactly)
    if (pageList) {
        pageList.innerHTML = '';
        if (players.length === 0) {
            pageList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 1.1rem; padding: 50px 20px; line-height: 1.6;">No hay cuentas registradas.<br><span style="font-size: 0.9rem; opacity: 0.8;">Crea una cuenta en el menú de perfil para aparecer en la clasificación.</span></div>`;
        } else {
            players.forEach((player, index) => {
                let rankSymbol = `#${index + 1}`;
                let rankColor = '#cbd5e1';
                if (index === 0) { rankSymbol = '🥇'; rankColor = '#fbbf24'; }
                else if (index === 1) { rankSymbol = '🥈'; rankColor = '#cbd5e1'; }
                else if (index === 2) { rankSymbol = '🥉'; rankColor = '#b45309'; }

                const avatarHTML = player.avatarType === 'image'
                    ? `<img src="${player.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                    : `<span style="font-size: 1.6rem; line-height: 1;">${player.avatar}</span>`;

                const tierName = getTierName(player.points);
                const tierColor = getTierColor(player.points);

                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: rgba(0, 0, 0, 0.25); border: 1.5px solid rgba(255, 255, 255, 0.05); padding: 12px 18px; border-radius: 12px; transition: transform 0.2s;';
                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <!-- PFP (far left) -->
                        <div style="width: 50px; height: 50px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                            ${avatarHTML}
                        </div>
                        <!-- Player Name & RANGO (vertical list) -->
                        <div style="display: flex; flex-direction: column; text-align: left; gap: 2px;">
                            <span style="font-size: 1.25rem; font-weight: 700; color: #fff; line-height: 1.2;">${player.username}</span>
                            <span style="font-size: 0.85rem; font-weight: 800; color: ${tierColor}; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8;">${tierName}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 25px;">
                        <!-- points (left of position) -->
                        <span style="font-size: 1.15rem; font-weight: 700; color: var(--primary);">${player.points} pts</span>
                        <!-- position (far right) -->
                        <span style="font-weight: 900; font-size: 1.4rem; min-width: 32px; text-align: right; color: ${rankColor};">${rankSymbol}</span>
                    </div>
                `;
                pageList.appendChild(row);
            });
        }
    }

    // 3. Render in main menu right column (under user profile card)
    if (mainMenuList) {
        mainMenuList.innerHTML = '';
        if (players.length === 0) {
            mainMenuList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 15px 0;">No hay cuentas registradas.</div>`;
        } else {
            players.forEach((player, index) => {
                let rankSymbol = `#${index + 1}`;
                let rankColor = 'var(--text-muted)';
                if (index === 0) { rankSymbol = '🥇'; rankColor = '#fbbf24'; }
                else if (index === 1) { rankSymbol = '🥈'; rankColor = '#cbd5e1'; }
                else if (index === 2) { rankSymbol = '🥉'; rankColor = '#b45309'; }

                const avatarHTML = player.avatarType === 'image'
                    ? `<img src="${player.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                    : player.avatar;

                const tierName = getTierName(player.points);
                const tierColor = getTierColor(player.points);

                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.03); padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.02); transition: transform 0.2s;';
                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.1rem; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 50%; overflow: hidden;">${avatarHTML}</span>
                        <div style="display: flex; flex-direction: column; text-align: left;">
                            <span style="font-weight: bold; font-size: 0.85rem; color: #fff; line-height: 1.1;">${player.username}</span>
                            <span style="font-size: 0.7rem; font-weight: 800; color: ${tierColor}; text-transform: uppercase; letter-spacing: 0.5px;">${tierName}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary);">${player.points} pts</span>
                        <span style="font-weight: 800; font-size: 1rem; min-width: 18px; text-align: center; color: ${rankColor};">${rankSymbol}</span>
                    </div>
                `;
                mainMenuList.appendChild(row);
            });
        }
    }
}

function saveProfile(name, avatar, avatarType) {
    const currentUser = localStorage.getItem('neonbeat-current-user');
    if (currentUser) {
        // Save to account
        const accounts = JSON.parse(localStorage.getItem('neonbeat-accounts') || '{}');
        if (accounts[currentUser]) {
            accounts[currentUser].avatar = avatar;
            accounts[currentUser].avatarType = avatarType;
            localStorage.setItem('neonbeat-accounts', JSON.stringify(accounts));
        }
        // Async background remote avatar update
        updateRemoteUser(currentUser, null, avatar, avatarType).then(() => {
            refreshProfileUI();
        });
    } else {
        // Save to guest profile
        localStorage.setItem('neonbeat-username', name);
        localStorage.setItem('neonbeat-avatar', avatar);
        localStorage.setItem('neonbeat-avatar-type', avatarType);
    }

    // Sync with multiplayer input username
    const mpUserEl = document.getElementById('online-username');
    if (mpUserEl) {
        mpUserEl.value = currentUser ? currentUser : name;
        mpUserEl.dispatchEvent(new Event('input'));
    }

    refreshProfileUI();
}

function refreshProfileUI() {
    const currentUser = localStorage.getItem('neonbeat-current-user');
    let name = '';
    let avatar = '🎮';
    let avatarType = 'emoji';
    let points = 0;
    let isGuest = true;

    if (currentUser) {
        const accounts = JSON.parse(localStorage.getItem('neonbeat-accounts') || '{}') || {};
        const userAcc = accounts[currentUser];
        if (userAcc) {
            name = currentUser; // Nickname is fixed to username
            avatar = userAcc.avatar || '🎮';
            avatarType = userAcc.avatarType || 'emoji';
            points = userAcc.points || 0;
            isGuest = false;
        } else {
            const guestProfile = loadProfile();
            name = guestProfile.name;
            avatar = guestProfile.avatar;
            avatarType = guestProfile.avatarType;
            points = parseInt(localStorage.getItem('neonbeat-guest-points')) || 0;
        }
    } else {
        const guestProfile = loadProfile();
        name = guestProfile.name;
        avatar = guestProfile.avatar;
        avatarType = guestProfile.avatarType;
        points = parseInt(localStorage.getItem('neonbeat-guest-points')) || 0;
    }

    const nameEl = document.getElementById('menu-profile-name');
    const picEl = document.getElementById('menu-profile-pic');
    const fallbackEl = document.getElementById('menu-profile-pic-fallback');
    const tierEl = document.getElementById('menu-profile-tier');
    const pointsEl = document.getElementById('menu-profile-points');
    const hintEl = document.querySelector('.profile-edit-hint');

    if (nameEl) {
        nameEl.innerHTML = name + (isGuest 
            ? ' <span style="font-size: 0.7rem; background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 5px; vertical-align: middle;">INVITADO</span>' 
            : ' <span style="font-size: 0.7rem; background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 5px; vertical-align: middle;">REGISTRADO</span>');
    }
    if (tierEl) tierEl.innerText = getTierName(points);
    if (pointsEl) pointsEl.innerText = 'Puntos: ' + points;
    if (hintEl) {
        hintEl.innerText = isGuest ? 'Click para registrarte y subir al Leaderboard' : 'Click para editar perfil';
    }

    if (avatarType === 'image') {
        if (picEl) {
            picEl.src = avatar;
            picEl.classList.remove('hidden');
        }
        if (fallbackEl) fallbackEl.classList.add('hidden');
    } else {
        if (picEl) picEl.classList.add('hidden');
        if (fallbackEl) {
            fallbackEl.innerText = avatar;
            fallbackEl.classList.remove('hidden');
        }
    }

    // Sync with multiplayer input username
    const mpUserEl = document.getElementById('online-username');
    if (mpUserEl) {
        mpUserEl.value = name;
        mpUserEl.dispatchEvent(new Event('input'));
    }

    // Update account view in modal if it is loaded
    updateModalAccountView();
    refreshLeaderboardUI();
}

// Edit Profile Modal Wiring
let tempSelectedAvatar = '🎮';
let tempSelectedAvatarType = 'emoji';

function initProfileModal() {
    const editCard = document.getElementById('menu-profile-card');
    const modal = document.getElementById('profile-edit-modal');
    const nameInput = document.getElementById('profile-edit-name-input');
    const fileInput = document.getElementById('avatar-file-input');
    const fileNameSpan = document.getElementById('avatar-file-name');
    const saveBtn = document.getElementById('btn-profile-save');
    const cancelBtn = document.getElementById('btn-profile-cancel');
    const presetBtns = document.querySelectorAll('.avatar-preset-btn');

    if (!editCard || !modal) return;

    editCard.onclick = () => {
        const currentUser = localStorage.getItem('neonbeat-current-user');
        const profile = loadProfile();
        let activeAvatar = profile.avatar;
        let activeAvatarType = profile.avatarType;

        if (currentUser) {
            nameInput.value = currentUser;
            nameInput.disabled = true; // Disable nickname edit when logged in
            
            const accounts = JSON.parse(localStorage.getItem('neonbeat-accounts') || '{}');
            const userAcc = accounts[currentUser] || {};
            activeAvatar = userAcc.avatar || '🎮';
            activeAvatarType = userAcc.avatarType || 'emoji';
        } else {
            nameInput.value = profile.name;
            nameInput.disabled = false;
            activeAvatar = profile.avatar;
            activeAvatarType = profile.avatarType;
        }

        tempSelectedAvatar = activeAvatar;
        tempSelectedAvatarType = activeAvatarType;

        // Reset file upload label
        if (fileNameSpan) fileNameSpan.innerText = activeAvatarType === 'image' ? 'Imagen cargada' : 'Ningún archivo seleccionado';
        if (fileInput) fileInput.value = '';

        // Highlight active preset
        presetBtns.forEach(btn => {
            if (activeAvatarType === 'emoji' && btn.dataset.emoji === activeAvatar) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        // Make sure login tab is shown by default if not logged in
        if (!currentUser && typeof window.switchAccountTab === 'function') {
            window.switchAccountTab('login');
        }

        updateModalAccountView();
        modal.classList.remove('hidden');
    };

    presetBtns.forEach(btn => {
        btn.onclick = () => {
            presetBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            tempSelectedAvatar = btn.dataset.emoji;
            tempSelectedAvatarType = 'emoji';
            if (fileNameSpan) fileNameSpan.innerText = 'Emoji seleccionado: ' + tempSelectedAvatar;
        };
    });

    if (fileInput) {
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (fileNameSpan) fileNameSpan.innerText = file.name;

            const reader = new FileReader();
            reader.onload = function (evt) {
                tempSelectedAvatar = evt.target.result; // base64 string
                tempSelectedAvatarType = 'image';
                presetBtns.forEach(b => b.classList.remove('selected'));
            };
            reader.readAsDataURL(file);
        };
    }

    if (saveBtn) {
        saveBtn.onclick = () => {
            const nameVal = nameInput.value.trim();
            if (!nameVal) return;
            saveProfile(nameVal, tempSelectedAvatar, tempSelectedAvatarType);
            modal.classList.add('hidden');
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
        };
    }
}

// --- Settings Wiring ---
function initSettingsTabValues() {
    // Sync sound sliders
    const musicOrig = document.getElementById('vol-music');
    const sfxOrig = document.getElementById('vol-sfx');

    const settingsMusic = document.getElementById('settings-vol-music');
    const settingsMusicVal = document.getElementById('settings-vol-music-val');
    const settingsSfx = document.getElementById('settings-vol-sfx');
    const settingsSfxVal = document.getElementById('settings-vol-sfx-val');

    if (musicOrig && settingsMusic) {
        settingsMusic.value = musicOrig.value;
        if (settingsMusicVal) settingsMusicVal.innerText = Math.round(musicOrig.value * 100) + '%';
    }
    if (sfxOrig && settingsSfx) {
        settingsSfx.value = sfxOrig.value;
        if (settingsSfxVal) settingsSfxVal.innerText = Math.round(sfxOrig.value * 100) + '%';
    }

    // Extras volume
    const extrasVol = localStorage.getItem('neonbeat-extras-vol') || '0.5';
    const settingsExtras = document.getElementById('settings-vol-extras');
    const settingsExtrasVal = document.getElementById('settings-vol-extras-val');
    if (settingsExtras) {
        settingsExtras.value = extrasVol;
        if (settingsExtrasVal) settingsExtrasVal.innerText = Math.round(extrasVol * 100) + '%';
    }

    // Privacy options
    const hideNames = localStorage.getItem('neonbeat-hide-names') === 'true';
    const hideAvatars = localStorage.getItem('neonbeat-hide-avatars') === 'true';

    const hideNamesCheckbox = document.getElementById('settings-hide-names');
    const hideAvatarsCheckbox = document.getElementById('settings-hide-avatars');

    if (hideNamesCheckbox) hideNamesCheckbox.checked = hideNames;
    if (hideAvatarsCheckbox) hideAvatarsCheckbox.checked = hideAvatars;

    syncThemesTabSelection();
}

function syncThemesTabSelection() {
    // Sync theme selection active borders
    const currentTheme = Array.from(document.body.classList).find(c => c.startsWith('theme-')) || 'default';
    const themeId = currentTheme === 'default' ? 'default' : currentTheme.replace('theme-', '');

    const cards = document.querySelectorAll('.settings-theme-card');
    cards.forEach(card => {
        if (card.dataset.theme === themeId) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
}

function initSettingsWiring() {
    // Sound sliders synchronization
    const settingsMusic = document.getElementById('settings-vol-music');
    const settingsSfx = document.getElementById('settings-vol-sfx');
    const settingsExtras = document.getElementById('settings-vol-extras');

    if (settingsMusic) {
        settingsMusic.oninput = (e) => {
            const val = e.target.value;
            const valSpan = document.getElementById('settings-vol-music-val');
            if (valSpan) valSpan.innerText = Math.round(val * 100) + '%';

            const orig = document.getElementById('vol-music');
            if (orig) {
                orig.value = val;
                orig.dispatchEvent(new Event('input'));
            }
        };
    }

    if (settingsSfx) {
        settingsSfx.oninput = (e) => {
            const val = e.target.value;
            const valSpan = document.getElementById('settings-vol-sfx-val');
            if (valSpan) valSpan.innerText = Math.round(val * 100) + '%';

            const orig = document.getElementById('vol-sfx');
            if (orig) {
                orig.value = val;
                orig.dispatchEvent(new Event('input'));
            }
        };
    }

    if (settingsExtras) {
        settingsExtras.oninput = (e) => {
            const val = e.target.value;
            const valSpan = document.getElementById('settings-vol-extras-val');
            if (valSpan) valSpan.innerText = Math.round(val * 100) + '%';
            localStorage.setItem('neonbeat-extras-vol', val);
        };
    }

    // Privacy checkboxes
    const hideNamesCheckbox = document.getElementById('settings-hide-names');
    const hideAvatarsCheckbox = document.getElementById('settings-hide-avatars');

    if (hideNamesCheckbox) {
        hideNamesCheckbox.onchange = (e) => {
            localStorage.setItem('neonbeat-hide-names', e.target.checked);
        };
    }

    if (hideAvatarsCheckbox) {
        hideAvatarsCheckbox.onchange = (e) => {
            localStorage.setItem('neonbeat-hide-avatars', e.target.checked);
        };
    }

    // Tabs switching
    const tabBtns = document.querySelectorAll('.settings-tab-btn');
    const tabContents = document.querySelectorAll('.settings-tab-content');

    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetTab = btn.dataset.tab;
            tabContents.forEach(content => {
                if (content.id === 'tab-' + targetTab) {
                    content.classList.remove('hidden');
                } else {
                    content.classList.add('hidden');
                }
            });
        };
    });

    // Theme card clicks inside settings -> simulates clicking the original sidebar theme-opts
    const themeCards = document.querySelectorAll('.settings-theme-card');
    themeCards.forEach(card => {
        card.onclick = () => {
            const theme = card.dataset.theme;
            themeCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            // Find in sidebar
            const sidebarBtn = document.querySelector(`.theme-opt[data-theme="${theme}"]`);
            if (sidebarBtn) {
                sidebarBtn.click();
            }
        };
    });

    // Fullscreen Toggle
    const btnFullscreen = document.getElementById('btn-toggle-fullscreen');
    if (btnFullscreen) {
        btnFullscreen.onclick = () => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                const docEl = document.documentElement;
                if (docEl.requestFullscreen) {
                    docEl.requestFullscreen();
                } else if (docEl.webkitRequestFullscreen) {
                    docEl.webkitRequestFullscreen();
                } else if (docEl.msRequestFullscreen) {
                    docEl.msRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        };

        const updateFullscreenButton = () => {
            const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (isFS) {
                btnFullscreen.innerHTML = '📺 Salir de Pantalla Completa';
                btnFullscreen.classList.remove('btn-success');
                btnFullscreen.classList.add('btn-primary');
            } else {
                btnFullscreen.innerHTML = '📺 Pantalla Completa';
                btnFullscreen.classList.remove('btn-primary');
                btnFullscreen.classList.add('btn-success');
            }
        };

        document.addEventListener('fullscreenchange', updateFullscreenButton);
        document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
    }
}

// Initialize local co-op mode state
window.localMode = {
    active: false,
    p1Keys: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    p2Keys: ['KeyE', 'KeyR', 'KeyU', 'KeyI'],
    p2HeldKeys: new Set(),
    p2Score: 0,
    p2Combo: 0,
    p2MaxCombo: 0,
    p2Health: 50,
    p1Died: false,
    p2Died: false,
    p2CountPerfect: 0,
    p2CountGreat: 0,
    p2CountOk: 0,
    p2CountMiss: 0,
    p2FeedbackText: '',
    p2FeedbackClass: '',
    p2FeedbackTimer: null
};

// Player 2 Hit Check Logic
function checkPlayer2Hit(columnClicked) {
    if (!window.isPlaying || window.isGameOver) return;
    if (window.localMode && window.localMode.active && window.localMode.p2Died) return;

    const currentTime = window.audioContext.currentTime - startTime - (window.audioOffset || 0);
    let hitWindow = 0.25;

    if (activeModes.easier) hitWindow = 0.35;
    if (activeModes.harder) hitWindow = 0.15;

    let closestNote = null;
    let closestDiff = Infinity;

    for (let i = 0; i < window.audioMap.length; i++) {
        let note = window.audioMap[i];
        if (note.isDoubleClone && !activeModes.double) continue;
        if (note.isUntouchable && !activeModes.untouchable) continue;

        if (note.active && !note.opponentScored && note.col === columnClicked) {
            let diff = Math.abs(note.time - currentTime);
            if (diff < closestDiff && (note.time - currentTime > -hitWindow)) {
                closestDiff = diff;
                closestNote = note;
            }
        }
    }

    if (closestNote && closestDiff <= hitWindow) {
        const isHold = (closestNote.type === 'hold' || (typeof closestNote.endTime === 'number' && Number.isFinite(closestNote.endTime)));

        if (isHold) {
            closestNote.opponentScored = true;
            closestNote.opponentHoldStarted = true;
            closestNote.opponentHoldJudged = false;
            closestNote.opponentHoldStartDiff = closestDiff;

            const timing = getTimingFeedback(closestDiff);
            applyPlayer2Judgement(closestDiff, closestNote.col, { showText: true });
            if (timing.tier === 'perfect' || timing.tier === 'great') {
                spawnParticles(window._oppStartX + closestNote.col * window._oppColWidth + window._oppColWidth / 2, hitZoneY, colorMap[closestNote.col], splashStyle);
            }
            return;
        }

        closestNote.opponentScored = true;
        if (closestNote.isUntouchable) {
            window.localMode.p2CountMiss++;
            window.localMode.p2Combo = 0;
            showP2Feedback('UNTOUCHABLE!', 'feedback-miss');
            updatePlayer2Health(-50);
        } else {
            applyPlayer2Judgement(closestDiff, closestNote.col);
        }
    } else {
        if (!activeModes.ghostTapping) {
            window.localMode.p2Combo = 0;
            showP2Feedback('MISS', 'feedback-miss');
            updatePlayer2Health(-5);
        }
    }
}

function applyPlayer2Judgement(diff, col, options = {}) {
    const showText = options.showText !== false;
    const spawnFx = options.spawnFx !== false;
    const applyHealth = options.applyHealth !== false;

    let pText = '';
    let pClass = '';

    if (diff <= 0.08) {
        window.localMode.p2Score += window.pointsPerNote;
        window.localMode.p2Combo++;
        window.localMode.p2CountPerfect++;
        pText = 'PERFECT'; pClass = 'feedback-perfect';
        if (spawnFx) {
            spawnParticles(window._oppStartX + col * window._oppColWidth + window._oppColWidth / 2, hitZoneY, colorMap[col], splashStyle);
        }
        if (applyHealth) updatePlayer2Health(2);
    } else if (diff <= 0.14) {
        window.localMode.p2Score += window.pointsPerNote * 0.8;
        window.localMode.p2Combo++;
        window.localMode.p2CountGreat++;
        pText = 'GREAT'; pClass = 'feedback-good';
        if (spawnFx) {
            if (splashStyle === 'stars' || splashStyle === 'sparks') spawnParticles(window._oppStartX + col * window._oppColWidth + window._oppColWidth / 2, hitZoneY, colorMap[col], splashStyle);
        }
        if (applyHealth) updatePlayer2Health(1);
    } else if (diff <= 0.20) {
        window.localMode.p2Score += window.pointsPerNote * 0.5;
        window.localMode.p2Combo++;
        window.localMode.p2CountOk++;
        pText = 'OK'; pClass = 'feedback-good';
        if (applyHealth) updatePlayer2Health(0.5);
    } else {
        window.localMode.p2Combo = 0;
        window.localMode.p2CountMiss++;
        pText = 'BAD'; pClass = 'feedback-miss';
        if (applyHealth) updatePlayer2Health(-5);
    }

    if (window.localMode.p2Combo > window.localMode.p2MaxCombo) {
        window.localMode.p2MaxCombo = window.localMode.p2Combo;
    }

    if (typeof updateLocalCoopHUD === 'function') updateLocalCoopHUD();
    if (showText) showP2Feedback(pText, pClass);
}

function updatePlayer2Health(val) {
    if (window.isGameOver) return;
    if (window.localMode && window.localMode.active && window.localMode.p2Died) return;

    if (activeModes && activeModes.nodeath && val < 0) val = 0;

    window.localMode.p2Health = Math.max(0, Math.min(100, window.localMode.p2Health + val));
    if (window.localMode.p2Health <= 0 && window.localMode && window.localMode.active) {
        window.localMode.p2Health = 0;
        window.localMode.p2Died = true;
        window.localMode.p2HeldKeys.clear();
        showP2Feedback('DEATH', 'feedback-death');
        if (window.localMode.p1Died) {
            if (!window.isGameOver) gameOver();
        }
    }
}

function showP2Feedback(text, className) {
    window.localMode.p2FeedbackText = text;
    window.localMode.p2FeedbackClass = className;
    if (window.localMode.p2FeedbackTimer) clearTimeout(window.localMode.p2FeedbackTimer);
    window.localMode.p2FeedbackTimer = setTimeout(() => {
        window.localMode.p2FeedbackText = '';
        window.localMode.p2FeedbackClass = '';
    }, 800);
}

function updateLocalCoopHUD() {
    const dualScoreP2 = document.getElementById('dual-score-p2');
    const dualComboP2 = document.getElementById('dual-combo-p2');
    const dualScoreP1 = document.getElementById('dual-score-p1');
    const dualComboP1 = document.getElementById('dual-combo-p1');

    if (dualScoreP2) dualScoreP2.innerText = Math.round(window.localMode.p2Score);
    if (dualComboP2) dualComboP2.innerText = window.localMode.p2Combo + 'x';
    if (dualScoreP1) dualScoreP1.innerText = Math.round(score);
    if (dualComboP1) dualComboP1.innerText = combo + 'x';

    const totalScore = score + window.localMode.p2Score;
    let p1Pct = 50, p2Pct = 50;
    if (totalScore > 0) {
        p1Pct = (score / totalScore) * 100;
        p2Pct = 100 - p1Pct;
    }
    const fillP1 = document.getElementById('versus-fill-p1');
    const fillP2 = document.getElementById('versus-fill-p2');
    if (fillP1) fillP1.style.width = p1Pct + '%';
    if (fillP2) fillP2.style.width = p2Pct + '%';
}

// Local Play Tab / Wiring
let activeLocalBind = null;

window.switchLobbyTab = function (tab) {
    const onlineBtn = document.getElementById('tab-lobby-online');
    const localBtn = document.getElementById('tab-lobby-local');
    const onlinePanel = document.getElementById('lobby-online-panel');
    const localPanel = document.getElementById('lobby-local-panel');
    const panelTitle = document.getElementById('lobby-panel-title');

    if (tab === 'online') {
        if (onlineBtn) onlineBtn.classList.add('active');
        if (localBtn) localBtn.classList.remove('active');
        if (onlinePanel) onlinePanel.classList.remove('hidden');
        if (localPanel) localPanel.classList.add('hidden');
        if (panelTitle) panelTitle.innerText = 'Online';
        window.localMode.active = false;
    } else {
        if (onlineBtn) onlineBtn.classList.remove('active');
        if (localBtn) localBtn.classList.add('active');
        if (onlinePanel) onlinePanel.classList.add('hidden');
        if (localPanel) localPanel.classList.remove('hidden');
        if (panelTitle) panelTitle.innerText = 'Local';
        updateLocalKeybindUI();
    }
};

function updateLocalKeybindUI() {
    const buttons = document.querySelectorAll('.btn-local-key');
    buttons.forEach(btn => {
        const player = btn.dataset.player;
        const col = parseInt(btn.dataset.col);
        const code = (player === '1') ? window.localMode.p1Keys[col] : window.localMode.p2Keys[col];
        let shortName = code.replace('Key', '').replace('Arrow', '');
        btn.innerText = shortName || code;
    });
}

function initLocalModeSystem() {
    const buttons = document.querySelectorAll('.btn-local-key');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            buttons.forEach(b => {
                b.classList.remove('waiting');
                const p = b.dataset.player;
                const c = parseInt(b.dataset.col);
                const code = (p === '1') ? window.localMode.p1Keys[c] : window.localMode.p2Keys[c];
                b.innerText = code.replace('Key', '').replace('Arrow', '');
            });

            const player = btn.dataset.player;
            const col = parseInt(btn.dataset.col);
            activeLocalBind = { player: player, col: col };
            btn.classList.add('waiting');
            btn.innerText = '???';
        });
    });

    window.addEventListener('keydown', e => {
        if (activeLocalBind) {
            e.preventDefault();
            e.stopPropagation();
            const player = activeLocalBind.player;
            const col = activeLocalBind.col;

            if (player === '1') {
                window.localMode.p1Keys[col] = e.code;
            } else {
                window.localMode.p2Keys[col] = e.code;
            }

            activeLocalBind = null;
            updateLocalKeybindUI();
            buttons.forEach(b => b.classList.remove('waiting'));
        }
    }, true);

    const startBtn = document.getElementById('btn-local-start');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            window.localMode.active = true;
            window.showScreen('game');

            const versusHud = document.getElementById('versus-hud');
            const dualHud = document.getElementById('dual-hud');
            if (versusHud) versusHud.classList.remove('hidden');
            if (dualHud) dualHud.classList.remove('hidden');

            const p1Label = document.getElementById('versus-name-p1');
            if (p1Label) p1Label.innerText = 'JUGADOR 1';
            const displayNameP1 = document.getElementById('display-name-p1');
            if (displayNameP1) displayNameP1.innerText = 'JUGADOR 1';

            const p2Label = document.getElementById('versus-name-p2');
            if (p2Label) p2Label.innerText = 'JUGADOR 2';
            const displayNameP2 = document.getElementById('display-name-p2');
            if (displayNameP2) displayNameP2.innerText = 'JUGADOR 2';

            const pauseBtn = document.getElementById('btn-pause');
            if (pauseBtn) {
                pauseBtn.disabled = false;
                pauseBtn.style.opacity = '1';
                pauseBtn.style.cursor = 'pointer';
                pauseBtn.innerText = '⏸ Pausa';
            }
        });
    }
}

// DomContentLoaded hook for new systems
function initNewMenuSystem() {
    refreshProfileUI();
    initProfileModal();
    initAccountSystem();
    initSettingsWiring();
    initSettingsTabValues();
    initLocalModeSystem();
    initTouchControls();
    initLayoutMode();

    // Make sure we show the main menu screen by default and hide app container initially
    window.showScreen('main-menu');
}

// ===== MOBILE TOUCH CONTROLS & TRANSPARENCY SYSTEM =====
let touchOpacityVal = parseInt(localStorage.getItem('neonbeat-touch-opacity')) || 30;

function updateTouchOpacity(val) {
    touchOpacityVal = Math.max(0, Math.min(100, parseInt(val) || 0));
    localStorage.setItem('neonbeat-touch-opacity', touchOpacityVal);
    document.documentElement.style.setProperty('--touch-opacity', (touchOpacityVal / 100).toFixed(2));

    const leftValEl = document.getElementById('touch-opacity-val');
    const settingsValEl = document.getElementById('settings-touch-opacity-val');
    const leftInput = document.getElementById('touch-opacity-range');
    const settingsInput = document.getElementById('settings-touch-opacity');

    if (leftValEl) leftValEl.innerText = touchOpacityVal + '%';
    if (settingsValEl) settingsValEl.innerText = touchOpacityVal + '%';
    if (leftInput && leftInput.value != touchOpacityVal) leftInput.value = touchOpacityVal;
    if (settingsInput && settingsInput.value != touchOpacityVal) settingsInput.value = touchOpacityVal;
}

function initTouchControls() {
    const leftInput = document.getElementById('touch-opacity-range');
    const settingsInput = document.getElementById('settings-touch-opacity');

    if (leftInput) {
        leftInput.value = touchOpacityVal;
        leftInput.addEventListener('input', (e) => updateTouchOpacity(e.target.value));
    }
    if (settingsInput) {
        settingsInput.value = touchOpacityVal;
        settingsInput.addEventListener('input', (e) => updateTouchOpacity(e.target.value));
    }
    updateTouchOpacity(touchOpacityVal);

    const touchContainer = document.getElementById('mobile-touch-container');
    if (!touchContainer) return;

    // Always start hidden — only appear after a real touch input
    touchContainer.classList.add('hidden');
    window._touchControlsVisible = false;

    const panels = touchContainer.querySelectorAll('.touch-panel');
    let activeTouchCols = new Set();

    function processTouches(e) {
        if (!window.isPlaying || window.isGameOver || window.isPaused) return;
        e.preventDefault();

        const rect = touchContainer.getBoundingClientRect();
        const currentActiveCols = new Set();

        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            const x = touch.clientX - rect.left;
            const pct = x / rect.width;
            let col = Math.floor(pct * 4);
            col = Math.max(0, Math.min(3, col));
            currentActiveCols.add(col);
        }

        // Newly pressed columns
        currentActiveCols.forEach(col => {
            if (!activeTouchCols.has(col)) {
                activeTouchCols.add(col);
                if (panels[col]) panels[col].classList.add('active');
                const key = window.userKeys[col] || ['KeyD', 'KeyF', 'KeyJ', 'KeyK'][col];
                if (window.localMode && window.localMode.active) {
                    if (!window.localMode.p1Died) {
                        heldKeys.add(key);
                        checkHit(col);
                    }
                } else {
                    heldKeys.add(key);
                    checkHit(col);
                }
            }
        });

        // Released columns
        activeTouchCols.forEach(col => {
            if (!currentActiveCols.has(col)) {
                activeTouchCols.delete(col);
                if (panels[col]) panels[col].classList.remove('active');
                const key = window.userKeys[col] || ['KeyD', 'KeyF', 'KeyJ', 'KeyK'][col];
                heldKeys.delete(key);
            }
        });
    }

    function showTouchControls() {
        if (window.currentScreenName !== 'game') return;
        touchContainer.classList.remove('hidden');
        window._touchControlsVisible = true;
    }

    function hideTouchControls() {
        touchContainer.classList.add('hidden');
        window._touchControlsVisible = false;
        activeTouchCols.clear();
        panels.forEach(p => p.classList.remove('active'));
    }

    window.showTouchControls = showTouchControls;
    window.hideTouchControls = hideTouchControls;

    touchContainer.addEventListener('touchstart', processTouches, { passive: false });
    touchContainer.addEventListener('touchmove', processTouches, { passive: false });
    touchContainer.addEventListener('touchend', processTouches, { passive: false });
    touchContainer.addEventListener('touchcancel', processTouches, { passive: false });

    // Reveal only after a real touch; hide again if keyboard/mouse is used
    let lastTouchAt = 0;

    window.addEventListener('keydown', () => {
        if (window._touchControlsVisible) hideTouchControls();
    });

    window.addEventListener('mousedown', () => {
        // Ignore synthesized mouse events that follow a touch on mobile
        if (Date.now() - lastTouchAt < 1000) return;
        if (window._touchControlsVisible) hideTouchControls();
    });

    window.addEventListener('touchstart', (e) => {
        lastTouchAt = Date.now();
        if (window.currentScreenName !== 'game') return;
        const wasHidden = !window._touchControlsVisible;
        showTouchControls();
        // First tap also counts as input once the panels are visible
        if (wasHidden && window.isPlaying && !window.isGameOver && !window.isPaused) {
            processTouches(e);
        }
    }, { passive: false });
}

function initLayoutMode() {
    const savedMode = localStorage.getItem('neonbeat-layout-mode');
    let activeMode = 'pc';

    if (savedMode) {
        activeMode = savedMode;
    } else {
        // Auto-detect based on userAgent or screen size
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
        activeMode = isMobileDevice ? 'mobile' : 'pc';
        localStorage.setItem('neonbeat-layout-mode', activeMode);
    }

    applyLayoutMode(activeMode);

    // Wire buttons in settings general tab
    const selector = document.getElementById('layout-mode-selector');
    if (selector) {
        const buttons = selector.querySelectorAll('.mode-btn');
        buttons.forEach(btn => {
            // Set initial active class
            btn.classList.toggle('active', btn.dataset.mode === activeMode);

            btn.onclick = () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const newMode = btn.dataset.mode;
                localStorage.setItem('neonbeat-layout-mode', newMode);
                applyLayoutMode(newMode);
            };
        });
    }
}

function applyLayoutMode(mode) {
    if (mode === 'mobile') {
        document.body.classList.add('mobile-version');
        document.body.classList.remove('pc-version');
        
        // Auto-show touch controls if playing
        if (window.isPlaying && typeof window.showTouchControls === 'function') {
            window.showTouchControls();
        }
    } else {
        document.body.classList.add('pc-version');
        document.body.classList.remove('mobile-version');
        
        // Hide touch controls if switching back to PC mode
        if (typeof window.hideTouchControls === 'function') {
            window.hideTouchControls();
        }
    }

    // Force resize of canvas
    setTimeout(() => {
        if (typeof window.resizeCanvas === 'function') {
            window.resizeCanvas();
        }
    }, 50);
}

function initAccountSystem() {
    const tabBtnLogin = document.getElementById('tab-btn-login');
    const tabBtnRegister = document.getElementById('tab-btn-register');
    const formLogin = document.getElementById('form-account-login');
    const formRegister = document.getElementById('form-account-register');

    const btnLogin = document.getElementById('btn-account-login');
    const btnRegister = document.getElementById('btn-account-register');
    const btnLogout = document.getElementById('btn-account-logout');

    const loginUser = document.getElementById('login-username-input');
    const loginPass = document.getElementById('login-password-input');
    const registerUser = document.getElementById('register-username-input');
    const registerPass = document.getElementById('register-password-input');

    const loginError = document.getElementById('login-error-msg');
    const registerError = document.getElementById('register-error-msg');

    if (!tabBtnLogin || !tabBtnRegister) return;

    window.switchAccountTab = function(tab) {
        if (tab === 'login') {
            tabBtnLogin.classList.add('active');
            tabBtnRegister.classList.remove('active');
            formLogin.classList.remove('hidden');
            formRegister.classList.add('hidden');
            if (loginError) loginError.classList.add('hidden');
        } else {
            tabBtnLogin.classList.remove('active');
            tabBtnRegister.classList.add('active');
            formLogin.classList.add('hidden');
            formRegister.classList.remove('hidden');
            if (registerError) registerError.classList.add('hidden');
        }
    };

    tabBtnLogin.onclick = () => window.switchAccountTab('login');
    tabBtnRegister.onclick = () => window.switchAccountTab('register');

    if (btnLogin) {
        btnLogin.onclick = async () => {
            const username = loginUser.value.trim();
            const password = loginPass.value;

            if (!username || !password) return;

            btnLogin.disabled = true;
            const origText = btnLogin.innerText;
            btnLogin.innerText = 'Verificando...';

            try {
                const res = await loginRemoteUser(username, password);

                if (res.success) {
                    localStorage.setItem('neonbeat-current-user', username);
                    loginUser.value = '';
                    loginPass.value = '';
                    if (loginError) loginError.classList.add('hidden');
                    refreshProfileUI();
                } else {
                    if (loginError) {
                        loginError.innerText = res.error || 'Usuario o contraseña incorrectos';
                        loginError.classList.remove('hidden');
                    }
                }
            } catch (err) {
                console.error('Login failed:', err);
                if (loginError) {
                    loginError.innerText = 'Error de conexión';
                    loginError.classList.remove('hidden');
                }
            } finally {
                btnLogin.disabled = false;
                btnLogin.innerText = origText;
            }
        };
    }

    if (btnRegister) {
        btnRegister.onclick = async () => {
            const username = registerUser.value.trim();
            const password = registerPass.value;

            if (!username || !password) return;

            btnRegister.disabled = true;
            const origText = btnRegister.innerText;
            btnRegister.innerText = 'Registrando...';

            try {
                const res = await registerRemoteUser(username, password);
                
                if (!res.success) {
                    if (registerError) {
                        registerError.innerText = res.error || 'Error al registrar';
                        registerError.classList.remove('hidden');
                    }
                } else {
                    localStorage.setItem('neonbeat-current-user', username);
                    registerUser.value = '';
                    registerPass.value = '';
                    if (registerError) registerError.classList.add('hidden');
                    refreshProfileUI();
                }
            } catch (err) {
                console.error('Registration failed:', err);
                if (registerError) {
                    registerError.innerText = 'Error de conexión';
                    registerError.classList.remove('hidden');
                }
            } finally {
                btnRegister.disabled = false;
                btnRegister.innerText = origText;
            }
        };
    }

    if (btnLogout) {
        btnLogout.onclick = () => {
            localStorage.removeItem('neonbeat-current-user');
            refreshProfileUI();
        };
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewMenuSystem);
} else {
    initNewMenuSystem();
}


