#!/usr/bin/env node
/**
 * Downloads the proprietary libffmpeg for the installed Electron version
 * and replaces the bundled stub, enabling H.264/AAC hardware codec support.
 *
 * Electron's official GitHub releases include a proprietary ffmpeg build as a
 * separate asset: ffmpeg-v{VERSION}-{platform}-{arch}.zip
 *
 * Reference: https://www.electronjs.org/docs/latest/tutorial/using-proprietary-codecs
 */

import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// --- Detect installed Electron version ---
const electronPkgPath = join(rootDir, 'node_modules', 'electron', 'package.json');
if (!existsSync(electronPkgPath)) {
    console.error('[ffmpeg] node_modules/electron not found — run npm install first');
    process.exit(1);
}
const electronVersion = JSON.parse(readFileSync(electronPkgPath, 'utf8')).version;

const platform = process.platform; // linux | darwin | win32
const arch = process.arch;         // x64 | arm64 | ia32

// --- Paths ---
const libName = platform === 'win32' ? 'ffmpeg.dll' : platform === 'darwin' ? 'libffmpeg.dylib' : 'libffmpeg.so';
const distDir = join(rootDir, 'node_modules', 'electron', 'dist');

let destPath;
if (platform === 'darwin') {
    destPath = join(
        distDir,
        'Electron.app',
        'Contents',
        'Frameworks',
        'Electron Framework.framework',
        'Versions',
        'A',
        'Libraries',
        'libffmpeg.dylib',
    );
} else {
    destPath = join(distDir, libName);
}

// --- Skip if already proprietary ---
// The proprietary libffmpeg is ~10× larger than the stub (~4 MB vs ~400 KB).
const PROPRIETARY_MIN_BYTES = 3 * 1024 * 1024; // 3 MB
if (existsSync(destPath) && statSync(destPath).size >= PROPRIETARY_MIN_BYTES) {
    console.log(`[ffmpeg] Proprietary ffmpeg already installed (${(statSync(destPath).size / 1024 / 1024).toFixed(1)} MB). Skipping.`);
    process.exit(0);
}

// --- Download ---
const zipName = `ffmpeg-v${electronVersion}-${platform}-${arch}.zip`;
const url = `https://github.com/electron/electron/releases/download/v${electronVersion}/${zipName}`;
const tmpDir = join(tmpdir(), `electron-ffmpeg-${Date.now()}`);
const tmpZip = join(tmpDir, zipName);

console.log(`[ffmpeg] Installing proprietary codecs for Electron v${electronVersion} (${platform}-${arch})`);
console.log(`[ffmpeg] Downloading from ${url}`);

mkdirSync(tmpDir, { recursive: true });

try {
    execSync(`curl -fsSL --progress-bar -o "${tmpZip}" "${url}"`, { stdio: 'inherit' });
} catch {
    console.error('[ffmpeg] curl failed — is curl installed? Try: sudo apt install curl');
    rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
}

// --- Extract ---
try {
    execSync(`unzip -o "${tmpZip}" "${libName}" -d "${tmpDir}"`, { stdio: 'inherit' });
} catch {
    console.error('[ffmpeg] unzip failed — is unzip installed? Try: sudo apt install unzip');
    rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
}

const extractedLib = join(tmpDir, libName);
if (!existsSync(extractedLib)) {
    console.error(`[ffmpeg] ${libName} not found in downloaded zip`);
    rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
}

// --- Install ---
copyFileSync(extractedLib, destPath);
rmSync(tmpDir, { recursive: true, force: true });

const sizeMb = (statSync(destPath).size / 1024 / 1024).toFixed(1);
console.log(`[ffmpeg] Installed ${libName} (${sizeMb} MB) → ${destPath}`);
console.log('[ffmpeg] H.264/AAC hardware codecs are now available in Electron.');
