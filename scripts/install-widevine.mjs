#!/usr/bin/env node
/**
 * Downloads the Widevine CDM from Google Chrome's stable .deb package
 * and installs it into Electron's dist directory, enabling DRM playback
 * (YouTube, etc.) in the packaged app.
 *
 * Only supports Linux x64 — macOS and Windows ship with system Widevine.
 */

import { execSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

if (process.platform !== 'linux') {
    console.log('[widevine] Skipping — only needed on Linux.');
    process.exit(0);
}

if (process.arch !== 'x64') {
    console.log(`[widevine] Skipping — unsupported arch: ${process.arch}`);
    process.exit(0);
}

// --- Paths ---
const electronDist = join(rootDir, 'node_modules', 'electron', 'dist');
const destDir = join(electronDist, 'WidevineCdm');
const destLib = join(destDir, '_platform_specific', 'linux_x64', 'libwidevinecdm.so');
const destManifest = join(destDir, 'manifest.json');

// --- Skip if already installed ---
const WIDEVINE_MIN_BYTES = 3 * 1024 * 1024; // 3 MB
if (existsSync(destLib) && statSync(destLib).size >= WIDEVINE_MIN_BYTES && existsSync(destManifest)) {
    const manifest = JSON.parse(readFileSync(destManifest, 'utf8'));
    console.log(`[widevine] CDM already installed (v${manifest.version}). Skipping.`);
    process.exit(0);
}

// --- Download Chrome .deb ---
const tmpDir = join(tmpdir(), `widevine-cdm-${Date.now()}`);
const debPath = join(tmpDir, 'chrome.deb');

console.log('[widevine] Installing Widevine CDM from Google Chrome stable...');
mkdirSync(tmpDir, { recursive: true });

try {
    console.log('[widevine] Downloading google-chrome-stable .deb...');
    execSync(
        `curl -fsSL --progress-bar -o "${debPath}" "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"`,
        { stdio: 'inherit' },
    );
} catch {
    console.error('[widevine] Failed to download Chrome .deb — is curl installed?');
    rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
}

// --- Extract WidevineCdm from .deb ---
const extractDir = join(tmpDir, 'extracted');
mkdirSync(extractDir, { recursive: true });

try {
    // .deb is an ar archive containing data.tar.xz
    execSync(`ar x "${debPath}"`, { cwd: extractDir, stdio: 'pipe' });

    // Find the data archive (could be data.tar.xz, data.tar.zst, or data.tar.gz)
    const dataArchive = ['data.tar.xz', 'data.tar.zst', 'data.tar.gz']
        .map((name) => join(extractDir, name))
        .find((p) => existsSync(p));

    if (!dataArchive) {
        throw new Error('No data.tar.* found in .deb');
    }

    // Extract only the WidevineCdm directory
    execSync(`tar xf "${dataArchive}" --wildcards "*/WidevineCdm/*"`, {
        cwd: extractDir,
        stdio: 'pipe',
    });
} catch (err) {
    console.error(`[widevine] Failed to extract Chrome .deb: ${err.message}`);
    rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
}

// --- Locate and copy WidevineCdm ---
const chromeCdmDir = join(extractDir, 'opt', 'google', 'chrome', 'WidevineCdm');

if (!existsSync(chromeCdmDir)) {
    console.error('[widevine] WidevineCdm not found in Chrome .deb');
    rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
}

// Remove old CDM if present, then copy fresh
if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
}
cpSync(chromeCdmDir, destDir, { recursive: true });

// --- Clean up ---
rmSync(tmpDir, { recursive: true, force: true });

// --- Verify ---
if (!existsSync(destLib)) {
    console.error('[widevine] libwidevinecdm.so not found after extraction');
    process.exit(1);
}

const manifest = JSON.parse(readFileSync(destManifest, 'utf8'));
const sizeMb = (statSync(destLib).size / 1024 / 1024).toFixed(1);
console.log(`[widevine] Installed Widevine CDM v${manifest.version} (${sizeMb} MB) → ${destDir}`);
console.log('[widevine] DRM playback (YouTube, etc.) is now available in Electron.');
