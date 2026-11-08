(function () {
  'use strict';

  var BACKEND = null;
  var curChat = null;
  var curClassName = null;
  var curChatTitle = '';
  var pollTimer = null;
  var qrTimer = null;

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

  function show(name) {
    $('view-setup').className = 'view' + (name === 'setup' ? '' : ' hidden');
    $('view-login').className = 'view' + (name === 'login' ? '' : ' hidden');
    $('view-pass').className = 'view' + (name === 'pass' ? '' : ' hidden');
    $('view-main').className = 'view' + (name === 'main' ? '' : ' hidden');
    $('view-player').className = 'view' + (name === 'player' ? '' : ' hidden');
    stopPolling();
    if (name === 'setup') $('setup-url').focus();
    if (name === 'login') startLogin();
    if (name === 'pass') $('pass-input').focus();
  }

  function showLoading(on) { $('loading').className = on ? '' : 'hidden'; }

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

  function fmtDur(s) {
    s = Math.floor(s || 0);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var ss = s % 60;
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
      if (data.loggedIn) { show('main'); loadDialogs(); }
      else { show('login'); }
    });
  }

  // ===== Login QR =====
  function startLogin() {
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

  function refreshQr() {
    var img = $('qr-img');
    if (BACKEND) img.src = BACKEND + '/api/qr.png?t=' + Date.now();
  }

  function pollLogin() {
    api('/api/status', 'GET', null, function (err, data) {
      if (err) { $('login-msg').textContent = err.message; pollTimer = setTimeout(pollLogin, 4000); return; }
      if (data.loggedIn) { stopPolling(); show('main'); loadDialogs(); return; }
      if (data.needPassword) { stopPolling(); show('pass'); return; }
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
      pollTimer = setTimeout(pollLogin, 1200);
    });
  }

  // ===== Main =====
  function loadDialogs() {
    $('main-title').textContent = 'Canales';
    showLoading(true);
    api('/api/dialogs', 'GET', null, function (err, data) {
      showLoading(false);
      if (err) { $('main-content').innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; return; }
      var list = (data && data.dialogs) ? data.dialogs : [];
      if (!list.length) {
        $('main-content').innerHTML = '<div class="empty">No se encontraron canales. Asegúrate de estar suscrito a canales en Telegram.</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var initial = (c.title || '?').charAt(0).toUpperCase();
        html += '<div class="row focusable" tabindex="0" data-action="channel" data-chat="' + esc(c.id) + '" data-class="' + esc(c.className) + '" data-title="' + esc(c.title || '') + '">'
          + '<div class="row-ico">' + esc(initial) + '</div>'
          + '<div><div class="row-title">' + esc(c.title || c.username || c.id) + '</div>'
          + '<div class="row-sub">' + (c.username ? '@' + esc(c.username) : 'Canal') + '</div></div></div>';
      }
      $('main-content').innerHTML = html;
      focusFirst();
    });
  }

  function openChannel(chat, className, title) {
    curChat = chat;
    curClassName = className;
    curChatTitle = title;
    $('main-title').textContent = title || 'Videos';
    showLoading(true);
    api('/api/messages?chat=' + enc(chat) + '&className=' + enc(className), 'GET', null, function (err, data) {
      showLoading(false);
      if (err) { $('main-content').innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; return; }
      var list = (data && data.messages) ? data.messages : [];
      var html = '<div class="row focusable" tabindex="0" data-action="back-channels"><div class="row-ico">&#8592;</div><div><div class="row-title">Volver a canales</div></div></div>';
      if (!list.length) {
        html += '<div class="empty">No hay videos en este canal (solo se listan videos; los archivos MKV aún no se muestran).</div>';
      } else {
        html += '<div class="grid">';
        for (var i = 0; i < list.length; i++) {
          var v = list[i];
          var cap = v.caption ? v.caption.replace(/\s+/g, ' ').substring(0, 90) : '';
          html += '<div class="vcard focusable" tabindex="0" data-action="play" data-msg="' + v.id + '">'
            + '<div class="vthumb"><span class="vplay">&#9654;</span></div>'
            + '<div class="vtitle">' + (cap || ('Video ' + (i + 1))) + '</div>'
            + '<div class="vmeta">' + fmtDur(v.duration) + ' · ' + fmtSize(v.size) + '</div></div>';
        }
        html += '</div>';
      }
      $('main-content').innerHTML = html;
      focusFirst();
    });
  }

  function playVideo(msgId) {
    var url = BACKEND + '/api/video?chat=' + enc(curChat) + '&className=' + enc(curClassName) + '&msgId=' + enc(String(msgId));
    $('player-title').textContent = curChatTitle || '';
    $('player-msg').textContent = 'Descargando/búfer del video...';
    var v = $('video');
    try { v.pause(); } catch (e) {}
    v.removeAttribute('src');
    try { v.load(); } catch (e) {}
    v.src = url;
    v.addEventListener('playing', function () { $('player-msg').textContent = ''; });
    v.addEventListener('error', function () { $('player-msg').textContent = 'No se pudo reproducir. El video puede estar en un formato no compatible (HEVC) o ser muy grande.'; });
    try { v.play(); } catch (e) {}
    show('player');
  }

  // ===== Actions =====
  function onAction(action, el) {
    if (action === 'channel') openChannel(el.getAttribute('data-chat'), el.getAttribute('data-class'), el.getAttribute('data-title'));
    else if (action === 'play') playVideo(el.getAttribute('data-msg'));
    else if (action === 'back-channels') loadDialogs();
  }

  // ===== Navigation (espacial, con las flechas del control) =====
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
  function focusFirst() {
    var els = focusables();
    if (els.length) els[0].focus();
  }
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
    if (key === 37) { spatialMove(-1, 0); e.preventDefault(); }
    else if (key === 39) { spatialMove(1, 0); e.preventDefault(); }
    else if (key === 38) { spatialMove(0, -1); e.preventDefault(); }
    else if (key === 40) { spatialMove(0, 1); e.preventDefault(); }
    else if (key === 461 || key === 27) {
      if (!$('view-player').classList.contains('hidden')) {
        var v = $('video');
        try { v.pause(); } catch (e2) {}
        v.removeAttribute('src');
        show('main');
        e.preventDefault();
      } else if (!$('view-main').classList.contains('hidden') && curChat) {
        loadDialogs();
        e.preventDefault();
      } else if (!$('view-login').classList.contains('hidden') || !$('view-pass').classList.contains('hidden')) {
        show('setup');
        e.preventDefault();
      }
    } else if (key === 13) {
      var el = findUp(document.activeElement, 'data-action');
      if (el) { onAction(el.getAttribute('data-action'), el); e.preventDefault(); }
    }
  });

  // ===== Init =====
  window.onerror = function (msg, src, line) {
    try {
      var el = $('setup-msg') || $('login-msg') || $('player-msg');
      if (el) el.textContent = 'Error: ' + msg + ' (línea ' + line + ')';
    } catch (e) {}
  };

  function init() {
    $('setup-btn').addEventListener('click', doSetup);
    $('setup-url').addEventListener('keydown', function (e) { if (e.keyCode === 13) doSetup(); });
    $('pass-btn').addEventListener('click', doPassword);
    $('pass-input').addEventListener('keydown', function (e) { if (e.keyCode === 13) doPassword(); });
    $('btn-logout').addEventListener('click', function () {
      api('/api/logout', 'POST', null, function () { show('setup'); });
    });
    $('btn-player-back').addEventListener('click', function () {
      var v = $('video');
      try { v.pause(); } catch (e) {}
      v.removeAttribute('src');
      show('main');
    });
    $('main-content').addEventListener('click', function (e) {
      var el = findUp(e.target, 'data-action');
      if (el) onAction(el.getAttribute('data-action'), el);
    });

    // boot
    try { BACKEND = localStorage.getItem('tg_backend'); } catch (e) {}
    if (BACKEND) {
      $('setup-url').value = BACKEND;
      showLoading(true);
      api('/api/status', 'GET', null, function (err, data) {
        showLoading(false);
        if (err) { show('setup'); $('setup-msg').textContent = err.message; }
        else if (data.loggedIn) { show('main'); loadDialogs(); }
        else { show('login'); }
      });
    } else {
      show('setup');
    }
  }

  init();
})();
