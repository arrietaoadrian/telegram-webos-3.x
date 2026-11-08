'use strict';

/*
 * Telegram TV backend — corre en Termux (Android) con Node.js.
 * Habla con Telegram (MTProto), genera el login por QR, lista tus canales
 * y sirve los videos por HTTP para que la app del TV los reproduzca.
 *
 * Configuración: edita config.json con tu apiId y apiHash (de my.telegram.org).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const QRCode = require('qrcode');

const BASE = __dirname;
const configPath = path.join(BASE, 'config.json');
const SESSION_FILE = path.join(BASE, 'session.txt');
const CACHE_DIR = path.join(BASE, 'cache');

let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.error('ERROR: no se pudo leer config.json');
    process.exit(1);
}

if (!config.apiId || !config.apiHash || config.apiHash === 'PON_AQUI_TU_API_HASH') {
    console.error('ERROR: edita config.json con tu apiId y apiHash reales.');
    process.exit(1);
}

const PORT = config.port || 8080;
const API_ID = Number(config.apiId);
const API_HASH = String(config.apiHash);

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// Los videos son temporales: se borran automáticamente.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos sin uso

function cleanupCache() {
    fs.readdir(CACHE_DIR, function (err, files) {
        if (err) return;
        const now = Date.now();
        for (const f of files) {
            const p = path.join(CACHE_DIR, f);
            fs.stat(p, function (err, st) {
                if (err) return;
                if (now - st.mtimeMs > CACHE_TTL_MS) {
                    fs.unlink(p, function () {});
                }
            });
        }
    });
}

// ===== Sesión persistente =====
let sessionString = fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, 'utf8').trim() : '';
const stringSession = new StringSession(sessionString);
const client = new TelegramClient(stringSession, API_ID, API_HASH, { connectionRetries: 5 });

function saveSession() {
    try { fs.writeFileSync(SESSION_FILE, stringSession.save()); } catch (e) {}
}

// ===== Estado de login =====
let loggedIn = false;
let loginInProgress = false;
let qrToken = null;          // Buffer
let needPassword = false;
let passwordResolver = null;
let loginError = null;
let meInfo = null;
let started = false;

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function startLogin() {
    if (loginInProgress) return;
    loginInProgress = true;
    qrToken = null;
    needPassword = false;
    loginError = null;
    try {
        await client.connect();
        await client.signInUserWithQrCode(
            { apiId: API_ID, apiHash: API_HASH },
            {
                qrCode: async (code) => {
                    qrToken = code.token;
                },
                password: async () => {
                    needPassword = true;
                    return await new Promise((resolve) => { passwordResolver = resolve; });
                },
                onError: async (err) => {
                    loginError = err.message || String(err);
                    return true; // detener
                }
            }
        );
        saveSession();
        loggedIn = true;
        needPassword = false;
        try { meInfo = await client.getMe(); } catch (e) {}
    } catch (e) {
        loginError = e.message || String(e);
    } finally {
        loginInProgress = false;
        qrToken = null;
        started = false;
    }
}

async function ensureConnected() {
    if (!client.connected) {
        await client.connect();
    }
    const auth = await client.checkAuthorization();
    loggedIn = auth;
    return auth;
}

// ===== Utilidades =====
function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function sendPng(res, buf) {
    res.writeHead(200, {
        'Content-Type': 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Length': buf.length
    });
    res.end(buf);
}

// Servir archivo con soporte de rango (para streaming/seeking)
function serveFileWithRange(res, filePath, mimeType, req) {
    fs.stat(filePath, function (err, stat) {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        const total = stat.size;
        const range = req.headers.range;
        if (range) {
            const m = /bytes=(\d*)-(\d*)/.exec(range);
            let start = m && m[1] ? parseInt(m[1], 10) : 0;
            let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
            if (isNaN(start) || start < 0) start = 0;
            if (isNaN(end) || end >= total) end = total - 1;
            if (start > end) {
                res.writeHead(416, { 'Content-Range': 'bytes */' + total });
                res.end();
                return;
            }
            res.writeHead(206, {
                'Content-Type': mimeType,
                'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
                'Accept-Ranges': 'bytes',
                'Content-Length': end - start + 1,
                'Access-Control-Allow-Origin': '*'
            });
            const stream = fs.createReadStream(filePath, { start: start, end: end });
            stream.pipe(res);
            stream.on('error', function () { try { res.end(); } catch (e) {} });
        } else {
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Accept-Ranges': 'bytes',
                'Content-Length': total,
                'Access-Control-Allow-Origin': '*'
            });
            fs.createReadStream(filePath).pipe(res);
        }
    });
}

function videoInfo(m) {
    const doc = m && m.media && m.media.document;
    if (!doc) return null;
    let v = null;
    const attrs = doc.attributes || [];
    for (let i = 0; i < attrs.length; i++) {
        if (attrs[i] instanceof Api.DocumentAttributeVideo) { v = attrs[i]; break; }
    }
    if (!v) return null;
    return {
        id: m.id,
        date: m.date,
        caption: m.message || '',
        duration: v.duration || 0,
        width: v.w || 0,
        height: v.h || 0,
        size: doc.size || 0,
        mimeType: doc.mimeType || 'video/mp4'
    };
}

async function getEntityById(id, className) {
    const nid = BigInt(id);
    if (className === 'Channel') {
        return await client.getEntity(new Api.PeerChannel({ channelId: nid }));
    }
    if (className === 'Chat') {
        return await client.getEntity(new Api.PeerChat({ chatId: nid }));
    }
    if (className === 'User') {
        return await client.getEntity(new Api.PeerUser({ userId: nid }));
    }
    throw new Error('tipo desconocido: ' + className);
}

// ===== Servidor HTTP =====
const server = http.createServer(async function (req, res) {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    try {
        if (p === '/api/status') {
            sendJson(res, 200, {
                loggedIn: loggedIn,
                needPassword: needPassword,
                waitingQr: loginInProgress && !!qrToken,
                error: loginError,
                me: meInfo ? { id: String(meInfo.id), username: meInfo.username, firstName: meInfo.firstName } : null
            });
            return;
        }

        if (p === '/api/login' && req.method === 'POST') {
            if (loggedIn) { sendJson(res, 200, { ok: true, loggedIn: true }); return; }
            startLogin();
            sendJson(res, 200, { ok: true });
            return;
        }

        if (p === '/api/password' && req.method === 'POST') {
            let body = '';
            req.on('data', function (c) { body += c; });
            req.on('end', function () {
                let pw = '';
                try { pw = JSON.parse(body).password || ''; } catch (e) {}
                if (passwordResolver) { passwordResolver(pw); passwordResolver = null; needPassword = false; }
                sendJson(res, 200, { ok: true });
            });
            return;
        }

        if (p === '/api/qr.png') {
            if (qrToken) {
                const text = 'tg://login?token=' + b64url(qrToken);
                const buf = await QRCode.toBuffer(text, { type: 'png', width: 340, margin: 2 });
                sendPng(res, buf);
            } else {
                res.writeHead(404); res.end('no qr');
            }
            return;
        }

        if (p === '/api/logout' && req.method === 'POST') {
            try { await client.invoke(new Api.auth.LogOut()); } catch (e) {}
            try { fs.unlinkSync(SESSION_FILE); } catch (e) {}
            stringSession.load('');
            loggedIn = false;
            meInfo = null;
            sendJson(res, 200, { ok: true });
            return;
        }

        // ===== Rutas que requieren sesión =====
        if (!loggedIn) {
            try { await ensureConnected(); } catch (e) {}
        }
        if (!loggedIn) {
            sendJson(res, 401, { error: 'no_logged_in' });
            return;
        }

        if (p === '/api/me') {
            try { meInfo = await client.getMe(); } catch (e) {}
            sendJson(res, 200, { me: meInfo ? { id: String(meInfo.id), username: meInfo.username, firstName: meInfo.firstName } : null });
            return;
        }

        if (p === '/api/dialogs') {
            const dialogs = await client.getDialogs({});
            const list = [];
            for (const d of dialogs) {
                const e = d.entity;
                if (!e) continue;
                if (e.className === 'Channel' || e.className === 'Chat') {
                    list.push({
                        id: String(e.id),
                        className: e.className,
                        title: e.title || d.title || '',
                        username: e.username || ''
                    });
                }
            }
            sendJson(res, 200, { dialogs: list });
            return;
        }

        if (p === '/api/messages') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const offsetId = Number(u.searchParams.get('offsetId') || 0) || 0;
            const entity = await getEntityById(chatId, className);
            const result = await client.getMessages(entity, {
                filter: new Api.InputMessagesFilterVideo(),
                limit: 50,
                offsetId: offsetId
            });
            const videos = [];
            for (const m of result) {
                const vi = videoInfo(m);
                if (vi) videos.push(vi);
            }
            sendJson(res, 200, { messages: videos, title: entity.title || '' });
            return;
        }

        if (p === '/api/video') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const msgId = Number(u.searchParams.get('msgId') || 0);
            const entity = await getEntityById(chatId, className);
            const msgs = await client.getMessages(entity, { ids: [msgId] });
            if (!msgs || !msgs.length) { res.writeHead(404); res.end('no message'); return; }
            const msg = msgs[0];
            const vi = videoInfo(msg);
            if (!vi) { res.writeHead(404); res.end('not a video'); return; }
            const fileName = crypto.createHash('md5').update(chatId + ':' + msgId).digest('hex') + '.mp4';
            const filePath = path.join(CACHE_DIR, fileName);
            if (!fs.existsSync(filePath)) {
                await client.downloadMedia(msg, { outputFile: filePath });
            }
            // renovar el timestamp para que no se borre mientras se ve
            fs.utimes(filePath, new Date(), new Date(), function () {});
            serveFileWithRange(res, filePath, vi.mimeType, req);
            return;
        }

        sendJson(res, 404, { error: 'not_found' });
    } catch (e) {
        sendJson(res, 500, { error: e.message || String(e) });
    }
});

server.listen(PORT, '0.0.0.0', function () {
    console.log('Telegram TV backend escuchando en http://0.0.0.0:' + PORT);
    console.log('En el TV usa: http://IP_DEL_TELEFONO:' + PORT);
});

// Limpieza de videos temporales: al arrancar y cada 10 minutos.
cleanupCache();
setInterval(cleanupCache, 10 * 60 * 1000);

// Al arrancar, intenta validar la sesión guardada
(async function () {
    try {
        await client.connect();
        const auth = await client.checkAuthorization();
        loggedIn = auth;
        if (auth) {
            try { meInfo = await client.getMe(); } catch (e) {}
            console.log('Sesión existente válida. Usuario:', meInfo ? meInfo.username : '?');
        } else {
            console.log('Sin sesión. La app mostrará el QR para iniciar sesión.');
        }
    } catch (e) {
        console.log('Aviso al arrancar:', e.message);
    }
})();
