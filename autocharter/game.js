const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const btnPlayGame = document.getElementById('btn-play');
const btnPauseGame = document.getElementById('btn-pause');
const scoreDisplay = document.getElementById('score-display');
const comboDisplay = document.getElementById('combo-display');
const hitFeedback = document.getElementById('hit-feedback');

// UI Settings Elements
const shapeSelect = document.getElementById('shape-select');
const splashSelect = document.getElementById('splash-select');
const sizeRange = document.getElementById('size-range');
const sizeVal = document.getElementById('size-val');
const previewCanvas = document.getElementById('preview-canvas');
const pCtx = previewCanvas.getContext('2d');
const visualizerCanvas = document.getElementById('visualizer-canvas');
const vCtx = visualizerCanvas.getContext('2d');
const healthBar = document.getElementById('health-bar'); 

// Visualizer State
let analyser = null;
let dataArray = null;
let bufferLength = 0;

// State globals
let noteShape = 'circle';
let splashStyle = 'rings';
let noteSize = 25;
let scrollDirection = 'down';
let showVisualizer = true; // NEW: Toggle visualizer

window.isPlaying = false;
window.isPaused = false;
window.isGameOver = false;
let isAutoPlay = false;
let startTime = 0;
let audioSourceNode = null;
let score = 0;
let combo = 0;
let health = 50;

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
let particles = [];

// Settings Events
shapeSelect.addEventListener('change', e => { noteShape = e.target.value; });
splashSelect.addEventListener('change', e => { splashStyle = e.target.value; });
sizeRange.addEventListener('input', e => { 
    noteSize = parseInt(e.target.value); 
    sizeVal.innerText = noteSize + 'px'; 
});

const visualizerToggle = document.getElementById('visualizer-toggle');
if (visualizerToggle) {
    visualizerToggle.addEventListener('change', e => {
        showVisualizer = e.target.checked;
        if (!showVisualizer) {
            vCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        }
    });
}

const autoPlayToggle = document.getElementById('autoplay-toggle');
if (autoPlayToggle) {
    autoPlayToggle.addEventListener('change', e => {
        isAutoPlay = e.target.checked;
    });
}

const scrollSelector = document.getElementById('scroll-selector');
if (scrollSelector) {
    const scrollBtns = scrollSelector.querySelectorAll('.mode-btn');
    scrollBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            scrollBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            scrollDirection = btn.dataset.dir;
            resizeCanvas();
            if (typeof window.drawReadyState === 'function') window.drawReadyState();
        });
    });
}

// LIBRARY TOGGLE (Robust Implementation)
function initLibraryToggle() {
    const libraryBtn = document.getElementById('btn-library');
    const libraryBox = document.getElementById('library-content');

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
window.renderLibrary = function() {
    const libraryCount = document.getElementById('library-count');
    const libraryList = document.getElementById('library-content');
    
    if (libraryCount && window.savedSongs) {
        libraryCount.innerText = `(${window.savedSongs.length})`;
    }
    
    if (libraryList && (!window.savedSongs || window.savedSongs.length === 0)) {
        libraryList.innerHTML = '<div class="library-empty">Aún no has generado canciones</div>';
    }
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLibraryToggle);
} else {
    initLibraryToggle();
}

// Live Preview Animation Loop
function drawPreviewTick() {
    pCtx.clearRect(0,0, previewCanvas.width, previewCanvas.height);
    
    pCtx.strokeStyle = 'rgba(255,255,255,0.3)';
    pCtx.lineWidth = 4;
    pCtx.beginPath();
    drawNotePath(pCtx, 100, 40, noteSize + 5, noteShape, 1);
    pCtx.closePath();
    pCtx.stroke();
    
    const time = Date.now() / 300;
    const pulseY = 40 + Math.sin(time) * 10;
    
    drawNoteShape(pCtx, 100, pulseY, noteSize, colorMap[1], noteShape, 1);
    
    requestAnimationFrame(drawPreviewTick);
}
requestAnimationFrame(drawPreviewTick);

// Resizing
function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    visualizerCanvas.width = window.innerWidth;
    visualizerCanvas.height = window.innerHeight;
    
    colWidth = canvas.width / columns;
    hitZoneY = (scrollDirection === 'down') ? (canvas.height - 120) : 120; 
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

function updateHealth(amount) {
    if (window.isGameOver) return;
    health = Math.min(100, Math.max(0, health + amount));
    healthBar.style.width = health + '%';
    
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
        triggerGameOver();
    }
}

function triggerGameOver() {
    window.isGameOver = true;
    window.isPlaying = false;
    if(window.audioContext && window.audioContext.state === 'running'){
        try { window.audioContext.suspend(); } catch(e) {}
    }
    document.getElementById('status-text').innerText = '🔥 ¡HAS PERDIDO! (Sin vida)';
    btnPlayGame.innerText = 'Reintentar';
    btnPlayGame.classList.remove('hidden');
    btnPauseGame.classList.add('hidden');
    showFeedback('GAME OVER', 'feedback-miss');
}

function drawNotePath(tCtx, cx, cy, radius, shape, colIndex = 0) {
    if (shape === 'circle') {
        tCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    } else if (shape === 'diamond') {
        tCtx.moveTo(cx, cy - radius);
        tCtx.lineTo(cx + radius, cy);
        tCtx.lineTo(cx, cy + radius);
        tCtx.lineTo(cx - radius, cy);
    } else if (shape === 'bar') {
        tCtx.rect(cx - radius * 1.2, cy - radius*0.4, radius * 2.4, radius*0.8);
    } else if (shape === 'arrow') {
        let angle = 0;
        if(colIndex === 0) angle = -Math.PI/2;
        if(colIndex === 1) angle = Math.PI;
        if(colIndex === 3) angle = Math.PI/2;
        
        tCtx.translate(cx, cy);
        tCtx.rotate(angle);
        
        tCtx.moveTo(0, -radius);
        tCtx.lineTo(radius, radius*0.3);
        tCtx.lineTo(radius*0.4, radius*0.3);
        tCtx.lineTo(radius*0.4, radius);
        tCtx.lineTo(-radius*0.4, radius);
        tCtx.lineTo(-radius*0.4, radius*0.3);
        tCtx.lineTo(-radius, radius*0.3);
        
        tCtx.rotate(-angle);
        tCtx.translate(-cx, -cy);
    }
}

// Draw util
function drawNoteShape(tCtx, cx, cy, radius, color, shape, colIndex = 0) {
    tCtx.fillStyle = color;
    tCtx.shadowBlur = 15;
    tCtx.shadowColor = color;
    tCtx.lineWidth = 2;
    tCtx.strokeStyle = '#fff';
    
    tCtx.beginPath();
    drawNotePath(tCtx, cx, cy, radius, shape, colIndex);
    tCtx.closePath();
    tCtx.fill();
    tCtx.shadowBlur = 0;
    tCtx.stroke();
}

function spawnParticles(x, y, color, style) {
    if (style === 'rings') {
        particles.push({ type: 'ring', x, y, radius: 10, maxRadius: 70, alpha: 1, color });
    } else if (style === 'sparks') {
        for(let i=0; i<12; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = 2 + Math.random() * 6;
            particles.push({ type: 'spark', x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, life: 1, color });
        }
    } else if (style === 'stars') {
        for(let i=0; i<6; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = 1 + Math.random() * 3;
            particles.push({ type: 'star', x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, life: 1, rot: Math.random()*Math.PI, color });
        }
    }
}

function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        
        if (p.type === 'ring') {
            p.radius += 4;
            p.alpha -= 0.05;
            if(p.alpha <= 0) { particles.splice(i, 1); continue; }
            
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
            ctx.stroke();
            ctx.globalAlpha = 1;

        } else if (p.type === 'spark') {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.04;
            if(p.life <= 0) { particles.splice(i, 1); continue; }
            
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1, p.life * 5), 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1;
            
        } else if (p.type === 'star') {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += 0.1;
            p.life -= 0.02;
            if(p.life <= 0) { particles.splice(i, 1); continue; }
            
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            
            ctx.beginPath();
            for(let j=0; j<5; j++) {
                ctx.lineTo(Math.cos((18+j*72)/180*Math.PI)*12, -Math.sin((18+j*72)/180*Math.PI)*12);
                ctx.lineTo(Math.cos((54+j*72)/180*Math.PI)*5, -Math.sin((54+j*72)/180*Math.PI)*5);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.shadowBlur = 0;
    }
}

// Game Loop
function drawGame(timestamp) {
    if (!window.isPlaying || window.isPaused || window.isGameOver) return; 
    
    // Advance time
    const currentTime = window.audioContext.currentTime - startTime;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw columns
    for (let i = 0; i < columns; i++) {
        let x = i * colWidth;
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        
        const isHeld = (heldKeys.has(keysList[i]) || heldKeys.has(keysList[i+4]));
        
        ctx.strokeStyle = isHeld ? colorMap[i] : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        drawNotePath(ctx, x + colWidth / 2, hitZoneY, noteSize + 5, noteShape, i);
        ctx.closePath();
        ctx.stroke();

        if (isHeld) {
            ctx.fillStyle = colorMap[i] + '55'; 
            ctx.fill();
            ctx.shadowBlur = 20;
            ctx.shadowColor = colorMap[i];
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }
    
    const currentFallDuration = fallDuration / window.fallSpeed;
    const currentFallSec = currentFallDuration / 1000;

    // Draw lines and checks
    if(window.audioMap) {
        for (let i = 0; i < window.audioMap.length; i++) {
            let note = window.audioMap[i];
            if (!note.active) continue;
            
            const timeUntilHit = note.time - currentTime;

            // --- LÓGICA DE AUTO-PLAY (BOT MODE) ---
            if (isAutoPlay && !note.scored) {
                // El bot pulsa en el momento exacto (tolerancia de 20ms para parecer fluido)
                if (Math.abs(timeUntilHit) < 0.02) {
                    handleHit(note);
                }
            }

            // --- CORRECCIÓN: DETECCIÓN DE FALLO (MISS) SI LA NOTA PASA EL RANGO ---
            if (!note.scored && timeUntilHit < -0.2) {
                note.scored = true;
                countMiss++;
                combo = 0;
                comboDisplay.innerText = "0";
                showFeedback('MISS', 'feedback-miss');
                updateHealth(-8); // Bajar vida por omitir
            }

            // Desactivar nota solo cuando esté bien fuera de pantalla
            if (timeUntilHit < -0.5) {
                note.active = false;
                continue;
            }

            // Dibujar cuerpo de la nota si está cerca de la pantalla
            if (timeUntilHit <= currentFallSec && timeUntilHit > -0.5) {
                let progress = 1 - (timeUntilHit / currentFallSec);
                let x = note.col * colWidth + colWidth/2;
                let targetY;
                
                if (scrollDirection === 'down') {
                    targetY = progress * hitZoneY;
                } else {
                    targetY = canvas.height - (progress * (canvas.height - hitZoneY));
                }
                
                drawNoteShape(ctx, x, targetY, noteSize, colorMap[note.col], noteShape, note.col);
            }
        }
    }
    
    updateAndDrawParticles();
    requestAnimationFrame(drawGame);
}

// Render estático del marco 0
window.drawReadyState = function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw columns
    for (let i = 0; i < columns; i++) {
        let x = i * colWidth;
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        drawNotePath(ctx, x + colWidth / 2, hitZoneY, noteSize + 5, noteShape, i);
        ctx.closePath();
        ctx.stroke();
    }
    
    // Render the notes corresponding to their initial spawn position before the song starts
    const currentFallSec = (fallDuration / window.fallSpeed) / 1000;
    
    // Suponer que el map se carga en tiempo negativo de anticipación
    let simulatedCurrentTime = -currentFallSec; 
    
    if(window.audioMap) {
        for (let i = 0; i < window.audioMap.length; i++) {
            let note = window.audioMap[i];
            const timeUntilHit = note.time - simulatedCurrentTime;
            
            if (timeUntilHit <= currentFallSec) {
                let progress = 1 - (timeUntilHit / currentFallSec);
                let x = note.col * colWidth + colWidth/2;
                let targetY;

                if (scrollDirection === 'down') {
                    targetY = progress * hitZoneY;
                    if (targetY <= canvas.height + noteSize) {
                        drawNoteShape(ctx, x, targetY, noteSize, colorMap[note.col], noteShape, note.col);
                    }
                } else {
                    targetY = canvas.height - (progress * (canvas.height - hitZoneY));
                    if (targetY >= -noteSize) {
                        drawNoteShape(ctx, x, targetY, noteSize, colorMap[note.col], noteShape, note.col);
                    }
                }
            }
        }
    }
};

function stopPreviousAudio() {
    if (audioSourceNode) {
        audioSourceNode.onended = null; // Importante: evitar que el evento 'onended' dispare lógica de fin de juego al detenerlo manualmente
        try {
            audioSourceNode.stop();
            audioSourceNode.disconnect();
        } catch(e) {
            // Ya estaba detenido o no iniciado
        }
        audioSourceNode = null;
    }
    
    // Resetear estado de pausa
    window.isPaused = false;
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.classList.remove('paused');
    btnPauseGame.innerText = '⏸ Pausa / Reanudar (P)';
    
    // Asegurar que la zona de subida sea visible si queremos cambiar de canción
    if (typeof window.resetUploaderUI === 'function') {
        window.resetUploaderUI(true);
    }
}

// Iniciar Partida
btnPlayGame.addEventListener('click', () => {
    btnPlayGame.classList.add('hidden');
    btnPauseGame.classList.remove('hidden');
    document.getElementById('status-text').innerText = '¡Juego en curso!';
    
    stopPreviousAudio();
    
    // Resume context initially to avoid warning
    if(window.audioContext.state === 'suspended') window.audioContext.resume();
    
    score = 0;
    combo = 0;
    health = 50; 
    window.isPaused = false;
    window.isGameOver = false;
    particles = [];
    scoreDisplay.innerText = score;
    comboDisplay.innerText = combo;
    updateHealth(0); // init ui
    
    // Hard-reset visual
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (window.audioMap) {
        window.audioMap.forEach(n => { n.active = true; n.scored = false; });
    }
    
    const leadInTime = (fallDuration / window.fallSpeed) / 1000;
    
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
    analyser.connect(window.audioContext.destination);
    
    audioSourceNode.start(window.audioContext.currentTime + leadInTime);
    startTime = window.audioContext.currentTime + leadInTime;
    window.isPlaying = true;
    window.isGameOver = false;
    
    // Reset Counters
    score = 0; combo = 0; health = 50;
    countPerfect = 0; countGreat = 0; countOk = 0; countMiss = 0; maxCombo = 0;
    scoreDisplay.innerText = "0";
    comboDisplay.innerText = "0";
    updateHealth(0);
    document.getElementById('results-screen').classList.add('hidden');
    
    resizeCanvas();
    requestAnimationFrame(drawGame);
    requestAnimationFrame(drawVisualizer);

    audioSourceNode.onended = () => {
        if (window.isGameOver) return; 
        window.isPlaying = false;
        
        // Mostrar Pantalla de Resultados
        setTimeout(() => showResults(), 1000);
    };
});

function togglePause() {
    if (!window.isPlaying || window.isGameOver) return;
    
    const gameContainer = document.getElementById('game-container');
    
    if (window.isPaused) {
        window.audioContext.resume();
        btnPauseGame.innerText = '⏸ Pausa / Reanudar (P)';
        window.isPaused = false;
        gameContainer.classList.remove('paused');
        requestAnimationFrame(drawGame);
        requestAnimationFrame(drawVisualizer);
        document.getElementById('status-text').innerText = '¡Juego en curso!';
    } else {
        window.audioContext.suspend();
        btnPauseGame.innerText = '▶ Reanudar (P)';
        window.isPaused = true;
        gameContainer.classList.add('paused');
        document.getElementById('status-text').innerText = 'JUEGO PAUSADO';
    }
}
btnPauseGame.addEventListener('click', togglePause);

// Manejo de Inputs (Hit Detection y GHOST TAPPING)
window.addEventListener('keydown', e => {
    if (e.repeat) return; 
    
    if (!window.isPlaying && !btnPlayGame.classList.contains('hidden') && e.code === 'Space') {
        e.preventDefault();
        btnPlayGame.click();
        return;
    }
    
    if (window.isPlaying && !window.isGameOver && (e.code === 'Escape' || e.code === 'KeyP' || e.key.toLowerCase() === 'p')) {
        togglePause();
        return;
    }
    
    if (window.isPaused || !window.isPlaying || window.isGameOver) return; 
    
    const keyIndex = keysList.indexOf(e.code) !== -1 ? e.code : e.key.toUpperCase();
    let col = -1;
    
    if (keyIndex === 'D' || keyIndex === 'ArrowLeft') col = 0;
    if (keyIndex === 'F' || keyIndex === 'ArrowDown') col = 1;
    if (keyIndex === 'J' || keyIndex === 'ArrowUp') col = 2;
    if (keyIndex === 'K' || keyIndex === 'ArrowRight') col = 3;
    
    if (col !== -1 && !heldKeys.has(keyIndex)) {
        heldKeys.add(keyIndex);
        checkHit(col);
    }
});

window.addEventListener('keyup', e => {
    const keyIndex = keysList.indexOf(e.code) !== -1 ? e.code : e.key.toUpperCase();
    
    let col = -1;
    if (keyIndex === 'D' || keyIndex === 'ArrowLeft') col = 0;
    if (keyIndex === 'F' || keyIndex === 'ArrowDown') col = 1;
    if (keyIndex === 'J' || keyIndex === 'ArrowUp') col = 2;
    if (keyIndex === 'K' || keyIndex === 'ArrowRight') col = 3;

    if (heldKeys.has(keyIndex)) {
        heldKeys.delete(keyIndex);
    }
});


function checkHit(columnClicked) {
    if (!window.isPlaying || window.isGameOver) return;
    
    const currentTime = window.audioContext.currentTime - startTime;
    const hitWindow = 0.15; 

    let closestNote = null;
    let closestDiff = Infinity;

    for (let i = 0; i < window.audioMap.length; i++) {
        let note = window.audioMap[i];
        // Nota viva en esa columna, que no haya marcado
        if (note.active && !note.scored && note.col === columnClicked) {
            let diff = Math.abs(note.time - currentTime);
            if (diff < closestDiff && (note.time - currentTime > -0.15)) {
                closestDiff = diff;
                closestNote = note;
            }
        }
    }

    if (closestNote && closestDiff <= hitWindow) {
        closestNote.active = false;
        closestNote.scored = true; 
        
        let pText = '';
        let pClass = '';
        
        if (closestDiff <= 0.04) { 
            score += 100;
            combo++;
            countPerfect++;
            pText = 'PERFECT'; pClass = 'feedback-perfect';
            spawnParticles(closestNote.col * colWidth + colWidth/2, hitZoneY, colorMap[closestNote.col], splashStyle);
            updateHealth(2);
        } else if (closestDiff <= 0.08) { 
            score += 50;
            combo++;
            countGreat++;
            pText = 'GREAT'; pClass = 'feedback-good';
            if (splashStyle === 'stars' || splashStyle === 'sparks') spawnParticles(closestNote.col * colWidth + colWidth/2, hitZoneY, colorMap[closestNote.col], splashStyle);
            updateHealth(1);
        } else if (closestDiff <= 0.12) { 
            score += 20;
            combo++;
            countOk++;
            pText = 'OK'; pClass = 'feedback-good';
            updateHealth(0.5);
        } else { 
            score += 10;
            countMiss++;
            combo = 0;
            pText = 'BAD'; pClass = 'feedback-miss';
            updateHealth(-5);
        }
        
        if (combo > maxCombo) maxCombo = combo;
        
        scoreDisplay.innerText = score;
        comboDisplay.innerText = combo;
        showFeedback(pText, pClass);
        
    } else {
        // GHOST TAPPING
        countMiss++;
        combo = 0;
        comboDisplay.innerText = combo;
        showFeedback('MISS', 'feedback-miss');
        updateHealth(-10);
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
    feedbackTimeout = setTimeout(() => {
        hitFeedback.classList.remove('show');
    }, 500);
}

// RESULTADOS FINALES Y RANGOS
function showResults() {
    const totalNotes = window.audioMap.length;
    
    // Cálculo de precisión (Acorde al plan)
    const accuracy = ((countPerfect * 1.0 + countGreat * 0.8 + countOk * 0.5) / totalNotes) * 100;
    
    let rank = 'D';
    let rankClass = 'rank-D';
    
    // Rango P (Full Perfect)
    if (countPerfect === totalNotes) {
        rank = 'P'; rankClass = 'rank-P';
    } else if (accuracy >= 95) {
        rank = 'S'; rankClass = 'rank-S';
    } else if (accuracy >= 85) {
        rank = 'A'; rankClass = 'rank-A';
    } else if (accuracy >= 70) {
        rank = 'B'; rankClass = 'rank-B';
    } else if (accuracy >= 50) {
        rank = 'C'; rankClass = 'rank-C';
    }
    
    // Poblar DOM
    document.getElementById('result-rank').innerText = rank;
    document.getElementById('result-rank').className = 'result-rank ' + rankClass;
    document.getElementById('res-perfect').innerText = countPerfect;
    document.getElementById('res-great').innerText = countGreat;
    document.getElementById('res-ok').innerText = countOk;
    document.getElementById('res-miss').innerText = countMiss;
    document.getElementById('res-max-combo').innerText = maxCombo;
    document.getElementById('res-score').innerText = score;
    
    document.getElementById('results-screen').classList.remove('hidden');
    
    // Al finalizar, permitir volver a jugar o subir otra
    btnPlayGame.innerText = 'Rejugar';
    btnPlayGame.classList.remove('hidden');
    btnPauseGame.classList.add('hidden');
}

// Botones de Resultados
document.getElementById('btn-results-retry').addEventListener('click', () => {
    document.getElementById('results-screen').classList.add('hidden');
    btnPlayGame.click(); // Dispara la lógica de inicio que ya resetea todo
});

document.getElementById('btn-results-close').addEventListener('click', () => {
    document.getElementById('results-screen').classList.add('hidden');
    // Mostrar la zona de subida de nuevo al cerrar resultados
    if (typeof window.resetUploaderUI === 'function') {
        window.resetUploaderUI(true);
    }
});


// BARRAS DE FONDO SIMÉTRICAS (TOTAL BACKGROUND VISUALIZER)
function drawVisualizer() {
    if (!showVisualizer || !window.isPlaying || window.isPaused || window.isGameOver) return;
    
    requestAnimationFrame(drawVisualizer);
    analyser.getByteFrequencyData(dataArray);
    
    vCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    
    // Dibujo Simétrico: Barras desde el centro hacia afuera
    const halfWidth = visualizerCanvas.width / 2;
    const barWidth = halfWidth / (bufferLength * 0.8); // Ajustar para cubrir mejor
    let barHeight;
    
    for (let i = 0; i < bufferLength; i++) {
        // --- SUPRESIÓN DE RUIDO MANUAL ---
        // Si el valor es muy bajo (ruido de fondo), lo forzamos a 0
        let val = dataArray[i];
        if (val < 15) val = 0; 
        else val = (val - 15) * 1.1; // Re-escalar para mantener la fuerza
        
        barHeight = (val / 255) * visualizerCanvas.height * 0.45;
        
        const gradient = vCtx.createLinearGradient(0, visualizerCanvas.height, 0, visualizerCanvas.height - barHeight);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.05)'); 
        gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.2)');
        gradient.addColorStop(1, 'rgba(236, 72, 153, 0.5)'); 
        vCtx.fillStyle = gradient;

        // Derecha
        vCtx.fillRect(halfWidth + (i * barWidth), visualizerCanvas.height - barHeight, barWidth - 1, barHeight);
        // Izquierda (Espejo)
        vCtx.fillRect(halfWidth - (i * barWidth) - barWidth, visualizerCanvas.height - barHeight, barWidth - 1, barHeight);
    }
}

function updateHealth(change) {
    if (window.isGameOver) return;
    
    health = Math.max(0, Math.min(100, health + change));
    if (healthBar) {
        healthBar.style.width = health + '%';
        // Feedback visual de la barra según salud
        if (health < 30) {
            healthBar.style.backgroundColor = '#f87171'; // Rojo
            healthBar.style.boxShadow = '0 0 15px #f87171';
        } else if (health < 60) {
            healthBar.style.backgroundColor = '#fbbf24'; // Naranja
            healthBar.style.boxShadow = '0 0 10px #fbbf24';
        } else {
            healthBar.style.backgroundColor = '#4ade80'; // Verde
            healthBar.style.boxShadow = '0 0 10px #4ade80';
        }
    }
    
    if (health <= 0 && !window.isGameOver) {
        gameOver();
    }
}

function gameOver() {
    window.isGameOver = true;
    window.isPlaying = false;
    stopPreviousAudio();
    
    showFeedback('GAME OVER', 'feedback-miss');
    document.getElementById('status-text').innerText = '¡HAS FALLADO!';
    
    // Mostrar resultados de fracaso
    setTimeout(() => {
        showResults();
    }, 1500);
}



