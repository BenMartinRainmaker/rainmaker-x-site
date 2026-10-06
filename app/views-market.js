/* ==============================================================
   Rainmaker X · app · market views
   Dashboard, Browse Companies, the company page, the RX50 index page and the advanced chart.
   ============================================================== */
'use strict';

// Dashboard activity feed: cards or table.
let dashFeedView = 'cards';
// Dashboard: KPIs, trade box, watchlist, RX50 chart, latest market activity, to-dos.
// Market activity (Ben, Sep 30 2026): a member-facing page, outside the back office, listing every order on the exchange
// (bids, asks, custom orders) plus open structured-deal interest, with filters by company, type, fill rule, size and price.
let marketView = 'table'; // Cards / Table / List on Market activity (Ben, Oct 4 2026); per page load
let mkOpen = null;        // which picker menu is open ('companies' | 'sectors'); kept across redraws
let mkPickQ = '';         // search text inside the open picker
let mkMore = false;       // "More filters" (price per share, valuation, fill rule) row shown
let mkRedraw = null;      // redraw callback for the document-level click-away handler
let mkFolded = true;      // Filters + Sort panel folded to one summary row (Ben, Oct 6 2026: it took too much space); per page load
// Market activity filters (Ben, Oct 5 2026): FILTERS say what is shown, SORT says the order. Multi-select groups are arrays
// (empty = all); every numeric filter has preset buckets plus a custom min / max; the time filter has presets plus a custom date range.
const MARKET_DEF = { q: '', types: [], companies: [], sectors: [], qtyB: [], qtyMin: '', qtyMax: '', valB: [], valMin: '', valMax: '', period: 'all', from: '', to: '', statuses: ['live'], pxB: [], pxMin: '', pxMax: '', capB: [], capMin: '', capMax: '', fills: [], sortBy: 'placed', sortDir: 'desc' };
const MARKET_TYPES = [['bid', 'Bids'], ['ask', 'Asks'], ['custom', 'Custom orders'], ['structured', 'Structured deals']];
const MARKET_STATUS = [['live', 'Live'], ['done', 'Matched'], ['cancelled', 'Cancelled']];
const MARKET_FILLS = [['partial', 'Partial fills accepted'], ['aon', 'All-or-none'], ['min', 'Minimum fill']];
const MARKET_QTY = [['s', 'Under 1,000', 0, 1000], ['m', '1,000 – 10,000', 1000, 10000], ['l', '10,000 – 50,000', 10000, 50000], ['xl', 'Over 50,000', 50000, Infinity]];
const MARKET_PX = [['a', 'Under $10', 0, 10], ['b', '$10 – $50', 10, 50], ['c', '$50 – $200', 50, 200], ['d', 'Over $200', 200, Infinity]];
const MARKET_CAP = [['a', 'Under $1b', 0, 1e9], ['b', '$1b – $10b', 1e9, 10e9], ['c', '$10b – $50b', 10e9, 50e9], ['d', 'Over $50b', 50e9, Infinity]];
const MARKET_PERIODS = [['all', 'Any time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['custom', 'Custom range']];
// [key, label, descending label, ascending label]
const MARKET_SORTS = [['placed', 'Date placed', 'Newest first', 'Oldest first'], ['company', 'Company name', 'Z to A', 'A to Z'], ['value', 'Order value', 'Largest first', 'Smallest first'], ['qty', 'Shares', 'Most first', 'Fewest first'], ['price', 'Price per share', 'Highest first', 'Lowest first'], ['cap', 'Valuation', 'Highest first', 'Lowest first']];
// Groups that count as "active" when they differ from the default (search excluded).
const MARKET_GROUPS = [['types'], ['companies'], ['sectors'], ['qtyB', 'qtyMin', 'qtyMax'], ['valB', 'valMin', 'valMax'], ['period', 'from', 'to'], ['statuses'], ['pxB', 'pxMin', 'pxMax'], ['capB', 'capMin', 'capMax'], ['fills']];
const MARKET_MORE = ['pxB', 'pxMin', 'pxMax', 'capB', 'capMin', 'capMax', 'fills'];
// Filter state lives in state.adminF.market (same home as the back-office bars); older single-value shapes are replaced.
function mkState() { const S = D.state.adminF || (D.state.adminF = {}); if (!S.market || !Array.isArray(S.market.types)) S.market = JSON.parse(JSON.stringify(MARKET_DEF)); Object.keys(MARKET_DEF).forEach(k => { if (S.market[k] === undefined) S.market[k] = JSON.parse(JSON.stringify(MARKET_DEF[k])); }); return S.market; }
// A value passes a bucket group when no bucket is chosen or one of the chosen buckets holds it; the custom min / max then narrow it (scale = units of the inputs).
const mkInBuckets = (v, chosen, buckets, min, max, scale) => { const s = scale || 1; v = +v || 0; if (chosen.length && !chosen.some(k => { const b = buckets.find(x => x[0] === k); return b && v >= b[2] && (b[3] === Infinity || v < b[3]); })) return false; if (min !== '' && !isNaN(+min) && v < +min * s) return false; if (max !== '' && !isNaN(+max) && v > +max * s) return false; return true; };
// Placed within the chosen period: a preset number of days back, a custom date range, or any time.
const mkInPeriod = (ts, F) => F.period === 'custom' ? D.placedBetween(ts, F.from, F.to) : F.period === 'all' ? true : ts >= NOW_T - (+F.period) * 864e5;
// Number of filter groups that differ from the default.
const mkActive = F => MARKET_GROUPS.filter(g => g.some(k => JSON.stringify(F[k]) !== JSON.stringify(MARKET_DEF[k]))).length;
// ---- filter panel pieces
const mkChip = (attrs, on, label, title) => `<button type="button" class="chip ${on ? 'on' : ''}" ${attrs}${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
const mkGroup = (label, body, cls) => `<div class="mkf-group ${cls || ''}"><div class="mkf-label">${label}</div>${body}</div>`;
// Multi-select chips with an "All" chip that clears the group.
const mkMulti = (key, opts, F, allLabel) => `<div class="mkf-chips">${mkChip(`data-mk-all="${key}"`, !F[key].length, allLabel || 'All')}${opts.map(([v, l]) => mkChip(`data-mk="${key}" data-v="${esc(v)}"`, F[key].includes(v), esc(l))).join('')}</div>`;
// Custom min / max inputs beside the buckets (prefix / suffix are display units; values apply on change).
const mkRange = (minKey, maxKey, F, prefix, suffix, ph) => `<div class="mkf-range"><span class="mkf-rl">Custom</span><label>${prefix ? `<span class="mkf-unit">${prefix}</span>` : ''}<input class="mini" inputmode="decimal" data-mk-num="${minKey}" placeholder="${esc(ph ? ph[0] : 'Min')}" value="${esc(F[minKey])}">${suffix ? `<span class="mkf-unit">${suffix}</span>` : ''}</label><span class="mkf-dash">to</span><label>${prefix ? `<span class="mkf-unit">${prefix}</span>` : ''}<input class="mini" inputmode="decimal" data-mk-num="${maxKey}" placeholder="${esc(ph ? ph[1] : 'Max')}" value="${esc(F[maxKey])}">${suffix ? `<span class="mkf-unit">${suffix}</span>` : ''}</label></div>`;
// Picker menu for long option lists (companies, sectors): a button with the count, the chosen ones as removable chips, and a checkbox menu with search.
const mkPick = (key, one, many, opts, F) => { const sel = F[key]; const open = mkOpen === key; const name = v => (opts.find(o => o[0] === v) || [v, v])[1]; const q = open ? mkPickQ.trim().toLowerCase() : '';
  return `<div class="mkf-pickwrap"><div class="mkf-pick ${open ? 'open' : ''}" data-pick="${key}"><button type="button" class="mkf-pick-btn ${sel.length ? 'on' : ''}" data-pick-btn="${key}">${sel.length ? `${sel.length} ${sel.length === 1 ? one : many}` : `All ${many}`}${ICON.chev}</button>${open ? `<div class="mkf-menu"><input class="mini" data-pick-q placeholder="Search ${esc(many)}" value="${esc(mkPickQ)}"><div class="mkf-menu-list">${opts.filter(o => !q || o[1].toLowerCase().includes(q) || (o[2] && o[2].ticker.toLowerCase().includes(q))).map(([v, l, c, n]) => `<label class="opt"><input type="checkbox" data-mk="${key}" data-v="${esc(v)}" ${sel.includes(v) ? 'checked' : ''}>${c ? logo(c, 'sm') : ''}<span class="mkf-nm">${esc(l)}</span><span class="dim small">${c ? esc(c.ticker) : n != null ? n + (n === 1 ? ' company' : ' companies') : ''}</span></label>`).join('') || '<div class="empty small">No match.</div>'}</div><div class="mkf-menu-foot"><button type="button" class="btn ghost sm" data-mk-all="${key}">Clear</button><button type="button" class="btn primary sm" data-pick-close>Done</button></div></div>` : ''}</div>${sel.map(v => `<span class="chip on sm">${esc(name(v))}<button type="button" class="chip-x" data-mk="${key}" data-v="${esc(v)}" title="Remove">✕</button></span>`).join('')}</div>`; };
// Plain-language summary of the active filters and the sort, shown on the folded panel so nothing is hidden silently.
function mkSummary(F, coOpts, secOpts) {
  const name = (opts, v) => (opts.find(o => o[0] === v) || [v, v])[1]; const list = (opts, vals) => vals.map(v => name(opts, v)).join(', ');
  const range = (min, max, pre, suf) => min !== '' && max !== '' ? `${pre}${min}${suf} – ${pre}${max}${suf}` : min !== '' ? `from ${pre}${min}${suf}` : max !== '' ? `up to ${pre}${max}${suf}` : '';
  const parts = [];
  if (F.statuses.length) parts.push(list(MARKET_STATUS, F.statuses)); else parts.push('All statuses');
  if (F.types.length) parts.push(list(MARKET_TYPES, F.types));
  if (F.companies.length) parts.push(F.companies.length <= 2 ? list(coOpts, F.companies) : `${F.companies.length} companies`);
  if (F.sectors.length) parts.push(F.sectors.length <= 2 ? list(secOpts, F.sectors) : `${F.sectors.length} sectors`);
  if (F.qtyB.length) parts.push(list(MARKET_QTY, F.qtyB) + ' shares'); else if (range(F.qtyMin, F.qtyMax, '', '')) parts.push(range(F.qtyMin, F.qtyMax, '', '') + ' shares');
  if (F.valB.length) parts.push('Value ' + list(D.ORDER_VALUE_BUCKETS, F.valB)); else if (range(F.valMin, F.valMax, '$', '')) parts.push('Value ' + range(F.valMin, F.valMax, '$', ''));
  if (F.period === 'custom') parts.push(`Placed ${F.from || '…'} to ${F.to || '…'}`); else if (F.period !== 'all') parts.push('Placed ' + name(MARKET_PERIODS, F.period).toLowerCase());
  if (F.pxB.length) parts.push('Price ' + list(MARKET_PX, F.pxB)); else if (range(F.pxMin, F.pxMax, '$', '')) parts.push('Price ' + range(F.pxMin, F.pxMax, '$', ''));
  if (F.capB.length) parts.push('Valuation ' + list(MARKET_CAP, F.capB)); else if (range(F.capMin, F.capMax, '$', 'b')) parts.push('Valuation ' + range(F.capMin, F.capMax, '$', 'b'));
  if (F.fills.length) parts.push(list(MARKET_FILLS, F.fills));
  const sortDef = MARKET_SORTS.find(s => s[0] === F.sortBy) || MARKET_SORTS[0];
  return `${parts.map(esc).join(' · ')} <span class="mkf-sum-sort">Sorted by ${esc(sortDef[1].toLowerCase())}, ${esc((F.sortDir === 'asc' ? sortDef[3] : sortDef[2]).toLowerCase())}</span>`;
}
// Show / Hide filters toggle for the panel.
const mkFoldBtn = () => `<button type="button" class="btn outline sm mkf-fold ${mkFolded ? '' : 'open'}" data-mk-fold title="${mkFolded ? 'Show every filter and the sort options' : 'Fold the panel to one row'}">${ICON.chev} ${mkFolded ? 'Show filters' : 'Hide filters'}</button>`;
// The whole Filters + Sort panel. Folded (the default) it is one row: heading, summary, search, Reset and Show filters.
function mkPanel(F, coOpts, secOpts) {
  if (mkFolded) { const n = mkActive(F); return `<div class="card mkf folded"><div class="mkf-sec mkf-bar"><div class="mkf-sec-head"><h3>${ICON.filter} Filters${n ? ` <span class="badge count">${n}</span>` : ''}</h3><span class="mkf-what mkf-sum">${mkSummary(F, coOpts, secOpts)}</span><label class="mkf-search">${ICON.search}<input data-mk-q placeholder="Search by order ID, company or ticker" value="${esc(F.q)}"></label><button type="button" class="btn ghost sm" data-mk-reset ${n || F.q ? '' : 'disabled'}>Reset filters</button>${mkFoldBtn()}</div></div></div>`; }
  const n = mkActive(F); const sortDef = MARKET_SORTS.find(s => s[0] === F.sortBy) || MARKET_SORTS[0]; const valB = D.ORDER_VALUE_BUCKETS.filter(b => b[0] !== 'all'); const more = mkMore || MARKET_MORE.some(k => JSON.stringify(F[k]) !== JSON.stringify(MARKET_DEF[k]));
  return `<div class="card mkf"><div class="mkf-sec"><div class="mkf-sec-head"><h3>${ICON.filter} Filters${n ? ` <span class="badge count">${n}</span>` : ''}</h3><span class="mkf-what">What is shown</span><label class="mkf-search">${ICON.search}<input data-mk-q placeholder="Search by order ID, company or ticker" value="${esc(F.q)}"></label><button type="button" class="btn ghost sm" data-mk-reset ${n || F.q ? '' : 'disabled'}>Reset filters</button>${mkFoldBtn()}</div>
    <div class="mkf-grid">
      ${mkGroup('Order type', mkMulti('types', MARKET_TYPES, F, 'All types'))}
      ${mkGroup('Status', mkMulti('statuses', MARKET_STATUS, F, 'All statuses'))}
      ${mkGroup('Companies', mkPick('companies', 'company', 'companies', coOpts, F))}
      ${mkGroup('Sectors', mkPick('sectors', 'sector', 'sectors', secOpts, F))}
      ${mkGroup('Size <span class="dim">(shares)</span>', mkMulti('qtyB', MARKET_QTY, F, 'Any size') + mkRange('qtyMin', 'qtyMax', F, '', 'sh', ['Min shares', 'Max shares']), 'wide')}
      ${mkGroup('Order value <span class="dim">(shares × price)</span>', mkMulti('valB', valB, F, 'Any value') + mkRange('valMin', 'valMax', F, '$', '', ['Min', 'Max']), 'wide')}
      ${mkGroup('Placed', `<div class="mkf-chips">${MARKET_PERIODS.map(([v, l]) => mkChip(`data-mk-one="period" data-v="${v}"`, F.period === v, l)).join('')}</div><div class="mkf-range ${F.period === 'custom' ? '' : 'off'}"><span class="mkf-rl">Custom</span><label><input class="mini" type="date" data-mk-date="from" value="${esc(F.from)}" title="Placed on or after this date"></label><span class="mkf-dash">to</span><label><input class="mini" type="date" data-mk-date="to" value="${esc(F.to)}" title="Placed on or before this date"></label></div>`, 'wide')}
    </div>
    <button type="button" class="mkf-more ${more ? 'open' : ''}" data-mk-more>${ICON.chev} ${more ? 'Fewer filters' : 'More filters'} <span class="dim">price per share · valuation · fill rule</span></button>
    ${more ? `<div class="mkf-grid">
      ${mkGroup('Price per share', mkMulti('pxB', MARKET_PX, F, 'Any price') + mkRange('pxMin', 'pxMax', F, '$', '', ['Min', 'Max']), 'wide')}
      ${mkGroup('Valuation at last round', mkMulti('capB', MARKET_CAP, F, 'Any valuation') + mkRange('capMin', 'capMax', F, '$', 'b', ['Min', 'Max']), 'wide')}
      ${mkGroup('Fill rule', mkMulti('fills', MARKET_FILLS, F, 'Any fill rule'))}
    </div>` : ''}
  </div>
  <div class="mkf-sec mkf-sortsec"><div class="mkf-sec-head"><h3>${ICON.sliders} Sort</h3><span class="mkf-what">The order they are shown in</span></div>
    <div class="mkf-sort"><div class="mkf-chips">${MARKET_SORTS.map(s => mkChip(`data-mk-one="sortBy" data-v="${s[0]}"`, F.sortBy === s[0], s[1])).join('')}</div><div class="seg mkf-dir" title="Direction"><button type="button" data-mk-one="sortDir" data-v="desc" class="${F.sortDir === 'desc' ? 'on' : ''}">${sortDef[2]}</button><button type="button" data-mk-one="sortDir" data-v="asc" class="${F.sortDir === 'asc' ? 'on' : ''}">${sortDef[3]}</button></div></div>
  </div></div>`;
}
// Wire the panel: chips toggle array groups, single chips set a value, ranges apply on change, pickers open / close, search keeps its caret.
function wireMk(main, redraw) {
  const panel = main.querySelector('.mkf'); if (!panel) return; const F = mkState(); mkRedraw = redraw;
  const toggle = (key, v) => { const i = F[key].indexOf(v); if (i < 0) F[key].push(v); else F[key].splice(i, 1); if (key === 'qtyB') { F.qtyMin = F.qtyMax = ''; } if (key === 'valB') { F.valMin = F.valMax = ''; } if (key === 'pxB') { F.pxMin = F.pxMax = ''; } if (key === 'capB') { F.capMin = F.capMax = ''; } };
  panel.addEventListener('click', e => {
    const t = e.target.closest('[data-mk],[data-mk-all],[data-mk-one],[data-pick-btn],[data-pick-close],[data-mk-more],[data-mk-reset],[data-mk-fold]'); if (!t) return;
    if (t.hasAttribute('data-mk-fold')) { mkFolded = !mkFolded; mkOpen = null; mkPickQ = ''; return redraw(); }
    if (t.dataset.mk) { toggle(t.dataset.mk, t.dataset.v); return redraw(); }
    if (t.dataset.mkAll) { const k = t.dataset.mkAll; F[k] = []; if (k === 'qtyB') F.qtyMin = F.qtyMax = ''; if (k === 'valB') F.valMin = F.valMax = ''; if (k === 'pxB') F.pxMin = F.pxMax = ''; if (k === 'capB') F.capMin = F.capMax = ''; return redraw(); }
    if (t.dataset.mkOne) { F[t.dataset.mkOne] = t.dataset.v; if (t.dataset.mkOne === 'period' && t.dataset.v !== 'custom') { F.from = F.to = ''; } if (t.dataset.mkOne === 'sortBy') F.sortDir = t.dataset.v === 'company' ? 'asc' : 'desc'; return redraw(); }   // a new sort field starts in its natural direction (names A to Z, everything else largest / newest first)
    if (t.dataset.pickBtn) { mkOpen = mkOpen === t.dataset.pickBtn ? null : t.dataset.pickBtn; mkPickQ = ''; return redraw(); }
    if (t.hasAttribute('data-pick-close')) { mkOpen = null; mkPickQ = ''; return redraw(); }
    if (t.hasAttribute('data-mk-more')) { const open = t.classList.contains('open'); if (open && MARKET_MORE.some(k => JSON.stringify(F[k]) !== JSON.stringify(MARKET_DEF[k]))) return toast('Clear the price, valuation or fill-rule filter first to hide these.'); mkMore = !open; return redraw(); }
    if (t.hasAttribute('data-mk-reset')) { const keep = { sortBy: F.sortBy, sortDir: F.sortDir }; D.state.adminF.market = Object.assign(JSON.parse(JSON.stringify(MARKET_DEF)), keep); mkOpen = null; return redraw(); }
  });
  // custom ranges: typing a custom number clears the preset buckets of that group; dates switch the period to custom
  panel.querySelectorAll('[data-mk-num]').forEach(i => i.onchange = () => { const k = i.dataset.mkNum; F[k] = i.value.replace(/[^\d.]/g, ''); const g = k.replace(/Min|Max$/, '') + 'B'; if (F[k] !== '' && F[g]) F[g] = []; redraw(); });
  panel.querySelectorAll('[data-mk-date]').forEach(i => i.onchange = () => { F[i.dataset.mkDate] = i.value; F.period = 'custom'; redraw(); });
  const keepCaret = (sel, apply) => { const q = panel.querySelector(sel); if (!q) return; q.addEventListener('input', () => { apply(q.value); const pos = q.selectionStart; redraw(); const n = main.querySelector(sel); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { /* not every input supports a caret */ } } }); };
  keepCaret('[data-mk-q]', v => { F.q = v; });
  keepCaret('[data-pick-q]', v => { mkPickQ = v; });
  if (!wireMk.doc) { wireMk.doc = true; document.addEventListener('click', e => { if (mkOpen && !e.target.closest('.mkf-pick') && document.querySelector('.mkf-pick.open') && mkRedraw) { mkOpen = null; mkPickQ = ''; mkRedraw(); } }); }
}
// Market activity card for a structured deal (cards view): no order page, the desk works these.
const arrCard = r => `<a class="order-card" href="#/alternatives"><div class="oc-head"><span class="badge ${r.a.side === 'sell' ? 'listing' : 'bid'}">${r.a.side === 'sell' ? 'Ask' : 'Bid'}</span><span class="badge custom">${esc(D.ARRANGEMENT_TYPES[r.a.type] || 'Structured')}</span><span class="cname">${logo(r.c, 'sm')}<b>${esc(r.c.name)}</b></span></div><div class="oc-body"><div class="qp">${r.qty ? num(r.qty) : '—'} <span class="per">@</span> ${r.price ? money(r.price) : '—'}<span class="total">${r.qty && r.price ? money(r.qty * r.price, 0) : ''}</span></div><div class="sub">Structured deal · ${esc(r.id)} · worked by the Rainmaker desk</div></div></a>`;
// One-line entry for the list view: badges, company, terms and a Match button that opens the order page.
const orderLine = o => { const c = D.company(o.companyId); const isL = o.side === 'listing'; const live = o.status === 'live' && !o.mine;
  return `<div class="ob-li"><a class="ob-li-main" href="#/order/${esc(o.id)}">${sideBadge(o)}${customBadge(o)}${fillBadge(o)}${logo(c, 'sm')}<b>${esc(c.name)}</b><span class="oid">${esc(o.id)}</span><span class="qp">${num(o.qty)} @ ${money(o.price)}</span><span class="qp tot">${money(o.qty * o.price, 0)}</span><span class="dim">${esc(o.shareType)} · ${esc(o.transferType)} · ${isL ? `${o.bidsCount || 0} ${o.bidsCount === 1 ? 'bid' : 'bids'}` : daysLeft(o) + 'd left'}</span></a>${live ? `<a class="btn sm ${isL ? 'bid' : 'ask'}" href="#/order/${esc(o.id)}" title="${isL ? 'Bid on this ask' : 'Sell into this bid'} at its price">${isL ? ICON.cart : ICON.cash} Match</a>` : ''}</div>`; };
const arrLine = r => `<div class="ob-li"><a class="ob-li-main" href="#/alternatives"><span class="badge ${r.a.side === 'sell' ? 'listing' : 'bid'}">${r.a.side === 'sell' ? 'Ask' : 'Bid'}</span><span class="badge custom">${esc(D.ARRANGEMENT_TYPES[r.a.type] || 'Structured')}</span>${logo(r.c, 'sm')}<b>${esc(r.c.name)}</b><span class="oid">${esc(r.id)}</span><span class="qp">${r.qty ? num(r.qty) : '—'} @ ${r.price ? money(r.price) : '—'}</span><span class="dim">Structured deal · worked by the desk</span></a><a class="btn outline sm" href="#/new/custom/${r.c.id}">Match</a></div>`;
function viewMarket(main) {
  const F = mkState(); const st = D.marketStats();
  const rows = D.allOrders().map(o => ({ o, id: o.id, kind: o.custom ? 'custom' : o.side === 'listing' ? 'ask' : 'bid', c: D.company(o.companyId), qty: o.qty, price: o.price, ts: o.created, status: o.status === 'live' ? 'live' : o.status === 'cancelled' ? 'cancelled' : 'done', fill: D.fillRule(o).fill }));
  const arrs = D.marketArrangements(); arrs.forEach(a => rows.push({ a, id: a.id, kind: 'structured', c: D.company(a.companyId), qty: a.qty, price: a.price, ts: a.created, status: 'live', fill: 'partial' }));
  const valB = D.ORDER_VALUE_BUCKETS;
  const pass = r => r.c && (!F.types.length || F.types.includes(r.kind)) && (!F.statuses.length || F.statuses.includes(r.status)) && (!F.companies.length || F.companies.includes(r.c.id)) && (!F.sectors.length || F.sectors.includes(r.c.sector)) && mkInBuckets(r.qty, F.qtyB, MARKET_QTY, F.qtyMin, F.qtyMax) && mkInBuckets((r.qty || 0) * (r.price || 0), F.valB, valB, F.valMin, F.valMax) && mkInPeriod(r.ts, F) && mkInBuckets(r.price, F.pxB, MARKET_PX, F.pxMin, F.pxMax) && mkInBuckets(D.marketCap(r.c), F.capB, MARKET_CAP, F.capMin, F.capMax, 1e9) && (!F.fills.length || F.fills.includes(r.fill)) && afHas(F.q, r.id, r.c.name, r.c.ticker);
  const get = { placed: r => r.ts, company: r => r.c.name, value: r => (r.qty || 0) * (r.price || 0), qty: r => r.qty || 0, price: r => r.price || 0, cap: r => D.marketCap(r.c) }[F.sortBy] || (r => r.ts); const dir = F.sortDir === 'asc' ? 1 : -1;
  const shown = rows.filter(pass).sort((a, b) => { const va = get(a), vb = get(b); const d = typeof va === 'string' ? va.localeCompare(vb) : va - vb; return (d || (a.ts - b.ts) * -1 || a.id.localeCompare(b.id)) * dir; });
  const coOpts = D.COMPANIES.slice().sort((x, y) => x.name.localeCompare(y.name)).map(c => [c.id, c.name, c]);
  const secCount = {}; D.COMPANIES.forEach(c => { secCount[c.sector] = (secCount[c.sector] || 0) + 1; }); const secOpts = Object.keys(secCount).sort().map(s => [s, s, null, secCount[s]]);
  const arrRow = r => `<tr class="clickable" data-href="#/alternatives"><td><span class="row" style="gap:6px"><span class="badge ${r.a.side === 'sell' ? 'listing' : 'bid'}">${r.a.side === 'sell' ? 'Ask' : 'Bid'}</span><span class="badge custom" title="Structured deal with the Rainmaker desk">${esc(D.ARRANGEMENT_TYPES[r.a.type] || 'Structured')}</span><span class="oid">${esc(r.id)}</span></span></td><td><span class="row" style="gap:8px">${logo(r.c, 'sm')}<b>${esc(r.c.name)}</b></span></td><td class="num">${r.qty ? num(r.qty) : '—'}</td><td class="num px">${r.price ? money(r.price) : '—'}</td><td class="num px">${r.qty && r.price ? money(r.qty * r.price, 0) : '—'}</td><td class="dim">Structured · desk</td><td class="dim">${esc(r.a.status)}</td><td class="num"><span class="dim small">${fmtDateShort(r.ts)}</span></td><td class="num"><a class="btn outline custom sm" href="#/new/custom/${r.c.id}" title="Structured deals are matched by the desk: submit yours on the other side">Match</a></td></tr>`;
  main.innerHTML = `<div class="page wide">${pageHead({ icon: PH.orders, title: 'Market activity', tag: 'Live', tagClass: 'open', actions: `<a class="btn bid sm" href="#/new/bid">${ICON.cart} Place bid</a><a class="btn ask sm" href="#/new/listing">${ICON.cash} Place ask</a><a class="btn outline custom sm" href="#/new/custom">${ICON.sliders} Custom order</a>`, stats: [['Live asks', num(st.asks), compact(st.askValue) + ' offered'], ['Live bids', num(st.bids), compact(st.bidValue) + ' sought'], ['Structured deals open', arrs.length], ['30-day volume', compact(st.vol30), num(st.tx30) + ' transactions']] })}
    ${mkPanel(F, coOpts, secOpts)}
    <div class="card"><div class="card-head mk-head"><h3>${num(shown.length)} ${shown.length === 1 ? 'order' : 'orders'} <span class="dim">of ${num(rows.length)}</span></h3><div class="seg" id="mk-view" title="How to show the orders"><button type="button" data-view="cards" class="${marketView === 'cards' ? 'on' : ''}">Cards</button><button type="button" data-view="table" class="${marketView === 'table' ? 'on' : ''}">Table</button><button type="button" data-view="list" class="${marketView === 'list' ? 'on' : ''}">List</button></div></div>
      ${!shown.length ? '<div class="empty">No orders match these filters.</div>' : marketView === 'cards' ? `<div class="company-grid mk-cards">${shown.slice(0, 300).map(r => r.o ? orderCard(r.o, { actions: true }) : arrCard(r)).join('')}</div>` : marketView === 'list' ? `<div class="ob-list">${shown.slice(0, 300).map(r => r.o ? orderLine(r.o) : arrLine(r)).join('')}</div>` : `<table class="table compact ob"><thead><tr><th>Order</th><th>Company</th><th class="num">Shares</th><th class="num">Price / sh</th><th class="num">Total</th><th>Class · transfer</th><th>Expires</th><th class="num">Activity</th><th class="num">Match</th></tr></thead><tbody>${shown.slice(0, 300).map(r => r.o ? orderRow(r.o, { showCompany: true, match: true }) : arrRow(r)).join('')}</tbody></table>`}
      <div class="card-foot small muted">${shown.length > 300 ? 'Showing the first 300. Narrow the filters to see the rest. ' : ''}All-or-none orders only match when the entire quantity executes at once; minimum-fill orders only in chunks of at least the stated size. Structured deals are worked by the Rainmaker desk and never show who is behind them.</div></div></div>`;
  document.title = 'Rainmaker X · Market activity';
  wireMk(main, () => viewMarket(main));
  wireMatchRows(main, () => viewMarket(main));
  main.querySelector('#mk-view').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; marketView = b.dataset.view; viewMarket(main); });
}
// Match button on a Market activity row: opens an inline form under the row to bid on the ask or
// sell into the bid (same calls as the order page: bidOnListing / sellIntoBid; unverified members
// send a request). One form open at a time; Cancel or a second press closes it.
function wireMatchRows(main, redraw) {
  const table = main.querySelector('table.ob'); if (!table) return;
  const close = () => { const open = table.querySelector('tr.match-form-row'); if (open) { const prev = open.previousElementSibling; if (prev) prev.classList.remove('matching'); open.remove(); } };
  table.addEventListener('click', e => {
    const b = e.target.closest('[data-match-order]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (D.isVisitor()) { toast('Sign in to match an order', false); go('#/signin'); return; }
    const row = b.closest('tr'); const wasOpen = row.classList.contains('matching'); close(); if (wasOpen) return;
    const o = D.order(b.dataset.matchOrder); if (!o || o.status !== 'live') { toast('This order is no longer live', false); redraw(); return; }
    const c = D.company(o.companyId); const isL = o.side === 'listing'; const ok = D.canTrade(); const fr = D.fillRule(o);
    const defQty = fr.fill === 'min' ? Math.min(fr.min || 1, o.qty) : o.qty;
    const tr = document.createElement('tr'); tr.className = 'match-form-row';
    tr.innerHTML = `<td colspan="${row.children.length}"><form class="match-form" data-for="${esc(o.id)}">
      <span class="mf-what">${isL ? 'Bid on ask' : 'Sell into bid'} <b class="oid">${esc(o.id)}</b> · ${esc(c.name)} · ${num(o.qty)} @ ${money(o.price)}${fr.fill !== 'partial' ? ` · <span class="badge fill">${esc(D.fillLabel(o))}</span>` : ''}</span>
      <label class="mf-field"><span class="label">Shares</span><input class="mini" name="qty" type="number" min="1" step="1" value="${defQty}" required></label>
      <label class="mf-field"><span class="label">Price / sh</span><input class="mini" name="price" type="number" min="0.01" step="0.01" value="${o.price}" required></label>
      ${isL ? '<label class="mf-field"><span class="label">Valid (days)</span><input class="mini" name="days" type="number" min="1" max="90" value="7" required></label>' : ''}
      <span class="mf-gross"><span class="label">Total</span><b class="mf-total">—</b></span>
      <span class="mf-note small"></span>
      <label class="check small mf-ack"><input type="checkbox" name="ack" required><span>${isL ? 'Serious intention to buy on these terms' : 'I can sell these shares on these terms'}</span></label>
      <span class="row" style="gap:6px"><button class="btn sm ${isL ? 'bid' : 'ask'}" type="submit">${isL ? ICON.cart : ICON.cash} <span class="bl">${ok ? (isL ? 'Place bid' : 'Accept bid') : 'Submit request'}</span></button><button class="btn ghost sm" type="button" data-match-cancel="1">Cancel</button></span>
      ${ok ? '' : `<span class="tiny muted mf-gate">Not yet verified: this goes to your primary representative as a request and is placed once compliance approves.</span>`}
    </form></td>`;
    row.after(tr); row.classList.add('matching');
    const form = tr.querySelector('form'); const note = form.querySelector('.mf-note'); const total = form.querySelector('.mf-total'); const sub = form.querySelector('[type=submit]');
    const upd = () => { const q = +form.qty.value || 0, p = +form.price.value || 0; total.textContent = money(q * p, 0);
      const meets = isL ? p >= o.price : p <= o.price; const fillNo = !D.fillOk(o, Math.min(q, o.qty));
      note.className = 'mf-note small ' + (meets && !fillNo ? 'up' : 'muted');
      note.textContent = meets && fillNo ? `Price meets the ${isL ? 'ask' : 'bid'} but not its fill rule (${D.fillLabel(o).toLowerCase()}): goes to your primary representative as a negotiation.` : meets ? `Matches now: ${num(Math.min(q, o.qty))} shares at ${money(o.price)}, awaiting Rainmaker's approval.` : isL ? `${pct((p - o.price) / o.price)} vs the ask: opens a negotiation through your primary representative.` : `${pct((p - o.price) / o.price)} above the bid: sent as a counter-offer.`;
      if (ok && !isL) (sub.querySelector('.bl') || sub).textContent = meets ? 'Accept bid' : 'Send counter-offer'; };
    form.addEventListener('input', upd); upd(); form.qty.focus();
    form.querySelector('[data-match-cancel]').onclick = close;
    form.addEventListener('submit', ev => { ev.preventDefault(); const q = +form.qty.value, p = +form.price.value; if (!(q > 0 && p > 0)) return;
      if (!ok) { const rq = D.submitRequest({ kind: isL ? 'bid-on-ask' : 'sell-into-bid', companyId: c.id, orderId: o.id, price: p, qty: q, days: isL ? +form.days.value : 7 }); toast(`Request ${rq.id} sent to your primary representative`); redraw(); return; }
      if (isL) { const r = D.bidOnListing(o.id, p, q, +form.days.value); toast(r.match ? `Matched ${num(r.match.qty)} ${c.name} shares @ ${money(r.match.price)} (${r.match.matchId}, awaiting Rainmaker's approval)` : `Bid ${r.bid.id} placed on ${o.id}`); }
      else { const r = D.sellIntoBid(o.id, p, q); toast(r.match ? `Sold ${num(r.match.qty)} ${c.name} shares @ ${money(r.match.price)} (${r.match.matchId}, awaiting Rainmaker's approval)` : 'Counter-offer sent'); }
      redraw(); });
  });
}
function viewDashboard(main) {
  const watch = D.state.watchlist.map(id => D.company(id)).filter(Boolean);
  const active = D.mostActive(6); const st = D.marketStats();
  const idxCh1 = D.change(D.INDEX, '1D'); const idxLast = D.series(D.INDEX, '1D').slice(-1)[0].p;
  const members = D.INDEX.members.slice().sort((a, b) => Math.abs(D.change(b, '3M')) - Math.abs(D.change(a, '3M'))).slice(0, 5);
  const mine = D.myOrders().filter(o => o.status === 'live');
  const open = D.settlements().filter(x => x.stage < D.SETTLE_STEPS[x.counterparty === 'desk' ? 'desk' : 'market'].length - 1);
  main.innerHTML = `<div class="page">
    ${D.state.dismissedBanner ? '' : `<div class="banner slim"><div><h3><span>Exchange prototype</span> · sample market data</h3><p>Every ask, bid and match you record here is saved locally in this browser. Use the avatar menu to reset.</p></div><a class="btn" href="#/browse">Browse companies</a><button class="x" id="dismiss-banner">✕</button></div>`}
    <div class="kpis">
      <a class="kpi" href="#/fund/rx50"><span class="label">RX50 index</span><div class="v">${idxLast.toFixed(2)}</div><div class="s"><span class="${cls(idxCh1)}">${pct2(idxCh1)}</span> today</div></a>
      <div class="kpi"><span class="label">30-day volume</span><div class="v">${compact(st.vol30)}</div><div class="s">${num(st.tx30)} transactions</div></div>
      <div class="kpi"><span class="label">Open asks</span><div class="v">${num(st.asks)}</div><div class="s">${compact(st.askValue)} offered</div></div>
      <a class="kpi" href="#/account"><span class="label">Your buying power</span><div class="v">${compact(D.buyingPower())}</div><div class="s">${compact(D.reservedCash())} reserved for open bids</div></a>
    </div>
    <div class="dash">
      <div class="col-left stack">
        <div class="card"><div class="card-head"><span class="label">Trade on the exchange</span></div><div class="card-body stack" style="gap:8px"><div class="trade-btns"><a class="btn ask" href="#/new/listing">${ICON.cash} Place Ask</a><a class="btn bid" href="#/new/bid">${ICON.cart} Place Bid</a></div><a class="btn outline custom block" href="#/new/custom">${ICON.sliders} Custom order</a></div></div>
        <div class="card"><div class="card-head"><span class="label">Your watchlist</span><span class="row" style="gap:6px"><button class="btn ghost sm" id="wl-import">Import</button><a class="btn outline sm" href="#/browse" title="Star companies on Browse">${ICON.plus} Add</a></span></div><form id="wl-import-form" class="hidden" style="padding:12px 22px 0"><textarea name="text" class="mini" style="width:100%;height:60px;padding:8px" placeholder="Paste names or tickers, e.g. NWR, Cobalt Photonics"></textarea><div class="row" style="margin-top:6px"><button class="btn sm" type="submit">Add</button><button class="btn ghost sm" type="button" id="wl-import-x">Cancel</button></div></form>
          <div class="watch-list">${watch.length ? watch.map(c => `<div class="watch-item"><div class="wi-head"><a href="#/company/${c.id}">${logo(c)}<span>${esc(c.name)}</span></a>${starBtn(c)}</div>
            <div class="wi-body"><div class="wi-row"><span class="label">Highest bid</span><span class="v">${money(D.highestBid(c.id))}</span></div><div class="wi-row"><span class="label">Lowest ask</span><span class="v">${money(D.lowestAsk(c.id))}</span></div><div class="wi-row"><span class="label">RX price</span><span class="v">${money(D.price(c.id))} <span class="tiny ${cls(D.change(c, '1D'))}">${pct(D.change(c, '1D'))}</span></span></div></div></div>`).join('') : `<div class="empty"><b>Your watchlist is empty.</b><div class="small" style="margin-top:4px">Star a company on <a class="link" href="#/browse">Browse Companies</a>, or paste a list with Import. Each one shows its highest bid, lowest ask and RX price here.</div></div>`}</div></div>
        <div class="card"><div class="card-head"><span class="label">Most active companies</span></div>
          <div class="active-list">${active.map(a => `<div class="active-item"><div class="ai-head"><a href="#/company/${a.c.id}">${logo(a.c)}<span>${esc(a.c.name)}</span></a>${starBtn(a.c)}</div><div class="pills"><span class="pill sm"><b>${a.listings}</b> Asks</span><span class="pill sm"><b>${a.bids}</b> Bids</span></div></div>`).join('')}</div></div>
      </div>
      <div class="col-center stack">
        <div class="card" id="index-card"><div class="card-head"><div class="index-title">RX<span class="fifty">50</span><span class="light">Index</span><span class="updated">${updatedStr()}</span></div><a class="link small" href="#/fund/rx50">View all constituents</a></div>
          <div class="card-body"><div class="between" style="margin-bottom:14px"><div class="row"><span class="price-big" id="idx-price"></span><span class="chg" id="idx-chg"></span></div><div class="seg"></div></div><div class="chart-wrap"></div></div>
          <div class="card-foot" style="background:#fff"><div class="strong" style="margin-bottom:4px">RX50 Members</div><div class="small muted" style="margin-bottom:12px">Displayed price changes reflect the last 90 day period.</div>
            <div class="members">${members.map(c => { const ch = D.change(c, '3M'); return `<div class="member"><a href="#/company/${c.id}">${esc(c.name)}</a><div class="p">${money(D.price(c.id))}</div><div class="${cls(ch)}">${pct(ch)}</div></div>`; }).join('')}</div></div></div>
        ${todoPanel()}
        ${open.length ? `<div class="card"><div class="card-head"><span class="label">Settlements in progress</span><a class="link small" href="#/orders/matches">All matches</a></div><div class="card-body stack" style="gap:14px">${open.slice(0, 3).map(x => { const c = D.company(x.companyId); return `<div><div class="small" style="margin-bottom:6px"><b>${esc(c.name)}</b> · ${x.side === 'buy' ? 'buying' : 'selling'} ${num(x.qty)} @ ${money(x.price)}</div>${trackerBlock(x, { compact: true })}</div>`; }).join('')}</div></div>` : ''}
        <div class="card"><div class="card-head"><span class="label">Your live orders</span><a class="link small" href="#/orders">View all</a></div>
          ${mine.length ? `<table class="table compact"><thead><tr><th>Order</th><th>Company</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th><th></th></tr></thead><tbody>${mine.map(o => { const c = D.company(o.companyId); return `<tr class="clickable" data-href="#/order/${o.id}"><td><span class="row" style="gap:6px">${sideBadge(o)}${customBadge(o)}<span class="oid">${esc(o.id)}</span></span></td><td>${esc(c.name)}</td><td class="num">${num(o.qty)}</td><td class="num">${money(o.price)}</td><td class="num">${money(o.price * o.qty, 0)}</td><td class="num" style="white-space:nowrap"><span class="exp-chip ${daysLeft(o) <= 3 ? 'urgent' : daysLeft(o) <= 7 ? 'soon' : ''}" title="Expires ${fmtDate(o.expires)}">${daysLeft(o)}d</span> ${daysLeft(o) <= 7 ? `<button class="btn outline sm" data-reconfirm="${o.id}">Reconfirm</button>` : ''}<button class="btn danger sm" data-cancel="${o.id}">Cancel</button></td></tr>`; }).join('')}</tbody></table>` : `<div class="empty"><b>No live orders yet.</b><div class="small" style="margin-top:4px">Post a <a class="link" href="#/new/bid">bid</a> at the price you would pay, an <a class="link" href="#/new/listing">ask</a> for shares you hold, or a <a class="link" href="#/new/custom">custom order</a>. Orders stay live for 30 days and can be reconfirmed here.</div></div>`}</div>
        <div class="card"><div class="card-head"><span class="label">Latest notifications</span></div><div class="notes">${D.notifications().map(n => `<div class="note-card">${esc(n.text)}<div class="ts">${fmtPlaced(n.ts)}</div></div>`).join('') || '<div class="muted small">Nothing yet. Matches, counter-offers, alerts and settlement steps are announced here.</div>'}</div></div>
      </div>
      <div class="col-right">
        <div class="card"><div class="card-head"><span class="label">Latest market activity</span><div class="seg" id="feed-view"><button data-view="cards" class="${dashFeedView === 'cards' ? 'on' : ''}">Cards</button><button data-view="table" class="${dashFeedView === 'table' ? 'on' : ''}">Table</button></div></div>
          <div style="padding:0 22px"><div class="tabs" id="feed-tabs" style="margin-top:12px"><button class="on" data-tab="listing">Asks</button><button data-tab="bid">Bids</button></div></div>
          <div class="feed" id="feed"></div></div>
      </div>
    </div></div>`;
  const card = main.querySelector('#index-card');
  mountPriceChart(card, D.INDEX, { prefix: '', height: 230, periods: ['1D', '1M', '3M', '6M', '1Y', 'MAX'], labelEl: card.querySelector('#idx-price'), changeEl: card.querySelector('#idx-chg') });
  const feed = main.querySelector('#feed'); let side = 'listing';
  const drawFeed = () => { const list = D.recentOrders(side, 30); feed.innerHTML = dashFeedView === 'cards' ? list.map(o => orderCard(o)).join('') : orderBook(list, { showCompany: true }); feed.style.padding = dashFeedView === 'cards' ? '' : '0'; };
  drawFeed();
  main.querySelector('#feed-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; main.querySelectorAll('#feed-tabs button').forEach(x => x.classList.toggle('on', x === b)); side = b.dataset.tab; drawFeed(); });
  main.querySelector('#feed-view').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; dashFeedView = b.dataset.view; main.querySelectorAll('#feed-view button').forEach(x => x.classList.toggle('on', x === b)); drawFeed(); });
  const dis = main.querySelector('#dismiss-banner'); if (dis) dis.onclick = () => { D.dismissBanner(); render(); };
  const wi = main.querySelector('#wl-import'), wf = main.querySelector('#wl-import-form'); if (wi) { wi.onclick = () => wf.classList.toggle('hidden'); main.querySelector('#wl-import-x').onclick = () => wf.classList.add('hidden'); wf.addEventListener('submit', e => { e.preventDefault(); const r = D.importWatchlist(wf.text.value); toast(r.added.length ? `Added ${r.added.join(', ')}${r.unknown.length ? `; not found: ${r.unknown.join(', ')}` : ''}` : 'No matches found', !!r.added.length); if (r.added.length) render(); }); }
}

// Browse filters and sort, kept across renders.
const browseState = { q: '', sort: 'activity', industries: [], rx50: false, min: '', max: '', capMin: '', capMax: '', page: 1, view: 'list', investor: '', sector: '' };
// Browse Companies: search, filters, cards / list toggle.
function viewBrowse(main) {
  const allInd = [...new Set(D.COMPANIES.flatMap(c => c.industries))].sort();
  const SORTS = { alpha: 'Alphabetically', value: 'Valuation: high to low', valueLow: 'Valuation: low to high', activity: 'Market Activity', listings: 'Number of Asks', bids: 'Number of Bids', change: 'Today\'s Change' };
  const parseVal = s => { const m = /\$([\d.]+)(b|m)?/i.exec(s || ''); return m ? parseFloat(m[1]) * (m[2] && m[2].toLowerCase() === 'b' ? 1e9 : 1e6) : 0; };
  let list = D.COMPANIES.slice();
  const q = browseState.q.toLowerCase();
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q));
  if (browseState.industries.length) list = list.filter(c => c.industries.some(i => browseState.industries.includes(i)));
  if (browseState.investor) list = list.filter(c => c.investors.includes(browseState.investor));
  if (browseState.sector) list = list.filter(c => c.sector === browseState.sector);
  if (browseState.rx50) list = list.filter(c => c.liquid);
  if (browseState.min) list = list.filter(c => D.price(c.id) >= +browseState.min);
  if (browseState.max) list = list.filter(c => D.price(c.id) <= +browseState.max);
  if (browseState.capMin) list = list.filter(c => D.marketCap(c) >= +browseState.capMin * 1e9);   // valuation range in $ billions
  if (browseState.capMax) list = list.filter(c => D.marketCap(c) <= +browseState.capMax * 1e9);
  const act = c => D.liveListings(c.id).length + D.liveBids(c.id).length;
  const sorters = { alpha: (a, b) => a.name.localeCompare(b.name), value: (a, b) => D.marketCap(b) - D.marketCap(a), valueLow: (a, b) => D.marketCap(a) - D.marketCap(b), activity: (a, b) => act(b) - act(a), listings: (a, b) => D.liveListings(b.id).length - D.liveListings(a.id).length, bids: (a, b) => D.liveBids(b.id).length - D.liveBids(a.id).length, change: (a, b) => D.change(b, '1D') - D.change(a, '1D') };
  list.sort(sorters[browseState.sort]);
  const table = browseState.view === 'table'; const listView = browseState.view === 'list';
  const PER = table || listView ? 20 : 9; const pages = Math.max(1, Math.ceil(list.length / PER)); browseState.page = Math.min(browseState.page, pages);
  const pageItems = list.slice((browseState.page - 1) * PER, browseState.page * PER);
  const filtersOn = browseState.industries.length + (browseState.rx50 ? 1 : 0) + (browseState.min ? 1 : 0) + (browseState.max ? 1 : 0) + (browseState.capMin ? 1 : 0) + (browseState.capMax ? 1 : 0) + (browseState.investor ? 1 : 0) + (browseState.sector ? 1 : 0);
  const activeChips = [browseState.capMin || browseState.capMax ? `<span class="chip on">Valuation ${browseState.capMin ? '$' + esc(browseState.capMin) + 'b' : '0'} – ${browseState.capMax ? '$' + esc(browseState.capMax) + 'b' : 'any'} <button class="chip-x" data-clear-cap="1">✕</button></span>` : '', browseState.investor ? `<span class="chip on">Investor: ${esc(browseState.investor)} <button class="chip-x" data-clear="investor">✕</button></span>` : '', browseState.sector ? `<span class="chip on">Category: ${esc(browseState.sector)} <button class="chip-x" data-clear="sector">✕</button></span>` : '', ...browseState.industries.map(i => `<span class="chip on">${esc(i)} <button class="chip-x" data-clear-ind="${esc(i)}">✕</button></span>`)].filter(Boolean).join('');
  const listHtml = `<div class="card co-list">${pageItems.map(c => `<a class="co-row" href="#/company/${c.id}">${companyRow(c, `<span class="co-extra"><span class="tiny muted">Bid ${money(D.highestBid(c.id))} · Ask ${money(D.lowestAsk(c.id))}</span><span class="pill sm"><b>${D.liveListings(c.id).length}</b> asks</span><span class="pill sm"><b>${D.liveBids(c.id).length}</b> bids</span></span>`)}<span class="co-star">${starBtn(c)}</span></a>`).join('')}</div>`;
  const cardsHtml = `<div class="company-grid">${pageItems.map(c => `<div class="card ccard" data-href="#/company/${c.id}">
      <div class="ch">${logo(c, 'lg')}<span class="name">${esc(c.name)}</span>${c.liquid ? rx50() : ''}${starBtn(c)}</div>
      ${pricingStrip(c)}
      <table class="kv tight"><tr><th>Last round value</th><td>${esc(c.round.post)} post at ${money(c.round.pps)}/sh</td></tr><tr><th>Last round series</th><td>${esc(c.round.date)} (${esc(c.round.series)})</td></tr><tr><th>Last round size</th><td>${esc(c.round.raised)} of ${esc(c.round.total)} total</td></tr><tr><th>Market activity</th><td>${activityPills(c)}</td></tr></table>
      <div class="desc">${esc(c.desc)}</div>
      <div><div class="label" style="margin-bottom:8px">Industries</div><div class="tags">${c.industries.map(i => `<span class="tag">${esc(i)}</span>`).join('')}</div></div>
      <div><div class="label" style="margin-bottom:8px">Investors</div><div class="tags">${c.investors.map(i => `<span class="tag">${esc(i)}</span>`).join('')}</div></div>
    </div>`).join('')}</div>`;
  const tableHtml = `<div class="card"><table class="table mkt"><thead><tr><th>Company</th><th class="num">RX price</th><th class="num">Today</th><th>3 months</th><th class="num">Highest bid</th><th class="num">Lowest ask</th><th class="num">Spread</th><th class="num">Asks</th><th class="num">Bids</th><th>Last round</th><th></th></tr></thead><tbody>${pageItems.map(c => { const hb = D.highestBid(c.id), la = D.lowestAsk(c.id); const sp = hb && la ? (la - hb) / la : null; const d1 = D.change(c, '1D'), m3 = D.change(c, '3M');
    return `<tr class="clickable" data-href="#/company/${c.id}"><td><span class="row" style="gap:10px">${logo(c)}<span><b>${esc(c.name)}</b> ${c.liquid ? rx50() : ''}<div class="tiny muted">${esc(c.ticker)} · ${esc(c.sector)}</div></span></span></td><td class="num strong">${money(D.price(c.id))}</td><td class="num ${cls(d1)}">${pct(d1)}</td><td><span class="row" style="gap:8px">${sparkline(D.series(c, '3M'), 64, 22)}<span class="${cls(m3)} small">${pct(m3)}</span></span></td><td class="num">${money(hb)}</td><td class="num">${money(la)}</td><td class="num">${sp == null ? '—' : (sp * 100).toFixed(1) + '%'}</td><td class="num">${D.liveListings(c.id).length}</td><td class="num">${D.liveBids(c.id).length}</td><td class="dim" style="white-space:nowrap">${esc(c.round.series)} · ${esc(c.round.post)}</td><td>${starBtn(c)}</td></tr>`; }).join('')}</tbody></table></div>`;
  main.innerHTML = `<div class="page">
    <div class="mkt-head"><div><h1 style="font-size:26px">Browse Companies</h1><div class="muted small">Showing ${list.length} of ${D.COMPANIES.length} companies · RX prices update on every match</div></div>
      <div class="toolbar" style="margin:0">
        <div class="search">${ICON.search}<input id="bsearch" placeholder="Search by company" value="${esc(browseState.q)}"></div>
        <div class="dd" id="dd-filter"><button>${ICON.filter} Filter${filtersOn ? ` <span class="count-pill sm">${filtersOn}</span>` : ''} ${ICON.chev}</button>
          <div class="dd-menu hidden" style="min-width:300px;max-height:520px;overflow:auto"><div class="grp">Liquidity</div><label class="opt"><input type="checkbox" data-f="rx50" ${browseState.rx50 ? 'checked' : ''}> RX50 constituents only</label>
            <div class="grp">RX price range</div><div class="range"><input type="number" placeholder="Min $" data-f="min" value="${esc(browseState.min)}"><input type="number" placeholder="Max $" data-f="max" value="${esc(browseState.max)}"></div>
            <div class="grp">Valuation at last round ($ billions)</div><div class="range"><input type="number" step="0.5" placeholder="Min $b" data-f="capMin" value="${esc(browseState.capMin)}"><input type="number" step="0.5" placeholder="Max $b" data-f="capMax" value="${esc(browseState.capMax)}"></div><div class="chips" style="padding:4px 12px 2px;gap:4px">${[['', '1', 'Under $1b'], ['1', '10', '$1–10b'], ['10', '50', '$10–50b'], ['50', '', '$50b+']].map(([a, b, l]) => `<button type="button" class="chip ${browseState.capMin === a && browseState.capMax === b ? 'on' : ''}" data-cap="${a}|${b}">${l}</button>`).join('')}</div>
            <div class="grp">Industries</div>${allInd.map(i => `<label class="opt"><input type="checkbox" data-ind="${esc(i)}" ${browseState.industries.includes(i) ? 'checked' : ''}> ${esc(i)}</label>`).join('')}
            <div class="dd-foot"><button class="btn ghost sm" id="f-clear">Clear</button><button class="btn dark sm" id="f-apply">Apply</button></div></div></div>
        <div class="dd" id="dd-sort"><button>Sort by: <b>${SORTS[browseState.sort]}</b> ${ICON.chev}</button><div class="dd-menu hidden">${Object.entries(SORTS).map(([k, v]) => `<button class="opt ${k === browseState.sort ? 'on' : ''}" data-sort="${k}">${v}</button>`).join('')}</div></div>
        <div class="seg" id="view-seg"><button data-view="list" class="${listView ? 'on' : ''}">List</button><button data-view="cards" class="${browseState.view === 'cards' ? 'on' : ''}">Cards</button><button data-view="table" class="${table ? 'on' : ''}">Table</button></div>
      </div></div>
    ${activeChips ? `<div class="chips" style="margin:-6px 0 16px;flex-wrap:wrap">${activeChips}</div>` : ''}
    ${pageItems.length ? (table ? tableHtml : listView ? listHtml : cardsHtml) : '<div class="card empty">No companies match these filters.</div>'}
    ${pages > 1 ? `<div class="pager"><button data-page="${browseState.page - 1}" ${browseState.page === 1 ? 'disabled' : ''}>‹</button>${Array.from({ length: pages }, (_, i) => `<button data-page="${i + 1}" class="${i + 1 === browseState.page ? 'on' : ''}">${i + 1}</button>`).join('')}<button data-page="${browseState.page + 1}" ${browseState.page === pages ? 'disabled' : ''}>›</button></div>` : ''}
  </div>`;
  const bs = main.querySelector('#bsearch'); bs.addEventListener('input', () => { browseState.q = bs.value; browseState.page = 1; const pos = bs.selectionStart; viewBrowse(main); const n = main.querySelector('#bsearch'); n.focus(); n.setSelectionRange(pos, pos); });
  const toggleDD = id => { const dd = main.querySelector('#' + id); dd.querySelector('button').onclick = e => { e.stopPropagation(); const m = dd.querySelector('.dd-menu'); const open = m.classList.contains('hidden'); main.querySelectorAll('.dd-menu').forEach(x => x.classList.add('hidden')); if (open) m.classList.remove('hidden'); }; dd.querySelector('.dd-menu').onclick = e => e.stopPropagation(); };
  toggleDD('dd-filter'); toggleDD('dd-sort');
  document.addEventListener('click', () => main.querySelectorAll('.dd-menu').forEach(x => x.classList.add('hidden')), { once: true });
  main.querySelector('#dd-sort .dd-menu').addEventListener('click', e => { const b = e.target.closest('[data-sort]'); if (!b) return; browseState.sort = b.dataset.sort; browseState.page = 1; viewBrowse(main); });
  main.querySelector('#view-seg').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; browseState.view = b.dataset.view; browseState.page = 1; viewBrowse(main); });
  main.querySelector('#f-apply').onclick = () => { const m = main.querySelector('#dd-filter .dd-menu'); browseState.rx50 = m.querySelector('[data-f=rx50]').checked; browseState.min = m.querySelector('[data-f=min]').value; browseState.max = m.querySelector('[data-f=max]').value; browseState.capMin = m.querySelector('[data-f=capMin]').value; browseState.capMax = m.querySelector('[data-f=capMax]').value; browseState.industries = [...m.querySelectorAll('[data-ind]:checked')].map(x => x.dataset.ind); browseState.page = 1; viewBrowse(main); };
  main.querySelector('#f-clear').onclick = () => { Object.assign(browseState, { rx50: false, min: '', max: '', capMin: '', capMax: '', industries: [], investor: '', sector: '', page: 1 }); viewBrowse(main); };
  main.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { browseState[b.dataset.clear] = ''; browseState.page = 1; viewBrowse(main); });
  main.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => { const [a, z] = b.dataset.cap.split('|'); browseState.capMin = a; browseState.capMax = z; browseState.page = 1; viewBrowse(main); });
  main.querySelectorAll('[data-clear-cap]').forEach(b => b.onclick = () => { browseState.capMin = ''; browseState.capMax = ''; browseState.page = 1; viewBrowse(main); });
  main.querySelectorAll('[data-clear-ind]').forEach(b => b.onclick = () => { browseState.industries = browseState.industries.filter(i => i !== b.dataset.clearInd); browseState.page = 1; viewBrowse(main); });
  main.querySelectorAll('.pager button').forEach(b => b.onclick = () => { browseState.page = +b.dataset.page; viewBrowse(main); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

// Company page feed: cards or table.
let coFeedView = 'cards';
// Company page: chart, pricing strip, order book, trade box, desk, data room, alerts, negotiation, IOIs.
function viewCompany(main, id, initialTab) {
  const c = D.company(id); if (!c) { main.innerHTML = '<div class="page"><div class="card empty">Company not found.</div></div>'; return; }
  const tx = D.transactions(c.id);
  const allCh = D.change(c, 'MAX');
  let txLimit = 10; let showScatter = true; let tab = 'listing';
  main.innerHTML = `<div class="page wide"><div class="two-col">
    <div class="stack">
      <div class="card">
        <div class="company-head">${logo(c, 'lg')}<h1>${esc(c.name)}</h1><button class="btn outline sm" data-alert="${c.id}">${ICON.bellSm} Alerts</button><button class="btn outline sm" data-contact="${c.id}" title="Message your primary representative or Rainmaker Securities support, with documents or screenshots">${ICON.mail} Contact us</button>${watchBtn(c, true)}</div>
        ${alertBox(c)}
        <div class="info-block">${c.liquid ? `<div><span class="rx50-note">${rx50()}<span class="txt">This stock is more liquid than most</span></span></div>` : ''}<div class="label">Current pricing</div>${pricingStrip(c, true)}<div class="label">Market activity</div>${activityPills(c)}</div>
        <div class="info-block"><div class="label">About</div><p>${esc(c.desc)}</p>${c.info ? `<div class="label">Important information</div><p><b>Transfer fees</b>: ${esc(c.info)}</p>` : ''}</div>
        <div class="info-block">${policyBlock(c)}</div>
        <div class="card-foot">Have questions about trading ${esc(c.name)}? <a class="link" href="#/messages/${c.id}" data-contact="${c.id}">Contact us or your primary representative</a> · attach documents or screenshots.</div>
      </div>
      <div class="card" id="price-card"><div class="card-head"><span class="label">${esc(c.name)} price history</span></div>
        <div class="card-body stack">
          <div class="stats-3"><div class="stat"><span class="k">RX Price ${ICON.info}</span><div class="v" id="c-price">${money(D.price(c.id))}</div><div class="chg ${cls(allCh)}" id="c-chg"></div><div class="s" style="margin-top:6px;font-style:italic">${updatedStr()}</div></div><div class="stat"><span class="k">Matches ${ICON.info}</span><div class="v">${num(c.matches)}</div><div class="s">all time</div></div><div class="stat"><span class="k">Volume ${ICON.info}</span><div class="v">${compact(c.volume)}</div><div class="s">all time</div></div></div>
          <div class="between"><div class="seg"></div><div class="row"><a class="btn outline sm" href="#/chart/${c.id}">Advanced chart ›</a></div></div>
          <div class="chart-wrap"></div>
          <div class="legend"><span class="li"><span class="ln" style="background:${D.change(c, '1Y') >= 0 ? '#00a000' : '#ff0000'}"></span>RX Price</span><span class="li muted small">Individual transactions are plotted on the advanced chart.</span></div>
          <div class="disclaimer">The RX Price is a per-security indicative price estimate. It is calculated daily using a time-decayed, volume-weighted blend of (a) confirmed transactions and (b) the bid/ask midpoint, weighted in favour of bids. Past performance is not indicative of future results. Sample data for prototyping only.</div>
        </div></div>
      <div class="card"><div class="card-head"><span class="label">Order book depth</span><span class="muted small">${D.liveBids(c.id).length} bids · ${D.liveListings(c.id).length} asks · live</span></div><div class="card-body">${depthChart(c)}</div></div>
      <div class="card"><div class="card-head"><span class="label">Transaction history</span><span class="muted small">${tx.length} records</span></div>
        <div id="tx-wrap"></div></div>
      <div class="card"><div class="card-head"><span class="label">Last round details</span></div>
        <div class="card-body" style="padding-top:4px;padding-bottom:4px"><table class="kv"><tr><th>Value</th><td>${esc(c.round.post)} post at ${money(c.round.pps)}/sh</td></tr><tr><th>Date</th><td>${esc(c.round.date)} (${esc(c.round.series)})</td></tr><tr><th>Capital raised</th><td>${esc(c.round.raised)} of ${esc(c.round.total)} total</td></tr><tr><th>Notable investors</th><td>${c.investors.map(esc).join(', ')}</td></tr><tr><th>Industries</th><td><div class="tags">${c.industries.map(i => `<span class="tag">${esc(i)}</span>`).join('')}</div></td></tr></table></div>
        <div class="card-foot disclaimer"><b>Note:</b> Information is provided for informational and educational purposes only, and is not a recommendation to buy or sell securities.</div></div>
      ${dataRoomCard(c)}
      ${similarCompanies(c)}
      <div class="card"><div class="card-head"><span class="label">Resources</span></div><div class="card-body res-grid"><div class="resource">${ICON.doc}<h4>${esc(c.name)} Research Report</h4><div class="by">By Rainmaker Research</div><a class="view" href="#/company/${c.id}">View →</a></div><div class="resource">${ICON.doc}<h4>The Liquidity Thesis: ${esc(c.name)}</h4><div class="by">By Rainmaker X</div><a class="view" href="#/company/${c.id}">View →</a></div></div></div>
    </div>
    <div class="stack">
      ${deskCard(c)}
      ${tradeCards(c)}
      ${ioiCard(c)}
      <div class="between" style="margin-top:8px"><h2 class="section-title" style="margin:0">Market Activity</h2><div class="seg" id="ma-view"><button data-view="cards" class="${coFeedView === 'cards' ? 'on' : ''}">Cards</button><button data-view="table" class="${coFeedView === 'table' ? 'on' : ''}">Table</button></div></div>
      <div class="tabs" id="ma-tabs"><button class="on" data-tab="listing">Asks <span class="cnt" id="cnt-l"></span></button><button data-tab="bid">Bids <span class="cnt" id="cnt-b"></span></button></div>
      <div class="stack" id="ma-feed"></div>
    </div>
  </div></div>`;
  const pc = main.querySelector('#price-card');
  mountPriceChart(pc, c, { height: 320, labelEl: pc.querySelector('#c-price'), changeEl: pc.querySelector('#c-chg') });
  const txWrap = main.querySelector('#tx-wrap');
  const drawTx = () => { const rows = tx.slice(0, txLimit); txWrap.innerHTML = `<table class="table compact"><thead><tr><th>Date</th><th class="num">Price / sh</th><th class="num">Shares</th><th class="num">Total</th><th>Transfer</th><th>Status</th></tr></thead><tbody>${rows.map(t => `<tr><td>${fmtDate(t.ts)}</td><td class="num">${money(t.price)}</td><td class="num">${num(t.qty)}</td><td class="num">${money(t.price * t.qty, 0)}</td><td>${esc(t.transferType)}</td><td><span class="tx-status"><span class="sw" style="background:${t.status === 'closed' ? '#1d5f8a' : t.status === 'matched' ? '#7fc4ea' : '#c4c9ce'}"></span>${t.status[0].toUpperCase() + t.status.slice(1)}${t.mine ? ' · yours' : ''}</span></td></tr>`).join('')}</tbody></table>${tx.length > txLimit ? `<div class="card-foot" style="text-align:center"><button class="btn outline sm" id="tx-more">Show more</button></div>` : ''}`; const more = txWrap.querySelector('#tx-more'); if (more) more.onclick = () => { txLimit += 20; drawTx(); }; };
  drawTx();
  const feed = main.querySelector('#ma-feed');
  const drawFeed = () => { const list = tab === 'listing' ? D.listings(c.id) : D.standingBids(c.id); main.querySelector('#cnt-l').textContent = D.listings(c.id).length; main.querySelector('#cnt-b').textContent = D.standingBids(c.id).length;
    const foot = `<div class="row small" style="justify-content:center;gap:16px"><a class="link" href="#/new/${tab === 'listing' ? 'bid' : 'listing'}/${c.id}">Don't see a price you like? Place your own ${tab === 'listing' ? 'bid' : 'ask'}</a><a class="link" href="#/new/custom/${c.id}">Build a custom order →</a></div>`;
    feed.innerHTML = list.length ? (coFeedView === 'cards' ? list.map(o => orderCard(o, { showCompany: false })).join('') : `<div class="card">${orderBook(list)}</div>`) + foot : `<div class="card empty">No ${tab === 'listing' ? 'asks' : 'bids'} yet. <a class="link" href="#/new/${tab}/${c.id}">Be the first.</a></div>`; };
  drawFeed();
  main.querySelector('#ma-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; main.querySelectorAll('#ma-tabs button').forEach(x => x.classList.toggle('on', x === b)); drawFeed(); });
  main.querySelector('#ma-view').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; coFeedView = b.dataset.view; main.querySelectorAll('#ma-view button').forEach(x => x.classList.toggle('on', x === b)); drawFeed(); });
  wireDesk(main, c); wireAskRainmaker(main, c, null);
  const ioiF = main.querySelector('#ioi-form'); if (ioiF) ioiF.addEventListener('submit', e => { e.preventDefault(); D.addIOI({ companyId: c.id, side: ioiF.side.value, price: +ioiF.price.value, qty: +ioiF.qty.value }); toast('Indication of interest recorded'); render(); });
  const alF = main.querySelector('#alert-form'); if (alF) alF.addEventListener('submit', e => { e.preventDefault(); D.addAlert({ companyId: c.id, type: alF.type.value, price: +alF.price.value || 0 }); toast('Alert saved'); render(); setTimeout(() => { const b = document.querySelector('#alert-box'); if (b) b.classList.remove('hidden'); }, 0); });
  main.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => toast('Documents are placeholders in this prototype', false));
}

// A settlement with no order behind it (seeded holdings, desk trades) gets its own page under the same #/order/<id> route.

// RX50 constituents table sort.
const idxSort = { key: 'change', dir: -1 };
// RX50 index page: chart and constituents.
function viewIndex(main) {
  const s = D.series(D.INDEX, 'MAX'); const last = s[s.length - 1].p; const ch = D.change(D.INDEX, 'MAX');
  const rows = D.INDEX.members.map(c => ({ c, price: D.price(c.id), change: D.change(c, '3M'), hb: D.highestBid(c.id) || 0, la: D.lowestAsk(c.id) || 0, name: c.name }));
  rows.sort((a, b) => (typeof a[idxSort.key] === 'string' ? a[idxSort.key].localeCompare(b[idxSort.key]) : a[idxSort.key] - b[idxSort.key]) * idxSort.dir);
  const th = (k, label, num) => `<th class="sortable ${num ? 'num' : ''}" data-k="${k}">${label} ${idxSort.key === k ? (idxSort.dir < 0 ? '▾' : '▴') : ''}</th>`;
  main.innerHTML = `<div class="page narrow stack">
    <div class="card" id="index-card"><div class="card-body stack"><div><div class="between"><div class="index-title" style="font-size:28px">RX<span class="fifty">50</span><span class="light">Index</span><span class="updated">${updatedStr()}</span></div><a class="link small" href="#/funds">← All RX Funds</a></div><p style="margin:6px 0 0;max-width:760px;color:var(--ink-2)">The RX50 is an equal-weight price index of the most liquid securities on Rainmaker X. The index is generated directly from user orders and transactions on the platform. It is intended to be a barometer for the direction and momentum of the late-stage private market.</p></div>
      <div class="between"><div class="row"><span class="price-big xl" id="idx-price">${last.toFixed(2)}</span><span class="chg" id="idx-chg"></span></div><div class="seg"></div></div><div class="chart-wrap"></div></div></div>
    <div class="card"><div class="card-body" style="padding-bottom:0"><h2 style="font-size:24px">Index Constituents</h2><p style="margin:6px 0 0;max-width:760px;color:var(--ink-2)">Membership is determined quarterly based on a liquidity score incorporating the frequency and volume of closed transactions in the 180 days prior to the reconstitution date.</p></div>
      <div class="card-body"><table class="table" id="idx-table"><thead><tr>${th('name', 'Company')}${th('price', 'RX price', true)}<th>Trend (over 3M)</th>${th('change', 'Change (over 3M)', true)}${th('hb', 'Highest bid', true)}${th('la', 'Lowest ask', true)}<th></th></tr></thead><tbody>
        ${rows.map(r => `<tr class="clickable" data-href="#/company/${r.c.id}"><td><span class="row">${logo(r.c)}<b>${esc(r.c.name)}</b></span></td><td class="num strong">${money(r.price)}</td><td>${sparkline(D.series(r.c, '3M'))}</td><td class="num ${cls(r.change)} strong">${pct(r.change)}</td><td class="num strong">${money(r.hb || null)}</td><td class="num strong">${money(r.la || null)}</td><td class="num">${watchBtn(r.c, true)}</td></tr>`).join('')}</tbody></table></div></div>
  </div>`;
  const card = main.querySelector('#index-card');
  mountPriceChart(card, D.INDEX, { prefix: '', height: 340, periods: ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX'], labelEl: card.querySelector('#idx-price'), changeEl: card.querySelector('#idx-chg') });
  main.querySelector('#idx-table thead').addEventListener('click', e => { const t = e.target.closest('[data-k]'); if (!t) return; if (idxSort.key === t.dataset.k) idxSort.dir *= -1; else { idxSort.key = t.dataset.k; idxSort.dir = t.dataset.k === 'name' ? 1 : -1; } viewIndex(main); });
}


// Advanced chart: zoom / pan, transactions, blue line.
function viewChart(main, id) {
  const c = D.company(id); if (!c) { main.innerHTML = '<div class="page"><div class="card empty">Company not found.</div></div>'; return; }
  const allTx = D.transactions(c.id);
  const F = { status: { matched: true, closed: true, canceled: true }, share: { Common: true, Preferred: true }, transfer: { Direct: true, SPV: true, Forward: true }, trends: { price: true, ma: false, bidask: false } };
  let period = 'MAX', brush = null, selected = null;
  const bucket = v => v < 1e5 ? '< $100K' : v < 5e5 ? '$100K – $500K' : v < 1e6 ? '$500K – $1M' : '> $1M';
  const radius = v => v < 1e5 ? 3 : v < 5e5 ? 4.5 : v < 1e6 ? 6 : 8;
  const chk = (grp, key, label) => `<label class="opt"><input type="checkbox" data-grp="${grp}" data-key="${key}" ${F[grp][key] ? 'checked' : ''}> ${label}</label>`;
  main.innerHTML = `<div class="chart-page">
    <div class="chart-head"><div class="row" style="gap:14px">${logo(c, 'lg')}<div><h1 style="font-size:26px">${esc(c.name)}</h1><div class="row"><span class="muted">Price history</span><span class="powered">Powered by <b>Rainmaker X</b></span></div></div></div><a class="btn outline sm" href="#/company/${c.id}">Close advanced chart ⤡</a></div>
    <div class="chart-trade"><a class="btn ask" href="#/new/listing/${c.id}">${ICON.cash} Sell</a><a class="btn bid" href="#/new/bid/${c.id}">${ICON.cart} Buy</a></div>
    <div class="chart-toolbar"><div class="seg"></div><div class="row">
      <div class="dd"><button>${ICON.plus} Price trends</button><div class="dd-menu hidden">${chk('trends', 'price', 'RX Price')}${chk('trends', 'ma', '30-day moving average')}${chk('trends', 'bidask', 'Highest bid / lowest ask')}</div></div>
      <div class="dd"><button>${ICON.plus} Transaction status</button><div class="dd-menu hidden">${chk('status', 'matched', 'Matched')}${chk('status', 'closed', 'Closed')}${chk('status', 'canceled', 'Canceled')}</div></div>
      <div class="dd"><button>${ICON.plus} Order type</button><div class="dd-menu hidden"><div class="grp">Share type</div>${chk('share', 'Common', 'Common')}${chk('share', 'Preferred', 'Preferred')}<div class="grp">Transfer type</div>${chk('transfer', 'Direct', 'Direct')}${chk('transfer', 'SPV', 'SPV')}${chk('transfer', 'Forward', 'Forward')}</div></div>
    </div></div>
    <div class="chart-body">
      <div class="chart-side"><div class="stat"><span class="k">RX Price ${ICON.info}</span><div class="v" id="ac-price">${money(D.price(c.id))}</div><div class="chg" id="ac-chg"></div><div class="s" style="margin-top:6px;font-style:italic">${updatedStr()}</div></div><div class="tx-panel" id="tx-panel"></div></div>
      <div class="chart-main"><div class="chart-wrap" id="ac-main"></div><div class="minimap" id="ac-mini"></div><div class="small muted" style="margin-top:6px">Drag the handles below the chart to zoom into a date range. Hover a dot to inspect that transaction. Dot size reflects transaction size.</div></div>
    </div>
    <div class="chart-foot"><div class="label" style="margin-bottom:8px">Legend</div><div class="legend"><span class="li"><span class="ln" style="background:#4a90c4"></span>RX Price</span><span class="li"><span class="sw" style="background:#7fc4ea"></span>Matched</span><span class="li"><span class="sw" style="background:#1d5f8a"></span>Closed</span><span class="li"><span class="sw" style="background:#c4c9ce"></span>Canceled</span><span class="li"><span class="ln" style="background:#e8635b"></span>30-day average</span></div>
      <div class="disclaimer" style="margin-top:12px">The RX Price is a per-security indicative price estimate calculated daily using a time-decayed, volume-weighted blend of confirmed transactions and the bid/ask midpoint, weighted in favour of bids. Sample data for prototyping only.</div></div>
  </div>`;
  const seg = main.querySelector('.seg'); const PER = ['1M', '3M', '6M', '1Y', '5Y', 'MAX'];
  seg.innerHTML = PER.map(p => `<button data-p="${p}" class="${p === period ? 'on' : ''}">${p}</button>`).join('');
  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; period = b.dataset.p; brush = null; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); drawMini(); drawMain(); });
  main.querySelectorAll('.dd').forEach(dd => { dd.querySelector('button').onclick = e => { e.stopPropagation(); const m = dd.querySelector('.dd-menu'); const open = m.classList.contains('hidden'); main.querySelectorAll('.dd-menu').forEach(x => x.classList.add('hidden')); if (open) m.classList.remove('hidden'); }; dd.querySelector('.dd-menu').onclick = e => e.stopPropagation(); });
  document.addEventListener('click', () => main.querySelectorAll('.dd-menu').forEach(x => x.classList.add('hidden')));
  main.querySelectorAll('[data-grp]').forEach(i => i.addEventListener('change', () => { F[i.dataset.grp][i.dataset.key] = i.checked; drawMain(); }));
  const mainEl = main.querySelector('#ac-main'), miniEl = main.querySelector('#ac-mini'), panel = main.querySelector('#tx-panel'), priceEl = main.querySelector('#ac-price'), chgEl = main.querySelector('#ac-chg');
  const full = () => D.series(c, period);
  const range = () => { const f = full(); return brush || [f[0].t, f[f.length - 1].t]; };
  const renderPanel = () => { const t = selected; if (!t) { panel.innerHTML = '<div class="muted small">Hover a transaction dot to see its details.</div>'; return; }
    const col = t.status === 'closed' ? '#1d5f8a' : t.status === 'matched' ? '#7fc4ea' : '#c4c9ce';
    panel.innerHTML = `<div class="row" style="margin-bottom:12px"><span class="sw" style="width:10px;height:10px;border-radius:50%;background:${col};display:inline-block"></span><b style="font-size:15px">${t.status[0].toUpperCase() + t.status.slice(1)}</b>${t.mine ? '<span class="badge mine">Yours</span>' : ''}</div>
      <table class="kv tight"><tr><th>Price per share</th><td class="strong">${money(t.price)}</td></tr><tr><th>Transaction size</th><td class="strong">${bucket(t.price * t.qty)}</td></tr><tr><th>Share type</th><td class="strong">${esc(t.shareType || 'Common')}</td></tr><tr><th>Transfer type</th><td class="strong">${esc(t.transferType)}</td></tr></table>
      <table class="kv tight" style="margin-top:10px"><tr><th>${t.status === 'closed' ? 'Close date' : 'Match date'}</th><td class="strong">${fmtDate(t.ts)}</td></tr><tr><th>Status</th><td class="strong">${t.status === 'matched' ? 'In progress' : t.status === 'closed' ? 'Closed' : 'Canceled'}</td></tr></table>`; };
  const ma = (series, n) => series.map((p, i) => { const w = series.slice(Math.max(0, i - n + 1), i + 1); return { t: p.t, p: w.reduce((s, x) => s + x.p, 0) / w.length }; });
  function drawMain() {
    const f = full(); const [t0, t1] = range();
    let vis = f.filter(p => p.t >= t0 && p.t <= t1); if (vis.length < 2) vis = f.slice(-2);
    const tx = allTx.filter(t => F.status[t.status] && F.share[t.shareType || 'Common'] && F.transfer[t.transferType || 'Direct'] && t.ts >= t0 && t.ts <= t1 + 3600000).map(t => Object.assign({}, t, { r: radius(t.price * t.qty) }));
    const ch = (vis[vis.length - 1].p - vis[0].p) / vis[0].p; chgEl.className = 'chg ' + cls(ch); chgEl.innerHTML = `${pct2(ch)}<span class="lbl">${brush ? 'selected range' : period === 'MAX' ? 'all time' : 'past ' + period}</span>`;
    const lines = F.trends.ma ? [{ series: ma(f, 30), color: '#e8635b', width: 1.5 }] : [];
    const hlines = F.trends.bidask ? [{ v: D.highestBid(c.id), label: 'Highest bid ' + money(D.highestBid(c.id)), color: '#2f9e5f' }, { v: D.lowestAsk(c.id), label: 'Lowest ask ' + money(D.lowestAsk(c.id)), color: '#d9534a' }].filter(h => h.v != null) : [];
    mainEl.classList.toggle('hide-line', !F.trends.price);
    lineChart(mainEl, { series: vis, period: (t1 - t0) < 40 * D.DAY ? '1M' : (t1 - t0) < 400 * D.DAY ? '1Y' : 'MAX', height: 420, color: '#4a90c4', scatter: tx, lines, hlines, onHover: p => { priceEl.textContent = money(p ? p.p : D.price(c.id)); }, onDot: s => { if (s && s !== selected) { selected = s; renderPanel(); } } });
    if (!selected || !tx.find(t => t.id === selected.id)) { selected = tx[0] || null; renderPanel(); }
  }
  function drawMini() {
    const f = full(); const W = Math.max(320, miniEl.clientWidth || 700), H = 78, pad = { l: 12, r: 52, t: 8, b: 18 };
    const tmin = f[0].t, tmax = f[f.length - 1].t; const ys = f.map(p => p.p); const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const X = t => pad.l + (t - tmin) / (tmax - tmin || 1) * (W - pad.l - pad.r); const Xi = x => tmin + (x - pad.l) / (W - pad.l - pad.r) * (tmax - tmin);
    const Y = v => pad.t + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - pad.t - pad.b);
    const path = f.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.p).toFixed(1)).join(' ');
    const nX = Math.min(8, Math.max(2, Math.round(W / 160))); const xt = []; for (let i = 0; i <= nX; i++) xt.push(tmin + (tmax - tmin) * i / nX);
    const [b0, b1] = range();
    miniEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="touch-action:none;user-select:none">
      <path d="${path} L${X(tmax).toFixed(1)} ${H - pad.b} L${X(tmin).toFixed(1)} ${H - pad.b} Z" fill="#4a90c4" fill-opacity=".12"/><path d="${path}" fill="none" stroke="#4a90c4" stroke-width="1.2"/>
      ${xt.map(t => `<text x="${X(t).toFixed(1)}" y="${H - 4}" font-size="9" fill="#8b929c" text-anchor="${t === tmin ? 'start' : t === tmax ? 'end' : 'middle'}">${xLabel(t, 'MAX')}</text>`).join('')}
      <rect class="shade l" x="${pad.l}" y="${pad.t}" width="${(X(b0) - pad.l).toFixed(1)}" height="${H - pad.t - pad.b}" fill="#1b1f24" fill-opacity=".06"/>
      <rect class="shade r" x="${X(b1).toFixed(1)}" y="${pad.t}" width="${(W - pad.r - X(b1)).toFixed(1)}" height="${H - pad.t - pad.b}" fill="#1b1f24" fill-opacity=".06"/>
      <rect class="win" x="${X(b0).toFixed(1)}" y="${pad.t}" width="${(X(b1) - X(b0)).toFixed(1)}" height="${H - pad.t - pad.b}" fill="transparent" stroke="#1e3a45" stroke-width="1.2" style="cursor:grab"/>
      <rect class="h l" x="${(X(b0) - 4).toFixed(1)}" y="${pad.t + 10}" width="8" height="${H - pad.t - pad.b - 20}" rx="2" fill="#1e3a45" style="cursor:ew-resize"/>
      <rect class="h r" x="${(X(b1) - 4).toFixed(1)}" y="${pad.t + 10}" width="8" height="${H - pad.t - pad.b - 20}" rx="2" fill="#1e3a45" style="cursor:ew-resize"/>
    </svg>`;
    const svg = miniEl.querySelector('svg'); const els = { sl: svg.querySelector('.shade.l'), sr: svg.querySelector('.shade.r'), win: svg.querySelector('.win'), hl: svg.querySelector('.h.l'), hr: svg.querySelector('.h.r') };
    const setRects = (t0, t1) => { const x0 = X(t0), x1 = X(t1); els.sl.setAttribute('width', Math.max(0, x0 - pad.l)); els.sr.setAttribute('x', x1); els.sr.setAttribute('width', Math.max(0, W - pad.r - x1)); els.win.setAttribute('x', x0); els.win.setAttribute('width', Math.max(0, x1 - x0)); els.hl.setAttribute('x', x0 - 4); els.hr.setAttribute('x', x1 - 4); };
    let mode = null, startX = 0, start = null; const minSpan = (tmax - tmin) * 0.03;
    const px = e => { const r = svg.getBoundingClientRect(); return (e.clientX - r.left) * (W / r.width); };
    svg.addEventListener('pointerdown', e => { const x = px(e); const [c0, c1] = range(); const x0 = X(c0), x1 = X(c1);
      mode = Math.abs(x - x0) <= 9 ? 'l' : Math.abs(x - x1) <= 9 ? 'r' : (x > x0 && x < x1) ? 'move' : 'new'; startX = x; start = [c0, c1]; if (mode === 'new') { brush = [Xi(x), Xi(x)]; } svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => { if (!mode) return; const x = px(e); const t = Math.max(tmin, Math.min(tmax, Xi(x))); let [c0, c1] = start;
      if (mode === 'l') c0 = Math.min(t, c1 - minSpan); else if (mode === 'r') c1 = Math.max(t, c0 + minSpan); else if (mode === 'move') { const dt = Xi(x) - Xi(startX); const span = c1 - c0; c0 = Math.max(tmin, Math.min(tmax - span, c0 + dt)); c1 = c0 + span; } else { const a = Xi(startX); c0 = Math.min(a, t); c1 = Math.max(a, t); if (c1 - c0 < minSpan) c1 = Math.min(tmax, c0 + minSpan); }
      brush = [c0, c1]; setRects(c0, c1); });
    const end = () => { if (!mode) return; mode = null; if (brush && brush[0] <= tmin + 1 && brush[1] >= tmax - 1) brush = null; drawMain(); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  }
  drawMini(); drawMain();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (document.body.contains(miniEl)) drawMini(); else ro.disconnect(); }); ro.observe(miniEl); }
}

// ---------------- v5 shared pieces ----------------
