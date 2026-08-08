/**
 * NeonBeat Rhythm Engine - WebRTC Multiplayer Controller (v2 - Complete Overhaul)
 * SERVERLESS P2P MULTIPLAYER PROTOCOL (PeerJS broker signaling)
 * 
 * Fixes applied:
 * - All DOM IDs now match index.html exactly
 * - window.onlineMode initialized in game.js before this loads
 * - Uses window.getGameState() to access local score/combo/health
 * - Uses window.spawnParticles / window.resizeCanvas (exposed globals)
 * - Opponent hits no longer set note.active=false (which broke local board)
 * - Added Leave Room, Copy Code, game-over sync, back-pressure file transfer
 * - Added connection timeout and reconnection UX
 */

(function () {
    'use strict';

    // Guard: PeerJS must be loaded
    if (typeof Peer === 'undefined') {
        console.error('[NeonBeat MP] PeerJS not loaded! Add the script tag to index.html.');
        return;
    }

    // ===== DOM BINDINGS (matching index.html IDs exactly) =====
    const btnCreateRoom  = document.getElementById('btn-create-room');
    const btnJoinRoom    = document.getElementById('btn-join-room');
    const btnLeaveRoom   = document.getElementById('btn-leave-room');
    const btnCopyCode    = document.getElementById('btn-copy-code');
    const inputJoinCode  = document.getElementById('join-room-code');
    const inputUsername  = document.getElementById('online-username');
    const lobbyStatusText = document.getElementById('lobby-status-text');
    const roomForm       = document.getElementById('room-form');
    const roomInfo       = document.getElementById('room-info');
    const roomInfoLabel  = document.getElementById('room-info-label');
    const roomIdDisplay  = document.getElementById('room-id-display');
    const slotP1         = document.getElementById('slot-p1');
    const slotP2         = document.getElementById('slot-p2');
    const pulseDot       = document.getElementById('pulse-dot');
    const syncContainer  = document.getElementById('sync-progress-container');
    const syncBar        = document.getElementById('sync-progress-bar');
    const syncText       = document.getElementById('sync-progress-text');
    const versusHud      = document.getElementById('versus-hud');
    const dualHud        = document.getElementById('dual-hud');

    // Load saved username or generate a fun default
    if (inputUsername) {
        const savedName = localStorage.getItem('neonbeat-username');
        if (savedName) {
            inputUsername.value = savedName;
        } else {
            inputUsername.value = 'Jugador' + Math.floor(100 + Math.random() * 900);
            localStorage.setItem('neonbeat-username', inputUsername.value);
        }
        inputUsername.addEventListener('input', () => {
            localStorage.setItem('neonbeat-username', inputUsername.value.trim());
        });
    }

    // ===== LOBBY DATABASE INTEGRATION (KeyValue API) =====
    // KeyValue returns XML: <string xmlns="...">PAYLOAD</string>
    // Previous code JSON.parsed the raw XML → always failed → other players never saw rooms.
    const LOBBY_APP_KEY = 'if0zmh0e';
    const LOBBY_ROOMS_KEY = 'rooms';
    const ROOM_TTL_MS = 10 * 60 * 1000;
    let _lobbyHeartbeatTimer = null;
    let _lobbyRefreshTimer = null;

    function decodeHtmlEntities(str) {
        return String(str)
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }

    /** Extract usable payload from KeyValue GetValue responses (XML, quoted JSON, plain JSON). */
    function parseKeyValuePayload(raw) {
        if (raw == null) return null;
        let text = String(raw).trim();
        if (!text || text === 'null' || text === '"null"' || /^Error/i.test(text)) return null;

        const xmlMatch = text.match(/<string[^>]*>([\s\S]*?)<\/string>/i);
        if (xmlMatch) text = decodeHtmlEntities(xmlMatch[1].trim());

        if (!text || text === 'null') return null;

        // Double-encoded JSON string: "\"[...]\"" or "\"hello\""
        if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
            try {
                text = JSON.parse(text);
            } catch (e) {
                text = text.slice(1, -1);
            }
        }
        if (typeof text !== 'string') return text;
        text = text.trim();
        if (!text || text === 'null') return null;
        try {
            return JSON.parse(text);
        } catch (e) {
            return text;
        }
    }

    function normalizeRoomsList(data) {
        if (!data) return [];
        if (Array.isArray(data)) {
            return data
                .filter(r => r && (r.code || r.c))
                .map(expandRoom);
        }
        if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                return Array.isArray(parsed)
                    ? parsed.filter(r => r && (r.code || r.c)).map(expandRoom)
                    : [];
            } catch (e) { return []; }
        }
        return [];
    }

    async function fetchRemoteRooms() {
        const response = await fetch(
            `https://keyvalue.immanuel.co/api/KeyVal/GetValue/${LOBBY_APP_KEY}/${LOBBY_ROOMS_KEY}`,
            { cache: 'no-store' }
        );
        if (!response.ok) throw new Error('GetValue HTTP ' + response.status);
        const text = await response.text();
        return deserializeRoomsFromKv(parseKeyValuePayload(text));
    }

    /**
     * KeyValue puts the value in the URL path. ASP.NET rejects paths containing
     * ':' AFTER url-decoding — so JSON always fails to save ("dangerous Request.Path").
     * Wire format (colon-free): CODE-HOST-TIMESTAMP_CODE-HOST-TIMESTAMP
     */
    function serializeRoomsForKv(rooms) {
        return rooms.map(r => {
            const code = String(r.code || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 12);
            const host = String(r.host || 'Jugador')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]/g, '')
                .slice(0, 20) || 'Jugador';
            const t = Number(r.created) || Date.now();
            return `${code}-${host}-${t}`;
        }).filter(p => /^[A-Za-z0-9]+-[A-Za-z0-9]+-\d+$/.test(p)).join('_');
    }

    function deserializeRoomsFromKv(raw) {
        if (raw == null) return [];
        if (Array.isArray(raw)) return normalizeRoomsList(raw);
        if (typeof raw === 'object') return normalizeRoomsList([raw]);

        let text = String(raw).trim();
        if (!text || text === 'null' || text === 'EMPTY' || text === '[]') return [];

        // Legacy JSON payloads from older clients
        if (text.startsWith('[') || text.startsWith('{')) {
            try { return normalizeRoomsList(JSON.parse(text)); } catch (e) { /* fall through */ }
        }

        return text.split('_').map(part => {
            const m = String(part).match(/^([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d+)$/);
            if (!m) return null;
            return { code: m[1], host: m[2], created: Number(m[3]) };
        }).filter(Boolean);
    }

    async function pushRemoteRooms(rooms) {
        let list = rooms.map(expandRoom).filter(r => r.code);
        let payload = serializeRoomsForKv(list);
        // Empty path segment can 404 — use a sentinel the reader understands
        if (!payload) payload = 'EMPTY';
        while (payload.length > 1000 && list.length > 1) {
            list = list.slice(0, -1);
            payload = serializeRoomsForKv(list) || 'EMPTY';
        }
        const encoded = encodeURIComponent(payload);
        const response = await fetch(
            `https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${LOBBY_APP_KEY}/${LOBBY_ROOMS_KEY}/${encoded}`,
            { method: 'POST' }
        );
        if (!response.ok) throw new Error('UpdateValue HTTP ' + response.status);
        return list;
    }

    function expandRoom(r) {
        // Support both compact {c,h,t} and legacy {code,host,created}
        return {
            code: String(r.code || r.c || ''),
            host: String(r.host || r.h || 'Jugador'),
            created: Number(r.created || r.t || 0)
        };
    }

    function mergeRooms(...lists) {
        const now = Date.now();
        const map = new Map();
        lists.flat().forEach(raw => {
            const r = expandRoom(raw);
            if (!r.code) return;
            if (now - r.created >= ROOM_TTL_MS) return;
            const prev = map.get(r.code);
            if (!prev || r.created >= prev.created) map.set(r.code, r);
        });
        return Array.from(map.values()).sort((a, b) => b.created - a.created);
    }

    async function registerRoomInLobby(code, hostName) {
        try {
            const now = Date.now();
            const mine = { code: String(code), host: hostName || 'Anfitrión', created: now };
            let local = mergeRooms(getLocalPublicRooms(), [mine]);
            saveLocalPublicRooms(local);

            // Read-modify-write with one retry to reduce lost updates from concurrent hosts
            for (let attempt = 0; attempt < 2; attempt++) {
                let remote = [];
                try { remote = await fetchRemoteRooms(); } catch (e) { console.warn('[Lobby] fetch before register failed:', e); }
                const merged = mergeRooms(remote, [mine]);
                try {
                    await pushRemoteRooms(merged);
                    console.log(`[Lobby] Registered room ${code} for host ${hostName}`);
                    startLobbyHeartbeat(code, hostName);
                    return;
                } catch (e) {
                    console.warn('[Lobby] push attempt failed:', e);
                    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
                }
            }
            console.warn('[Lobby] Room saved locally only — remote lobby update failed');
            startLobbyHeartbeat(code, hostName);
        } catch (e) {
            console.error("[Lobby] Error registering room:", e);
        }
    }

    async function removeRoomFromLobby(code) {
        if (!code) return;
        stopLobbyHeartbeat();
        try {
            const now = Date.now();
            let rooms = getLocalPublicRooms().filter(r => r.code !== code && (now - r.created < ROOM_TTL_MS));
            saveLocalPublicRooms(rooms);

            let remote = [];
            try { remote = await fetchRemoteRooms(); } catch (e) {}
            const merged = mergeRooms(remote).filter(r => r.code !== code);
            try {
                await pushRemoteRooms(merged);
                console.log(`[Lobby] Removed room ${code} from lobby list`);
            } catch (e) {
                console.warn('[Lobby] Could not remove room remotely:', e);
            }
        } catch (e) {
            console.error("[Lobby] Error removing room:", e);
        }
    }

    function startLobbyHeartbeat(code, hostName) {
        stopLobbyHeartbeat();
        _lobbyHeartbeatTimer = setInterval(() => {
            if (!window.onlineMode || window.onlineMode.role !== 'host' || !window.onlineMode.roomId) {
                stopLobbyHeartbeat();
                return;
            }
            // Refresh created timestamp so the room stays visible
            registerRoomInLobby(code, hostName);
        }, 60 * 1000);
    }

    function stopLobbyHeartbeat() {
        if (_lobbyHeartbeatTimer) {
            clearInterval(_lobbyHeartbeatTimer);
            _lobbyHeartbeatTimer = null;
        }
    }

    function getLocalPublicRooms() {
        try {
            const data = localStorage.getItem('neonbeat-local-public-rooms');
            return data ? normalizeRoomsList(JSON.parse(data)).map(expandRoom) : [];
        } catch (e) { return []; }
    }

    function saveLocalPublicRooms(rooms) {
        try {
            localStorage.setItem('neonbeat-local-public-rooms', JSON.stringify(rooms));
        } catch (e) {}
    }

    function renderRoomsList(rooms) {
        const listEl = document.getElementById('lobby-rooms-list');
        if (!listEl) return;

        if (!rooms.length) {
            listEl.innerHTML = '<div class="lobby-room-empty">No hay salas activas en este momento. ¡Crea una para jugar!</div>';
            return;
        }

        listEl.innerHTML = '';
        rooms.forEach(room => {
            const btn = document.createElement('button');
            btn.className = 'lobby-room-btn';

            const hideNames = localStorage.getItem('neonbeat-hide-names') === 'true';
            const displayName = hideNames ? 'Jugador' : room.host;

            btn.innerHTML = `<span>Sala de ${displayName}</span> <span class="room-code">${room.code}</span>`;
            btn.onclick = () => {
                initGuestPeer(room.code);
            };
            listEl.appendChild(btn);
        });
    }

    window.refreshRoomsLobby = async function() {
        const listEl = document.getElementById('lobby-rooms-list');
        if (!listEl) return;

        listEl.innerHTML = '<div class="lobby-room-loading">Buscando salas activas...</div>';

        const now = Date.now();
        let rooms = mergeRooms(getLocalPublicRooms());

        try {
            const remote = await fetchRemoteRooms();
            rooms = mergeRooms(rooms, remote);
            // Persist a soft cache so refresh still shows something if the next fetch fails
            saveLocalPublicRooms(rooms.filter(r => now - r.created < ROOM_TTL_MS));
        } catch (e) {
            console.warn("[Lobby] Could not fetch remote rooms, showing local fallback rooms:", e);
        }

        rooms = rooms.filter(r => now - r.created < ROOM_TTL_MS);
        renderRoomsList(rooms);
    };

    function startLobbyAutoRefresh() {
        stopLobbyAutoRefresh();
        _lobbyRefreshTimer = setInterval(() => {
            if (window.currentScreenName === 'online-lobby' && typeof window.refreshRoomsLobby === 'function') {
                window.refreshRoomsLobby();
            } else {
                stopLobbyAutoRefresh();
            }
        }, 8000);
    }

    function stopLobbyAutoRefresh() {
        if (_lobbyRefreshTimer) {
            clearInterval(_lobbyRefreshTimer);
            _lobbyRefreshTimer = null;
        }
    }

    // Hook screen changes for lobby auto-refresh
    const _origShowScreen = window.showScreen;
    if (typeof _origShowScreen === 'function') {
        window.showScreen = function (screenName) {
            const result = _origShowScreen.apply(this, arguments);
            if (screenName === 'online-lobby') startLobbyAutoRefresh();
            else stopLobbyAutoRefresh();
            return result;
        };
    } else {
        // showScreen may be defined later — poll once DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof window.showScreen === 'function' && !window.showScreen._lobbyWrapped) {
                const orig = window.showScreen;
                window.showScreen = function (screenName) {
                    const result = orig.apply(this, arguments);
                    if (screenName === 'online-lobby') startLobbyAutoRefresh();
                    else stopLobbyAutoRefresh();
                    return result;
                };
                window.showScreen._lobbyWrapped = true;
            }
        });
    }

    function renderLobbyAvatar(avatarEl, avatar, type) {
        if (!avatarEl) return;
        const hideAvatarsSetting = localStorage.getItem('neonbeat-hide-avatars') === 'true';
        if (hideAvatarsSetting) {
            avatarEl.innerHTML = '🎮';
            return;
        }
        if (type === 'image') {
            avatarEl.innerHTML = `<img src="${avatar}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; vertical-align: middle;">`;
        } else {
            avatarEl.innerHTML = avatar || '🎮';
        }
    }

    // Wire Lobby screen elements
    document.addEventListener('DOMContentLoaded', () => {
        const btnLobbyCreate = document.getElementById('btn-lobby-create');
        if (btnLobbyCreate) {
            btnLobbyCreate.onclick = () => {
                initHostPeer();
            };
        }

        const btnLobbyJoin = document.getElementById('btn-lobby-join');
        const lobbyJoinInput = document.getElementById('lobby-join-code-input');
        if (btnLobbyJoin && lobbyJoinInput) {
            btnLobbyJoin.onclick = () => {
                const code = lobbyJoinInput.value.trim();
                if (!code || code.length !== 5 || isNaN(code)) {
                    alert('Por favor ingresa un código de 5 dígitos.');
                    return;
                }
                initGuestPeer(code);
            };
        }
    });

    let incomingChunks = [];
    let incomingMeta = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    // ===== STATUS HELPERS =====
    function setStatus(html) {
        if (lobbyStatusText) lobbyStatusText.innerHTML = html;
    }

    function setStatusOK(text) {
        setStatus(`<span style="color:#10b981;font-weight:800;">✓ ${text}</span>`);
        if (pulseDot) pulseDot.style.backgroundColor = '#10b981';
    }

    function setStatusError(text) {
        setStatus(`<span style="color:#ef4444;font-weight:700;">✗ ${text}</span>`);
        if (pulseDot) pulseDot.style.backgroundColor = '#ef4444';
    }

    function setStatusWaiting(text) {
        setStatus(`<span style="color:#f59e0b;font-weight:600;">⏳ ${text}</span>`);
        if (pulseDot) pulseDot.style.backgroundColor = '#f59e0b';
    }

    function showRoomInfo(code) {
        if (roomForm) roomForm.classList.add('hidden');
        if (roomInfo) roomInfo.classList.remove('hidden');
        if (roomIdDisplay) roomIdDisplay.innerText = code;
        if (btnLeaveRoom) btnLeaveRoom.classList.remove('hidden');
    }

    function hideRoomInfo() {
        if (roomForm) roomForm.classList.remove('hidden');
        if (roomInfo) roomInfo.classList.add('hidden');
        if (btnLeaveRoom) btnLeaveRoom.classList.add('hidden');
    }

    function updateSyncProgress(pct) {
        if (syncBar) syncBar.style.width = pct + '%';
        if (syncText) syncText.innerText = Math.round(pct) + '%';
    }

    // ===== BUTTON HANDLERS =====
    if (btnCreateRoom) {
        btnCreateRoom.addEventListener('click', () => {
            retryCount = 0;
            initHostPeer();
        });
    }

    if (btnJoinRoom) {
        btnJoinRoom.addEventListener('click', () => {
            const code = inputJoinCode ? inputJoinCode.value.trim() : '';
            if (!code || code.length !== 5 || isNaN(code)) {
                setStatusError('Ingresa un código de 5 dígitos válido');
                return;
            }
            initGuestPeer(code);
        });
    }

    if (btnLeaveRoom) {
        btnLeaveRoom.addEventListener('click', () => {
            leaveRoom();
        });
    }

    if (btnCopyCode) {
        btnCopyCode.addEventListener('click', () => {
            const code = roomIdDisplay ? roomIdDisplay.innerText : '';
            if (code && code !== '-----') {
                navigator.clipboard.writeText(code).then(() => {
                    btnCopyCode.innerText = '✓';
                    setTimeout(() => { btnCopyCode.innerText = '📋'; }, 1500);
                }).catch(() => {
                    // Fallback for non-HTTPS
                    const ta = document.createElement('textarea');
                    ta.value = code;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    btnCopyCode.innerText = '✓';
                    setTimeout(() => { btnCopyCode.innerText = '📋'; }, 1500);
                });
            }
        });
    }

    // ===== HOST: Create Room =====
    function initHostPeer() {
        setStatusWaiting('Creando sala...');
        btnCreateRoom.disabled = true;

        const roomCode = String(Math.floor(10000 + Math.random() * 90000));
        const fullRoomId = 'NEONBEAT-' + roomCode;

        const peer = new Peer(fullRoomId, {
            debug: 0,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });

        window.onlineMode.peer = peer;

        peer.on('open', (id) => {
            window.onlineMode.roomId = id;
            window.onlineMode.role = 'host';

            // Disable game modes for multiplayer
            if (typeof window.resetGameModes === 'function') window.resetGameModes();
            if (typeof window.toggleModesEnabled === 'function') window.toggleModesEnabled(false);

            showRoomInfo(roomCode);
            if (roomInfoLabel) roomInfoLabel.innerText = 'CÓDIGO DE SALA';
            setStatusWaiting('Sala lista — comparte el código con tu rival');
            
            const localUsername = (inputUsername ? inputUsername.value.trim() : '') || 'Anfitrión';
            if (slotP1) { slotP1.innerText = localUsername + ' (Tú)'; slotP1.className = 'slot connected'; }
            if (slotP2) { slotP2.innerText = 'Esperando rival...'; slotP2.className = 'slot waiting pulsate'; }
            btnCreateRoom.disabled = false;

            // Register room in the lobby list if public
            const isPublicCheckbox = document.getElementById('lobby-public-checkbox');
            const isPublic = isPublicCheckbox ? isPublicCheckbox.checked : true;
            if (isPublic) {
                registerRoomInLobby(roomCode, localUsername);
            } else {
                console.log(`[Lobby] Created private room ${roomCode}`);
            }

            // Redirect automatically to the autocharter/game screen
            if (typeof window.showScreen === 'function') {
                window.showScreen('game');
            }
        });

        peer.on('error', (err) => {
            btnCreateRoom.disabled = false;
            if (err.type === 'unavailable-id') {
                retryCount++;
                if (retryCount < MAX_RETRIES) {
                    console.warn('[MP] Room ID taken, retrying...');
                    initHostPeer();
                } else {
                    setStatusError('No se pudo crear la sala. Intenta de nuevo.');
                }
            } else {
                console.error('[MP] Host error:', err);
                setStatusError('Error de red: ' + (err.message || err.type));
            }
        });

        peer.on('connection', (conn) => {
            window.onlineMode.conn = conn;
            setupConnection(conn);
        });
    }

    // ===== GUEST: Join Room =====
    function initGuestPeer(targetCode) {
        setStatusWaiting('Conectando...');
        if (btnJoinRoom) btnJoinRoom.disabled = true;

        const peer = new Peer(null, {
            debug: 0,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });

        window.onlineMode.peer = peer;

        peer.on('open', () => {
            const fullTargetId = 'NEONBEAT-' + targetCode;
            setStatusWaiting(`Buscando sala ${targetCode}...`);

            // Disable game modes for multiplayer
            if (typeof window.resetGameModes === 'function') window.resetGameModes();
            if (typeof window.toggleModesEnabled === 'function') window.toggleModesEnabled(false);

            const conn = peer.connect(fullTargetId, { reliable: true });
            window.onlineMode.conn = conn;
            window.onlineMode.role = 'client';

            // Connection timeout
            const timeout = setTimeout(() => {
                if (!window.onlineMode.active) {
                    setStatusError('No se encontró la sala. Verifica el código.');
                    if (btnJoinRoom) btnJoinRoom.disabled = false;
                    try { peer.destroy(); } catch(e) {}
                }
            }, 10000);

            conn.on('open', () => { clearTimeout(timeout); });
            setupConnection(conn);

            // Redirect automatically to the autocharter/game screen to see loading/syncing
            if (typeof window.showScreen === 'function') {
                window.showScreen('game');
            }
        });

        peer.on('error', (err) => {
            if (btnJoinRoom) btnJoinRoom.disabled = false;
            console.error('[MP] Guest error:', err);
            if (err.type === 'peer-unavailable') {
                setStatusError('Sala no encontrada. ¿El código es correcto?');
            } else {
                setStatusError('Error de conexión: ' + (err.message || err.type));
            }
        });
    }

    // ===== COMMON CONNECTION SETUP =====
    function setupConnection(conn) {
        conn.on('open', () => {
            window.onlineMode.active = true;

            // Force disable Autoplay for Multiplayer
            const autoPlayToggle = document.getElementById('autoplay-toggle');
            if (autoPlayToggle) {
                if (autoPlayToggle.checked) {
                    autoPlayToggle.click(); // Triggers the event listener in game.js to set isAutoPlay = false
                }
                autoPlayToggle.disabled = true;
                autoPlayToggle.parentElement.style.opacity = '0.5';
                autoPlayToggle.parentElement.title = 'Autoplay no está disponible en multijugador';
            }

            setStatusOK('¡CONECTADOS!');
            if (btnJoinRoom) btnJoinRoom.disabled = false;

            const hideNamesSetting = localStorage.getItem('neonbeat-hide-names') === 'true';
            const rawLocalUsername = (inputUsername ? inputUsername.value.trim() : '') || (window.onlineMode.role === 'host' ? 'Anfitrión' : 'Invitado');
            const localUsername = hideNamesSetting ? 'Tú' : rawLocalUsername;
            
            // Send our custom username and avatar to the opponent immediately
            const hideAvatars = localStorage.getItem('neonbeat-hide-avatars') === 'true';
            const localAvatar = hideAvatars ? '🎮' : (localStorage.getItem('neonbeat-avatar') || '🎮');
            const localAvatarType = hideAvatars ? 'emoji' : (localStorage.getItem('neonbeat-avatar-type') || 'emoji');

            conn.send({
                type: 'username',
                username: rawLocalUsername,
                avatar: localAvatar,
                avatarType: localAvatarType
            });

            if (window.onlineMode.role === 'host') {
                if (slotP1) { slotP1.innerText = localUsername + ' (Tú)'; slotP1.className = 'slot connected'; }
                if (slotP2) { slotP2.innerText = 'Conectando rival...'; slotP2.className = 'slot connected'; }

                const avatarElP1 = slotP1 ? slotP1.parentElement.querySelector('.avatar') : null;
                renderLobbyAvatar(avatarElP1, localAvatar, localAvatarType);

                // Auto-send song if already loaded
                if (window.rawAudioBufferArray && window.audioMap && window.audioMap.length > 0) {
                    setStatusWaiting('Enviando canción al rival...');
                    sendAudioAndMap();
                } else {
                    setStatus('¡Conectado! Sube un MP3 y genera el mapa.');
                }
            } else {
                showRoomInfo(conn.peer.replace('NEONBEAT-', ''));
                if (roomInfoLabel) roomInfoLabel.innerText = 'SALA CONECTADA';
                if (slotP1) { slotP1.innerText = 'Conectando anfitrión...'; slotP1.className = 'slot connected'; }
                if (slotP2) { slotP2.innerText = localUsername + ' (Tú)'; slotP2.className = 'slot connected'; }

                const avatarElP2 = slotP2 ? slotP2.parentElement.querySelector('.avatar') : null;
                renderLobbyAvatar(avatarElP2, localAvatar, localAvatarType);
            }

            // Show multiplayer HUD elements
            if (versusHud) versusHud.classList.remove('hidden');
            if (dualHud) dualHud.classList.remove('hidden');

            // Set player labels (temporary fallbacks, updated by username packet shortly)
            const oppLabel = hideNamesSetting ? 'OPONENTE' : (window.onlineMode.role === 'host' ? 'RIVAL' : 'ANFITRIÓN');
            const p2Label = document.getElementById('versus-name-p2');
            if (p2Label) p2Label.innerText = oppLabel;
            const displayNameP2 = document.getElementById('display-name-p2');
            if (displayNameP2) displayNameP2.innerText = oppLabel;
            window.onlineMode.opponent.name = oppLabel;

            const p1Label = document.getElementById('versus-name-p1');
            if (p1Label) p1Label.innerText = localUsername.toUpperCase();
            const displayNameP1 = document.getElementById('display-name-p1');
            if (displayNameP1) displayNameP1.innerText = localUsername.toUpperCase();

            // Add online class to container for splitscreen layout
            const gameContainer = document.getElementById('game-container');
            if (gameContainer) gameContainer.classList.add('online-active');

            // Disable pause button in versus mode
            const pauseBtn = document.getElementById('btn-pause');
            if (pauseBtn) {
                pauseBtn.disabled = true;
                pauseBtn.style.opacity = '0.5';
                pauseBtn.style.cursor = 'not-allowed';
                pauseBtn.innerText = '⏸ Pausa (No disponible en Versus)';
            }

            // Resize to splitscreen
            if (window.resizeCanvas) window.resizeCanvas();
        });

        conn.on('close', () => { handleDisconnection('El rival se desconectó'); });
        conn.on('error', (err) => {
            console.error('[MP] DataChannel error:', err);
            handleDisconnection('Error en la conexión');
        });

        // ===== INCOMING PACKET ROUTER =====
        conn.on('data', (data) => {
            if (!data || typeof data.type !== 'string') return;

            switch (data.type) {
                case 'username':
                    const hideNamesSetting = localStorage.getItem('neonbeat-hide-names') === 'true';
                    const oppNameVal = data.username || (window.onlineMode.role === 'host' ? 'Invitado' : 'Anfitrión');
                    const oppName = hideNamesSetting ? 'Oponente' : oppNameVal;
                    window.onlineMode.opponent.name = oppName;

                    // Update HUD name tags
                    const p2Label = document.getElementById('versus-name-p2');
                    if (p2Label) p2Label.innerText = oppName.toUpperCase();
                    const displayNameP2 = document.getElementById('display-name-p2');
                    if (displayNameP2) displayNameP2.innerText = oppName.toUpperCase();

                    const localUsernameVal = (inputUsername ? inputUsername.value.trim() : '') || (window.onlineMode.role === 'host' ? 'Anfitrión' : 'Invitado');
                    const localUsername = hideNamesSetting ? 'Tú' : localUsernameVal;
                    const p1Label = document.getElementById('versus-name-p1');
                    if (p1Label) p1Label.innerText = localUsername.toUpperCase();
                    const displayNameP1 = document.getElementById('display-name-p1');
                    if (displayNameP1) displayNameP1.innerText = localUsername.toUpperCase();

                    // Update Lobby Slot display text and opponent avatar!
                    const oppAvatar = data.avatar || '🎮';
                    const oppAvatarType = data.avatarType || 'emoji';
                    
                    if (window.onlineMode.role === 'host') {
                        if (slotP1) { slotP1.innerText = localUsername + ' (Tú)'; slotP1.className = 'slot connected'; }
                        if (slotP2) { 
                            slotP2.innerText = oppName + ' ✓'; 
                            slotP2.className = 'slot connected'; 
                            const avatarEl = slotP2.parentElement.querySelector('.avatar');
                            renderLobbyAvatar(avatarEl, oppAvatar, oppAvatarType);
                        }
                    } else {
                        if (slotP1) { 
                            slotP1.innerText = oppName + ' ✓'; 
                            slotP1.className = 'slot connected'; 
                            const avatarEl = slotP1.parentElement.querySelector('.avatar');
                            renderLobbyAvatar(avatarEl, oppAvatar, oppAvatarType);
                        }
                        if (slotP2) { slotP2.innerText = localUsername + ' (Tú)'; slotP2.className = 'slot connected'; }
                    }

                    // Host: remove room from lobby since a player connected!
                    if (window.onlineMode.role === 'host') {
                        const roomCode = window.onlineMode.roomId.replace('NEONBEAT-', '');
                        removeRoomFromLobby(roomCode);
                    }
                    break;

                // --- FILE TRANSFER (Chunked) ---
                case 'file-start':
                    incomingChunks = [];
                    incomingMeta = data;
                    window.currentFileName = data.fileName;
                    window.selectedDifficulty = data.difficulty;
                    window.fallSpeed = data.fallSpeed;
                    window.audioMap = data.map;

                    if (syncContainer) syncContainer.classList.remove('hidden');
                    setStatusWaiting('Recibiendo canción...');
                    updateSyncProgress(0);
                    break;

                case 'file-chunk':
                    if (incomingMeta) {
                        incomingChunks[data.index] = data.data;
                        const received = incomingChunks.filter(Boolean).length;
                        const pct = (received / incomingMeta.totalChunks) * 100;
                        updateSyncProgress(pct);
                        setStatusWaiting(`Descargando: ${Math.round(pct)}%`);
                    }
                    break;

                case 'file-end':
                    if (incomingMeta) {
                        const total = incomingMeta.totalChunks || 0;
                        const received = incomingChunks.filter(Boolean).length;
                        if (total > 0 && received < total) {
                            console.error(`[MP] Incomplete file transfer: ${received}/${total} chunks`);
                            setStatusError('Transferencia incompleta. Pide al anfitrión que reenvíe la canción.');
                            incomingChunks = [];
                            incomingMeta = null;
                            break;
                        }
                        setStatusWaiting('Decodificando audio...');
                        const blob = new Blob(incomingChunks);
                        const fileReader = new FileReader();
                        fileReader.readAsArrayBuffer(blob);
                        fileReader.onload = function() {
                            const arrayBuffer = this.result;
                            window.rawAudioBufferArray = arrayBuffer.slice(0);

                            window.audioContext.decodeAudioData(arrayBuffer, (buffer) => {
                                window.audioBuffer = buffer;
                                setStatusOK('CANCIÓN SINCRONIZADA — Esperando inicio');
                                if (syncContainer) syncContainer.classList.add('hidden');
                                if (typeof window.drawReadyState === 'function') window.drawReadyState();
                                if (typeof window.resetUploaderUI === 'function') window.resetUploaderUI(false);
                                
                                // Send "ready" to host
                                window.onlineMode.conn.send({ type: 'guest-ready' });
                            }, (err) => {
                                console.error('[MP] Decode error:', err);
                                setStatusError('Error al decodificar el audio');
                            });
                        };
                    }
                    break;

                case 'guest-ready':
                    if (window.onlineMode.role === 'host') {
                        setStatusOK('CANCIÓN SINCRONIZADA — Pulsa Jugar');
                        if (syncContainer) syncContainer.classList.add('hidden');
                        
                        const btnPlay = document.getElementById('btn-play');
                        if (btnPlay) {
                            btnPlay.disabled = false;
                            btnPlay.title = '';
                        }
                    }
                    break;

                // --- GAME START SYNC ---
                case 'song-start':
                    handleSongStartCountdown(data.delayMs);
                    break;

                // --- INPUT SYNC ---
                case 'keydown':
                    window.onlineMode.opponent.heldKeys.add(data.col);
                    break;

                case 'keyup':
                    window.onlineMode.opponent.heldKeys.delete(data.col);
                    break;

                case 'hold-start':
                    if (window.audioMap) {
                        const note = findNoteByTimeAndCol(data.noteTime, data.col);
                        if (note) {
                            note.opponentHoldStarted = true;
                            note.opponentScored = true;
                        }
                    }
                    break;

                // --- HIT / SCORE SYNC ---
                case 'hit':
                    handleOpponentHit(data);
                    break;

                case 'state':
                    window.onlineMode.opponent.score = data.score;
                    window.onlineMode.opponent.combo = data.combo;
                    window.onlineMode.opponent.health = data.health;
                    updateOpponentHUD();
                    break;

                // --- GAME END SYNC ---
                case 'game-over':
                    // Opponent's game ended (they died or song finished)
                    window.onlineMode.opponent.finalScore = data.score;
                    window.onlineMode.opponent.maxCombo = Math.max(
                        window.onlineMode.opponent.maxCombo || 0,
                        data.maxCombo || 0
                    );
                    break;

                case 'player-death':
                    window.onlineMode.opponentDied = true;
                    if (window.handleOpponentDeath) {
                        window.handleOpponentDeath();
                    }
                    break;

                case 'retry-ready':
                    window.onlineMode.opponentReadyToRetry = data.ready;
                    if (window.updateRetryStatusUI) {
                        window.updateRetryStatusUI();
                    }
                    if (window.checkBothReadyToRetry) {
                        window.checkBothReadyToRetry();
                    }
                    break;
            }
        });
    }

    // ===== SONG START COUNTDOWN (received by guest) =====
    function handleSongStartCountdown(delayMs) {
        // Hide results screen and overlays immediately
        const resultsScreen = document.getElementById('results-screen');
        if (resultsScreen) resultsScreen.classList.add('hidden');
        document.body.classList.remove('extreme-mode', 'flash-miss');

        let countdownVal = 3;
        const statusEl = document.getElementById('status-text');
        const countdownStyle = 'font-size:1.4rem;color:#6366f1;font-weight:900;text-shadow:0 0 10px #6366f1;';
        if (statusEl) statusEl.innerHTML = `<span style="${countdownStyle}">EMPEZANDO EN ${countdownVal}...</span>`;
        if (typeof window.playUIClick === 'function') window.playUIClick();

        const interval = setInterval(() => {
            countdownVal--;
            if (countdownVal > 0) {
                if (statusEl) statusEl.innerHTML = `<span style="${countdownStyle}">EMPEZANDO EN ${countdownVal}...</span>`;
                if (typeof window.playUIClick === 'function') window.playUIClick();
            } else {
                clearInterval(interval);
            }
        }, 500);

        setTimeout(() => {
            if (typeof window.startGameplay === 'function') {
                window.startGameplay(0);
            }
        }, delayMs);
    }

    // ===== OPPONENT HIT HANDLER =====
    function handleOpponentHit(data) {
        const opp = window.onlineMode.opponent;

        // Mark note as scored on the opponent's board only (NOT note.active = false!)
        if (data.noteTime !== -1 && window.audioMap) {
            const note = findNoteByTimeAndCol(data.noteTime, data.col);
            if (note) {
                note.opponentScored = true;
                // DO NOT set note.active = false — that would remove it from local player's board!
            }
        }

        // Update opponent stats
        if (data.tier === 'perfect') {
            opp.countPerfect++;
            opp.combo++;
            spawnOpponentParticles(data.col, 'perfect');
            showOpponentFeedback('PERFECT', 'feedback-perfect');
        } else if (data.tier === 'great') {
            opp.countGreat++;
            opp.combo++;
            spawnOpponentParticles(data.col, 'great');
            showOpponentFeedback('GREAT', 'feedback-good');
        } else if (data.tier === 'ok') {
            opp.countOk++;
            opp.combo++;
            showOpponentFeedback('OK', 'feedback-good');
        } else if (data.tier === 'miss' || data.tier === 'bad') {
            opp.countMiss++;
            opp.combo = 0;
            showOpponentFeedback('MISS', 'feedback-miss');
        }

        if (opp.combo > (opp.maxCombo || 0)) opp.maxCombo = opp.combo;
        updateOpponentHUD();
    }

    // ===== FILE TRANSFER (Host -> Guest) =====
    function sendAudioAndMap() {
        if (!window.rawAudioBufferArray || !window.onlineMode.conn) return;

        const btnPlay = document.getElementById('btn-play');
        if (btnPlay) {
            btnPlay.disabled = true;
            btnPlay.title = 'Sincronizando con el rival...';
        }

        const buffer = window.rawAudioBufferArray;
        const chunkSize = 65536; // 64KB
        const totalChunks = Math.ceil(buffer.byteLength / chunkSize);

        if (syncContainer) syncContainer.classList.remove('hidden');
        updateSyncProgress(0);

        // Send metadata + map
        window.onlineMode.conn.send({
            type: 'file-start',
            fileName: window.currentFileName,
            difficulty: window.selectedDifficulty,
            fallSpeed: window.fallSpeed,
            totalChunks: totalChunks,
            byteLength: buffer.byteLength,
            map: window.audioMap
        });

        let currentChunk = 0;

        function sendNextBurst() {
            // Send up to 8 chunks per frame to maximize throughput while avoiding buffer overflow
            const batchSize = 8;
            let sent = 0;

            while (sent < batchSize && currentChunk < totalChunks) {
                if (!window.onlineMode.conn || !window.onlineMode.conn.open) return;

                const startByte = currentChunk * chunkSize;
                const endByte = Math.min(buffer.byteLength, startByte + chunkSize);

                window.onlineMode.conn.send({
                    type: 'file-chunk',
                    index: currentChunk,
                    data: buffer.slice(startByte, endByte)
                });

                currentChunk++;
                sent++;
            }

            const pct = (currentChunk / totalChunks) * 100;
            updateSyncProgress(pct);
            setStatusWaiting(`Subiendo: ${Math.round(pct)}%`);

            if (currentChunk < totalChunks) {
                // Use requestAnimationFrame for smoother UI + back-pressure
                setTimeout(sendNextBurst, 10);
            } else {
                // All chunks sent
                window.onlineMode.conn.send({ type: 'file-end' });
                updateSyncProgress(100);
                setStatusWaiting('Esperando a que el rival termine de cargar...');
                
                const btnPlay = document.getElementById('btn-play');
                if (btnPlay) {
                    btnPlay.disabled = true;
                    btnPlay.title = 'Esperando a que el rival termine de decodificar el audio...';
                }
            }
        }

        sendNextBurst();
    }

    // ===== AUTO-SYNC ON SONG LOAD (Host only) =====
    window.addEventListener('neonbeat-song-loaded', () => {
        if (window.onlineMode && window.onlineMode.active && window.onlineMode.role === 'host' && window.onlineMode.conn) {
            setStatusWaiting('Enviando canción al rival...');
            sendAudioAndMap();
        }
    });

    // ===== GAME-OVER SYNC =====
    window.addEventListener('neonbeat-game-over', () => {
        if (window.onlineMode && window.onlineMode.active && window.onlineMode.conn) {
            const gs = window.getGameState ? window.getGameState() : {};
            window.onlineMode.conn.send({
                type: 'game-over',
                score: gs.score || 0,
                maxCombo: gs.maxCombo || 0
            });
        }
    });

    // ===== HELPER: Find note by time + column =====
    function findNoteByTimeAndCol(noteTime, col) {
        if (!window.audioMap) return null;
        return window.audioMap.find(n => Math.abs(n.time - noteTime) < 0.05 && n.col === col) || null;
    }

    // ===== HELPER: Opponent floating feedback =====
    function showOpponentFeedback(text, cssClass) {
        const opp = window.onlineMode.opponent;
        opp.feedbackText = text;
        opp.feedbackClass = cssClass;
        clearTimeout(opp.feedbackTimeout);
        opp.feedbackTimeout = setTimeout(() => { opp.feedbackText = ''; }, 500);
    }

    // ===== HELPER: Spawn particles on opponent mini-track =====
    function spawnOpponentParticles(col, tier) {
        if (typeof window.spawnParticles !== 'function') return;
        if (!window.onlineMode || !window.onlineMode.active) return;

        const gs = window.getGameState ? window.getGameState() : {};
        const gameCanvas = document.getElementById('game-canvas');
        if (!gameCanvas) return;

        const oppStartX = window._oppStartX || gameCanvas.width;
        const oppColW = window._oppColWidth || 0;
        const xCoord = oppStartX + col * oppColW + oppColW / 2;
        const hitY = gs.hitZoneY || (gameCanvas.height - 120);
        const colors = ['#e91e63', '#2196f3', '#4caf50', '#ffeb3b'];
        const style = gs.splashStyle || 'sparks';

        if (tier === 'perfect') {
            window.spawnParticles(xCoord, hitY, colors[col] || '#fff', style);
        } else if (tier === 'great' && (style === 'stars' || style === 'sparks')) {
            window.spawnParticles(xCoord, hitY, colors[col] || '#fff', style);
        }
    }

    // ===== UPDATE OPPONENT HUD =====
    function updateOpponentHUD() {
        const opp = window.onlineMode.opponent;
        const gs = window.getGameState ? window.getGameState() : {};

        // Dual score panels
        const dualScoreP2 = document.getElementById('dual-score-p2');
        const dualComboP2 = document.getElementById('dual-combo-p2');
        const dualScoreP1 = document.getElementById('dual-score-p1');
        const dualComboP1 = document.getElementById('dual-combo-p1');

        if (dualScoreP2) dualScoreP2.innerText = Math.round(opp.score);
        if (dualComboP2) dualComboP2.innerText = opp.combo + 'x';
        if (dualScoreP1) dualScoreP1.innerText = Math.round(gs.score || 0);
        if (dualComboP1) dualComboP1.innerText = (gs.combo || 0) + 'x';

        // Versus balance bar
        const localScore = gs.score || 0;
        const totalScore = localScore + opp.score;
        let p1Pct = 50, p2Pct = 50;
        if (totalScore > 0) {
            p1Pct = (localScore / totalScore) * 100;
            p2Pct = 100 - p1Pct;
        }

        const fillP1 = document.getElementById('versus-fill-p1');
        const fillP2 = document.getElementById('versus-fill-p2');
        if (fillP1) fillP1.style.width = p1Pct + '%';
        if (fillP2) fillP2.style.width = p2Pct + '%';
    }
    window.updateOpponentHUD = updateOpponentHUD;

    // ===== LEAVE ROOM =====
    function leaveRoom() {
        try {
            if (window.onlineMode.conn) {
                window.onlineMode.conn.close();
            }
            if (window.onlineMode.peer) {
                window.onlineMode.peer.destroy();
            }
        } catch (e) { /* ignore */ }

        resetOnlineState();
        setStatus('Has salido de la sala.');
    }

    // ===== DISCONNECTION HANDLER =====
    function handleDisconnection(reason) {
        resetOnlineState();
        setStatusError(reason || 'Conexión perdida');
    }

    function resetOnlineState() {
        // Host: remove room from lobby if active
        if (window.onlineMode.roomId && window.onlineMode.role === 'host') {
            const roomCode = window.onlineMode.roomId.replace('NEONBEAT-', '');
            removeRoomFromLobby(roomCode);
        }

        window.onlineMode.active = false;
        window.onlineMode.conn = null;
        window.onlineMode.peer = null;
        window.onlineMode.role = null;
        window.onlineMode.roomId = null;
        window.onlineMode.opponentDied = false;
        window.onlineMode.localDied = false;

        // Reset opponent stats
        const opp = window.onlineMode.opponent;
        opp.score = 0; opp.combo = 0; opp.maxCombo = 0; opp.health = 50;
        opp.countPerfect = 0; opp.countGreat = 0; opp.countOk = 0; opp.countMiss = 0;
        opp.heldKeys.clear(); opp.feedbackText = '';

        // Reset UI
        hideRoomInfo();
        if (slotP1) { 
            slotP1.innerText = 'Jugador 1'; 
            slotP1.className = 'slot waiting'; 
            const avatarEl = slotP1.parentElement.querySelector('.avatar');
            if (avatarEl) avatarEl.innerHTML = '🎮';
        }
        if (slotP2) { 
            slotP2.innerText = 'Jugador 2'; 
            slotP2.className = 'slot waiting'; 
            const avatarEl = slotP2.parentElement.querySelector('.avatar');
            if (avatarEl) avatarEl.innerHTML = '🕹️';
        }
        if (versusHud) versusHud.classList.add('hidden');
        if (dualHud) dualHud.classList.add('hidden');
        if (syncContainer) syncContainer.classList.add('hidden');
        const resultsScreen = document.getElementById('results-screen');
        if (resultsScreen) resultsScreen.classList.add('hidden');
        if (btnJoinRoom) btnJoinRoom.disabled = false;
        if (btnCreateRoom) btnCreateRoom.disabled = false;

        // Restore game modes
        if (typeof window.resetGameModes === 'function') window.resetGameModes();
        if (typeof window.toggleModesEnabled === 'function') window.toggleModesEnabled(true);

        // Restore pause button
        const pauseBtn = document.getElementById('btn-pause');
        if (pauseBtn) {
            pauseBtn.disabled = false;
            pauseBtn.style.opacity = '1';
            pauseBtn.style.cursor = 'pointer';
            pauseBtn.innerText = '⏸ Pausa / Reanudar (P)';
        }

        // Restore singleplayer track width
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.classList.remove('online-active');

        if (window.resizeCanvas) window.resizeCanvas();

        // Redirect back to main menu or online lobby
        if (typeof window.showScreen === 'function' && window.currentScreenName !== 'main-menu') {
            window.showScreen('main-menu');
        }
    }

    // Exponer globalmente para permitir salir de la sala al regresar al menú principal
    window.leaveRoom = leaveRoom;
    window.resetOnlineState = resetOnlineState;

    window.addEventListener('beforeunload', () => {
        if (window.onlineMode && window.onlineMode.roomId && window.onlineMode.role === 'host') {
            const roomCode = window.onlineMode.roomId.replace('NEONBEAT-', '');
            removeRoomFromLobby(roomCode);
        }
    });
})();
