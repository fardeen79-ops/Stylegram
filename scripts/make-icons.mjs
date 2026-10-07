// Generates the app icons in public/icons from one SVG design. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const gradient = `<linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0" stop-color="#ffb35c"/><stop offset="0.35" stop-color="#ff7a59"/>
  <stop offset="0.7" stop-color="#e94b7a"/><stop offset="1" stop-color="#c13584"/></linearGradient>`;

/** White shopping-bag mark, centred, at `scale` of the canvas. */
const bag = (scale) => {
  const s = 512 * scale, o = (512 - s) / 2, k = s / 24;
  return `<g transform="translate(${o} ${o}) scale(${k})" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8h-9a1 1 0 0 1-1-.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></g>`;
};

const icon = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>${gradient}</defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#g)"/>${bag(scale)}</svg>`;

const out = [
  ["icon-192.png", 192, icon({ rounded: true, scale: 0.62 })],
  ["icon-512.png", 512, icon({ rounded: true, scale: 0.62 })],
  // Maskable: full-bleed background, mark inside the 80% safe zone.
  ["maskable-512.png", 512, icon({ rounded: false, scale: 0.5 })],
  ["maskable-192.png", 192, icon({ rounded: false, scale: 0.5 })],
  // iOS rounds the corners itself and doesn't allow transparency.
  ["apple-touch-icon.png", 180, icon({ rounded: false, scale: 0.6 })],
];
for (const [name, size, svg] of out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log("wrote", name);
}
await sharp(Buffer.from(icon({ rounded: true, scale: 0.62 }))).resize(64, 64).png().toFile("public/icons/favicon-64.png");
