(function () {
  'use strict';

  var BACKEND = null;
  var screen = 'setup';
  var curChat = null, curClassName = null, curChatTitle = '';
  var lastList = 'channels';
  var pollTimer = null, qrTimer = null;
  var messages = [];
  var offsetId = 0;
  var progress = {};
  var subList = [];
  var activeSub = null;
  var photoIndex = 0;
  var photoList = [];
  var photoZoom = 1;
  var playingType = 'video';
  var curMsgId = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    s = String(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function enc(s) { return encodeURIComponent(s); }
  function findUp(el, attr) {
    while (el && el !== document) {
      if (el.getAttribute && el.getAttribute(attr) !== null && el.getAttribute(attr) !== '') return el;
      el = el.parentNode;
    }
    return null;
  }
  function fmtDur(s) {
    s = Math.floor(s || 0);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function fmtSize(b) {
    b = b || 0;
    if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return Math.round(b / 1024) + ' KB';
    return b + ' B';
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000);
    if (isNaN(d.getTime())) return '';
    var months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var hh = d.getHours(), mm = d.getMinutes();
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  // ===== Progreso de reproducción (localStorage) =====
  function loadProgress() {
    try {
      var s = localStorage.getItem('tg_progress');
      progress = s ? JSON.parse(s) : {};
    } catch (e) { progress = {}; }
  }
  function saveProgress() {
    try { localStorage.setItem('tg_progress', JSON.stringify(progress)); } catch (e) {}
  }
  function progKey(chatId, msgId) { return chatId + ':' + msgId; }

  function showLoading(on) { $('loading').className = on ? '' : 'hidden'; }

  function setView(name) {
    $('view-setup').className = 'view' + (name === 'setup' ? '' : ' hidden');
    $('view-login').className = 'view' + (name === 'login' ? '' : ' hidden');
    $('view-pass').className = 'view' + (name === 'pass' ? '' : ' hidden');
    $('view-main').className = 'view' + (name === 'main' ? '' : ' hidden');
    $('view-player').className = 'view' + (name === 'player' ? '' : ' hidden');
    $('view-photo').className = 'view' + (name === 'photo' ? '' : ' hidden');
    screen = name;
  }

  function setTopbar(opts) {
    $('main-title').textContent = opts.title || 'Canales';
    $('btn-archive').className = 'btn focusable' + (opts.showArchive ? '' : ' hidden');
    if (opts.archiveLabel) $('btn-archive').textContent = opts.archiveLabel;
    $('search-input').value = '';
  }

  function stopPolling() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
  }

  function api(path, method, body, cb) {
    var xhr = new XMLHttpRequest();
    var m = method || 'GET';
    xhr.open(m, BACKEND + path, true);
    if (body) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) cb(null, data);
        else cb(new Error('HTTP ' + xhr.status + (data && data.error ? ' ' + data.error : '')), data);
      }
    };
    xhr.onerror = function () { cb(new Error('Sin conexión con el servidor (' + BACKEND + ')'), null); };
    try { xhr.send(body ? JSON.stringify(body) : null); } catch (e) { cb(e, null); }
  }

  function apiText(path, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BACKEND + path, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) cb(null, xhr.responseText);
        else cb(new Error('HTTP ' + xhr.status), null);
      }
    };
    xhr.onerror = function () { cb(new Error('Sin conexión'), null); };
    xhr.send(null);
  }

  // ===== Setup =====
  function doSetup() {
    var u = $('setup-url').value.trim().replace(/\/+$/, '');
    if (!u) { $('setup-msg').textContent = 'Ingresa la dirección del servidor.'; return; }
    BACKEND = u;
    try { localStorage.setItem('tg_backend', BACKEND); } catch (e) {}
    $('setup-msg').textContent = '';
    showLoading(true);
    api('/api/status', 'GET', null, function (err, data) {
      showLoading(false);
      if (err) { $('setup-msg').textContent = err.message; return; }
      if (data.loggedIn) showChannels(); else showLogin();
    });
  }

  // ===== Login =====
  function showLogin() {
    setView('login');
    stopPolling();
    $('login-msg').textContent = 'Cargando QR...';
    api('/api/login', 'POST', null, function (err) {
      if (err) { $('login-msg').textContent = err.message; return; }
      $('login-msg').textContent = '';
      refreshQr();
      qrTimer = setInterval(refreshQr, 5000);
      pollLogin();
    });
  }
  function refreshQr() { if (BACKEND) $('qr-img').src = BACKEND + '/api/qr.png?t=' + Date.now(); }
  function pollLogin() {
    api('/api/status', 'GET', null, function (err, data) {
      if (err) { $('login-msg').textContent = err.message; pollTimer = setTimeout(pollLogin, 4000); return; }
      if (data.loggedIn) { stopPolling(); showChannels(); return; }
      if (data.needPassword) { stopPolling(); setView('pass'); $('pass-input').focus(); return; }
      if (data.error) { $('login-msg').textContent = data.error; }
      pollTimer = setTimeout(pollLogin, 2000);
    });
  }
  function doPassword() {
    var pw = $('pass-input').value;
    if (!pw) { $('pass-msg').textContent = 'Ingresa tu contraseña.'; return; }
    $('pass-msg').textContent = 'Verificando...';
    api('/api/password', 'POST', { password: pw }, function (err) {
      if (err) { $('pass-msg').textContent = err.message; return; }
      $('pass-msg').textContent = '';
      $('pass-input').value = '';
      showLogin();
    });
  }

  // ===== Canales / Archivados =====
  function showChannels() {
    lastList = 'channels';
    curChat = null;
    setView('main');
    setTopbar({ title: 'Canales', showArchive: true, archiveLabel: 'Archivados' });
    loadDialogs(false);
  }
  function showArchived() {
    lastList = 'archived';
    curChat = null;
    setView('main');
    setTopbar({ title: 'Archivados', showArchive: true, archiveLabel: 'Canales' });
    loadDialogs(true);
  }
  function loadDialogs(archivedOnly) {
    showLoading(true);
    api('/api/dialogs', 'GET', null, function (err, data) {
      showLoading(false);
      if (err) { $('main-content').innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; return; }
      var list = archivedOnly ? (data.archived || []) : (data.dialogs || []);
      if (!list.length) {
        $('main-content').innerHTML = '<div class="empty">' + (archivedOnly ? 'No hay chats archivados.' : 'No se encontraron canales.') + '</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var initial = (c.title || '?').charAt(0).toUpperCase();
        var avatarSrc = BACKEND + '/api/avatar?chat=' + enc(c.id) + '&className=' + enc(c.className);
        var savedCls = c.saved ? ' saved' : '';
        html += '<div class="row focusable' + savedCls + '" tabindex="0" data-action="chat" data-chat="' + esc(c.id) + '" data-class="' + esc(c.className) + '" data-title="' + esc(c.title || '') + '">'
          + '<div class="avatar"><span class="letter">' + esc(initial) + '</span><img src="' + esc(avatarSrc) + '" onerror="this.remove()" alt=""></div>'
          + '<div><div class="row-title">' + esc(c.title || c.username || c.id) + '</div>'
          + '<div class="row-sub">' + (c.saved ? 'Tus mensajes guardados' : (c.username ? '@' + esc(c.username) : 'Canal')) + '</div></div></div>';
      }
      $('main-content').innerHTML = html;
      focusFirst();
    });
  }

  // ===== Chat (mensajes) =====
  function openChat(chat, className, title) {
    curChat = chat;
    curClassName = className;
    curChatTitle = title;
    messages = [];
    offsetId = 0;
    subList = [];
    activeSub = null;
    setView('main');
    setTopbar({ title: title || 'Videos', showArchive: false });
    loadMessages('');
  }

  function renderGrid(list, showBack, showLoadMore, query) {
    var html = '';
    if (showBack) {
      html += '<div class="row focusable" tabindex="0" data-action="back-list"><div class="avatar" style="background:#444"><span class="letter">&#8592;</span></div><div><div class="row-title">' + (query ? 'Volver a todos' : 'Volver a canales') + '</div></div></div>';
    }
    if (!list.length) {
      html += '<div class="empty">' + (query ? 'Sin resultados para "' + esc(query) + '".' : 'No hay medios en este chat.') + '</div>';
    } else {
      html += '<div class="grid">';
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        var cap = v.caption ? v.caption.replace(/\s+/g, ' ').substring(0, 90) : '';
        var thumb = BACKEND + '/api/thumb?chat=' + enc(v.chatId || curChat) + '&className=' + enc(v.className || curClassName) + '&msgId=' + v.id;
        var chatLabel = v.chatTitle ? '<div class="vmeta">' + esc(v.chatTitle) + '</div>' : '';
        var progBar = '';
        var k = progKey(v.chatId || curChat, v.id);
        if ((v.type === 'video' || v.type === 'video_file') && progress[k] && v.duration) {
          var pct = Math.min(100, (progress[k] / v.duration) * 100);
          progBar = '<div class="vprogress"><div class="vprogress-fill" style="width:' + pct + '%"></div></div>';
        }
        var dateStr = fmtDate(v.date);
        if (v.type === 'photo') {
          html += '<div class="vcard focusable" tabindex="0" data-action="photo" data-msg="' + v.id + '">'
            + '<div class="vthumb"><img src="' + esc(thumb) + '" alt=""><span class="tag">Foto</span></div>'
            + '<div class="vtitle">' + (cap || ('Foto ' + (i + 1))) + '</div>'
            + chatLabel + '<div class="vmeta">' + dateStr + '</div></div>';
        } else if (v.type === 'audio') {
          html += '<div class="vcard focusable" tabindex="0" data-action="audio" data-msg="' + v.id + '">'
            + '<div class="vthumb"><span class="vplay">&#9835;</span><span class="tag">' + fmtDur(v.duration) + '</span></div>'
            + '<div class="vtitle">' + (cap || ('Canción ' + (i + 1))) + '</div>'
            + chatLabel + '<div class="vmeta">' + dateStr + ' · ' + fmtSize(v.size) + '</div></div>';
        } else {
          var isMkv = (v.type === 'video_file');
          var tag = isMkv ? 'MKV · ' + fmtDur(v.duration) : fmtDur(v.duration);
          html += '<div class="vcard focusable" tabindex="0" data-action="play" data-msg="' + v.id + '">'
            + '<div class="vthumb"><img src="' + esc(thumb) + '" onerror="this.style.display=\'none\'" alt=""><span class="vplay">&#9654;</span><span class="tag">' + tag + '</span>' + progBar + '</div>'
            + '<div class="vtitle">' + (cap || ('Video ' + (i + 1))) + '</div>'
            + chatLabel + '<div class="vmeta">' + dateStr + ' · ' + fmtSize(v.size) + '</div></div>';
        }
      }
      html += '</div>';
      if (showLoadMore) {
        html += '<div class="row focusable" tabindex="0" data-action="more"><div class="avatar" style="background:#444"><span class="letter">+</span></div><div><div class="row-title">Cargar más</div></div></div>';
      }
    }
    $('main-content').innerHTML = html;
    focusFirst();
  }

  function loadMessages(query) {
    showLoading(true);
    var path = query
      ? '/api/search?chat=' + enc(curChat) + '&className=' + enc(curClassName) + '&q=' + enc(query)
      : '/api/messages?chat=' + enc(curChat) + '&className=' + enc(curClassName);
    api(path, 'GET', null, function (err, data) {
      showLoading(false);
      if (err) { $('main-content').innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; return; }
      messages = (data && data.messages) ? data.messages : [];
      offsetId = messages.length ? messages[messages.length - 1].id : 0;
      renderGrid(messages, true, !query && messages.length >= 100, query);
      loadSubs();
    });
  }

  function loadMore() {
    if (!curChat || !offsetId) return;
    showLoading(true);
    api('/api/messages?chat=' + enc(curChat) + '&className=' + enc(curClassName) + '&offsetId=' + offsetId, 'GET', null, function (err, data) {
      showLoading(false);
      if (err) return;
      var more = (data && data.messages) ? data.messages : [];
      var seen = {};
      for (var i = 0; i < messages.length; i++) seen[messages[i].id] = true;
      for (var j = 0; j < more.length; j++) { if (!seen[more[j].id]) { messages.push(more[j]); seen[more[j].id] = true; } }
      messages.sort(function (a, b) { return b.id - a.id; });
      offsetId = messages.length ? messages[messages.length - 1].id : 0;
      renderGrid(messages, true, more.length >= 100, '');
    });
  }

  function loadSubs() {
    if (!curChat) return;
    api('/api/subtitles?chat=' + enc(curChat) + '&className=' + enc(curClassName), 'GET', null, function (err, data) {
      if (!err) subList = (data && data.subtitles) ? data.subtitles : [];
    });
  }

  // ===== Búsqueda global =====
  function doGlobalSearch(q) {
    if (!q) { if (lastList === 'archived') loadDialogs(true); else loadDialogs(false); return; }
    showLoading(true);
    api('/api/searchGlobal?q=' + enc(q), 'GET', null, function (err, data) {
      showLoading(false);
      if (err) { $('main-content').innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; return; }
      var list = (data && data.messages) ? data.messages : [];
      renderGrid(list, true, false, q);
    });
  }

  function doSearch() {
    var q = $('search-input').value.trim();
    if (curChat) { if (!q) { loadMessages(''); return; } loadMessages(q); }
    else doGlobalSearch(q);
  }

  // ===== Fotos =====
  function openPhoto(msgId) {
    photoList = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (m.type === 'photo') photoList.push({ id: m.id, chatId: m.chatId || curChat, className: m.className || curClassName, caption: m.caption });
    }
    photoIndex = 0;
    for (var j = 0; j < photoList.length; j++) { if (photoList[j].id === Number(msgId)) { photoIndex = j; break; } }
    photoZoom = 1;
    renderPhoto();
    setView('photo');
  }
  function renderPhoto() {
    var p = photoList[photoIndex];
    if (!p) return;
    $('photo-img').src = BACKEND + '/api/photo?chat=' + enc(p.chatId) + '&className=' + enc(p.className) + '&msgId=' + p.id;
    $('photo-img').style.transform = 'scale(' + photoZoom + ')';
    $('photo-caption').textContent = (p.caption || '') + ' (' + (photoIndex + 1) + '/' + photoList.length + ')';
  }
  function zoomPhoto(delta) {
    photoZoom = Math.max(1, Math.min(5, photoZoom + delta));
    renderPhoto();
  }
  function nextPhoto(dir) {
    if (!photoList.length) return;
    photoIndex += dir;
    if (photoIndex < 0) photoIndex = 0;
    if (photoIndex >= photoList.length) photoIndex = photoList.length - 1;
    photoZoom = 1;
    renderPhoto();
  }

  // ===== Reproductor =====
  function playVideo(msgId) {
    var item = null;
    for (var i = 0; i < messages.length; i++) if (messages[i].id === Number(msgId)) { item = messages[i]; break; }
    playingType = item ? item.type : 'video';
    curMsgId = Number(msgId);
    var url = BACKEND + '/api/video?chat=' + enc(curChat) + '&className=' + enc(curClassName) + '&msgId=' + enc(String(msgId));
    $('player-title').textContent = curChatTitle || '';
    $('player-msg').textContent = (playingType === 'video_file') ? 'Convirtiendo MKV (puede tardar)...' : 'Cargando video...';
    var v = $('video');
    try { v.pause(); } catch (e) {}
    removeSubtitleTracks();
    v.removeAttribute('src');
    try { v.load(); } catch (e) {}
    v.src = url;
    $('btn-playpause').textContent = 'Pausa';
    $('player-time').textContent = '0:00 / 0:00';
    $('pbar-fill').style.width = '0%';
    var key = progKey(curChat, msgId);
    var resume = progress[key] || 0;
    var didSeek = false;
    function onLoaded() {
      $('player-msg').textContent = '';
      if (resume > 15 && v.duration && resume < v.duration * 0.95 && !didSeek) {
        didSeek = true;
        v.currentTime = resume;
        updatePlayerTime();
      }
      attachSubtitles();
    }
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('playing', function () { $('player-msg').textContent = ''; });
    v.addEventListener('error', function () { $('player-msg').textContent = 'No se pudo reproducir. Si es MKV, verifica tener ffmpeg y que sea H.264/AAC.'; });
    try { v.play(); } catch (e) {}
    setView('player');
  }
  function removeSubtitleTracks() {
    var v = $('video');
    var tracks = v.querySelectorAll('track');
    for (var i = 0; i < tracks.length; i++) v.removeChild(tracks[i]);
    activeSub = null;
  }
  function attachSubtitles() {
    if (!subList.length) return;
    var v = $('video');
    var chosen = subList[0];
    var vidName = (curChatTitle || '').toLowerCase();
    for (var i = 0; i < subList.length; i++) {
      var n = (subList[i].fileName || '').toLowerCase().replace(/\.(srt|ass|vtt)$/i, '');
      if (n && vidName && (vidName.indexOf(n) !== -1 || n.indexOf(vidName) !== -1)) { chosen = subList[i]; break; }
    }
    apiText('/api/subtitle?chat=' + enc(curChat) + '&className=' + enc(curClassName) + '&msgId=' + chosen.id, function (err, vtt) {
      if (err) return;
      try {
        var blob = new Blob([vtt], { type: 'text/vtt' });
        var url = URL.createObjectURL(blob);
        var track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Español';
        track.srclang = 'es';
        track.src = url;
        track.default = true;
        v.appendChild(track);
        for (var j = 0; j < v.textTracks.length; j++) {
          if (v.textTracks[j].kind === 'subtitles') v.textTracks[j].mode = 'showing';
        }
      } catch (e) {}
    });
  }
  function playAudio(msgId) {
    playingType = 'audio';
    curMsgId = Number(msgId);
    var url = BACKEND + '/api/audio?chat=' + enc(curChat) + '&className=' + enc(curClassName) + '&msgId=' + enc(String(msgId));
    $('player-title').textContent = curChatTitle || '';
    $('player-msg').textContent = 'Cargando música...';
    var v = $('video');
    try { v.pause(); } catch (e) {}
    removeSubtitleTracks();
    v.removeAttribute('src');
    try { v.load(); } catch (e) {}
    v.src = url;
    v.addEventListener('playing', function () { $('player-msg').textContent = ''; });
    $('btn-playpause').textContent = 'Pausa';
    $('player-time').textContent = '0:00 / 0:00';
    $('pbar-fill').style.width = '0%';
    try { v.play(); } catch (e) {}
    setView('player');
  }
  function exitPlayer() {
    saveCurProgress();
    var v = $('video');
    try { v.pause(); } catch (e) {}
    v.removeAttribute('src');
    setView('main');
    focusFirst();
  }
  function updatePlayerTime() {
    var v = $('video');
    if (!v.duration) { $('player-time').textContent = '0:00 / 0:00'; return; }
    $('player-time').textContent = fmtDur(v.currentTime) + ' / ' + fmtDur(v.duration);
    $('pbar-fill').style.width = (v.currentTime / v.duration) * 100 + '%';
  }
  function seekBy(seconds) {
    var v = $('video');
    if (!v.duration) return;
    var t = v.currentTime + seconds;
    if (t < 0) t = 0;
    if (t > v.duration) t = v.duration;
    v.currentTime = t;
    updatePlayerTime();
  }
  function togglePlay() { var v = $('video'); if (v.paused) v.play(); else v.pause(); }

  // ===== Acciones =====
  function onAction(action, el) {
    if (action === 'chat') openChat(el.getAttribute('data-chat'), el.getAttribute('data-class'), el.getAttribute('data-title'));
    else if (action === 'play') playVideo(el.getAttribute('data-msg'));
    else if (action === 'audio') playAudio(el.getAttribute('data-msg'));
    else if (action === 'photo') openPhoto(el.getAttribute('data-msg'));
    else if (action === 'more') loadMore();
    else if (action === 'back-list') { if (lastList === 'archived') showArchived(); else showChannels(); }
  }

  // ===== Navegación =====
  function isVisible(el) {
    var n = el;
    while (n && n !== document) {
      if (n.classList && n.classList.contains('hidden')) return false;
      n = n.parentNode;
    }
    return true;
  }
  function focusables() {
    var els = document.querySelectorAll('.focusable');
    var out = [];
    for (var i = 0; i < els.length; i++) if (isVisible(els[i])) out.push(els[i]);
    return out;
  }
  function focusFirst() { var els = focusables(); if (els.length) els[0].focus(); }
  function spatialMove(dx, dy) {
    var els = focusables();
    var cur = document.activeElement;
    if (els.indexOf(cur) < 0) { if (els.length) els[0].focus(); return; }
    var r = cur.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bestScore = Infinity;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el === cur) continue;
      var er = el.getBoundingClientRect();
      var ex = er.left + er.width / 2, ey = er.top + er.height / 2;
      var ddx = ex - cx, ddy = ey - cy;
      if (dx > 0 && ddx <= 0) continue;
      if (dx < 0 && ddx >= 0) continue;
      if (dy > 0 && ddy <= 0) continue;
      if (dy < 0 && ddy >= 0) continue;
      var primary = dx !== 0 ? ddx * dx : ddy * dy;
      var perp = dx !== 0 ? Math.abs(ddy) : Math.abs(ddx);
      var score = primary + perp * 0.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) best.focus();
  }

  document.addEventListener('keydown', function (e) {
    var key = e.keyCode;
    if (screen === 'player') {
      if (key === 37) { seekBy(-10); e.preventDefault(); }
      else if (key === 39) { seekBy(10); e.preventDefault(); }
      else if (key === 38) { seekBy(60); e.preventDefault(); }
      else if (key === 40) { seekBy(-60); e.preventDefault(); }
      else if (key === 13) { togglePlay(); e.preventDefault(); }
      else if (key === 461 || key === 27) { saveCurProgress(); exitPlayer(); e.preventDefault(); }
      return;
    }
    if (screen === 'photo') {
      if (key === 37) { nextPhoto(-1); e.preventDefault(); }
      else if (key === 39) { nextPhoto(1); e.preventDefault(); }
      else if (key === 38) { zoomPhoto(0.5); e.preventDefault(); }
      else if (key === 40) { zoomPhoto(-0.5); e.preventDefault(); }
      else if (key === 461 || key === 27) { setView('main'); focusFirst(); e.preventDefault(); }
      else if (key === 13) { setView('main'); focusFirst(); e.preventDefault(); }
      return;
    }
    if (key === 37) { spatialMove(-1, 0); e.preventDefault(); }
    else if (key === 39) { spatialMove(1, 0); e.preventDefault(); }
    else if (key === 38) { spatialMove(0, -1); e.preventDefault(); }
    else if (key === 40) { spatialMove(0, 1); e.preventDefault(); }
    else if (key === 461 || key === 27) {
      if (screen === 'main' && curChat) { if (lastList === 'archived') showArchived(); else showChannels(); e.preventDefault(); }
      else if (screen === 'login' || screen === 'pass') { setView('setup'); $('setup-url').focus(); e.preventDefault(); }
    } else if (key === 13) {
      var el = findUp(document.activeElement, 'data-action');
      if (el) { onAction(el.getAttribute('data-action'), el); e.preventDefault(); }
    }
  });

  function saveCurProgress() {
    var v = $('video');
    if (!curChat || !curMsgId) return;
    if ((playingType === 'video' || playingType === 'video_file') && v.duration && v.currentTime > 5) {
      progress[progKey(curChat, curMsgId)] = Math.floor(v.currentTime);
      saveProgress();
    }
  }

  // ===== Init =====
  window.onerror = function (msg, src, line) {
    try {
      var el = $('setup-msg') || $('login-msg') || $('player-msg');
      if (el) el.textContent = 'Error: ' + msg + ' (línea ' + line + ')';
    } catch (e) {}
  };

  function init() {
    loadProgress();
    $('setup-btn').addEventListener('click', doSetup);
    $('setup-url').addEventListener('keydown', function (e) { if (e.keyCode === 13) doSetup(); });
    $('pass-btn').addEventListener('click', doPassword);
    $('pass-input').addEventListener('keydown', function (e) { if (e.keyCode === 13) doPassword(); });
    $('btn-logout').addEventListener('click', function () {
      api('/api/logout', 'POST', null, function () { setView('setup'); $('setup-url').focus(); });
    });
    $('btn-archive').addEventListener('click', function () {
      if (lastList === 'archived') showChannels(); else showArchived();
    });
    $('btn-refresh').addEventListener('click', function () {
      if (curChat) loadMessages('');
      else if (lastList === 'archived') loadDialogs(true);
      else loadDialogs(false);
    });
    $('btn-search').addEventListener('click', doSearch);
    $('search-input').addEventListener('keydown', function (e) { if (e.keyCode === 13) doSearch(); });
    $('btn-player-back').addEventListener('click', function () { saveCurProgress(); exitPlayer(); });
    $('btn-photo-back').addEventListener('click', function () { setView('main'); focusFirst(); });
    $('btn-rewind').addEventListener('click', function () { seekBy(-10); });
    $('btn-forward').addEventListener('click', function () { seekBy(10); });
    $('btn-playpause').addEventListener('click', togglePlay);

    var v = $('video');
    v.addEventListener('timeupdate', function () {
      updatePlayerTime();
      if ((playingType === 'video' || playingType === 'video_file') && curChat && curMsgId && v.duration && v.currentTime > 0) {
        progress[progKey(curChat, curMsgId)] = Math.floor(v.currentTime);
      }
    });
    v.addEventListener('play', function () { $('btn-playpause').textContent = 'Pausa'; });
    v.addEventListener('pause', function () { $('btn-playpause').textContent = 'Reproducir'; });

    $('main-content').addEventListener('click', function (e) {
      var el = findUp(e.target, 'data-action');
      if (el) onAction(el.getAttribute('data-action'), el);
    });

    try { BACKEND = localStorage.getItem('tg_backend'); } catch (e) {}
    if (BACKEND) {
      $('setup-url').value = BACKEND;
      showLoading(true);
      api('/api/status', 'GET', null, function (err, data) {
        showLoading(false);
        if (err) { setView('setup'); $('setup-msg').textContent = err.message; $('setup-url').focus(); }
        else if (data.loggedIn) showChannels();
        else showLogin();
      });
    } else {
      setView('setup');
      $('setup-url').focus();
    }
  }

  init();
})();
