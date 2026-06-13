#!/usr/bin/env node
/**
 * uiohook-napi ships an N-API prebuilt binary named `uiohook-napi.node`, but
 * @electron/rebuild (invoked by electron-builder) only recognizes prebuildify
 * N-API prebuilds named `node.napi.<ext>` / `electron.napi.<ext>`. Because the
 * name doesn't match, electron-builder fails to detect the prebuild and falls
 * back to a node-gyp source compile — which breaks on CI machines without a
 * full MSVC/Xcode toolchain (e.g. "Could not find any Visual Studio installation").
 *
 * N-API binaries are ABI-stable across Node and Electron, so the shipped
 * prebuild is already correct for Electron. We just expose it under the
 * canonical name so @electron/rebuild detects it and skips compilation.
 *
 * See node_modules/@electron/rebuild/lib/module-type/prebuildify.js.
 */

import { copyFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prebuildsDir = join(__dirname, '..', 'node_modules', 'uiohook-napi', 'prebuilds');

if (!existsSync(prebuildsDir)) {
    // uiohook-napi not installed (or no prebuilds) — nothing to do.
    process.exit(0);
}

// Mirror @electron/rebuild's determineNativePrebuildExtension().
function napiExtForArch(arch) {
    if (arch === 'arm64') return 'armv8.node';
    if (arch === 'armv7l' || arch === 'arm') return 'armv7.node';
    return 'node';
}

for (const dir of readdirSync(prebuildsDir)) {
    const platformDir = join(prebuildsDir, dir);
    const arch = dir.slice(dir.lastIndexOf('-') + 1);
    const canonical = `node.napi.${napiExtForArch(arch)}`;
    const canonicalPath = join(platformDir, canonical);

    if (existsSync(canonicalPath)) continue; // already detectable

    const nodeFiles = readdirSync(platformDir).filter((f) => f.endsWith('.node'));
    if (nodeFiles.length === 0) continue;

    copyFileSync(join(platformDir, nodeFiles[0]), canonicalPath);
    console.log(`[uiohook] Exposed prebuild for @electron/rebuild: ${dir}/${canonical}`);
}
