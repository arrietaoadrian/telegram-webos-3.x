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
const cp = require('child_process');

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

// Escribe errores y avisos en server.log para poder diagnosticar.
function logError(prefix, msg) {
    const line = new Date().toISOString() + ' [' + prefix + '] ' + String(msg) + '\n';
    try { fs.appendFile(path.join(BASE, 'server.log'), line, function () {}); } catch (e) {}
    console.error(line.trim());
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

// Cachés en memoria para avatares y miniaturas (no se recargan en cada render).
const avatarCache = new Map();
const thumbCache = new Map();
const MAX_CACHE = 120;

function cachePut(map, key, buf) {
    map.set(key, buf);
    if (map.size > MAX_CACHE) {
        const first = map.keys().next().value;
        map.delete(first);
    }
}

function serveImage(res, buf) {
    if (!buf || !buf.length) { res.writeHead(404); res.end('no image'); return; }
    let ct = 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) ct = 'image/png';
    else if (buf[0] === 0x47 && buf[1] === 0x49) ct = 'image/gif';
    res.writeHead(200, {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': buf.length
    });
    res.end(buf);
}

// ===== Utilidades =====
// Descarga un archivo de Telegram y borra restos parciales si falla (timeouts
// de upload.GetFile dejan archivos corruptos que rompen pdftoppm después).
async function safeDownloadMedia(msg, filePath) {
    const expected = getExpectedSize(msg);
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await client.downloadMedia(msg, { outputFile: filePath });
            let size = 0;
            try { size = fs.statSync(filePath).size; } catch (e) {}
            if (!size) throw new Error('downloaded file is empty');
            if (expected && size !== expected) throw new Error('downloaded file is incomplete (' + size + '/' + expected + ')');
            return;
        } catch (e) {
            try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e2) {}
            if (attempt === 3) throw e;
            logError('download', 'reintento ' + attempt + ' (' + e.message + ')');
            await new Promise(function (r) { setTimeout(r, 2000 * attempt); });
        }
    }
}

// Tamaño esperado del archivo según el mensaje de Telegram (0 si no se conoce).
function getExpectedSize(msg) {
    try {
        const d = msg && msg.media && msg.media.document;
        if (d && d.size) return Number(d.size);
    } catch (e) {}
    return 0;
}

// Evita que dos peticiones descarguen el mismo archivo a la vez (corromperían
// el PDF/audio/video al escribir sobre la misma ruta).
const downloadLocks = new Map();
function ensureDownloaded(msg, filePath) {
    const expected = getExpectedSize(msg);
    if (fs.existsSync(filePath)) {
        // Verifica que la descarga esté completa: si el tamaño no coincide con el
        // esperado (descarga interrumpida), bórrala y vuelve a descargar.
        try {
            const st = fs.statSync(filePath);
            if (expected && st.size !== expected) {
                logError('download', 'incompleto ' + filePath + ' (' + st.size + '/' + expected + ') -> redescargando');
                try { fs.unlinkSync(filePath); } catch (e) {}
            } else {
                return Promise.resolve();
            }
        } catch (e) {
            return Promise.resolve();
        }
    }
    let lock = downloadLocks.get(filePath);
    if (!lock) {
        lock = safeDownloadMedia(msg, filePath).then(function (v) {
            downloadLocks.delete(filePath);
            return v;
        }, function (e) {
            downloadLocks.delete(filePath);
            throw e;
        });
        downloadLocks.set(filePath, lock);
    }
    return lock;
}

// Cola de pdftoppm: evita bloquear el event loop (las carátulas de una lista
// pueden ser decenas) y da prioridad a las páginas completas del lector.
const pdfJobs = [];
let pdfRunning = 0;
const PDF_MAX_JOBS = 2;
function pumpPdfJobs() {
    while (pdfRunning < PDF_MAX_JOBS && pdfJobs.length) {
        const job = pdfJobs.shift();
        pdfRunning++;
        cp.execFile('pdftoppm', job.args, { timeout: 120000, maxBuffer: 1024 * 1024 }, function (err) {
            pdfRunning--;
            if (err) job.reject(err); else job.resolve();
            pumpPdfJobs();
        });
    }
}
function runPdftoppm(args, priority) {
    return new Promise(function (resolve, reject) {
        const job = { args: args, resolve: resolve, reject: reject };
        if (priority) pdfJobs.unshift(job); else pdfJobs.push(job);
        pumpPdfJobs();
    });
}

// Renderiza una página PDF a JPEG y devuelve la ruta generada (o null).
async function renderPdfPage(pdfPath, prefix, page, dpi, isThumb) {
    const priority = !isThumb;
    const args = ['-f', String(page), '-l', String(page), '-jpeg', '-r', dpi];
    if (isThumb) args.push('-jpegopt', 'quality=45,optimize=y');
    args.push(pdfPath, prefix);
    try {
        await runPdftoppm(args, priority);
    } catch (e) {
        if (!isThumb || e.code === 'ENOENT') throw e;
        // Poppler antiguo sin -jpegopt: reintenta sin esa opción.
        await runPdftoppm(['-f', String(page), '-l', String(page), '-jpeg', '-r', dpi, pdfPath, prefix], priority);
    }
    // pdftoppm nombra la salida con el número de página (ej: prefix-2.jpg, prefix-02.jpg).
    const marker = path.basename(prefix) + '-';
    const dirFiles = fs.readdirSync(CACHE_DIR);
    for (const f of dirFiles) {
        if (f.indexOf(marker) === 0 && /\.jpe?g$/i.test(f)) return path.join(CACHE_DIR, f);
    }
    return null;
}

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

function classifyMedia(m) {
    if (m && m.media instanceof Api.MessageMediaPhoto && m.media.photo) {
        return { type: 'photo', id: m.id, date: m.date, caption: m.message || '' };
    }
    if (m && m.media instanceof Api.MessageMediaDocument && m.media.document) {
        const doc = m.media.document;
        let fileName = '';
        for (const a of (doc.attributes || [])) {
            if (a.fileName) fileName = a.fileName;
        }
        for (const a of (doc.attributes || [])) {
            if (a instanceof Api.DocumentAttributeVideo) {
                const isMkv = /matroska/.test(doc.mimeType || '') || /\.mkv$/i.test(fileName);
                return {
                    type: isMkv ? 'video_file' : 'video',
                    id: m.id, date: m.date, caption: m.message || '',
                    duration: a.duration || 0, width: a.w || 0, height: a.h || 0,
                    size: doc.size || 0, mimeType: doc.mimeType || 'video/mp4', fileName: fileName
                };
            }
            if (a instanceof Api.DocumentAttributeAudio) {
                return {
                    type: 'audio', id: m.id, date: m.date, caption: m.message || '',
                    duration: a.duration || 0, size: doc.size || 0,
                    mimeType: doc.mimeType || 'audio/mpeg', fileName: fileName
                };
            }
        }
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        const mime = (doc.mimeType || '').toLowerCase();
        if (ext === 'pdf' || /pdf/.test(mime)) {
            return { type: 'pdf', id: m.id, date: m.date, caption: m.message || '', size: doc.size || 0, mimeType: doc.mimeType || 'application/pdf', fileName: fileName };
        }
        if (['mkv', 'avi', 'webm', 'm4v'].indexOf(ext) !== -1) {
            return { type: 'video_file', id: m.id, date: m.date, caption: m.message || '', size: doc.size || 0, mimeType: doc.mimeType || 'video/x-matroska', fileName: fileName, duration: 0, width: 0, height: 0 };
        }
        const AUDIO_EXTS = ['mp3', 'm4a', 'm4b', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wav', 'wma', 'mka', 'mid', 'midi', 'amr', 'aiff', 'aif', 'mp2', 'ac3', 'ape', 'alac'];
        if (AUDIO_EXTS.indexOf(ext) !== -1 || /^audio\//.test(mime)) {
            return { type: 'audio', id: m.id, date: m.date, caption: m.message || '', size: doc.size || 0, mimeType: doc.mimeType || 'audio/mpeg', fileName: fileName, duration: 0 };
        }
    }
    return null;
}

// Remuxea MKV -> MP4 (solo cambia el contenedor, sin recodificar). Requiere ffmpeg.
function remuxMkv(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        cp.execFile('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath],
            { timeout: 0 }, (err) => {
                if (err) reject(err); else resolve();
            });
    });
}

// Devuelve el nombre del códec de video (ej: 'h264', 'hevc', 'vp9', 'av1'). Vacío si falla.
function probeVideoCodec(filePath) {
    return new Promise((resolve) => {
        cp.execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', filePath],
            { timeout: 20000 }, (err, stdout) => {
                if (err) { resolve(''); return; }
                resolve(String(stdout || '').trim().toLowerCase());
            });
    });
}

// Recodifica a H.264 + AAC (compatible con el TV). Requiere ffmpeg.
function transcodeToH264(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        cp.execFile('ffmpeg', ['-y', '-i', inputPath, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputPath],
            { timeout: 0 }, (err) => {
                if (err) reject(err); else resolve();
            });
    });
}

// Devuelve el nombre del códec de audio (ej: 'mp3', 'aac', 'flac', 'opus'). Vacío si falla.
function probeAudioCodec(filePath) {
    return new Promise((resolve) => {
        cp.execFile('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', filePath],
            { timeout: 20000 }, (err, stdout) => {
                if (err) { resolve(''); return; }
                resolve(String(stdout || '').trim().toLowerCase());
            });
    });
}

// Convierte audio a MP3 (compatible con el TV). Requiere ffmpeg.
function transcodeToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        cp.execFile('ffmpeg', ['-y', '-i', inputPath, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', outputPath],
            { timeout: 0 }, (err) => {
                if (err) reject(err); else resolve();
            });
    });
}

// Convierte SRT -> WebVTT para los subtítulos del reproductor.
function srtToVtt(srt) {
    if (/^\s*WEBVTT/i.test(srt)) return srt;
    let vtt = 'WEBVTT\n\n';
    vtt += srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return vtt;
}

// Elige una miniatura mediana ('m', ~800px) para que se vea nítida en la rejilla.
function pickThumb(m) {
    let sizes = [];
    if (m && m.media instanceof Api.MessageMediaPhoto && m.media.photo) {
        sizes = m.media.photo.sizes || [];
    } else if (m && m.media instanceof Api.MessageMediaDocument && m.media.document) {
        sizes = m.media.document.thumbs || [];
    }
    const valid = [];
    for (const s of sizes) {
        if (s instanceof Api.PhotoSize || s instanceof Api.PhotoSizeProgressive) {
            valid.push(s);
        }
    }
    if (!valid.length) return 0;
    for (const s of valid) {
        if (s.type === 'm') return s;
    }
    return valid[valid.length - 1];
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
        if (p === '/api/log' && req.method === 'POST') {
            let body = '';
            req.on('data', function (c) { body += c; });
            req.on('end', function () {
                logError('client', body);
                sendJson(res, 200, { ok: true });
            });
            return;
        }

        if (p === '/api/logs') {
            let content = '';
            try {
                const logPath = path.join(BASE, 'server.log');
                if (fs.existsSync(logPath)) content = fs.readFileSync(logPath, 'utf8');
            } catch (e) {}
            const lines = content.split('\n');
            sendJson(res, 200, { log: lines.slice(-300).join('\n') });
            return;
        }

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
            const main = [];
            const archived = [];
            let meId = null;
            try { const me = await client.getMe(); meId = me ? String(me.id) : null; } catch (e) {}
            for (const d of dialogs) {
                const e = d.entity;
                if (!e) continue;
                const isSaved = (e.className === 'User' && (e.self === true || (meId && String(e.id) === meId)));
                const isBot = (e.className === 'User' && e.bot === true);
                if (e.className === 'Channel' || e.className === 'Chat' || isSaved || isBot) {
                    const item = {
                        id: String(e.id),
                        className: e.className,
                        title: isSaved ? 'Saved Messages' : (e.title || e.firstName || e.username || d.title || ''),
                        username: e.username || '',
                        saved: isSaved,
                        bot: isBot
                    };
                    if (d.folderId === 1) archived.push(item);
                    else main.push(item);
                }
            }
            sendJson(res, 200, { dialogs: main, archived: archived });
            return;
        }

        if (p === '/api/messages') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const offsetId = Number(u.searchParams.get('offsetId') || 0) || 0;
            const entity = await getEntityById(chatId, className);
            const [pv, docs, music] = await Promise.all([
                client.getMessages(entity, { filter: new Api.InputMessagesFilterPhotoVideo(), limit: 100, offsetId: offsetId }),
                client.getMessages(entity, { filter: new Api.InputMessagesFilterDocument(), limit: 100, offsetId: offsetId }),
                client.getMessages(entity, { filter: new Api.InputMessagesFilterMusic(), limit: 100, offsetId: offsetId })
            ]);
            const seen = new Map();
            for (const m of pv) { const c = classifyMedia(m); if (c && !seen.has(c.id)) seen.set(c.id, c); }
            for (const m of docs) { const c = classifyMedia(m); if (c && !seen.has(c.id)) seen.set(c.id, c); }
            for (const m of music) { const c = classifyMedia(m); if (c && !seen.has(c.id)) seen.set(c.id, c); }
            const items = Array.from(seen.values()).sort((a, b) => b.id - a.id);
            sendJson(res, 200, { messages: items, title: entity.title || '' });
            return;
        }

        if (p === '/api/avatar') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const key = 'a:' + chatId + ':' + className;
            if (avatarCache.has(key)) { serveImage(res, avatarCache.get(key)); return; }
            const entity = await getEntityById(chatId, className);
            const buf = await client.downloadProfilePhoto(entity, { isBig: false });
            if (!buf || !buf.length) { res.writeHead(404); res.end('no avatar'); return; }
            cachePut(avatarCache, key, buf);
            serveImage(res, buf);
            return;
        }

        if (p === '/api/thumb') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const msgId = Number(u.searchParams.get('msgId') || 0);
            const key = 't:' + chatId + ':' + msgId;
            if (thumbCache.has(key)) { serveImage(res, thumbCache.get(key)); return; }
            const entity = await getEntityById(chatId, className);
            const msgs = await client.getMessages(entity, { ids: [msgId] });
            if (!msgs || !msgs.length) { res.writeHead(404); res.end('no msg'); return; }
            const buf = await client.downloadMedia(msgs[0], { thumb: pickThumb(msgs[0]) });
            if (!buf || !buf.length) { res.writeHead(404); res.end('no thumb'); return; }
            cachePut(thumbCache, key, buf);
            serveImage(res, buf);
            return;
        }

        if (p === '/api/photo') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const msgId = Number(u.searchParams.get('msgId') || 0);
            const entity = await getEntityById(chatId, className);
            const msgs = await client.getMessages(entity, { ids: [msgId] });
            if (!msgs || !msgs.length) { res.writeHead(404); res.end('no msg'); return; }
            const buf = await client.downloadMedia(msgs[0], {});
            if (!buf || !buf.length) { res.writeHead(404); res.end('no photo'); return; }
            serveImage(res, buf);
            return;
        }

        if (p === '/api/search') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const q = u.searchParams.get('q') || '';
            if (!q) { sendJson(res, 200, { messages: [] }); return; }
            const entity = await getEntityById(chatId, className);
            const result = await client.getMessages(entity, {
                filter: new Api.InputMessagesFilterPhotoVideo(),
                search: q,
                limit: 50
            });
            const items = [];
            for (const m of result) {
                const mi = classifyMedia(m);
                if (mi) items.push(mi);
            }
            sendJson(res, 200, { messages: items, title: entity.title || '' });
            return;
        }

        if (p === '/api/searchGlobal') {
            const q = u.searchParams.get('q') || '';
            if (!q) { sendJson(res, 200, { messages: [] }); return; }
            const dialogs = await client.getDialogs({});
            let meId = null;
            try { const me = await client.getMe(); meId = me ? String(me.id) : null; } catch (e) {}
            const results = [];
            for (const d of dialogs) {
                const e = d.entity;
                if (!e) continue;
                const isSaved = (e.className === 'User' && (e.self === true || (meId && String(e.id) === meId)));
                const isBot = (e.className === 'User' && e.bot === true);
                if (e.className !== 'Channel' && e.className !== 'Chat' && !isSaved && !isBot) continue;
                try {
                    const msgs = await client.getMessages(e, { filter: new Api.InputMessagesFilterPhotoVideo(), search: q, limit: 5 });
                    for (const m of msgs) {
                        const c = classifyMedia(m);
                        if (c) {
                            c.chatId = String(e.id);
                            c.className = e.className;
                            c.chatTitle = isSaved ? 'Saved Messages' : (e.title || e.firstName || e.username || d.title || '');
                            results.push(c);
                        }
                    }
                } catch (err) {}
            }
            results.sort((a, b) => b.id - a.id);
            sendJson(res, 200, { messages: results.slice(0, 80) });
            return;
        }

        if (p === '/api/subtitles') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const entity = await getEntityById(chatId, className);
            const result = await client.getMessages(entity, { filter: new Api.InputMessagesFilterDocument(), limit: 100 });
            const subs = [];
            for (const m of result) {
                const doc = m.media && m.media.document;
                if (!doc) continue;
                let name = '';
                for (const a of (doc.attributes || [])) if (a.fileName) name = a.fileName;
                if (/\.(srt|ass|vtt)$/i.test(name)) {
                    subs.push({ id: m.id, fileName: name, date: m.date });
                }
            }
            sendJson(res, 200, { subtitles: subs });
            return;
        }

        if (p === '/api/subtitle') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const msgId = Number(u.searchParams.get('msgId') || 0);
            const entity = await getEntityById(chatId, className);
            const msgs = await client.getMessages(entity, { ids: [msgId] });
            if (!msgs || !msgs.length) { res.writeHead(404); res.end('no msg'); return; }
            const buf = await client.downloadMedia(msgs[0], {});
            if (!buf || !buf.length) { res.writeHead(404); res.end('no sub'); return; }
            const vtt = srtToVtt(buf.toString('utf8'));
            res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Content-Length': Buffer.byteLength(vtt) });
            res.end(vtt);
            return;
        }

        if (p === '/api/audio') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const msgId = Number(u.searchParams.get('msgId') || 0);
            const entity = await getEntityById(chatId, className);
            const msgs = await client.getMessages(entity, { ids: [msgId] });
            if (!msgs || !msgs.length) { res.writeHead(404); res.end('no msg'); return; }
            const msg = msgs[0];
            const ai = classifyMedia(msg);
            if (!ai || ai.type !== 'audio') { res.writeHead(404); res.end('not audio'); return; }
            const base = crypto.createHash('md5').update(chatId + ':' + msgId).digest('hex');
            const filePath = path.join(CACHE_DIR, base + '.audio');
            if (!fs.existsSync(filePath)) {
                await ensureDownloaded(msg, filePath);
            }
            fs.utimes(filePath, new Date(), new Date(), function () {});
            // Detecta el códec real y convierte a MP3 si el TV no lo soporta.
            // Con native=1 (TV moderno) se sirve el audio tal cual, sin transcodificar.
            const native = u.searchParams.get('native') === '1';
            const codec = await probeAudioCodec(filePath);
            logError('audio', 'codec=' + codec + ' native=' + native + ' mime=' + ai.mimeType + ' msgId=' + msgId);
            const SAFE = ['mp3', 'aac', 'vorbis'];
            if (!native && codec && SAFE.indexOf(codec) === -1) {
                const mp3Path = path.join(CACHE_DIR, base + '.mp3');
                if (!fs.existsSync(mp3Path)) {
                    logError('audio', 'convirtiendo a MP3 codec=' + codec + ' msgId=' + msgId);
                    try {
                        await transcodeToMp3(filePath, mp3Path);
                    } catch (e) {
                        logError('audio', 'transcode fallido: ' + e.message);
                        serveFileWithRange(res, filePath, ai.mimeType, req);
                        return;
                    }
                }
                fs.utimes(mp3Path, new Date(), new Date(), function () {});
                serveFileWithRange(res, mp3Path, 'audio/mpeg', req);
                return;
            }
            // Ajusta el mime al códec real para que el TV lo decodifique bien.
            let mime = ai.mimeType;
            if (codec === 'mp3') mime = 'audio/mpeg';
            else if (codec === 'aac') mime = 'audio/mp4';
            else if (codec === 'vorbis' || codec === 'opus') mime = 'audio/ogg';
            else if (codec === 'flac') mime = 'audio/flac';
            else if (codec === 'wav' || codec === 'pcm_s16le') mime = 'audio/wav';
            serveFileWithRange(res, filePath, mime, req);
            return;
        }

        if (p === '/api/pdfinfo') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const msgId = Number(u.searchParams.get('msgId') || 0);
            const entity = await getEntityById(chatId, className);
            const msgs = await client.getMessages(entity, { ids: [msgId] });
            if (!msgs || !msgs.length) { res.writeHead(404); res.end('no msg'); return; }
            const msg = msgs[0];
            const base = crypto.createHash('md5').update(chatId + ':' + msgId).digest('hex');
            const pdfPath = path.join(CACHE_DIR, base + '.pdf');
            if (!fs.existsSync(pdfPath)) {
                try {
                    await ensureDownloaded(msg, pdfPath);
                } catch (e) {
                    logError('pdfinfo', 'download failed: ' + e.message);
                    sendJson(res, 500, { error: 'PDF download failed' });
                    return;
                }
            }
            function readPages() {
                const out = cp.execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8', timeout: 30000 });
                const m = /Pages:\s+(\d+)/.exec(out);
                return m ? (parseInt(m[1], 10) || 1) : 1;
            }
            let pages = 1;
            try {
                pages = readPages();
            } catch (e) {
                logError('pdfinfo', 'pdfinfo failed: ' + e.message);
                if (e.code !== 'ENOENT') {
                    // PDF parcial/corrupto de una descarga anterior: bórralo y reintenta una vez.
                    try { fs.unlinkSync(pdfPath); } catch (e2) {}
                    try {
                        await ensureDownloaded(msg, pdfPath);
                        pages = readPages();
                    } catch (e3) {
                        logError('pdfinfo', 'retry failed: ' + e3.message);
                    }
                }
            }
            sendJson(res, 200, { pages: pages });
            return;
        }

        if (p === '/api/pdf') {
            const chatId = u.searchParams.get('chat');
            const className = u.searchParams.get('className') || 'Channel';
            const msgId = Number(u.searchParams.get('msgId') || 0);
            const page = Number(u.searchParams.get('page') || 1);
            const isThumb = u.searchParams.get('thumb') === '1';
            const dpi = isThumb ? '40' : '150';
            const thumbSuffix = '_t2';
            const entity = await getEntityById(chatId, className);
            const msgs = await client.getMessages(entity, { ids: [msgId] });
            if (!msgs || !msgs.length) { res.writeHead(404); res.end('no msg'); return; }
            const msg = msgs[0];
            const base = crypto.createHash('md5').update(chatId + ':' + msgId).digest('hex');
            const pdfPath = path.join(CACHE_DIR, base + '.pdf');
            let imgPath = path.join(CACHE_DIR, base + '_p' + page + (isThumb ? thumbSuffix : '') + '.jpg');
            if (!fs.existsSync(pdfPath)) {
                try {
                    await ensureDownloaded(msg, pdfPath);
                } catch (e) {
                    logError('pdf', 'download failed: ' + e.message);
                    sendJson(res, 500, { error: 'PDF download failed' });
                    return;
                }
            }
            if (!fs.existsSync(imgPath)) {
                // Prefijo único para evitar colisiones si dos peticiones piden la misma página a la vez.
                const prefix = path.join(CACHE_DIR, base + '_p' + page + (isThumb ? thumbSuffix : '') + '_tmp' + Date.now() + Math.floor(Math.random() * 1000));
                let found = null;
                try {
                    found = await renderPdfPage(pdfPath, prefix, page, dpi, isThumb);
                } catch (e) {
                    logError('pdf', 'pdftoppm failed page=' + page + ': ' + e.message);
                    if (e.code !== 'ENOENT') {
                        // PDF parcial/corrupto de una descarga anterior: bórralo y reintenta una vez.
                        try { fs.unlinkSync(pdfPath); } catch (e2) {}
                        try {
                            await ensureDownloaded(msg, pdfPath);
                            found = await renderPdfPage(pdfPath, prefix, page, dpi, isThumb);
                        } catch (e3) {
                            logError('pdf', 'retry failed page=' + page + ': ' + e3.message);
                        }
                    }
                }
                if (found) {
                    try { fs.renameSync(found, imgPath); } catch (e) {
                        logError('pdf', 'rename failed: ' + e.message);
                        if (fs.existsSync(found)) imgPath = found;
                    }
                }
            }
            if (!fs.existsSync(imgPath)) { logError('pdf', 'pdftoppm no genero imagen para page=' + page); res.writeHead(500); res.end('pdf convert failed'); return; }
            serveImage(res, fs.readFileSync(imgPath));
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
            const vi = classifyMedia(msg);
            logError('video', 'msgId=' + msgId + ' chat=' + chatId + ' type=' + (vi && vi.type) + ' mime=' + (vi && vi.mimeType));
            if (!vi || (vi.type !== 'video' && vi.type !== 'video_file')) { res.writeHead(404); res.end('not a video'); return; }
            const base = crypto.createHash('md5').update(chatId + ':' + msgId).digest('hex');
            const fileName = base + '.mp4';
            const filePath = path.join(CACHE_DIR, fileName);
            if (!fs.existsSync(filePath)) {
                if (vi.type === 'video_file') {
                    const mkvPath = path.join(CACHE_DIR, base + '.mkv');
                    if (!fs.existsSync(mkvPath)) {
                        await ensureDownloaded(msg, mkvPath);
                    }
                    try {
                        await remuxMkv(mkvPath, filePath);
                        try { fs.unlinkSync(mkvPath); } catch (e) {}
                    } catch (e) {
                        try { fs.unlinkSync(mkvPath); } catch (e2) {}
                        sendJson(res, 500, { error: 'No se pudo convertir el MKV. Instala ffmpeg en el teléfono (pkg install ffmpeg) y verifica que el video sea H.264/AAC.' });
                        return;
                    }
                } else {
                    await ensureDownloaded(msg, filePath);
                }
            }
            fs.utimes(filePath, new Date(), new Date(), function () {});
            // Detecta códecs que el TV no reproduce (H.265/HEVC, VP9, AV1...) y los convierte a H.264.
            // Si el cliente manda native=1 (TV moderno), se sirve el archivo tal cual sin transcodificar.
            const native = u.searchParams.get('native') === '1';
            const codec = await probeVideoCodec(filePath);
            logError('video', 'codec=' + codec + ' native=' + native + ' msgId=' + msgId + ' chat=' + chatId);
            if (!native && codec && codec !== 'h264' && codec !== 'avc' && codec !== 'avc1') {
                const h264Path = path.join(CACHE_DIR, base + '.h264.mp4');
                if (!fs.existsSync(h264Path)) {
                    logError('video', 'transcodificando a H.264 msgId=' + msgId);
                    try {
                        await transcodeToH264(filePath, h264Path);
                    } catch (e) {
                        logError('video', 'transcode fallido: ' + e.message);
                        serveFileWithRange(res, filePath, 'video/mp4', req);
                        return;
                    }
                }
                fs.utimes(h264Path, new Date(), new Date(), function () {});
                serveFileWithRange(res, h264Path, 'video/mp4', req);
                return;
            }
            serveFileWithRange(res, filePath, 'video/mp4', req);
            return;
        }

        sendJson(res, 404, { error: 'not_found' });
    } catch (e) {
        logError('server', e && e.stack ? e.stack : String(e));
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
