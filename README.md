# Telegram TV (webOS)

A video client for your **Telegram channels and groups**, for **old LG webOS TVs** (webOS 3.x, e.g. the 2017
`32LJ550B` and similar).

Sign in by scanning a QR code with your phone, browse the channels that contain videos, and play them with the
remote. It streams while it downloads, so nothing is stored permanently — neither on the TV nor on the server.

The app interface is in Spanish.

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
- `app/` — a webOS app written in **ES5 only** (no frameworks), so it runs on Chromium 38. It shows the QR, lets you
  browse with the remote and plays the videos with the native `<video>` element.

## Features

- QR sign-in (Telegram → Settings → Devices → Link Desktop Device). Two-step verification (2FA) is detected and
  supported.
- The session persists, so you only scan the QR once.
- Lists the channels/groups that contain videos (sent as videos).
- Grid of videos with duration and size; play with the remote.
- Spatial navigation (d-pad arrows + OK + Back).
- Temporary files: the server deletes cached videos automatically (30 min without use, and on restart). The TV never
  stores anything.

## Prerequisites

1. A Telegram `api_id` and `api_hash` from <https://my.telegram.org> → API development tools.
2. A machine to run `server/` with Node.js ≥ 16 (an Android phone with Termux, a PC, or a server).
3. A rooted/dev-mode LG webOS 3.x TV, and a way to sideload an `.ipk` (e.g. Homebrew Channel, or `ares-install`).

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
pkg update && pkg install nodejs curl -y
cd ~ && mkdir tg-backend && cd tg-backend
# copy server.js, package.json, config.json here, then:
npm install
nano config.json       # put your apiId/apiHash
node server.js
```

### 2. Install the app on the TV

Package it with the [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-introduction):

```bash
cd app
ares-package . -o bin --no-minify
```

This produces `bin/com.telegramtv.app_0.1.0_all.ipk`. Install it on the TV (Homebrew Channel, Dev Manager, or
`ares-install`).

### 3. Connect and sign in

1. Open **Telegram TV** on the TV.
2. Enter the server address, e.g. `http://192.168.1.50:8080` (the phone's IP on the same Wi-Fi).
3. A QR code appears. On your phone: Telegram → Settings → Devices → Link Desktop Device, and scan it.
4. If your account has 2FA, the app asks for your password.

## Notes / limits

- The TV and the server must be on the same network.
- Only **H.264** video plays (HEVC/H.265 is not supported by the old TV). Most Telegram videos are H.264.
- Files sent **as documents (MKV)** are not listed yet; only videos sent "as video".
- Keep the server running (Termux open) while watching. Android may kill background apps — use `termux-wake-lock`
  or disable battery optimization for Termux.

## License

MIT. See [LICENSE](LICENSE).
