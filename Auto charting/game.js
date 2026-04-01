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
const healthBar = document.getElementById('health-bar'); // NEW: Health Bar

// State globals
let noteShape = 'circle';
let splashStyle = 'rings';
let noteSize = 25;

window.isPlaying = false;
window.isPaused = false;
window.isGameOver = false;
let startTime = 0;
let audioSourceNode = null;
let score = 0;
let combo = 0;
let health = 50;

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
    colWidth = canvas.width / columns;
    hitZoneY = canvas.height - 120; 
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
            
            // Hold Notes Logic Updates
            if (note.type === 'long') {
                 if (note.isHolding) {
                     let endTime = note.time + note.duration;
                     if (currentTime >= endTime - 0.1) {
                          // Terminó bien
                          note.active = false;
                          note.isHolding = false;
                          updateHealth(1); // peque curación continua
                          score += 20;
                          scoreDisplay.innerText = score;
                     } else {
                          // Chispas continuas al aguantar
                          if (Math.random() < 0.15) {
                               spawnParticles(note.col * colWidth + colWidth/2, hitZoneY, colorMap[note.col], 'sparks');
                          }
                     }
                 } else if (timeUntilHit < -0.15 && !note.scored) {
                    // Miss por dejar ir la cabeza de la nota
                    note.active = false;
                    note.scored = true;
                    combo = 0;
                    comboDisplay.innerText = combo;
                    showFeedback('MISS', 'feedback-miss');
                    updateHealth(-10);
                    continue;
                 }
            } else {
                // Single Notes Logic Update
                // Miss por omitir
                if (timeUntilHit < -0.15 && !note.scored) {
                    note.active = false;
                    note.scored = true;
                    combo = 0;
                    comboDisplay.innerText = combo;
                    showFeedback('MISS', 'feedback-miss');
                    updateHealth(-10);
                    continue;
                }
            }

            // Draw Note body
            if (timeUntilHit <= currentFallSec && note.time + note.duration - currentTime > -0.15) {
                let progress = 1 - (timeUntilHit / currentFallSec);
                let targetY = progress * hitZoneY;
                let x = note.col * colWidth + colWidth/2;
                
                if (note.type === 'long') {
                    // Posicion de la cola
                    const tailTimeUntilHit = (note.time + note.duration) - currentTime;
                    const tailProgress = 1 - (tailTimeUntilHit / currentFallSec);
                    let tailY = tailProgress * hitZoneY;
                    
                    if (targetY > hitZoneY && note.isHolding) {
                        targetY = hitZoneY; // Fija cabeza al receptor
                    }
                    if (tailY < 0) tailY = 0;
                    
                    // Fix visual: dibujamos un cuerpo sólido para la cola en rectangulo,
                    // que no sufrirá distorsión "round" cuando el tamaño vertical cambie drásticamente.
                    let barWidth = noteSize * 1.5;
                    ctx.fillStyle = colorMap[note.col];
                    ctx.globalAlpha = 0.4;
                    ctx.fillRect(x - barWidth/2, tailY, barWidth, targetY - tailY);
                    ctx.globalAlpha = 1;
                }
                
                // Cabeza (si no se la comió ya)
                if (!note.isHolding || targetY <= hitZoneY) {
                    drawNoteShape(ctx, x, targetY, noteSize, colorMap[note.col], noteShape, note.col);
                }
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
            
            if (timeUntilHit <= currentFallSec && note.time + note.duration - simulatedCurrentTime > -0.15) {
                let progress = 1 - (timeUntilHit / currentFallSec);
                let targetY = progress * hitZoneY;
                let x = note.col * colWidth + colWidth/2;
                
                if (note.type === 'long') {
                    const tailTimeUntilHit = (note.time + note.duration) - simulatedCurrentTime;
                    const tailProgress = 1 - (tailTimeUntilHit / currentFallSec);
                    let tailY = tailProgress * hitZoneY;
                    if (tailY < 0) tailY = 0;
                    
                    let barWidth = noteSize * 1.5;
                    ctx.fillStyle = colorMap[note.col];
                    ctx.globalAlpha = 0.4;
                    ctx.fillRect(x - barWidth/2, tailY, barWidth, targetY - tailY);
                    ctx.globalAlpha = 1;
                }
                
                if (targetY <= hitZoneY) {
                    drawNoteShape(ctx, x, targetY, noteSize, colorMap[note.col], noteShape, note.col);
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
        window.audioMap.forEach(n => { n.active = true; n.scored = false; n.isHolding = false; });
    }
    
    const leadInTime = (fallDuration / window.fallSpeed) / 1000;
    
    audioSourceNode = window.audioContext.createBufferSource();
    audioSourceNode.buffer = window.audioBuffer;
    audioSourceNode.connect(window.audioContext.destination);
    
    audioSourceNode.start(window.audioContext.currentTime + leadInTime);
    startTime = window.audioContext.currentTime + leadInTime;
    window.isPlaying = true;
    
    resizeCanvas();
    requestAnimationFrame(drawGame);

    audioSourceNode.onended = () => {
        if (window.isGameOver) return; // if ended by game over
        window.isPlaying = false;
        document.getElementById('status-text').innerText = '¡Canción Terminada! Sube otra.';
        btnPlayGame.innerText = 'Rejugar';
        btnPlayGame.classList.remove('hidden');
        btnPauseGame.classList.add('hidden');
        
        // Mostrar la zona de subida de nuevo para permitir meter más canciones
        if (typeof window.resetUploaderUI === 'function') {
            window.resetUploaderUI(true); // Instantáneo para mejor feedback
        }
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
        if (col !== -1) checkRelease(col); // Check for long notes release
    }
});

function checkRelease(col) {
    if (!window.isPlaying || window.isGameOver || window.isPaused) return;

    const currentTime = window.audioContext.currentTime - startTime;
    for (let i = 0; i < window.audioMap.length; i++) {
        let note = window.audioMap[i];
        if (note.active && note.type === 'long' && note.isHolding && note.col === col) {
            let endTime = note.time + note.duration;
            if (endTime - currentTime > 0.15) { 
               // Soltó pronto
               note.active = false;
               note.isHolding = false;
               combo = 0;
               comboDisplay.innerText = combo;
               showFeedback('MISS', 'feedback-miss');
               updateHealth(-10);
            } else {
               // Soltó certero
               note.active = false;
               note.isHolding = false;
            }
        }
    }
}

function checkHit(columnClicked) {
    if (!window.isPlaying || window.isGameOver) return;
    
    const currentTime = window.audioContext.currentTime - startTime;
    const hitWindow = 0.15; 

    let closestNote = null;
    let closestDiff = Infinity;

    for (let i = 0; i < window.audioMap.length; i++) {
        let note = window.audioMap[i];
        // Nota viva en esa columna, que no haya marcado y no se esté manteniendo activamente
        if (note.active && !note.scored && !note.isHolding && note.col === columnClicked) {
            let diff = Math.abs(note.time - currentTime);
            if (diff < closestDiff && (note.time - currentTime > -0.15)) {
                closestDiff = diff;
                closestNote = note;
            }
        }
    }

    if (closestNote && closestDiff <= hitWindow) {
        if (closestNote.type === 'long') {
             closestNote.isHolding = true;
        } else {
             closestNote.active = false;
        }
        closestNote.scored = true; 
        
        let pText = '';
        let pClass = '';
        
        if (closestDiff <= 0.04) { 
            score += 100;
            combo++;
            pText = 'PERFECT'; pClass = 'feedback-perfect';
            spawnParticles(closestNote.col * colWidth + colWidth/2, hitZoneY, colorMap[closestNote.col], splashStyle);
            updateHealth(2);
        } else if (closestDiff <= 0.08) { 
            score += 50;
            combo++;
            pText = 'GREAT'; pClass = 'feedback-good';
            if (splashStyle === 'stars' || splashStyle === 'sparks') spawnParticles(closestNote.col * colWidth + colWidth/2, hitZoneY, colorMap[closestNote.col], splashStyle);
            updateHealth(1);
        } else if (closestDiff <= 0.12) { 
            score += 20;
            combo++;
            pText = 'OK'; pClass = 'feedback-good';
            updateHealth(0.5);
        } else { 
            score += 10;
            combo = 0;
            pText = 'BAD'; pClass = 'feedback-miss';
            updateHealth(-5);
        }
        
        scoreDisplay.innerText = score;
        comboDisplay.innerText = combo;
        showFeedback(pText, pClass);
        
    } else {
        // GHOST TAPPING
        combo = 0;
        comboDisplay.innerText = combo;
        showFeedback('MISS', 'feedback-miss');
        updateHealth(-10);
    }
}

let feedbackTimeout;
function showFeedback(text, cssClass) {
    hitFeedback.innerText = text;
    hitFeedback.className = 'feedback-text show ' + cssClass;
    
    clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => {
        hitFeedback.className = 'feedback-text';
    }, 500);
}
