/**
 * ui.js — Komponen UI Reusable (Toast, Modal/Sheet, Dialog, Ikon SVG, Tema)
 * Menggunakan design system di tokens.css, base.css, components.css, layout.css
 */

import { escapeHtml } from './format.js';

/* ---------- Kamus Ikon SVG ---------- */
export const ICONS = {
  store: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg>`,
  cashier: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/><path d="M7 8h10"/><path d="M7 12h4"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  award: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`,
  truck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`,
  shoppingBag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`,
  rotateCcw: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  userCheck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
  printer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  alertTriangle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  database: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  chevronUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  scan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/></svg>`,
  package: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
  arrowDownLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>`,
  arrowUpRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  xCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>`,
  smartphone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><line x1="12" x2="12.01" y1="18" y2="18"/></svg>`,
  bluetooth: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/></svg>`,
  wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" x2="12.01" y1="20" y2="20"/></svg>`,
  messageCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  helpCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  calculator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  wifiOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/><path d="M5 13a10 10 0 0 1 5.24-2.76"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
  palette: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`
};

/* ---------- Toast System ---------- */
let toastContainer = null;

function pastikanToastContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-area';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Tampilkan notifikasi Toast
 * @param {string} pesan
 * @param {'success'|'error'|'warning'|'info'} [tipe='info']
 * @param {number} [durasiMs=3500]
 */
export function showToast(pesan, tipe = 'info', durasiMs = 3500) {
  const container = pastikanToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipe}`;

  let ikon = ICONS.info;
  if (tipe === 'success') ikon = ICONS.check;
  if (tipe === 'error') ikon = ICONS.alertTriangle;
  if (tipe === 'warning') ikon = ICONS.alertTriangle;

  toast.innerHTML = `
    ${ikon}
    <div class="toast-body grow">${escapeHtml(pesan)}</div>
    <button type="button" class="btn btn-ghost btn-icon btn-sm text-muted" aria-label="Tutup" style="margin: -6px -8px -6px auto; min-height: 28px; width: 28px;">
      ${ICONS.x}
    </button>
  `;

  const btnClose = toast.querySelector('button');
  const tutup = () => {
    toast.classList.add('keluar');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 200);
  };

  btnClose.addEventListener('click', tutup);

  container.appendChild(toast);

  if (durasiMs > 0) {
    setTimeout(tutup, durasiMs);
  }
}

/* ---------- Modal & Dialog System ---------- */

/**
 * Tampilkan modal atau bottom sheet
 * @param {Object} options
 * @param {string} options.title
 * @param {string|HTMLElement} options.body
 * @param {string|HTMLElement} [options.footer]
 * @param {boolean} [options.isSheet=false]
 * @param {string} [options.size='md'] 'sm' | 'md' | 'lg'
 * @param {boolean} [options.closeOnOverlay=true]
 * @returns {{ close: Function, el: HTMLElement }}
 */
export function showModal({
  title,
  body,
  footer = null,
  isSheet = false,
  size = 'md',
  width = null,
  closeOnOverlay = true,
  closable = true,
  modalId = '',
  onClose = null
}) {
  const overlay = document.createElement('div');
  overlay.className = `overlay ${isSheet ? 'is-sheet' : 'is-modal'}`;
  overlay.dataset.closable = closable ? 'true' : 'false';
  if (modalId) overlay.dataset.modalId = modalId;

  let resolvedSize = size;
  if (width && size === 'md') {
    const px = parseInt(String(width), 10);
    if (px >= 640) resolvedSize = 'lg';
    else if (px > 0 && px <= 480) resolvedSize = 'sm';
  }

  const dialog = document.createElement('div');
  dialog.className = `dialog ${resolvedSize === 'lg' ? 'dialog-lg' : resolvedSize === 'md' ? 'dialog-md' : resolvedSize === 'sm' ? 'dialog-sm' : ''}`;
  if (width) {
    dialog.style.setProperty('--custom-dialog-w', String(width));
  }
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  dialog.innerHTML = `
    <div class="dialog-handle"></div>
    <div class="dialog-header">
      <div class="dialog-title">${escapeHtml(title)}</div>
      <button type="button" class="btn btn-ghost btn-icon btn-sm btn-close-modal" aria-label="Tutup">
        ${ICONS.x}
      </button>
    </div>
    <div class="dialog-body"></div>
    ${footer ? '<div class="dialog-footer"></div>' : ''}
  `;

  const bodyEl = dialog.querySelector('.dialog-body');
  if (typeof body === 'string') {
    bodyEl.innerHTML = body;
  } else if (body instanceof HTMLElement) {
    bodyEl.appendChild(body);
  }

  if (footer) {
    const footerEl = dialog.querySelector('.dialog-footer');
    if (typeof footer === 'string') {
      footerEl.innerHTML = footer;
    } else if (footer instanceof HTMLElement) {
      footerEl.appendChild(footer);
    }
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  let isClosing = false;
  const baseClose = () => {
    if (isClosing) return;
    isClosing = true;
    window.removeEventListener('keydown', handleKey);
    if (typeof onClose === 'function') {
      try { onClose(); } catch (_) {}
    }
    overlay.classList.add('keluar');
    setTimeout(() => {
      if (overlay.parentElement) overlay.remove();
    }, 200);
  };

  const modalRef = { close: baseClose, el: overlay };
  const triggerClose = () => modalRef.close();
  overlay._closeModal = triggerClose;

  dialog.querySelectorAll('.btn-close-modal, .btn-batal-modal, .btn-cancel').forEach((btn) => {
    btn.addEventListener('click', triggerClose);
  });

  if (closeOnOverlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) triggerClose();
    });
  }

  // Native Swipe-Down Gesture pada handle & header bottom sheet (mobile / sheet)
  const dragTargets = [dialog.querySelector('.dialog-handle'), dialog.querySelector('.dialog-header')].filter(Boolean);
  let startY = 0;
  let startTime = 0;
  let currentDy = 0;
  let isDraggingSheet = false;

  const onTouchStart = (e) => {
    if (isClosing) return;
    if (!isSheet && window.innerWidth >= 768) return;
    if (e.target.closest('button, a, input, select, textarea')) return;
    if (!e.touches || e.touches.length !== 1) return;

    startY = e.touches[0].clientY;
    startTime = Date.now();
    currentDy = 0;
    isDraggingSheet = true;
    dialog.classList.add('is-dragging');
  };

  const onTouchMove = (e) => {
    if (!isDraggingSheet || !e.touches || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      currentDy = dy;
      dialog.style.transform = `translate3d(0, ${dy}px, 0)`;
      const ratio = Math.max(0.25, 1 - dy / 420);
      overlay.style.backgroundColor = `rgba(15, 23, 42, ${(0.55 * ratio).toFixed(3)})`;
      if (e.cancelable) e.preventDefault();
    } else {
      currentDy = 0;
      dialog.style.transform = 'translate3d(0, 0, 0)';
    }
  };

  const onTouchEnd = () => {
    if (!isDraggingSheet) return;
    isDraggingSheet = false;
    dialog.classList.remove('is-dragging');

    const dt = Math.max(1, Date.now() - startTime);
    const velocity = currentDy / dt;

    if (currentDy > 88 || (currentDy > 32 && velocity > 0.45)) {
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
      } catch (_) {}
      overlay.style.backgroundColor = '';
      dialog.style.transition = 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)';
      dialog.style.transform = 'translate3d(0, 100%, 0)';
      triggerClose();
    } else {
      overlay.style.backgroundColor = '';
      dialog.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.2, 1)';
      dialog.style.transform = 'translate3d(0, 0, 0)';
      setTimeout(() => {
        dialog.style.transition = '';
        dialog.style.transform = '';
      }, 230);
    }
    currentDy = 0;
  };

  dragTargets.forEach((target) => {
    target.addEventListener('touchstart', onTouchStart, { passive: true });
    target.addEventListener('touchmove', onTouchMove, { passive: false });
    target.addEventListener('touchend', onTouchEnd, { passive: true });
    target.addEventListener('touchcancel', onTouchEnd, { passive: true });
  });

  // Escape key support (hanya menutup modal paling atas & menutup dropdown internal terlebih dahulu)
  const handleKey = (e) => {
    if (e.key === 'Escape') {
      const activeOverlays = document.querySelectorAll('.overlay:not(.keluar)');
      const topOverlay = activeOverlays[activeOverlays.length - 1];
      if (topOverlay && topOverlay !== overlay) return;

      const openCatPicker = dialog.querySelector('.cat-picker.is-open');
      if (openCatPicker) {
        openCatPicker.classList.remove('is-open');
        const panel = openCatPicker.querySelector('.cat-picker-panel');
        if (panel) panel.hidden = true;
        return;
      }

      const openAutocomplete = Array.from(dialog.querySelectorAll('.autocomplete-dropdown')).find(
        (el) => el.style.display === 'block'
      );
      if (openAutocomplete) {
        openAutocomplete.style.display = 'none';
        return;
      }

      if (!closable) return;
      triggerClose();
    }
  };
  window.addEventListener('keydown', handleKey);

  // Programmatic smooth autofocus tanpa memicu intervensi browser
  setTimeout(() => {
    const autoEl = dialog.querySelector('[data-autofocus]') || dialog.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])');
    autoEl?.focus();
  }, 100);

  return modalRef;
}

/**
 * Tutup lapisan overlay (modal / dialog / dropdown di dalam modal) paling atas secara berurutan (LIFO).
 * @returns {'closed_dropdown'|'closed_modal'|'mandatory'|'none'}
 */
export function closeTopOverlay() {
  const activeOverlays = document.querySelectorAll('.overlay:not(.keluar)');
  if (!activeOverlays.length) return 'none';

  const topOverlay = activeOverlays[activeOverlays.length - 1];

  // Tutup dropdown terbuka di dalam modal paling atas terlebih dahulu
  const openCatPicker = topOverlay.querySelector('.cat-picker.is-open');
  if (openCatPicker) {
    openCatPicker.classList.remove('is-open');
    const panel = openCatPicker.querySelector('.cat-picker-panel');
    if (panel) panel.hidden = true;
    return 'closed_dropdown';
  }

  const openAutocomplete = Array.from(topOverlay.querySelectorAll('.autocomplete-dropdown')).find(
    (el) => el.style.display === 'block'
  );
  if (openAutocomplete) {
    openAutocomplete.style.display = 'none';
    return 'closed_dropdown';
  }

  // Jangan tutup paksa modal wajib (mis. layar Login / Wajib Ganti PIN)
  if (topOverlay.dataset.closable === 'false') {
    return 'mandatory';
  }

  if (typeof topOverlay._closeModal === 'function') {
    topOverlay._closeModal();
    return 'closed_modal';
  }

  const btnClose = topOverlay.querySelector('.btn-close-modal, .btn-batal-dialog, .btn-modal-tutup, .btn-cancel, .btn-batal-void');
  if (btnClose && btnClose.offsetParent !== null) {
    btnClose.click();
    return 'closed_modal';
  }

  topOverlay.classList.add('keluar');
  setTimeout(() => {
    if (topOverlay.parentElement) topOverlay.remove();
  }, 200);
  return 'closed_modal';
}

/**
 * Tampilkan dialog konfirmasi interaktif bergaya modern (menggantikan confirm bawaan browser)
 * Mendukung format objek: showConfirm({ title, message, confirmText, cancelText, danger })
 * Maupun format 2 argumen: showConfirm('Judul', 'Pesan')
 * @returns {Promise<boolean>}
 */
export function showConfirm(titleOrOptions, messageOrOptions, extraOptions = {}) {
  let title = 'Konfirmasi Tindakan';
  let message = '';
  let confirmText = 'Ya, Lanjutkan';
  let cancelText = 'Batal';
  let danger = false;

  if (typeof titleOrOptions === 'string') {
    title = titleOrOptions;
    if (typeof messageOrOptions === 'string') {
      message = messageOrOptions;
      if (typeof extraOptions === 'object') {
        if (extraOptions.confirmText) confirmText = extraOptions.confirmText;
        if (extraOptions.cancelText) cancelText = extraOptions.cancelText;
        if (extraOptions.danger !== undefined) danger = !!extraOptions.danger;
      }
    } else if (typeof messageOrOptions === 'object' && messageOrOptions !== null) {
      if (messageOrOptions.message) message = messageOrOptions.message;
      if (messageOrOptions.confirmText) confirmText = messageOrOptions.confirmText;
      if (messageOrOptions.cancelText) cancelText = messageOrOptions.cancelText;
      if (messageOrOptions.danger !== undefined) danger = !!messageOrOptions.danger;
    }
  } else if (titleOrOptions && typeof titleOrOptions === 'object') {
    title = titleOrOptions.title || 'Konfirmasi Tindakan';
    message = titleOrOptions.message || '';
    confirmText = titleOrOptions.confirmText || 'Ya, Lanjutkan';
    cancelText = titleOrOptions.cancelText || 'Batal';
    danger = !!titleOrOptions.danger;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (val) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    const iconHtml = danger ? `
      <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(239, 68, 68, 0.14); color: #ef4444; display: grid; place-items: center; flex-shrink: 0;">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
    ` : `
      <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; flex-shrink: 0;">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
    `;

    const bodyHtml = `
      <div class="row" style="align-items: flex-start; gap: var(--sp-3); padding: var(--sp-1) 0;">
        ${iconHtml}
        <div class="stack" style="gap: 4px; flex: 1; min-width: 0;">
          <div class="fw-bold text-base" style="color: var(--text);">${escapeHtml(title)}</div>
          <div class="text-sm text-muted" style="line-height: 1.5;">${escapeHtml(message)}</div>
        </div>
      </div>
    `;

    const footer = document.createElement('div');
    footer.style.display = 'contents';
    footer.innerHTML = `
      <button type="button" class="btn btn-ghost btn-cancel" style="font-weight: 500;">${escapeHtml(cancelText)}</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-confirm" style="font-weight: 600; padding: 8px 18px;">${escapeHtml(confirmText)}</button>
    `;

    const modal = showModal({
      title: '',
      body: bodyHtml,
      footer,
      isSheet: false,
      size: 'sm',
      onClose: () => safeResolve(false)
    });

    const headerTitleEl = modal.el.querySelector('.dialog-title');
    if (headerTitleEl) headerTitleEl.style.display = 'none';

    modal.el.querySelector('.btn-cancel')?.addEventListener('click', () => {
      safeResolve(false);
      modal.close();
    });

    modal.el.querySelector('.btn-close-modal')?.addEventListener('click', () => {
      safeResolve(false);
    });

    modal.el.querySelector('.btn-confirm')?.addEventListener('click', () => {
      safeResolve(true);
      modal.close();
    });

    modal.el.addEventListener('click', (e) => {
      if (e.target === modal.el) {
        safeResolve(false);
      }
    });

    setTimeout(() => {
      const btnFocus = danger ? modal.el.querySelector('.btn-cancel') : modal.el.querySelector('.btn-confirm');
      btnFocus?.focus();
    }, 50);
  });
}

/* ---------- Manajemen Tema, Suasana Latar, Warna Aksen, & Font ---------- */

export const THEME_MODES = [
  { id: 'light', nama: 'Terang Sejuk', sub: 'Putih bersih & tajam', bgPreview: '#f1f5f9', cardPreview: '#ffffff', textPreview: '#0f172a' },
  { id: 'warm', nama: 'Terang Hangat', sub: 'Krem lembut anti-silau', bgPreview: '#f4f0e6', cardPreview: '#fffdf8', textPreview: '#1c1917' },
  { id: 'dark', nama: 'Gelap Malam', sub: 'Navy elegan hemat daya', bgPreview: '#0a101e', cardPreview: '#111a2e', textPreview: '#f1f5f9' }
];

export const ACCENT_PALETTES = [
  { id: 'orange', nama: 'Oranye Bata', sub: 'Khas Toko Bangunan', hex: '#e8590c' },
  { id: 'blue', nama: 'Biru Samudra', sub: 'Korporat & Tenang', hex: '#2563eb' },
  { id: 'emerald', nama: 'Hijau Zamrud', sub: 'Segar & Finansial', hex: '#059669' },
  { id: 'teal', nama: 'Toska Sejuk', sub: 'Nyaman Seharian', hex: '#0d9488' },
  { id: 'indigo', nama: 'Ungu Royal', sub: 'Modern & Elegan', hex: '#4f46e5' },
  { id: 'rose', nama: 'Merah Ruby', sub: 'Ritel Minimarket', hex: '#e11d48' }
];

export const FONT_SIZE_PRESETS = [
  { id: 'ringkas', nama: 'Ringkas', pct: 88, scale: 0.875, samplePx: '12px' },
  { id: 'kecil', nama: 'Kecil', pct: 94, scale: 0.9375, samplePx: '13.5px' },
  { id: 'normal', nama: 'Standar', pct: 100, scale: 1, samplePx: '15px' },
  { id: 'besar', nama: 'Besar', pct: 108, scale: 1.08, samplePx: '16.5px' },
  { id: 'ekstra', nama: 'Ekstra', pct: 116, scale: 1.16, samplePx: '18px' }
];

export const FONT_STYLE_MODES = [
  { id: 'standar', nama: 'Standar Seimbang', sub: 'Proporsional & bersih' },
  { id: 'tegas', nama: 'Tegas & Tebal', sub: 'Huruf lebih jelas & kontras' },
  { id: 'ramping', nama: 'Ramping & Padat', sub: 'Spasi rapat muat banyak' }
];

export const FONT_FAMILIES = [
  {
    id: 'system',
    nama: 'Sistem Bawaan',
    sub: 'Cepat & tajam 0 KB',
    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
    googleUrl: ''
  },
  {
    id: 'inter',
    nama: 'Inter',
    sub: 'Modern & presisi angka',
    stack: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    googleUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
  },
  {
    id: 'jakarta',
    nama: 'Plus Jakarta',
    sub: 'Geometris & elegan',
    stack: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    googleUrl: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'
  },
  {
    id: 'poppins',
    nama: 'Poppins',
    sub: 'Bulat ramah & rapi',
    stack: '"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    googleUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'
  },
  {
    id: 'roboto',
    nama: 'Roboto',
    sub: 'Tegas khas Android',
    stack: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
    googleUrl: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap'
  },
  {
    id: 'mono',
    nama: 'JetBrains Mono',
    sub: 'Gaya struk sejajar',
    stack: '"JetBrains Mono", "SFMono-Regular", Consolas, Menlo, monospace',
    googleUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap'
  }
];

function ensureFontFamilyLoaded(familyId) {
  if (typeof document === 'undefined') return;
  const item = FONT_FAMILIES.find((f) => f.id === familyId);
  if (!item || !item.googleUrl) return;
  const linkId = `pos-gfont-${item.id}`;
  if (document.getElementById(linkId)) return;
  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = item.googleUrl;
  document.head.appendChild(link);
}

export function initTheme() {
  const savedTheme = localStorage.getItem('pos_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const savedAccent = localStorage.getItem('pos_accent') || 'orange';
  document.documentElement.setAttribute('data-accent', savedAccent);

  const savedFont = localStorage.getItem('pos_font') || 'normal';
  document.documentElement.setAttribute('data-font', savedFont);

  const savedScale = parseFloat(localStorage.getItem('pos_font_scale') || '');
  if (Number.isFinite(savedScale) && savedScale >= 0.8 && savedScale <= 1.35) {
    document.documentElement.style.setProperty('--font-scale', String(savedScale));
  } else {
    document.documentElement.style.removeProperty('--font-scale');
  }

  const savedFontStyle = localStorage.getItem('pos_font_style') || 'standar';
  document.documentElement.setAttribute('data-font-style', savedFontStyle);

  const savedFontFamily = localStorage.getItem('pos_font_family') || 'system';
  document.documentElement.setAttribute('data-font-family', savedFontFamily);
  ensureFontFamilyLoaded(savedFontFamily);
}

export function getThemeConfig() {
  const fontId = document.documentElement.getAttribute('data-font') || localStorage.getItem('pos_font') || 'normal';
  const preset = FONT_SIZE_PRESETS.find((f) => f.id === fontId) || FONT_SIZE_PRESETS[2];
  const savedScale = parseFloat(localStorage.getItem('pos_font_scale') || '');
  const activeScale = (Number.isFinite(savedScale) && savedScale >= 0.8 && savedScale <= 1.35) ? savedScale : preset.scale;
  const activePct = Math.round(activeScale * 100);

  return {
    theme: document.documentElement.getAttribute('data-theme') || localStorage.getItem('pos_theme') || 'light',
    accent: document.documentElement.getAttribute('data-accent') || localStorage.getItem('pos_accent') || 'orange',
    font: fontId,
    fontScale: activeScale,
    fontPct: activePct,
    fontStyle: document.documentElement.getAttribute('data-font-style') || localStorage.getItem('pos_font_style') || 'standar',
    fontFamily: document.documentElement.getAttribute('data-font-family') || localStorage.getItem('pos_font_family') || 'system'
  };
}

export function setThemeMode(mode) {
  const valid = THEME_MODES.some((m) => m.id === mode) ? mode : 'light';
  document.documentElement.setAttribute('data-theme', valid);
  localStorage.setItem('pos_theme', valid);
  return valid;
}

export function setAccentColor(accent) {
  const valid = ACCENT_PALETTES.some((a) => a.id === accent) ? accent : 'orange';
  document.documentElement.setAttribute('data-accent', valid);
  localStorage.setItem('pos_accent', valid);
  return valid;
}

export function setFontSizePreset(presetId) {
  const found = FONT_SIZE_PRESETS.find((f) => f.id === presetId) || FONT_SIZE_PRESETS[2];
  document.documentElement.setAttribute('data-font', found.id);
  document.documentElement.style.setProperty('--font-scale', String(found.scale));
  localStorage.setItem('pos_font', found.id);
  localStorage.setItem('pos_font_scale', String(found.scale));
  return found;
}

export function setCustomFontScale(pctOrScale) {
  let pct = Number(pctOrScale);
  if (pct <= 2) pct = Math.round(pct * 100);
  pct = Math.max(85, Math.min(125, Math.round(pct || 100)));
  const scale = Math.round((pct / 100) * 10000) / 10000;

  // Cocokkan dengan preset terdekat jika selisih <= 1%
  const matchedPreset = FONT_SIZE_PRESETS.find((f) => Math.abs(f.pct - pct) <= 1);
  const fontAttr = matchedPreset ? matchedPreset.id : 'custom';

  document.documentElement.setAttribute('data-font', fontAttr);
  document.documentElement.style.setProperty('--font-scale', String(scale));
  localStorage.setItem('pos_font', fontAttr);
  localStorage.setItem('pos_font_scale', String(scale));
  return { id: fontAttr, pct, scale, nama: matchedPreset ? matchedPreset.nama : `Kustom ${pct}%` };
}

export function setFontStyleMode(styleId) {
  const valid = FONT_STYLE_MODES.some((s) => s.id === styleId) ? styleId : 'standar';
  document.documentElement.setAttribute('data-font-style', valid);
  localStorage.setItem('pos_font_style', valid);
  return valid;
}

export function setFontFamily(familyId) {
  const found = FONT_FAMILIES.find((f) => f.id === familyId) || FONT_FAMILIES[0];
  ensureFontFamilyLoaded(found.id);
  document.documentElement.setAttribute('data-font-family', found.id);
  localStorage.setItem('pos_font_family', found.id);
  return found;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  return setThemeMode(next);
}

export function toggleFontSize() {
  const current = document.documentElement.getAttribute('data-font') || 'normal';
  const idx = FONT_SIZE_PRESETS.findIndex((f) => f.id === current);
  const nextPreset = FONT_SIZE_PRESETS[(idx + 1) % FONT_SIZE_PRESETS.length] || FONT_SIZE_PRESETS[2];
  setFontSizePreset(nextPreset.id);
  return nextPreset.id;
}

/**
 * Buka Modal / Bottom Sheet Personalisasi Tema, Suasana Latar, Warna Aksen, & Ukuran Huruf
 * @param {Function} [onChanged] Callback saat tema/warna/font berubah ({ theme, accent, font, fontPct, fontStyle })
 */
export function bukaModalTemaWarna(onChanged = null) {
  const cfg = getThemeConfig();
  const activeFontFamily = FONT_FAMILIES.find((f) => f.id === cfg.fontFamily) || FONT_FAMILIES[0];

  // Muat pratinjau Google Fonts ringan saat modal dibuka agar kartu sampel langsung tampil sesuai jenis hurufnya
  FONT_FAMILIES.forEach((f) => ensureFontFamilyLoaded(f.id));

  const modal = showModal({
    title: 'Tema, Warna & Tipografi',
    size: 'md',
    body: `
      <div class="theme-picker-wrap">
        <!-- 1. Suasana Latar (Light / Warm / Dark) -->
        <div class="theme-picker-section">
          <div class="theme-picker-label">1. Suasana Latar Belakang</div>
          <div class="theme-mode-grid" id="picker-theme-modes">
            ${THEME_MODES.map((m) => `
              <button type="button" class="theme-mode-card ${cfg.theme === m.id ? 'is-active' : ''}" data-theme-mode="${m.id}">
                <div class="theme-mode-preview" style="background: ${m.bgPreview}; color: ${m.textPreview};">
                  ${m.id === 'dark' ? ICONS.moon : ICONS.sun}
                </div>
                <div class="theme-mode-info">
                  <div class="theme-mode-title">${escapeHtml(m.nama)}</div>
                  <div class="theme-mode-desc">${escapeHtml(m.sub)}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 2. Warna Aksen Utama (6 Pilihan Warna Solid) -->
        <div class="theme-picker-section">
          <div class="theme-picker-label">2. Warna Aksen Utama (Solid)</div>
          <div class="theme-accent-grid" id="picker-accent-colors">
            ${ACCENT_PALETTES.map((a) => `
              <button type="button" class="theme-accent-card ${cfg.accent === a.id ? 'is-active' : ''}" data-accent-id="${a.id}">
                <span class="theme-accent-swatch" style="background: ${a.hex};">
                  ${ICONS.check}
                </span>
                <div style="min-width: 0; flex: 1;">
                  <div class="theme-accent-name">${escapeHtml(a.nama)}</div>
                  <div class="theme-accent-sub">${escapeHtml(a.sub)}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 3. Jenis Font (6 Pilihan Real-Time) -->
        <div class="theme-picker-section">
          <div class="row-between items-center">
            <div class="theme-picker-label">3. Jenis Font (6 Pilihan)</div>
            <span class="font-slider-badge" id="picker-font-family-badge">${escapeHtml(activeFontFamily.nama)}</span>
          </div>
          <div class="font-family-grid" id="picker-font-families">
            ${FONT_FAMILIES.map((ff) => `
              <button type="button" class="font-family-card ${cfg.fontFamily === ff.id ? 'is-active' : ''}" data-font-family-id="${ff.id}" style="font-family: ${ff.stack};">
                <span class="font-family-sample">Aa</span>
                <div style="min-width: 0; flex: 1;">
                  <div class="theme-mode-title">${escapeHtml(ff.nama)}</div>
                  <div class="theme-mode-desc">${escapeHtml(ff.sub)}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 4. Ukuran Huruf (5 Preset + Slider Kustom Presisi 85% - 125%) -->
        <div class="theme-picker-section">
          <div class="row-between items-center">
            <div class="theme-picker-label">4. Ukuran Huruf (5 Varian + Skala Kustom)</div>
            <span class="font-slider-badge" id="picker-font-pct-badge">${cfg.fontPct}%</span>
          </div>
          <div class="font-preset-grid" id="picker-font-presets">
            ${FONT_SIZE_PRESETS.map((f) => `
              <button type="button" class="font-preset-card ${cfg.font === f.id ? 'is-active' : ''}" data-font-preset="${f.id}">
                <span class="font-preset-aa" style="font-size: ${f.samplePx};">Aa</span>
                <span class="font-preset-name">${escapeHtml(f.nama)}</span>
                <span class="font-preset-pct">${f.pct}%</span>
              </button>
            `).join('')}
          </div>

          <div class="font-slider-box">
            <button type="button" class="btn btn-secondary btn-xs" id="btn-font-step-down" title="Perkecil Huruf (-2%)">A-</button>
            <input type="range" class="font-slider-input" id="input-font-scale-slider" min="85" max="125" step="1" value="${cfg.fontPct}" aria-label="Slider Skala Ukuran Huruf">
            <button type="button" class="btn btn-secondary btn-xs" id="btn-font-step-up" title="Perbesar Huruf (+2%)">A+</button>
          </div>
        </div>

        <!-- 5. Gaya & Ketebalan Huruf (3 Varian) -->
        <div class="theme-picker-section">
          <div class="theme-picker-label">5. Gaya & Ketebalan Huruf</div>
          <div class="font-style-grid" id="picker-font-styles">
            ${FONT_STYLE_MODES.map((s) => `
              <button type="button" class="theme-mode-card ${cfg.fontStyle === s.id ? 'is-active' : ''}" data-font-style-id="${s.id}">
                <div class="theme-mode-info">
                  <div class="theme-mode-title">${escapeHtml(s.nama)}</div>
                  <div class="theme-mode-desc">${escapeHtml(s.sub)}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Pratinjau Langsung -->
        <div class="card card-body" style="background: var(--surface-2); padding: var(--sp-3); border: 1px solid var(--border);">
          <div class="row-between items-center" style="gap: var(--sp-2); flex-wrap: wrap;">
            <div>
              <div class="fw-bold text-sm">Pratinjau Font, Warna &amp; Suasana</div>
              <div class="text-xs text-muted">Contoh angka: <span class="mono fw-bold text-primary">Rp 1.250.000</span> • Stok: 25 Pcs</div>
            </div>
            <div class="row" style="gap: 6px; align-items: center;">
              <span class="badge badge-primary">Warna Solid</span>
              <button type="button" class="btn btn-primary btn-xs">Tombol Utama</button>
            </div>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row-between items-center" style="width: 100%; gap: var(--sp-2);">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-reset-tema-default">Reset ke Standar</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-selesai-tema">Selesai</button>
      </div>
    `
  });

  const sliderEl = modal.el.querySelector('#input-font-scale-slider');
  const badgePctEl = modal.el.querySelector('#picker-font-pct-badge');
  const badgeFamilyEl = modal.el.querySelector('#picker-font-family-badge');

  const emitChange = () => {
    if (typeof onChanged === 'function') {
      onChanged(getThemeConfig());
    }
  };

  const syncFontUi = (pct, activeId) => {
    if (sliderEl) sliderEl.value = String(pct);
    if (badgePctEl) badgePctEl.textContent = `${pct}%`;
    modal.el.querySelectorAll('[data-font-preset]').forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-font-preset') === activeId);
    });
  };

  modal.el.querySelectorAll('[data-theme-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-theme-mode');
      setThemeMode(mode);
      modal.el.querySelectorAll('[data-theme-mode]').forEach((b) => b.classList.toggle('is-active', b === btn));
      emitChange();
    });
  });

  modal.el.querySelectorAll('[data-accent-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const acc = btn.getAttribute('data-accent-id');
      setAccentColor(acc);
      modal.el.querySelectorAll('[data-accent-id]').forEach((b) => b.classList.toggle('is-active', b === btn));
      emitChange();
    });
  });

  modal.el.querySelectorAll('[data-font-family-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fid = btn.getAttribute('data-font-family-id') || 'system';
      const applied = setFontFamily(fid);
      if (badgeFamilyEl) badgeFamilyEl.textContent = applied.nama;
      modal.el.querySelectorAll('[data-font-family-id]').forEach((b) => b.classList.toggle('is-active', b === btn));
      emitChange();
    });
  });

  modal.el.querySelectorAll('[data-font-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const presetId = btn.getAttribute('data-font-preset') || 'normal';
      const applied = setFontSizePreset(presetId);
      syncFontUi(applied.pct, applied.id);
      emitChange();
    });
  });

  sliderEl?.addEventListener('input', () => {
    const res = setCustomFontScale(sliderEl.value);
    syncFontUi(res.pct, res.id);
    emitChange();
  });

  modal.el.querySelector('#btn-font-step-down')?.addEventListener('click', () => {
    const cur = Number(sliderEl?.value || 100);
    const res = setCustomFontScale(cur - 2);
    syncFontUi(res.pct, res.id);
    emitChange();
  });

  modal.el.querySelector('#btn-font-step-up')?.addEventListener('click', () => {
    const cur = Number(sliderEl?.value || 100);
    const res = setCustomFontScale(cur + 2);
    syncFontUi(res.pct, res.id);
    emitChange();
  });

  modal.el.querySelectorAll('[data-font-style-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const st = btn.getAttribute('data-font-style-id') || 'standar';
      setFontStyleMode(st);
      modal.el.querySelectorAll('[data-font-style-id]').forEach((b) => b.classList.toggle('is-active', b === btn));
      emitChange();
    });
  });

  modal.el.querySelector('#btn-reset-tema-default')?.addEventListener('click', () => {
    setThemeMode('light');
    setAccentColor('orange');
    const defFamily = setFontFamily('system');
    setFontSizePreset('normal');
    setFontStyleMode('standar');

    modal.el.querySelectorAll('[data-theme-mode]').forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-theme-mode') === 'light'));
    modal.el.querySelectorAll('[data-accent-id]').forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-accent-id') === 'orange'));
    modal.el.querySelectorAll('[data-font-family-id]').forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-font-family-id') === 'system'));
    modal.el.querySelectorAll('[data-font-style-id]').forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-font-style-id') === 'standar'));
    if (badgeFamilyEl) badgeFamilyEl.textContent = defFamily.nama;
    syncFontUi(100, 'normal');
    emitChange();
    showToast('Tema, warna, & font dikembalikan ke standar (100% • Oranye Bata • Sistem).', 'info', 2200);
  });

  modal.el.querySelector('#btn-selesai-tema')?.addEventListener('click', () => modal.close());

  return modal;
}

