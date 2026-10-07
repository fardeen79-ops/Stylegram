// Stylegram icon set: soft, rounded duotone glyphs (stroke = currentColor, light tint fill).
// Drawn for Stylegram; `on` = active/selected state (solid fill).
const svg = (body, { size = 24, sw = 1.8 } = {}) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Main shape of an icon: lightly tinted normally, solid when active. */
const shape = (d, on) => `<path d="${d}" fill="currentColor" fill-opacity="${on ? 1 : 0.12}"/>`;

const HEART = "M12 20s-8-4.7-8-10.6C4 6.6 6 4.5 8.6 4.5c1.5 0 2.6.7 3.4 1.9.8-1.2 1.9-1.9 3.4-1.9C18 4.5 20 6.6 20 9.4 20 15.3 12 20 12 20z";
const HANGER_BODY = "M12 8.2 3.4 14.6a1.4 1.4 0 0 0 .84 2.5h15.52a1.4 1.4 0 0 0 .84-2.5z";
const HANGER_HOOK = "M12 8.2V7.1a1.9 1.9 0 1 0-1.9-1.9";
const TAG = "M3.5 12.1V5a1.5 1.5 0 0 1 1.5-1.5h7.1a1.5 1.5 0 0 1 1.06.44l7.4 7.4a1.5 1.5 0 0 1 0 2.12l-7.1 7.1a1.5 1.5 0 0 1-2.12 0l-7.4-7.4a1.5 1.5 0 0 1-.44-1.06z";
const SPARK = "M10.5 3c.7 4.1 2.4 5.8 6.5 6.5-4.1.7-5.8 2.4-6.5 6.5-.7-4.1-2.4-5.8-6.5-6.5 4.1-.7 5.8-2.4 6.5-6.5z";
const SPARK_SMALL = "M18 14c.3 1.6 1 2.2 2.5 2.5-1.6.3-2.2 1-2.5 2.5-.3-1.6-1-2.2-2.5-2.5 1.6-.3 2.2-1 2.5-2.5z";
const BUBBLE = "M6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 3.5V17h-1A2.5 2.5 0 0 1 4 14.5v-8A2.5 2.5 0 0 1 6.5 4z";

export const icons = {
  /** Home = your feed: a stack of look cards. */
  home: (on) => svg(`${shape("M6.5 8h11A2.5 2.5 0 0 1 20 10.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-8A2.5 2.5 0 0 1 6.5 8z", on)}<path d="M7 4.5h10"/>`),
  search: (on) => svg(`${shape("M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z", on)}<path d="m15.8 15.8 4.2 4.2" stroke-width="2.4"/>`),
  /** Explore = discover: sparkles. */
  explore: (on) => svg(`${shape(SPARK, on)}${shape(SPARK_SMALL, on)}`),
  create: () => svg(`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.12"/><path d="M12 8v8M8 12h8"/>`),
  heart: (on) => svg(shape(HEART, on)),
  comment: () => svg(`${shape(BUBBLE, false)}<circle cx="8.6" cy="10.5" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="10.5" r=".9" fill="currentColor" stroke="none"/><circle cx="15.4" cy="10.5" r=".9" fill="currentColor" stroke="none"/>`),
  share: () => svg(`<path d="M12 14V3.5M7.8 7.6 12 3.5l4.2 4.1"/><path d="M5 12.5v5.8A2.7 2.7 0 0 0 7.7 21h8.6a2.7 2.7 0 0 0 2.7-2.7v-5.8"/>`),
  /** Saved = your closet: a hanger. */
  bookmark: (on) => svg(`${shape(HANGER_BODY, on)}<path d="${HANGER_HOOK}"/>`),
  /** Product tags: a price tag. */
  bag: (on) => svg(`${shape(TAG, on)}<circle cx="8" cy="8" r="1.5" ${on ? 'fill="var(--tag-hole, #fff)" stroke="none"' : ""}/>`),
  user: () => svg(`<circle cx="12" cy="8" r="4" fill="currentColor" fill-opacity="0.12"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>`),
  grid: (on) => svg(`<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>`, { size: 13, sw: on ? 2.4 : 2 }),
  saved: (on) => svg(`<path d="${HANGER_BODY}"/><path d="${HANGER_HOOK}"/>`, { size: 13, sw: on ? 2.4 : 2 }),
  shop: (on) => svg(`<path d="${TAG}"/><circle cx="8" cy="8" r="1.5"/>`, { size: 13, sw: on ? 2.4 : 2 }),
  more: () => svg(`<circle cx="12" cy="5.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.5" fill="currentColor" stroke="none"/>`),
  menu: () => svg(`<path d="M4 8.5h16M4 15.5h10"/>`),
  chevronLeft: () => svg(`<path d="m14.5 6-6 6 6 6"/>`, { sw: 2.4, size: 16 }),
  chevronRight: () => svg(`<path d="m9.5 6 6 6-6 6"/>`, { sw: 2.4, size: 16 }),
  back: () => svg(`<path d="M20 12H4M10 6l-6 6 6 6"/>`),
  close: () => svg(`<path d="M6 6l12 12M18 6 6 18"/>`),
  /** Carousel badge on grid tiles: fanned cards. */
  images: () => svg(`<rect x="8" y="4" width="12" height="14" rx="3" fill="currentColor" stroke="none"/><path d="M5 7.5v10A3.5 3.5 0 0 0 8.5 21H15"/>`, { size: 20 }),
  photos: () => svg(`<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" fill="currentColor" fill-opacity="0.08"/><circle cx="12" cy="13" r="3.5"/>`, { size: 72, sw: 1.1 }),
  chart: (on) => svg(`<rect x="4" y="11" width="4" height="9" rx="1.5" fill="currentColor" fill-opacity="${on ? 1 : 0.12}"/><rect x="10" y="4" width="4" height="16" rx="1.5" fill="currentColor" fill-opacity="${on ? 1 : 0.12}"/><rect x="16" y="8" width="4" height="12" rx="1.5" fill="currentColor" fill-opacity="${on ? 1 : 0.12}"/>`),
  shield: () => svg(`<path d="M12 3 4.5 6v5.5c0 4.4 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5.1 7.5-9.5V6z" fill="currentColor" fill-opacity="0.12"/><path d="m9 12 2 2 4-4"/>`),
  wifiOff: () => svg(`<path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.5 5.2A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 3.5-2M12.9 10A10 10 0 0 1 19 12.5M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/><path d="M3 3l18 18"/>`, { size: 28 }),
  globe: () => svg(`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.12"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>`, { size: 20 }),
  translate: () => svg(`<path d="M4 5h9M8.5 3v2M6 5c.6 3 2.6 5.6 5.5 7M11 5c-.7 3.4-3 6.3-6.5 8"/><path d="m12.5 21 4-10 4 10M14 17.5h5"/>`, { size: 14 }).replace('class="ic"', 'class="ic inline-ic"'),
  download: () => svg(`<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>`),
  iosShare: () => svg(`<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>`, { size: 18 }).replace('class="ic"', 'class="ic inline-ic"'),
  /** Verified brand: a rounded badge in the Stylegram gradient. */
  verified: () => `<svg class="vf" width="14" height="14" viewBox="0 0 24 24" aria-label="Verified"><defs><linearGradient id="vfg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#14b8a6"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="7" fill="url(#vfg)"/><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
