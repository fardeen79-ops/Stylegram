// Generates the app icons (price tag on the Stylegram indigo→teal gradient) in public/icons from one SVG design. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const gradient = `<linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#14b8a6"/></linearGradient>`;

/** White price-tag mark (Stylegram's tagging), centred, at `scale` of the canvas. */
const bag = (scale) => {
  const s = 512 * scale, o = (512 - s) / 2, k = s / 24;
  return `<g transform="translate(${o} ${o}) scale(${k}) rotate(-8 12 12)">
    <path d="M3.5 12.1V5a1.5 1.5 0 0 1 1.5-1.5h7.1a1.5 1.5 0 0 1 1.06.44l7.4 7.4a1.5 1.5 0 0 1 0 2.12l-7.1 7.1a1.5 1.5 0 0 1-2.12 0l-7.4-7.4a1.5 1.5 0 0 1-.44-1.06z" fill="#fff"/>
    <circle cx="8" cy="8" r="1.7" fill="#4f46e5"/></g>`;
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
