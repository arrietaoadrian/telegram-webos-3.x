'use strict';

/*
 * Telegram TV backend — runs on Termux (Android) or any modern Node.js machine.
 * Talks to Telegram (MTProto), produces the QR login, lists your chats and
 * serves the media over HTTP for the TV app to play.
 *
 * Configuration: edit config.json with your apiId and apiHash (from my.telegram.org).
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
    console.error('ERROR: could not read config.json');
    process.exit(1);
}

if (!config.apiId || !config.apiHash || config.apiHash === 'PON_AQUI_TU_API_HASH') {
    console.error('ERROR: edit config.json with your real apiId and apiHash.');
    process.exit(1);
}

const PORT = config.port || 8080;
const API_ID = Number(config.apiId);
const API_HASH = String(config.apiHash);

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// Media is temporary: deleted automatically.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes without use

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

// ===== Persistent session =====
let sessionString = fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, 'utf8').trim() : '';
const stringSession = new StringSession(sessionString);
const client = new TelegramClient(stringSession, API_ID, API_HASH, { connectionRetries: 5 });

function saveSession() {
    try { fs.writeFileSync(SESSION_FILE, stringSession.save()); } catch (e) {}
}

// ===== Login state =====
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

// In-memory caches for avatars and thumbnails (so they are not re-downloaded on every render).
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

// ===== Utilities =====
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

// Serve a file with range support (for streaming/seeking)
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
        if (['mkv', 'avi', 'webm', 'm4v'].indexOf(ext) !== -1) {
            return { type: 'video_file', id: m.id, date: m.date, caption: m.message || '', size: doc.size || 0, mimeType: doc.mimeType || 'video/x-matroska', fileName: fileName, duration: 0, width: 0, height: 0 };
        }
        if (['mp3', 'm4a', 'ogg', 'opus', 'flac', 'wav'].indexOf(ext) !== -1) {
            return { type: 'audio', id: m.id, date: m.date, caption: m.message || '', size: doc.size || 0, mimeType: doc.mimeType || 'audio/mpeg', fileName: fileName, duration: 0 };
        }
    }
    return null;
}

// Remux MKV -> MP4 (container-only, no re-encode). Requires ffmpeg.
function remuxMkv(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        cp.execFile('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath],
            { timeout: 0 }, (err) => {
                if (err) reject(err); else resolve();
            });
    });
}

// Convert SRT -> WebVTT for the player's subtitles.
function srtToVtt(srt) {
    if (/^\s*WEBVTT/i.test(srt)) return srt;
    let vtt = 'WEBVTT\n\n';
    vtt += srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return vtt;
}

// Pick a medium thumbnail ('m', ~800px) so it looks sharp in the grid.
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
    throw new Error('unknown type: ' + className);
}

// ===== HTTP server =====
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

        // ===== Routes that require a session =====
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
                if (e.className === 'Channel' || e.className === 'Chat' || isSaved) {
                    const item = {
                        id: String(e.id),
                        className: e.className,
                        title: isSaved ? 'Saved Messages' : (e.title || d.title || ''),
                        username: e.username || '',
                        saved: isSaved
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
            const [pv, docs] = await Promise.all([
                client.getMessages(entity, { filter: new Api.InputMessagesFilterPhotoVideo(), limit: 100, offsetId: offsetId }),
                client.getMessages(entity, { filter: new Api.InputMessagesFilterDocument(), limit: 100, offsetId: offsetId })
            ]);
            const seen = new Map();
            for (const m of pv) { const c = classifyMedia(m); if (c && !seen.has(c.id)) seen.set(c.id, c); }
            for (const m of docs) { const c = classifyMedia(m); if (c && !seen.has(c.id)) seen.set(c.id, c); }
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
                if (e.className !== 'Channel' && e.className !== 'Chat' && !isSaved) continue;
                try {
                    const msgs = await client.getMessages(e, { filter: new Api.InputMessagesFilterPhotoVideo(), search: q, limit: 5 });
                    for (const m of msgs) {
                        const c = classifyMedia(m);
                        if (c) {
                            c.chatId = String(e.id);
                            c.className = e.className;
                            c.chatTitle = isSaved ? 'Saved Messages' : (e.title || d.title || '');
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
            const fileName = crypto.createHash('md5').update(chatId + ':' + msgId).digest('hex') + '.mp3';
            const filePath = path.join(CACHE_DIR, fileName);
            if (!fs.existsSync(filePath)) {
                await client.downloadMedia(msg, { outputFile: filePath });
            }
            fs.utimes(filePath, new Date(), new Date(), function () {});
            serveFileWithRange(res, filePath, ai.mimeType, req);
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
            if (!vi || (vi.type !== 'video' && vi.type !== 'video_file')) { res.writeHead(404); res.end('not a video'); return; }
            const base = crypto.createHash('md5').update(chatId + ':' + msgId).digest('hex');
            const fileName = base + '.mp4';
            const filePath = path.join(CACHE_DIR, fileName);
            if (!fs.existsSync(filePath)) {
                if (vi.type === 'video_file') {
                    const mkvPath = path.join(CACHE_DIR, base + '.mkv');
                    if (!fs.existsSync(mkvPath)) {
                        await client.downloadMedia(msg, { outputFile: mkvPath });
                    }
                    try {
                        await remuxMkv(mkvPath, filePath);
                        try { fs.unlinkSync(mkvPath); } catch (e) {}
                    } catch (e) {
                        try { fs.unlinkSync(mkvPath); } catch (e2) {}
                        sendJson(res, 500, { error: 'Could not convert the MKV. Install ffmpeg on the phone (pkg install ffmpeg) and make sure the video is H.264/AAC.' });
                        return;
                    }
                } else {
                    await client.downloadMedia(msg, { outputFile: filePath });
                }
            }
            fs.utimes(filePath, new Date(), new Date(), function () {});
            serveFileWithRange(res, filePath, 'video/mp4', req);
            return;
        }

        sendJson(res, 404, { error: 'not_found' });
    } catch (e) {
        sendJson(res, 500, { error: e.message || String(e) });
    }
});

server.listen(PORT, '0.0.0.0', function () {
    console.log('Telegram TV backend listening on http://0.0.0.0:' + PORT);
    console.log('On the TV use: http://PHONE_IP:' + PORT);
});

// Clean up temporary media: at startup and every 10 minutes.
cleanupCache();
setInterval(cleanupCache, 10 * 60 * 1000);

// On startup, try to validate the saved session
(async function () {
    try {
        await client.connect();
        const auth = await client.checkAuthorization();
        loggedIn = auth;
        if (auth) {
            try { meInfo = await client.getMe(); } catch (e) {}
            console.log('Valid existing session. User:', meInfo ? meInfo.username : '?');
        } else {
            console.log('No session. The app will show the QR to sign in.');
        }
    } catch (e) {
        console.log('Startup notice:', e.message);
    }
})();
