// Line icons (24×24, stroke = currentColor), drawn for Stylegram.
const svg = (body, { fill = "none", size = 24, sw = 2 } = {}) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  home: (on) => svg(`<path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6.5H9V21H4a1 1 0 0 1-1-1z"/>`, { fill: on ? "currentColor" : "none" }),
  search: (on) => svg(`<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/>`, { sw: on ? 3 : 2 }),
  explore: (on) => svg(`<circle cx="12" cy="12" r="9.2"/><path d="m15.8 8.2-2.4 5.2-5.2 2.4 2.4-5.2z" fill="${on ? "currentColor" : "none"}"/>`),
  create: () => svg(`<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>`),
  heart: (on) => svg(`<path d="M12 20.3s-7.6-4.6-9.4-9.3C1.3 7.6 3.5 4.3 7 4.3c2 0 3.7 1.1 5 2.9 1.3-1.8 3-2.9 5-2.9 3.5 0 5.7 3.3 4.4 6.7-1.8 4.7-9.4 9.3-9.4 9.3z"/>`, { fill: on ? "currentColor" : "none" }),
  comment: () => svg(`<path d="M20.6 16.4A9 9 0 1 0 17 20.1L21.2 21z"/>`),
  share: () => svg(`<path d="M21.5 3 10.2 13.8M21.5 3 15 21l-4.8-7.2L3 9.3z"/>`),
  bookmark: (on) => svg(`<path d="M19 21 12 16 5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1z"/>`, { fill: on ? "currentColor" : "none" }),
  bag: (on) => svg(`<path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8h-9a1 1 0 0 1-1-.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>`, { fill: on ? "currentColor" : "none" }),
  user: () => svg(`<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>`),
  grid: (on) => svg(`<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>`, { sw: on ? 2.2 : 1.8, size: 12 }),
  saved: (on) => svg(`<path d="M19 21 12 16 5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1z"/>`, { sw: on ? 2.2 : 1.8, size: 12 }),
  shop: (on) => svg(`<path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8h-9a1 1 0 0 1-1-.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>`, { sw: on ? 2.2 : 1.8, size: 12 }),
  more: () => svg(`<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>`),
  menu: () => svg(`<path d="M3 6h18M3 12h18M3 18h18"/>`),
  chevronLeft: () => svg(`<path d="m14.5 6-6 6 6 6"/>`, { sw: 2.4, size: 16 }),
  chevronRight: () => svg(`<path d="m9.5 6 6 6-6 6"/>`, { sw: 2.4, size: 16 }),
  back: () => svg(`<path d="M20 12H4M10 6l-6 6 6 6"/>`),
  close: () => svg(`<path d="M6 6l12 12M18 6 6 18"/>`),
  images: () => svg(`<rect x="7" y="3" width="14" height="14" rx="2" fill="currentColor"/><path d="M4 7v12a2 2 0 0 0 2 2h12" />`, { size: 20 }),
  photos: () => svg(`<rect x="3" y="5" width="15" height="15" rx="2"/><path d="M7 2h13a2 2 0 0 1 2 2v13"/><path d="m3 16 4.5-4.5 4 4 2.5-2.5 4 4"/><circle cx="8.5" cy="9.5" r="1.4"/>`, { size: 72, sw: 1.2 }),
  chart: (on) => svg(`<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`, { sw: on ? 2.6 : 2 }),
  shield: () => svg(`<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>`),
  link: () => svg(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
  verified: () => `<svg class="vf" width="14" height="14" viewBox="0 0 24 24" aria-label="Verified"><path fill="#3897f0" d="M12 1.5 14.6 3.3l3.1-.2 1 3 2.6 1.8-.9 3 .9 3-2.6 1.8-1 3-3.1-.2L12 22.5l-2.6-1.8-3.1.2-1-3-2.6-1.8.9-3-.9-3 2.6-1.8 1-3 3.1.2z"/><path d="m8 12.3 2.7 2.7L16.3 9.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
