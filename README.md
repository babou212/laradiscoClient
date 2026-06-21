# LaraDisco Desktop Client

A cross-platform desktop communication app built with **Electron**, **Vue 3**, and **TypeScript**. LaraDisco delivers real-time messaging, voice/video calls, and screen sharing.

## Features

- **Real-time Messaging** — Channels, direct messages, threads, and pinned messages with cursor-based pagination
- **Voice & Video** — WebRTC-powered calls via LiveKit with noise suppression, echo cancellation, and auto gain control
- **Push-to-Talk** — Configurable global hotkey support via uIOhook
- **Screen Sharing** — Multiple quality presets (low, medium, high, source)
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
| Framework | Electron 41, Vue 3.5, TypeScript 5 |
| Build | electron-vite 5, electron-builder |
| State | Pinia 3, Pinia Colada |
| Routing | Vue Router 4 (hash mode) |
| UI | Tailwind CSS 4, shadcn-vue (New York style), PrimeVue, Reka UI, Lucide icons |
| i18n | Vue I18n 11 |
| Real-time | Laravel Echo, Pusher |
| Voice/Video | LiveKit Client SDK |
| Database | better-sqlite3, Drizzle ORM |
| HTTP | Axios |
| Media | Sharp (thumbnails), Howler (audio), FFmpeg |
| Validation | Zod |

## Prerequisites

- **Node.js** >= 24
- **npm** >= 11
- A running [LaraDisco](../laradisco) server instance

## Getting Started

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Build for Production
npm run build
```

The app will launch with hot-reload enabled for the renderer process.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Run TypeScript type checking (node + renderer) |
| `npm run lint` | Lint with ESLint (auto-fix) |
| `npm run format` | Format with Prettier |
| `npm run package` | Build an unpacked app directory |
| `npm run make` | Build installers for the current platform |
| `npm run make:win` / `make:mac` / `make:linux` | Build installers for a specific platform |
| `npm run publish` | Build and publish a release to GitHub |

## Project Structure

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # App entry, window management, IPC
│   ├── database.ts        # SQLite database setup
│   ├── ipc.ts             # IPC handler registration
│   ├── ptt.ts             # Push-to-talk global hotkeys
│   ├── updater.ts         # Auto-update logic
│   ├── db/                # SQLite schema & setup
│   ├── media/             # Thumbnail generation
│   ├── services/          # URL unfurling & normalization
├── preload/               # Context-isolated bridge APIs
│   ├── apis/              # IPC API modules (auth, window, etc.)
│   └── types/             # TypeScript type definitions
└── renderer/              # Vue 3 frontend
    └── src/
        ├── api/           # API client modules (auth, channels, messages, etc.)
        ├── assets/        # CSS (Tailwind, themes)
        ├── components/    # Vue components + shadcn-vue UI
        ├── composables/   # Vue composables
        ├── i18n/          # Internationalization (da, de, en, es, fr, nl, pl, pt, ru, zh)
        ├── layouts/       # Page layouts (app, auth, settings)
        ├── lib/           # Libraries (Echo, markdown, schemas)
        ├── queries/       # Pinia Colada query options
        ├── router/        # Vue Router configuration
        ├── stores/        # Pinia stores
        ├── types/         # TypeScript type definitions
        ├── utils/         # Utility functions
        └── views/         # Page views (chat, auth, settings)
```

## Packaging & Distribution

Built with electron-builder, producing platform-specific installers:

| Platform | Formats |
|----------|---------|
| Windows | NSIS installer |
| macOS | DMG, ZIP |
| Linux | AppImage |

## CI/CD

GitHub Actions workflows handle:

- **CI** — Lint, typecheck, build matrix (Ubuntu, macOS, Windows)
- **Release** — Automatic GitHub Releases with platform-specific artifacts on push to `main`

## Security

- Context isolation and sandboxing enabled
- Node integration disabled in renderer
- HTML sanitization via DOMPurify

## Translations

Language translations have been generated using AI and may not be fully accurate. If you notice any errors or would like to improve a translation, contributions are welcome.

## License

AGPL-3.0-or-later
