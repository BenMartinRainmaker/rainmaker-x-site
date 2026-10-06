/* ==============================================================
   Rainmaker X · app · navigator
   The platform's own Back / Forward: a history of the pages visited in this tab (sessionStorage),
   a label for each one, and the slim strip under the ticker with two arrow buttons (Ben, Sep 30 2026).
   The strip shows nothing else: no current-page name and no Recent menu (Ben, Oct 1 2026); the target
   page lives only in the button tooltip. Browser back / forward are detected and kept in step.
   ============================================================== */
'use strict';

// Human label for any hash, used in the Back / Forward tooltips and by the ⌘K palette.
function pageLabel(hash) {
  const [route, a, b] = (hash || '#/home').replace(/^#\/?/, '').split('/').map(decodeURIComponent); const co = id => (D.company(id) || {}).name;
  const names = { home: 'Home', dashboard: 'Dashboard', browse: 'Browse Companies', market: 'Market activity', profile: 'My Profile', account: 'Account', orders: 'My Orders', messages: 'Messages', funds: 'Funds', spvs: 'SPVs', alternatives: 'Alternatives', representatives: 'Representatives', index: 'RX50 index', join: 'Join', signin: 'Sign in', desk: 'Rep Desk', staff: 'Staff access' };
  if (route === 'company' && co(a)) return co(a) + (b ? ' · ' + b : '');
  if (route === 'chart' && co(a)) return co(a) + ' · chart';
  if (route === 'order') return 'Order ' + (a || '');
  if (route === 'match') return 'Match ' + (a || '').replace(/^stl-/, '').toUpperCase();
  if (route === 'client') return 'Client · ' + ((D.client(a) || {}).name || a || '');
  if (route === 'fund') return (D.fund(a) || {}).name || 'Fund';
  if (route === 'new') return a === 'custom' ? 'Custom order' : a === 'arrange' ? 'Structured deal' : a === 'listing' ? 'New ask' : 'New bid';
  if (route === 'admin') return (typeof ADMIN_META !== 'undefined' && ADMIN_META[a === 'settlements' ? 'matches' : a === 'activity' ? 'audit' : a] || ADMIN_META.overview).t;
  if (route === 'orders' && a) return 'My Orders · ' + a.charAt(0).toUpperCase() + a.slice(1);
  if (route === 'alternatives' && a) return 'Alternatives · ' + a;
  if (route === 'messages' && a) return 'Messages · ' + (co(a) || (a === 'support' ? 'support' : a));
  return names[route] || 'Rainmaker X';
}
// The in-app history: one list of hashes and a cursor, kept in sessionStorage so it survives a reload but not a new tab.
const NAV = {
  KEY: RX_CONFIG.storage.navKey, MAX: 60,
  _load() { try { const s = JSON.parse(sessionStorage.getItem(this.KEY) || 'null'); if (s && Array.isArray(s.list)) return s; } catch (e) { /* ignore */ } return { list: [], idx: -1 }; },
  _save(s) { sessionStorage.setItem(this.KEY, JSON.stringify(s)); },
  // Called on every hash change: step the cursor if this is a back / forward (ours or the browser's), otherwise push and drop any forward entries.
  record(hash) {
    const s = this._load(); hash = hash || location.hash || '#/home'; if (hash.startsWith('#/role/')) return;
    if (s.list[s.idx] === hash) return;
    if (s.list[s.idx - 1] === hash) s.idx--; else if (s.list[s.idx + 1] === hash) s.idx++;
    else { s.list = s.list.slice(0, s.idx + 1).concat(hash); if (s.list.length > this.MAX) s.list = s.list.slice(-this.MAX); s.idx = s.list.length - 1; }
    this._save(s);
  },
  canBack() { const s = this._load(); return s.idx > 0; },
  canForward() { const s = this._load(); return s.idx < s.list.length - 1; },
  backHash() { const s = this._load(); return s.idx > 0 ? s.list[s.idx - 1] : null; },
  forwardHash() { const s = this._load(); return s.idx < s.list.length - 1 ? s.list[s.idx + 1] : null; },
  back() { const h = this.backHash(); if (h) location.hash = h; return !!h; },
  forward() { const h = this.forwardHash(); if (h) location.hash = h; return !!h; },
  current() { const s = this._load(); return s.list[s.idx] || null; },
  clear() { this._save({ list: [], idx: -1 }); },
};
// The strip under the ticker: just the back and forward arrows (the target page is in the tooltip).
ICON.arrowL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
ICON.arrowR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>';
function histBar() {
  const b = NAV.backHash(), f = NAV.forwardHash();
  return `<div class="histbar"><div class="histbar-inner">
    <button class="hist-btn arrow" type="button" id="hist-back" ${b ? '' : 'disabled'} aria-label="Back" title="${b ? 'Back to ' + esc(pageLabel(b)) + ' (Alt+←)' : 'No earlier page in this session'}">${ICON.arrowL}</button>
    <button class="hist-btn arrow" type="button" id="hist-fwd" ${f ? '' : 'disabled'} aria-label="Forward" title="${f ? 'Forward to ' + esc(pageLabel(f)) + ' (Alt+→)' : 'No later page'}">${ICON.arrowR}</button>
  </div></div>`;
}
// Hook the strip up (called by renderHeader after it paints).
function wireHistBar(h) {
  const bk = h.querySelector('#hist-back'); if (bk) bk.onclick = () => NAV.back();
  const fw = h.querySelector('#hist-fwd'); if (fw) fw.onclick = () => NAV.forward();
  if (!window.__rxNavKeys) { window.__rxNavKeys = true; document.addEventListener('keydown', e => { if (!e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName)) return; if (e.key === 'ArrowLeft') { e.preventDefault(); NAV.back(); } else if (e.key === 'ArrowRight') { e.preventDefault(); NAV.forward(); } }); }
}
