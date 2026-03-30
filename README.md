# LaraDisco Desktop Client

A secure, cross-platform desktop communication app built with **Electron**, **Vue 3**, and **TypeScript**. LaraDisco delivers real-time messaging, voice/video calls, screen sharing, and end-to-end encryption — all powered by a Laravel backend.

## Features

- **Real-time Messaging** — Channels, direct messages, threads, and pinned messages with cursor-based pagination
- **End-to-End Encryption** — MLS (Messaging Layer Security) via OpenMLS WASM, with PIN-protected key backup/restore
- **Voice & Video** — WebRTC-powered calls via LiveKit with noise suppression, echo cancellation, and auto gain control
- **Push-to-Talk** — Configurable global hotkey support via uIOhook
- **Screen Sharing** — Multiple quality presets (low, medium, high, source)
- **File Encryption** — AES-based file encryption/decryption for attachments
- **Rich Text** — Markdown rendering, code syntax highlighting, and emoji picker
- **User Presence** — Online/offline status, custom status messages, and heartbeat tracking
- **Multi-Server** — Connect to multiple LaraDisco server instances
- **Auto Updates** — Built-in updater via electron-updater
- **Role-Based Permissions** — Invite members, manage roles, channels, and server settings
- **Two-Factor Authentication** — TOTP-based 2FA with recovery codes
- **Native Notifications** — Desktop notifications with click-to-navigate

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Framework | Electron 35, Vue 3.5, TypeScript 5 |
| Build | electron-vite, Electron Forge |
| State | Pinia 3 |
| Routing | Vue Router 4 (hash mode) |
| UI | Tailwind CSS 4, shadcn-vue (New York style), PrimeVue, Reka UI, Lucide icons |
| Real-time | Laravel Echo, Pusher |
| Voice/Video | LiveKit Client SDK |
| Crypto | OpenMLS (WASM), @noble/curves, @noble/hashes, hash-wasm |
| Database | better-sqlite3 |
| HTTP | Axios |
| Media | Sharp (thumbnails), Howler (audio), FFmpeg |
| Validation | Zod |

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- A running [LaraDisco](../laradisco) server instance

## Getting Started

```bash
# Install dependencies
npm install

# Install dependencies
npm run build

# Start in development mode
npm run dev
```

The app will launch with hot-reload enabled for the renderer process.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Build for production |
| `npm run package` | Create a redistributable package |
| `npm run make` | Build platform-specific installers |
| `npm run make:win` | Build Windows installer |
| `npm run make:mac` | Build macOS DMG |
| `npm run make:linux` | Build Linux packages |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format with Prettier |

## Project Structure

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # App entry, window management, IPC
│   ├── database.ts        # SQLite database setup
│   ├── ipc.ts             # IPC handler registration
│   ├── ptt.ts             # Push-to-talk global hotkeys
│   ├── updater.ts         # Auto-update logic
│   ├── crypto/            # AES file encryption
│   ├── media/             # Thumbnail generation
│   └── mls/               # OpenMLS WASM integration
│       ├── index.ts       # MLS coordinator & IPC handlers
│       ├── backup.ts      # Key backup/restore with PIN
│       ├── state.ts       # MLS state management
│       ├── storage.ts     # SQLite persistence for MLS
│       ├── auto-backup.ts # Automatic backup scheduling
│       └── wasm/          # OpenMLS WASM binaries
├── preload/               # Context-isolated bridge APIs
│   ├── apis/              # IPC API modules (auth, mls, window, etc.)
│   └── types/             # TypeScript type definitions
└── renderer/              # Vue 3 frontend
    └── src/
        ├── components/    # Vue components + shadcn-vue UI
        ├── composables/   # Vue composables
        ├── layouts/       # Page layouts
        ├── router/        # Vue Router configuration
        ├── stores/        # Pinia stores
        ├── views/         # Page views
        └── utils/         # Utility functions
```

## Packaging & Distribution

Built with Electron Forge, producing platform-specific installers:

| Platform | Formats |
|----------|---------|
| Windows | Squirrel installer, ZIP |
| macOS | DMG, ZIP |
| Linux | DEB, RPM, Flatpak, AppImage |

## CI/CD

GitHub Actions workflows handle:

- **CI** — Lint, typecheck, build matrix (Ubuntu, macOS, Windows), Snyk security scan
- **Release** — Automatic GitHub Releases with platform-specific artifacts on push to `main`

## Security

- Context isolation and sandboxing enabled
- Node integration disabled in renderer
- HTML sanitization via DOMPurify
- End-to-end encryption with MLS (Messaging Layer Security)
- AES file encryption for attachments
- Snyk vulnerability scanning in CI

## License

AGPL-3.0-or-later
