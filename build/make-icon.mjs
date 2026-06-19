// Generates a custom Laradisco app icon: a disco ball on a dark rounded square.
// Run: node build/make-icon.mjs   (regenerates build/icon.png + resources/icon.png)
import sharp from 'sharp';
import { writeFileSync } from 'fs';

const S = 1024; // canvas
const cx = 512;
const cy = 560; // ball sits slightly low to leave room for the mount
const R = 358; // ball radius
const cell = 52; // facet grid pitch
const gap = 5; // gap between facets
const fr = (cell - gap) / 2; // facet half-size

// Highlight comes from the upper-left, like a light hitting the ball.
const hx = cx - R * 0.42;
const hy = cy - R * 0.42;

// Vibrant accent facets scattered around the ball.
const accents = ['#ff3ea5', '#a855f7', '#22d3ee', '#fbbf24', '#4ade80'];

function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
}
function hex(r, g, b) {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

let facets = '';
let i = 0;
const cols = Math.ceil((2 * R) / cell) + 2;
for (let gxn = -cols; gxn <= cols; gxn++) {
    for (let gyn = -cols; gyn <= cols; gyn++) {
        const fx = cx + gxn * cell;
        const fy = cy + gyn * cell;
        const d = Math.hypot(fx - cx, fy - cy);
        if (d > R - fr * 0.3) continue; // keep facets inside the sphere

        // Spherical brightness: bright near the highlight, dark at the rim.
        const hd = Math.hypot(fx - hx, fy - hy);
        let bright = 1 - hd / (R * 1.7);
        bright = Math.max(0.18, Math.min(1, bright));
        // darken toward the silhouette edge for roundness
        bright *= 0.55 + 0.45 * (1 - d / R);

        // Deterministic "random" accent placement (hash mixed so accents
        // scatter instead of lining up in columns).
        let seed = ((gxn * 374761393) + (gyn * 668265263)) | 0;
        seed = (seed ^ (seed >>> 13)) * 1274126177;
        seed = (seed ^ (seed >>> 16)) >>> 0;
        const isAccent = seed % 7 === 0 && d < R * 0.9;

        let fill;
        if (isAccent) {
            fill = accents[seed % accents.length];
        } else {
            // cool silver-blue tint that brightens toward the highlight
            const r = lerp(70, 244, bright);
            const g = lerp(96, 250, bright);
            const b = lerp(140, 255, bright);
            fill = hex(r, g, b);
        }
        const op = isAccent ? 0.92 : 0.6 + 0.4 * bright;
        facets += `<rect x="${(fx - fr).toFixed(1)}" y="${(fy - fr).toFixed(1)}" width="${(fr * 2).toFixed(
            1,
        )}" height="${(fr * 2).toFixed(1)}" rx="6" fill="${fill}" fill-opacity="${op.toFixed(2)}"/>`;
        i++;
    }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2150"/>
      <stop offset="1" stop-color="#120b22"/>
    </linearGradient>
    <radialGradient id="glow" cx="${(((hx) / S) * 100).toFixed(1)}%" cy="${(((hy) / S) * 100).toFixed(1)}%" r="75%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.25"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="ball"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
  </defs>

  <rect width="${S}" height="${S}" rx="208" ry="208" fill="url(#bg)"/>

  <!-- mount / hanger -->
  <rect x="${cx - 9}" y="${cy - R - 64}" width="18" height="80" rx="9" fill="#cbd5e1"/>
  <circle cx="${cx}" cy="${cy - R - 70}" r="20" fill="none" stroke="#cbd5e1" stroke-width="14"/>

  <!-- ball body -->
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="#0e1330"/>
  <g clip-path="url(#ball)">${facets}</g>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#glow)"/>

  <!-- light sparkles cast by the ball -->
  <g fill="#ffffff">
    <path d="M205 300 l10 34 34 10 -34 10 -10 34 -10-34 -34-10 34-10z" fill-opacity="0.9"/>
    <path d="M835 470 l8 26 26 8 -26 8 -8 26 -8-26 -26-8 26-8z" fill-opacity="0.75"/>
    <path d="M770 815 l7 22 22 7 -22 7 -7 22 -7-22 -22-7 22-7z" fill-opacity="0.7"/>
  </g>
</svg>`;

writeFileSync('build/icon.svg', svg);
await sharp(Buffer.from(svg), { density: 384 }).resize(S, S).png().toFile('build/icon.png');
await sharp(Buffer.from(svg), { density: 384 }).resize(512, 512).png().toFile('resources/icon.png');
console.log(`wrote build/icon.svg, build/icon.png (1024), resources/icon.png (512) — ${i} facets`);
