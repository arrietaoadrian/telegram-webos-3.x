# Telegram TV (webOS)

A video client for your **Telegram channels and groups**, for **LG webOS TVs** (webOS 3.x and newer, e.g. the 2017
`32LJ550B` and similar).

Sign in by scanning a QR code with your phone, browse the channels that contain videos, and play them with the
remote. It streams while it downloads, so nothing is stored permanently — neither on the TV nor on the server.

> **Not affiliated with Telegram.** Personal project. Use Telegram under its own terms.

---

## Why this architecture

Modern Telegram clients (mtcute, gramjs) need a recent browser: `globalThis`, BigInt, WebAssembly, modern WebCrypto,
and modern JavaScript. Old webOS 3.x TVs ship **Chromium 38 (2015)**, which has none of that, so the Telegram client
cannot run on the TV itself.

This project splits the work in two:

```
┌─────────────┐   HTTP (LAN)   ┌──────────────────────┐   MTProto   ┌───────────┐
│   TV (webOS) │ ────────────▶ │  Server (Termux/Node) │ ──────────▶ │ Telegram  │
│   app/       │   /api/*      │  server/              │  WebSocket  │ servers   │
└─────────────┘                └──────────────────────┘             └───────────┘
```

- `server/` — a small Node.js server (run on any modern Node machine; Termux on Android is recommended). It talks to
  Telegram, produces the QR login, lists your chats and serves the videos over HTTP.
- `app/` — a webOS app written in **ES5 only** (no frameworks), so it runs on Chromium 38 (webOS 3.x) — and, being
  plain ES5, it also runs on every newer webOS version.

## Features

- **Interface in Spanish and English** — switch with a button in the top bar (Spanish by default).
- QR sign-in (Telegram → Settings → Devices → Link Desktop Device). Two-step verification (2FA) is detected and
  supported; the session persists, so you scan the QR only once.
- Channel avatars, video thumbnails, and photos posted in channels (full-screen viewer with zoom and navigation).
- Plays MP4 videos and **MKV files** (remuxed to MP4 with ffmpeg on the server; H.264/AAC only).
- **Resume playback**: remembers where you left off and shows a progress bar on watched videos.
- **Subtitles** (.srt/.vtt) picked up automatically when a matching file is posted in the chat.
- **Music**: songs posted in channels play in the same player.
- **Search**: global (across all chats) and per-chat.
- **Type filter**: tabs to switch between All / Videos (MP4) / MKV / Photos / Music.
- **Saved Messages** pinned at the top, and **archived chats** in a separate list.
- Publication date/time on every item, and "load more" pagination.
- Spatial navigation (d-pad arrows + OK + Back) with video controls (seek ±10s / ±1min, play/pause, progress bar).
- Temporary files: the server deletes cached media automatically (30 min without use, and on restart). The TV never
  stores anything.
- A **web player** (`web.html`) to browse and watch from any PC browser using the same server.

## Download

Prebuilt `.ipk` packages are attached to every
[Release](https://github.com/arrietaoadrian/telegram-webos-3.x/releases). Grab the latest
`com.telegramtv.app_*.ipk` and install it directly on the TV — no build required.

## Prerequisites

1. A Telegram `api_id` and `api_hash` from <https://my.telegram.org> → API development tools.
2. A machine to run `server/` with Node.js ≥ 16 (an Android phone with Termux, a PC, or a server).
3. A rooted/dev-mode LG webOS TV (3.x or newer), and a way to sideload an `.ipk` (e.g. Homebrew Channel, or
   `ares-install`).

## Setup

### 1. Run the server

```bash
cd server
npm install            # installs telegram (gramjs) and qrcode
# edit config.json with your apiId and apiHash
node server.js
```

You should see `Telegram TV backend escuchando en http://0.0.0.0:8080`.

On Android with Termux:

```bash
pkg update && pkg install nodejs curl ffmpeg -y
cd ~ && mkdir tg-backend && cd tg-backend
# copy server.js, package.json, config.json here, then:
npm install
nano config.json       # put your apiId/apiHash
node server.js
```

### 2. Build and install the app on the TV

You have two options: download the prebuilt `.ipk` from
[Releases](https://github.com/arrietaoadrian/telegram-webos-3.x/releases) (recommended), or build it from source.

**Build from source** (requires [Node.js](https://nodejs.org) ≥ 16):

1. Install the webOS CLI:
   ```bash
   npm install -g @webosose/ares-cli
   ```

2. Package the app (this produces the `.ipk`):
   ```bash
   cd app
   ares-package . -o bin --no-minify
   ```
   The output is `bin/com.telegramtv.app_0.2.0_all.ipk`.

3. Install the `.ipk` on the TV. Any of these works:
   - **Homebrew Channel** (recommended on a rooted TV),
   - **Dev Manager Desktop** (graphical tool),
   - the CLI, after registering the TV once with `ares-setup-device`:
     ```bash
     ares-install -d <tv-name> bin/com.telegramtv.app_0.1.0_all.ipk
     ```

### 3. Connect and sign in

1. Open **Telegram TV** on the TV.
2. Enter the server address, e.g. `http://192.168.1.50:8080` (the phone's IP on the same Wi-Fi).
3. A QR code appears. On your phone: Telegram → Settings → Devices → Link Desktop Device, and scan it.
4. If your account has 2FA, the app asks for your password.

## Notes / limits

- The TV and the server must be on the same network.
- Only **H.264** video plays (HEVC/H.265 is not supported by the old TV). Most Telegram videos are H.264.
- **MKV** files are supported (remuxed to MP4 on the server), but require `ffmpeg` installed and H.264/AAC codecs.
- Subtitles support `.srt`/`.vtt` (`.ass` styling is not rendered).
- Keep the server running (Termux open) while watching. Android may kill background apps — use `termux-wake-lock`
  or disable battery optimization for Termux.

## License

MIT. See [LICENSE](LICENSE).
