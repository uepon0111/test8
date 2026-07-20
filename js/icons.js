// icons.js
// A small hand-built set of stroke-based line icons (no emoji anywhere in the UI).
// Every icon is plain geometry (circles/lines/rects/simple paths) rendered as an
// inline <svg> string so it can be dropped straight into template strings and
// still be styled/recolored purely with CSS `color`.

const PATHS = {
  search: `<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/>`,
  close: `<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>`,
  chevronDown: `<polyline points="6 9 12 15 18 9"/>`,
  chevronRight: `<polyline points="9 6 15 12 9 18"/>`,
  back: `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
  check: `<polyline points="20 6 9 17 4 12"/>`,
  play: `<polygon points="7 5 20 12 7 19"/>`,
  pause: `<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>`,
  replay5: `<polyline points="9 15 4 10 9 5"/><path d="M4 10h10.5A5.5 5.5 0 0 1 20 15.5v0A5.5 5.5 0 0 1 14.5 21H11"/>`,
  forward5: `<polyline points="15 5 20 10 15 15"/><path d="M20 10H9.5A5.5 5.5 0 0 0 4 15.5v0A5.5 5.5 0 0 0 9.5 21H13"/>`,
  settings: `<circle cx="12" cy="12" r="3.3"/><circle cx="12" cy="12" r="7.6" stroke-dasharray="2.1 2.5"/>`,
  filter: `<line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2" fill="var(--surface,#fff)"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="var(--surface,#fff)"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="11" cy="17" r="2" fill="var(--surface,#fff)"/>`,
  sort: `<path d="M7 3v14"/><polyline points="3 13 7 17 11 13"/><path d="M17 21V7"/><polyline points="21 11 17 7 13 11"/>`,
  listView: `<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>`,
  grid3View: `<rect x="3" y="3" width="8" height="8" rx="1.6"/><rect x="13" y="3" width="8" height="8" rx="1.6"/><rect x="3" y="13" width="8" height="8" rx="1.6"/><rect x="13" y="13" width="8" height="8" rx="1.6"/>`,
  grid5View: `<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="9.5" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="16" y="9.5" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="9.5" y="16" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/>`,
  externalLink: `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`,
  video: `<circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none"/>`,
  musicNote: `<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>`,
  mic: `<path d="M12 15a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5.5A3.5 3.5 0 0 0 12 15Z"/><path d="M19 11a7 7 0 0 1-14 0"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="9" y1="22" x2="15" y2="22"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2.5"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/>`,
  pencil: `<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>`,
  mixer: `<line x1="6" y1="21" x2="6" y2="10"/><line x1="6" y1="7" x2="6" y2="3"/><circle cx="6" cy="8.5" r="2"/><line x1="12" y1="21" x2="12" y2="14"/><line x1="12" y1="11" x2="12" y2="3"/><circle cx="12" cy="12.5" r="2"/><line x1="18" y1="21" x2="18" y2="16"/><line x1="18" y1="13" x2="18" y2="3"/><circle cx="18" cy="14.5" r="2"/>`,
  hash: `<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>`,
  tag: `<path d="M20.6 12.6 12 21.2 2.8 12A2 2 0 0 1 2.2 10.6L3 3l7.6-.8A2 2 0 0 1 12 2.8l8.6 8.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.6" cy="7.6" r="1.3" fill="currentColor" stroke="none"/>`,
  arrowUp: `<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>`,
  arrowDown: `<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>`,
  loader: `<path d="M12 3a9 9 0 1 0 9 9"/>`,
  x: `<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>`,
  sparkAll: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>`,
};

/**
 * Build an inline SVG string.
 * @param {keyof typeof PATHS} name
 * @param {{size?:number, strokeWidth?:number, className?:string}} [opts]
 */
export function svgIcon(name, opts = {}) {
  const { size = 24, strokeWidth = 2, className = "" } = opts;
  const inner = PATHS[name];
  if (!inner) return "";
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS);
