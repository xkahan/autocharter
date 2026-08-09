const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav'
};

// Database loading helper
function loadDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({}));
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error('Error reading database file:', e);
        return {};
    }
}

// Database saving helper
function saveDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing database file:', e);
    }
}

// Helper to write JSON responses
function sendJSON(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end(JSON.stringify(data));
}

// Helper to read POST request body
function getBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', err => reject(err));
    });
}

// Handle CORS OPTIONS preflight
function handleCORS(req, res) {
    res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end();
}

const server = http.createServer(async (req, res) => {
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return handleCORS(req, res);
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // --- API ROUTES ---

    // 1. GET: Leaderboard
    if (pathname === '/api/leaderboard' && req.method === 'GET') {
        try {
            const db = loadDB();
            const players = Object.entries(db).map(([username, data]) => ({
                username,
                points: data.points || 0,
                avatar: data.avatar || '🎮',
                avatarType: data.avatarType || 'emoji'
            }));
            players.sort((a, b) => b.points - a.points);
            return sendJSON(res, 200, players);
        } catch (e) {
            return sendJSON(res, 500, { error: e.message });
        }
    }

    // 2. POST: Register
    if (pathname === '/api/register' && req.method === 'POST') {
        try {
            const { username, password } = await getBody(req);
            if (!username || !password) {
                return sendJSON(res, 400, { error: 'Usuario y contraseña son requeridos' });
            }
            const cleanUser = username.trim();
            if (!cleanUser) {
                return sendJSON(res, 400, { error: 'Nombre de usuario inválido' });
            }

            const db = loadDB();
            if (db[cleanUser]) {
                return sendJSON(res, 400, { error: 'El nombre de usuario ya está registrado' });
            }

            db[cleanUser] = {
                password: password,
                points: 0,
                avatar: '🎮',
                avatarType: 'emoji'
            };
            saveDB(db);
            console.log(`[NeonBeat] Nuevo usuario registrado: ${cleanUser}`);
            return sendJSON(res, 200, { success: true });
        } catch (e) {
            return sendJSON(res, 400, { error: e.message });
        }
    }

    // 3. POST: Login
    if (pathname === '/api/login' && req.method === 'POST') {
        try {
            const { username, password } = await getBody(req);
            if (!username || !password) {
                return sendJSON(res, 400, { error: 'Usuario y contraseña son requeridos' });
            }
            const cleanUser = username.trim();

            const db = loadDB();
            const acc = db[cleanUser];

            if (acc && acc.password === password) {
                console.log(`[NeonBeat] Inicio de sesión exitoso: ${cleanUser}`);
                return sendJSON(res, 200, {
                    success: true,
                    userData: {
                        username: cleanUser,
                        points: acc.points || 0,
                        avatar: acc.avatar || '🎮',
                        avatarType: acc.avatarType || 'emoji'
                    }
                });
            } else {
                return sendJSON(res, 400, { error: 'Usuario o contraseña incorrectos' });
            }
        } catch (e) {
            return sendJSON(res, 400, { error: e.message });
        }
    }

    // 4. POST: Add Points
    if (pathname === '/api/add-points' && req.method === 'POST') {
        try {
            const { username, points } = await getBody(req);
            if (!username || typeof points !== 'number') {
                return sendJSON(res, 400, { error: 'Datos de puntuación inválidos' });
            }

            const db = loadDB();
            if (db[username]) {
                db[username].points = (db[username].points || 0) + points;
                saveDB(db);
                console.log(`[NeonBeat] Se sumaron ${points} puntos a ${username}. Total: ${db[username].points}`);
                return sendJSON(res, 200, { success: true, points: db[username].points });
            } else {
                return sendJSON(res, 404, { error: 'Usuario no encontrado' });
            }
        } catch (e) {
            return sendJSON(res, 400, { error: e.message });
        }
    }

    // 5. POST: Update Profile
    if (pathname === '/api/update-profile' && req.method === 'POST') {
        try {
            const { username, avatar, avatarType } = await getBody(req);
            if (!username) {
                return sendJSON(res, 400, { error: 'Nombre de usuario requerido' });
            }

            const db = loadDB();
            if (db[username]) {
                if (avatar) db[username].avatar = avatar;
                if (avatarType) db[username].avatarType = avatarType;
                saveDB(db);
                console.log(`[NeonBeat] Perfil de ${username} actualizado.`);
                return sendJSON(res, 200, { success: true });
            } else {
                return sendJSON(res, 404, { error: 'Usuario no encontrado' });
            }
        } catch (e) {
            return sendJSON(res, 400, { error: e.message });
        }
    }

    // --- STATIC FILES ROUTING ---
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
        safePath = '/index.html';
    }

    const filePath = path.join(__dirname, safePath);
    const ext = path.extname(filePath).toLowerCase();

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            const fallbackPath = path.join(__dirname, 'index.html');
            res.writeHead(200, { 
                'Content-Type': 'text/html',
                'Access-Control-Allow-Origin': '*' 
            });
            fs.createReadStream(fallbackPath).pipe(res);
            return;
        }

        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*' 
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`================================================`);
    console.log(` [NeonBeat Server] Levantado exitosamente!`);
    console.log(` Escuchando en: http://localhost:${PORT}`);
    console.log(` (Sin dependencias externas - Listo para usar)`);
    console.log(`================================================`);
});
