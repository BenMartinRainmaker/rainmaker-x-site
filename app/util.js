/* ==============================================================
   Rainmaker X · app · shared helpers
   Formatting (money, dates, percentages), escaping, logos, icons, toast, navigation.
   Loaded first; every later app file relies on these.
   ============================================================== */
'use strict';

// The data layer (see data/). Every view reads and writes through it.
const D = window.Data;

// ---------------- utils ----------------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Dollar amount with thousands separators.
const money = (n, d = 2) => n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
// Plain number with thousands separators.
const num = n => n == null ? '—' : Number(n).toLocaleString();
// Short dollar amount: $1.2B, $65.1M, $368K.
const compact = n => { if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'; return money(n, 0); };
// Signed percentage, one decimal.
const pct = n => n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
// Signed percentage, two decimals.
const pct2 = n => n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
// CSS class for a change: up / down / flat.
const cls = n => n > 0.0005 ? 'up' : n < -0.0005 ? 'down' : 'flat';
// Short month names for dates.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Ordinal suffix: 1st, 2nd, 3rd.
const ord = d => d + (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');
// 12-hour clock time.
const time12 = d => { let h = d.getHours(); const m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
// When an order was placed: "26th Sep (3:00 PM)".
const fmtPlaced = t => { const d = new Date(t); return `${ord(d.getDate())} ${MONTHS[d.getMonth()]} (${time12(d)})`; };
// Long date: "Sep 26, 2026".
const fmtDate = t => { const d = new Date(t); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
// Short date: "26th Sep".
const fmtDateShort = t => { const d = new Date(t); return `${ord(d.getDate())} ${MONTHS[d.getMonth()]}`; };
// The "Updated …" stamp under charts.
const updatedStr = () => { const d = D.NOW; return `Updated ${ord(d.getDate())} ${MONTHS[d.getMonth()]} ${time12(d)}`; };
// Company logos come from public icon services (see RX_CONFIG.logos). If one source fails the
// <img> error handler below moves to the next; when all fail the coloured initial tile stays.
const LOGO_SOURCES = d => { const L = RX_CONFIG.logos; return L.pinnedToGoogle.includes(d) ? [L.google(d), L.iconHorse(d)] : [L.unavatar(d), L.iconHorse(d), L.google(d)]; };
// One delegated listener instead of an inline onerror attribute, so the CSP can forbid inline scripts.
document.addEventListener('error', e => {
  const img = e.target; if (!(img instanceof HTMLImageElement) || !img.dataset.domain) return;
  const i = (+img.dataset.i || 0) + 1; const srcs = LOGO_SOURCES(img.dataset.domain);
  if (i < srcs.length) { img.dataset.i = i; img.src = srcs[i]; } else img.remove();
}, true);
const logo = (c, size = '') => `<span class="logo ${size} ${c.domain ? 'img' : ''}" style="background:${c.color}">${esc(c.letter)}${c.domain ? `<img src="${LOGO_SOURCES(c.domain)[0]}" data-domain="${esc(c.domain)}" data-i="0" alt="" loading="lazy">` : ''}</span>`;
// The RX50 wordmark.
const rx50 = () => `<span class="rx50">RX<span>50</span></span>`;
// Inline SVG icons used across the UI.
const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  starFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 2h8l6 6v14H6z"/><path d="M14 2v6h6" fill="#fff" opacity=".6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  bellSm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  // Buy = shopping cart, sell = dollar sign in a square: shown before the label of every buy / sell button (Ben, Oct 4 2026).
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.6L22 7H6"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 6.5v11"/><path d="M14.6 9.2a2.6 2.6 0 0 0-2.6-1.4c-1.5 0-2.7.8-2.7 1.9 0 2.5 5.4 1.4 5.4 4 0 1.2-1.2 2.1-2.8 2.1a2.8 2.8 0 0 1-2.7-1.6"/></svg>',
};
// Brief message at the bottom of the screen (ok = green, false = red).
function toast(msg, ok = true) {
  let w = document.querySelector('.toast-wrap'); if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; document.body.appendChild(w); }
  const t = document.createElement('div'); t.className = 'toast' + (ok ? ' ok' : ''); t.textContent = msg; w.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 3200);
}
// Navigate to a hash route.
function go(hash) { location.hash = hash; }
// Hand the browser a file to save (CSV / JSON exports). Nothing leaves the machine.
function downloadFile(name, text, mime = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Dated file name for exports: rainmaker-x-orders-2026-09-29.csv
const exportName = (what, ext) => `${RX_CONFIG.exports.filePrefix}-${what}-${new Date().toISOString().slice(0, 10)}.${ext}`;

// ---------------- charts ----------------
