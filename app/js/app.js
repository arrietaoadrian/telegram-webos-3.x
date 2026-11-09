(function () {
  'use strict';

  // ===== Translations (ES / EN) =====
  var I18N = {
    es: {
      setup_sub: 'Conecta el TV con el servidor que corre en tu teléfono.',
      setup_hint: 'Esta dirección aparece en Termux (celular) al ejecutar <b>node server.js</b>. Es la IP de tu teléfono en el Wi-Fi + el puerto 8080.<br>Ejemplo: <b>http://192.168.1.50:8080</b>',
      connect: 'Conectar',
      enter_server: 'Ingresa la dirección del servidor.',
      sign_in: 'Iniciar sesión',
      scan_qr: 'Escanea este QR con Telegram:<br>Configuración → Dispositivos → Escanear QR',
      loading_qr: 'Cargando QR...',
      password: 'Contraseña',
      two_step: 'Tu cuenta tiene verificación en dos pasos',
      password_ph: 'Contraseña de Telegram',
      submit: 'Enviar',
      enter_password: 'Ingresa tu contraseña.',
      verifying: 'Verificando...',
      channels: 'Canales',
      archived: 'Archivados',
      refresh: 'Recargar',
      logout: 'Salir',
      search_ph: 'Buscar en este chat...',
      search_ph_all: 'Buscar canales...',
      search: 'Buscar',
      lang_switch: 'English',
      no_archived: 'No hay chats archivados.',
      no_channels: 'No se encontraron canales.',
      saved_messages: 'Mensajes guardados',
      your_saved: 'Tus mensajes guardados',
      channel: 'Canal',
      back_channels: 'Volver a canales',
      back_all: 'Volver a todos',
      no_media: 'No hay medios en este chat.',
      no_results: 'Sin resultados para "',
      photo: 'Foto',
      song: 'Canción',
      video: 'Video',
      load_more: 'Cargar más',
      back: 'Volver',
      pause: 'Pausa',
      play: 'Reproducir',
      converting_mkv: 'Convirtiendo MKV (puede tardar)...',
      loading_video: 'Cargando video (si es HEVC/H.265 se convertirá, puede tardar)...',
      could_not_play: 'No se pudo reproducir. Si es MKV, verifica tener ffmpeg y que sea H.264/AAC.',
      err_codec: 'Codec no soportado (el video podría ser HEVC/H.265)',
      err_network: 'Error de red',
      subtitles: 'Subtítulos',
      loading_music: 'Cargando música...',
      loading: 'Cargando...',
      no_connection: 'Sin conexión',
      no_connection_server: 'Sin conexión con el servidor (',
      error: 'Error: ',
      line: 'línea',
      filter_all: 'Todos',
      filter_videos: 'Videos',
      filter_mkv: 'MKV',
      filter_photos: 'Fotos',
      filter_music: 'Música',
      filter_pdfs: 'PDFs',
      pdf: 'PDF',
      months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    },
    en: {
      setup_sub: 'Connect the TV to the server running on your phone.',
      setup_hint: 'This address appears in Termux (phone) when you run <b>node server.js</b>. It\'s your phone\'s Wi-Fi IP + port 8080.<br>Example: <b>http://192.168.1.50:8080</b>',
      connect: 'Connect',
      enter_server: 'Enter the server address.',
      sign_in: 'Sign in',
      scan_qr: 'Scan this QR with Telegram:<br>Settings → Devices → Scan QR',
      loading_qr: 'Loading QR...',
      password: 'Password',
      two_step: 'Your account has two-step verification',
      password_ph: 'Telegram password',
      submit: 'Submit',
      enter_password: 'Enter your password.',
      verifying: 'Verifying...',
      channels: 'Channels',
      archived: 'Archived',
      refresh: 'Refresh',
      logout: 'Log out',
      search_ph: 'Search in this chat...',
      search_ph_all: 'Search channels...',
      search: 'Search',
      lang_switch: 'Español',
      no_archived: 'No archived chats.',
      no_channels: 'No channels found.',
      saved_messages: 'Saved Messages',
      your_saved: 'Your saved messages',
      channel: 'Channel',
      back_channels: 'Back to channels',
      back_all: 'Back to all',
      no_media: 'No media in this chat.',
      no_results: 'No results for "',
      photo: 'Photo',
      song: 'Song',
      video: 'Video',
      load_more: 'Load more',
      back: 'Back',
      pause: 'Pause',
      play: 'Play',
      converting_mkv: 'Converting MKV (may take a while)...',
      loading_video: 'Loading video (if HEVC/H.265 it will convert, may take a while)...',
      could_not_play: 'Could not play. If it is MKV, make sure ffmpeg is installed and it is H.264/AAC.',
      err_codec: 'Unsupported codec (the video might be HEVC/H.265)',
      err_network: 'Network error',
      subtitles: 'Subtitles',
      loading_music: 'Loading music...',
      loading: 'Loading...',
      no_connection: 'No connection',
      no_connection_server: 'No connection to the server (',
      error: 'Error: ',
      line: 'line',
      filter_all: 'All',
      filter_videos: 'Videos',
      filter_mkv: 'MKV',
      filter_photos: 'Photos',
      filter_music: 'Music',
      filter_pdfs: 'PDFs',
      pdf: 'PDF',
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    }
  };

  var LANG = 'es';
  function t(key) {
    if (I18N[LANG] && I18N[LANG][key] !== undefined) return I18N[LANG][key];
    if (I18N.en && I18N.en[key] !== undefined) return I18N.en[key];
    return key;
  }
  function setLang(lang) {
    LANG = lang;
    try { localStorage.setItem('tg_lang', LANG); } catch (e) {}
    applyI18n();
  }
  function applyI18n() {
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) els[i].innerHTML = t(els[i].getAttribute('data-i18n'));
    var phs = document.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < phs.length; j++) phs[j].setAttribute('placeholder', t(phs[j].getAttribute('data-i18n-ph')));
    if (curChat === null) $('search-input').setAttribute('placeholder', t('search_ph_all'));
    var lb = $('btn-lang');
    if (lb) lb.textContent = t('lang_switch');
  }

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
  var pdfMsgId = null;
  var pdfPage = 1;
  var pdfPages = 1;
  var playingType = 'video';
  var curMsgId = null;
  var filterType = 'all';
  var controlsTimer = null;

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
    var months = t('months');
    var hh = d.getHours(), mm = d.getMinutes();
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  // ===== Playback progress (localStorage) =====
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
    $('main-title').textContent = opts.title || t('channels');
    $('btn-archive').className = 'btn focusable' + (opts.showArchive ? '' : ' hidden');
    if (opts.archiveLabel) $('btn-archive').textContent = opts.archiveLabel;
    $('search-input').value = '';
    $('search-input').placeholder = t(curChat ? 'search_ph' : 'search_ph_all');
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
    xhr.onerror = function () { cb(new Error(t('no_connection_server') + BACKEND + ')'), null); };
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
    xhr.onerror = function () { cb(new Error(t('no_connection')), null); };
    xhr.send(null);
  }

  function logToServer(msg) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', BACKEND + '/api/log', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ message: msg }));
    } catch (e) {}
  }

  // ===== Setup =====
  function doSetup() {
    var u = $('setup-url').value.trim().replace(/\/+$/, '');
    if (!u) { $('setup-msg').textContent = t('enter_server'); return; }
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
    $('login-msg').textContent = t('loading_qr');
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
    if (!pw) { $('pass-msg').textContent = t('enter_password'); return; }
    $('pass-msg').textContent = t('verifying');
    api('/api/password', 'POST', { password: pw }, function (err) {
      if (err) { $('pass-msg').textContent = err.message; return; }
      $('pass-msg').textContent = '';
      $('pass-input').value = '';
      showLogin();
    });
  }

  // ===== Channels / Archived =====
  function showChannels() {
    lastList = 'channels';
    curChat = null;
    setView('main');
    setTopbar({ title: t('channels'), showArchive: true, archiveLabel: t('archived') });
    loadDialogs(false);
  }
  function showArchived() {
    lastList = 'archived';
    curChat = null;
    setView('main');
    setTopbar({ title: t('archived'), showArchive: true, archiveLabel: t('channels') });
    loadDialogs(true);
  }
  function loadDialogs(archivedOnly) {
    showLoading(true);
    api('/api/dialogs', 'GET', null, function (err, data) {
      showLoading(false);
      if (err) { $('main-content').innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; return; }
      var list = archivedOnly ? (data.archived || []) : (data.dialogs || []);
      if (!list.length) {
        $('main-content').innerHTML = '<div class="empty">' + (archivedOnly ? t('no_archived') : t('no_channels')) + '</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var initial = (c.title || '?').charAt(0).toUpperCase();
        var avatarSrc = BACKEND + '/api/avatar?chat=' + enc(c.id) + '&className=' + enc(c.className);
        var savedCls = c.saved ? ' saved' : '';
        var title = c.saved ? t('saved_messages') : (c.title || c.username || c.id);
        html += '<div class="row focusable' + savedCls + '" tabindex="0" data-action="chat" data-chat="' + esc(c.id) + '" data-class="' + esc(c.className) + '" data-title="' + esc(title) + '">'
          + '<div class="avatar"><span class="letter">' + esc(initial) + '</span><img src="' + esc(avatarSrc) + '" onerror="this.remove()" alt=""></div>'
          + '<div><div class="row-title">' + esc(title) + '</div>'
          + '<div class="row-sub">' + (c.saved ? t('your_saved') : (c.username ? '@' + esc(c.username) : t('channel'))) + '</div></div></div>';
      }
      $('main-content').innerHTML = html;
      focusFirst();
    });
  }

  // ===== Chat (messages) =====
  function openChat(chat, className, title) {
    curChat = chat;
    curClassName = className;
    curChatTitle = title;
    messages = [];
    offsetId = 0;
    subList = [];
    activeSub = null;
    filterType = 'all';
    setView('main');
    setTopbar({ title: title || t('channels'), showArchive: false });
    loadMessages('');
  }

  function filterBar() {
    var items = [
      ['all', 'filter_all'],
      ['video', 'filter_videos'],
      ['video_file', 'filter_mkv'],
      ['photo', 'filter_photos'],
      ['audio', 'filter_music'],
      ['pdf', 'filter_pdfs']
    ];
    var h = '<div class="tabs">';
    for (var i = 0; i < items.length; i++) {
      var cls = 'tab focusable' + (filterType === items[i][0] ? ' active' : '');
      h += '<button class="' + cls + '" data-action="filter" data-filter="' + items[i][0] + '">' + t(items[i][1]) + '</button>';
    }
    h += '</div>';
    return h;
  }

  function renderGrid(list, showBack, showLoadMore, query) {
    var showFilters = showBack && !query;
    if (showFilters && filterType !== 'all') {
      var filtered = [];
      for (var fi = 0; fi < list.length; fi++) {
        if (list[fi].type === filterType) filtered.push(list[fi]);
      }
      list = filtered;
    }
    var html = '';
    if (showBack) {
      html += '<div class="row focusable" tabindex="0" data-action="back-list"><div class="avatar" style="background:#444"><span class="letter">&#8592;</span></div><div><div class="row-title">' + (query ? t('back_all') : t('back_channels')) + '</div></div></div>';
    }
    if (showFilters) {
      html += filterBar();
    }
    if (!list.length) {
      html += '<div class="empty">' + (query ? t('no_results') + esc(query) + '".' : t('no_media')) + '</div>';
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
            + '<div class="vthumb"><img src="' + esc(thumb) + '" alt=""><span class="tag">' + t('photo') + '</span></div>'
            + '<div class="vtitle">' + (cap || (t('photo') + ' ' + (i + 1))) + '</div>'
            + chatLabel + '<div class="vmeta">' + dateStr + '</div></div>';
        } else if (v.type === 'audio') {
          html += '<div class="vcard focusable" tabindex="0" data-action="audio" data-msg="' + v.id + '">'
            + '<div class="vthumb contain"><span class="vplay" style="display:none">&#9835;</span>'
            + '<img src="' + esc(thumb) + '" onerror="this.style.display=\'none\';this.parentNode.getElementsByClassName(\'vplay\')[0].style.display=\'block\';" alt="">'
            + '<span class="tag">' + fmtDur(v.duration) + '</span></div>'
            + '<div class="vtitle">' + (cap || (t('song') + ' ' + (i + 1))) + '</div>'
            + chatLabel + '<div class="vmeta">' + dateStr + ' · ' + fmtSize(v.size) + '</div></div>';
        } else if (v.type === 'pdf') {
          var pdfThumb = BACKEND + '/api/pdf?chat=' + enc(v.chatId || curChat) + '&className=' + enc(v.className || curClassName) + '&msgId=' + v.id + '&page=1&thumb=1';
          html += '<div class="vcard focusable" tabindex="0" data-action="pdf" data-msg="' + v.id + '">'
            + '<div class="vthumb contain"><span class="vplay" style="display:none;font-size:14px;line-height:44px;">PDF</span>'
            + '<img src="' + esc(pdfThumb) + '" onerror="this.style.display=\'none\';this.parentNode.getElementsByClassName(\'vplay\')[0].style.display=\'block\';" alt="">'
            + '<span class="tag">PDF</span></div>'
            + '<div class="vtitle">' + (cap || (t('pdf') + ' ' + (i + 1))) + '</div>'
            + chatLabel + '<div class="vmeta">' + dateStr + ' · ' + fmtSize(v.size) + '</div></div>';
        } else {
          var isMkv = (v.type === 'video_file');
          var tag = isMkv ? 'MKV · ' + fmtDur(v.duration) : fmtDur(v.duration);
          html += '<div class="vcard focusable" tabindex="0" data-action="play" data-msg="' + v.id + '">'
            + '<div class="vthumb"><img src="' + esc(thumb) + '" onerror="this.style.display=\'none\'" alt=""><span class="vplay">&#9654;</span><span class="tag">' + tag + '</span>' + progBar + '</div>'
            + '<div class="vtitle">' + (cap || (t('video') + ' ' + (i + 1))) + '</div>'
            + chatLabel + '<div class="vmeta">' + dateStr + ' · ' + fmtSize(v.size) + '</div></div>';
        }
      }
      html += '</div>';
      if (showLoadMore) {
        html += '<div class="row focusable" tabindex="0" data-action="more"><div class="avatar" style="background:#444"><span class="letter">+</span></div><div><div class="row-title">' + t('load_more') + '</div></div></div>';
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

  // ===== Global search =====
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

  function toggleSearch() {
    var input = $('search-input');
    var open = input.classList.contains('hidden');
    if (open) {
      input.classList.remove('hidden');
      $('btn-search').classList.remove('hidden');
      $('btn-search-toggle').textContent = '\u2715';
      input.focus();
    } else {
      input.classList.add('hidden');
      $('btn-search').classList.add('hidden');
      $('btn-search-toggle').textContent = '\uD83D\uDD0D';
      input.value = '';
      if (curChat) loadMessages('');
      else if (lastList === 'archived') loadDialogs(true);
      else loadDialogs(false);
    }
  }

  // ===== Photos =====
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
    pdfMsgId = null;
    var img = $('photo-img');
    img.onload = null;
    img.onerror = null;
    img.classList.remove('pdf-mode');
    $('btn-photo-back').style.display = '';
    $('photo-scroll').scrollTop = 0;
    img.src = BACKEND + '/api/photo?chat=' + enc(p.chatId) + '&className=' + enc(p.className) + '&msgId=' + p.id;
    img.style.transform = 'scale(' + photoZoom + ')';
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
  function openPdf(msgId) {
    pdfMsgId = Number(msgId);
    pdfPage = 1;
    pdfPages = 1;
    var img = $('photo-img');
    img.onload = null;
    img.onerror = null;
    img.removeAttribute('src');
    img.classList.add('pdf-mode');
    img.style.transform = '';
    setView('photo');
    $('photo-caption').textContent = t('pdf') + ' 1 / ...';
    $('btn-photo-back').style.display = 'none';
    api('/api/pdfinfo?chat=' + enc(curChat) + '&className=' + enc(curClassName) + '&msgId=' + msgId, 'GET', null, function (err, data) {
      if (!err && data && data.pages) pdfPages = data.pages;
      renderPdf();
    });
  }
  var pdfPreloads = [];
  function pdfUrl(page) {
    return BACKEND + '/api/pdf?chat=' + enc(curChat) + '&className=' + enc(curClassName) + '&msgId=' + pdfMsgId + '&page=' + page;
  }
  function preloadPdfPage(page) {
    if (!pdfMsgId || page < 1 || page > pdfPages) return;
    try {
      var im = new Image();
      im.src = pdfUrl(page);
      pdfPreloads.push(im);
      if (pdfPreloads.length > 4) pdfPreloads.shift();
    } catch (e) {}
  }
  function renderPdf() {
    if (!pdfMsgId) return;
    var page = pdfPage;
    $('btn-photo-back').style.display = 'none';
    $('photo-caption').textContent = t('pdf') + ' ' + page + ' / ' + pdfPages + ' ...';
    // Chromium 38 (webOS) no repinta de forma fiable un <img> ya cargado al
    // cambiarle el src. Se crea una imagen nueva y se sustituye solo cuando
    // terminó de cargar, así la página cambia siempre.
    var ni = new Image();
    ni.id = 'photo-img';
    ni.className = 'pdf-mode';
    ni.alt = '';
    ni.onload = function () {
      ni.onload = null;
      ni.onerror = null;
      if (page !== pdfPage || !pdfMsgId) return;
      var cur = $('photo-img');
      if (cur && cur.parentNode) cur.parentNode.replaceChild(ni, cur);
      $('photo-scroll').scrollTop = 0;
      setTimeout(function () { if (page === pdfPage && pdfMsgId) $('photo-scroll').scrollTop = 0; }, 100);
      $('photo-caption').textContent = t('pdf') + ' ' + page + ' / ' + pdfPages;
      preloadPdfPage(page + 1);
      preloadPdfPage(page - 1);
    };
    ni.onerror = function () {
      ni.onload = null;
      ni.onerror = null;
      if (page === pdfPage) {
        $('photo-caption').textContent = t('pdf') + ' ' + page + ' / ' + pdfPages + ' [!]';
      }
    };
    ni.src = pdfUrl(page);
  }
  function scrollPdf(delta) {
    var sc = $('photo-scroll');
    sc.scrollTop += delta;
  }

  // ===== Player =====
  function mediaEl() { return playingType === 'audio' ? $('audio') : $('video'); }
  function playVideo(msgId) {
    var item = null;
    for (var i = 0; i < messages.length; i++) if (messages[i].id === Number(msgId)) { item = messages[i]; break; }
    playingType = item ? item.type : 'video';
    curMsgId = Number(msgId);
    var url = BACKEND + '/api/video?chat=' + enc(curChat) + '&className=' + enc(curClassName) + '&msgId=' + enc(String(msgId));
    $('player-title').textContent = curChatTitle || '';
    $('player-msg').textContent = (playingType === 'video_file') ? t('converting_mkv') : t('loading_video');
    try { $('audio').pause(); } catch (e) {}
    var v = $('video');
    try { v.pause(); } catch (e) {}
    removeSubtitleTracks();
    v.removeAttribute('src');
    try { v.load(); } catch (e) {}
    v.src = url;
    $('btn-playpause').textContent = t('pause');
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
    v.addEventListener('error', function () {
      var code = v.error ? v.error.code : -1;
      var msg = t('could_not_play') + ' [' + code + ']';
      if (code === 3 || code === 4) msg += ' — ' + t('err_codec');
      else if (code === 2) msg += ' — ' + t('err_network');
      $('player-msg').textContent = msg;
      logToServer('video error code=' + code + ' msgId=' + curMsgId + ' chat=' + curChat);
    });
    try { v.play(); } catch (e) {}
    showPlayerControls();
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
        track.label = t('subtitles');
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
    $('player-msg').textContent = t('loading_music');
    try { $('video').pause(); } catch (e) {}
    removeSubtitleTracks();
    var a = $('audio');
    a.removeAttribute('src');
    try { a.load(); } catch (e) {}
    a.src = url;
    $('btn-playpause').textContent = t('pause');
    $('player-time').textContent = '0:00 / 0:00';
    $('pbar-fill').style.width = '0%';
    try { a.play(); } catch (e) {}
    showPlayerControls();
    setView('player');
  }
  function exitPlayer() {
    saveCurProgress();
    var v = $('video');
    try { v.pause(); } catch (e) {}
    v.removeAttribute('src');
    var a = $('audio');
    try { a.pause(); } catch (e) {}
    a.removeAttribute('src');
    setView('main');
    focusFirst();
  }
  function updatePlayerTime() {
    var v = mediaEl();
    if (!v.duration) { $('player-time').textContent = '0:00 / 0:00'; return; }
    $('player-time').textContent = fmtDur(v.currentTime) + ' / ' + fmtDur(v.duration);
    $('pbar-fill').style.width = (v.currentTime / v.duration) * 100 + '%';
  }
  function seekBy(seconds) {
    var v = mediaEl();
    if (!v.duration) return;
    var t2 = v.currentTime + seconds;
    if (t2 < 0) t2 = 0;
    if (t2 > v.duration) t2 = v.duration;
    v.currentTime = t2;
    updatePlayerTime();
  }
  function togglePlay() { var v = mediaEl(); if (v.paused) v.play(); else v.pause(); showPlayerControls(); }

  function showPlayerControls() {
    var top = document.querySelector('#view-player .player-top');
    var ctrl = document.querySelector('#view-player .player-controls');
    if (top) top.classList.remove('hidden-controls');
    if (ctrl) ctrl.classList.remove('hidden-controls');
    if (controlsTimer) { clearTimeout(controlsTimer); controlsTimer = null; }
    var v = mediaEl();
    if (v && !v.paused) {
      controlsTimer = setTimeout(hidePlayerControls, 3000);
    }
  }
  function hidePlayerControls() {
    var top = document.querySelector('#view-player .player-top');
    var ctrl = document.querySelector('#view-player .player-controls');
    if (top) top.classList.add('hidden-controls');
    if (ctrl) ctrl.classList.add('hidden-controls');
  }

  // ===== Actions =====
  function onAction(action, el) {
    if (action === 'chat') openChat(el.getAttribute('data-chat'), el.getAttribute('data-class'), el.getAttribute('data-title'));
    else if (action === 'play') playVideo(el.getAttribute('data-msg'));
    else if (action === 'audio') playAudio(el.getAttribute('data-msg'));
    else if (action === 'photo') openPhoto(el.getAttribute('data-msg'));
    else if (action === 'pdf') openPdf(el.getAttribute('data-msg'));
    else if (action === 'more') loadMore();
    else if (action === 'filter') {
      filterType = el.getAttribute('data-filter');
      renderGrid(messages, true, messages.length >= 100, '');
    }
    else if (action === 'back-list') { if (lastList === 'archived') showArchived(); else showChannels(); }
  }

  // ===== Navigation =====
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
    for (var i = 0; i < els.length; i++) {
      if (els[i].id !== 'search-input' && els[i].id !== 'btn-search') { els[i].focus(); return; }
    }
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
      // mantiene la misma fila (horizontal) o columna (vertical)
      if (dx !== 0 && (er.bottom <= r.top || er.top >= r.bottom)) continue;
      if (dy !== 0 && (er.right <= r.left || er.left >= r.right)) continue;
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
      showPlayerControls();
      if (key === 37) { seekBy(-10); e.preventDefault(); }
      else if (key === 39) { seekBy(10); e.preventDefault(); }
      else if (key === 38) { seekBy(60); e.preventDefault(); }
      else if (key === 40) { seekBy(-60); e.preventDefault(); }
      else if (key === 13) { togglePlay(); e.preventDefault(); }
      else if (key === 461 || key === 27) { saveCurProgress(); exitPlayer(); e.preventDefault(); }
      return;
    }
    if (screen === 'photo') {
      if (pdfMsgId) {
        if (key === 37) { pdfPage = Math.max(1, pdfPage - 1); renderPdf(); e.preventDefault(); }
        else if (key === 39) { pdfPage = Math.min(pdfPages, pdfPage + 1); renderPdf(); e.preventDefault(); }
        else if (key === 38) { scrollPdf(-250); e.preventDefault(); }
        else if (key === 40) { scrollPdf(250); e.preventDefault(); }
        else if (key === 461 || key === 27 || key === 13) { pdfMsgId = null; setView('main'); focusFirst(); e.preventDefault(); }
        return;
      }
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
      if (el) el.textContent = t('error') + msg + ' (' + t('line') + ' ' + line + ')';
    } catch (e) {}
  };

  function reRender() {
    if (screen === 'channels') loadDialogs(false);
    else if (screen === 'archived') loadDialogs(true);
    else if (screen === 'chat') loadMessages('');
    else if (screen === 'photo') renderPhoto();
  }

  function init() {
    try { var savedLang = localStorage.getItem('tg_lang'); if (savedLang === 'en' || savedLang === 'es') LANG = savedLang; } catch (e) {}
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
    $('btn-search-toggle').addEventListener('click', toggleSearch);
    $('search-input').addEventListener('keydown', function (e) { if (e.keyCode === 13) doSearch(); });
    $('btn-lang').addEventListener('click', function () {
      setLang(LANG === 'es' ? 'en' : 'es');
      reRender();
    });
    $('btn-player-back').addEventListener('click', function () { saveCurProgress(); exitPlayer(); });
    $('btn-photo-back').addEventListener('click', function () { pdfMsgId = null; setView('main'); focusFirst(); });
    $('btn-rewind').addEventListener('click', function () { seekBy(-10); });
    $('btn-forward').addEventListener('click', function () { seekBy(10); });
    $('btn-playpause').addEventListener('click', togglePlay);

    var v = $('video');
    v.addEventListener('timeupdate', function () {
      if (playingType === 'audio') return;
      updatePlayerTime();
      if ((playingType === 'video' || playingType === 'video_file') && curChat && curMsgId && v.duration && v.currentTime > 0) {
        progress[progKey(curChat, curMsgId)] = Math.floor(v.currentTime);
      }
    });
    v.addEventListener('play', function () { if (playingType !== 'audio') $('btn-playpause').textContent = t('pause'); });
    v.addEventListener('pause', function () { if (playingType !== 'audio') $('btn-playpause').textContent = t('play'); });

    var a = $('audio');
    a.addEventListener('timeupdate', function () {
      if (playingType !== 'audio') return;
      updatePlayerTime();
    });
    a.addEventListener('playing', function () { $('player-msg').textContent = ''; });
    a.addEventListener('play', function () { if (playingType === 'audio') $('btn-playpause').textContent = t('pause'); });
    a.addEventListener('pause', function () { if (playingType === 'audio') $('btn-playpause').textContent = t('play'); });
    a.addEventListener('error', function () {
      var code = a.error ? a.error.code : -1;
      $('player-msg').textContent = t('could_not_play') + ' [' + code + ']';
      logToServer('audio error code=' + code + ' msgId=' + curMsgId + ' chat=' + curChat);
    });

    $('main-content').addEventListener('click', function (e) {
      var el = findUp(e.target, 'data-action');
      if (el) onAction(el.getAttribute('data-action'), el);
    });

    applyI18n();

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
