/* ==============================================================
   Rainmaker X · app · reusable components
   Order cards / rows / book, badges, page head (pageHead + PH icons), trade boxes,
   verification card, filter bars, company rows and pickers.
   ============================================================== */
'use strict';

// Traced gold R logo used in the header and hero.
const LOGO = '<svg viewBox="0 0 300 290" fill="none" aria-label="Rainmaker"><defs><linearGradient id="rxg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3dc7e"/><stop offset=".4" stop-color="#d4af37"/><stop offset=".7" stop-color="#b8912e"/><stop offset="1" stop-color="#e2c565"/></linearGradient><clipPath id="rxc"><rect x="0" y="0" width="300" height="279"/></clipPath></defs><g clip-path="url(#rxc)" stroke="url(#rxg)" stroke-width="15" stroke-linejoin="miter" stroke-linecap="butt"><path d="M290 296L5 12H186a72 72 0 0 1 0 144h-12"/><path d="M14 82h52l178 178"/><path d="M30 152h52l128 128"/></g></svg>';
// Milliseconds in a day.
const DAYMS = 86400000;
// Days until an order expires (never negative).
const daysLeft = o => Math.max(0, Math.ceil((o.expires - Date.now()) / DAYMS));
// True when an order has fully sold / filled.
const isDone = o => o.status === 'sold' || o.status === 'completed';
// Ask (gold) or Bid (blue) badge.
const sideBadge = o => `<span class="badge ${o.side === 'listing' ? 'listing' : 'bid'}">${o.side === 'listing' ? 'Ask' : 'Bid'}</span>`;
// Custom-order badge with the kind of custom terms.
const customBadge = o => o.custom ? `<span class="badge custom" title="Custom order">Custom${o.custom.tiers > 1 ? ` ${o.custom.tier}/${o.custom.tiers}` : ''}</span>` : '';
// Marks orders placed by this member (anonymous ones say so).
const yoursBadge = o => o.mine && !o.anonymous ? '<span class="badge mine">Yours</span>' : o.mine ? '<span class="badge status" title="Anonymous: only you can see this is yours">Yours · anon</span>' : '';
// Fill rule badge: all-or-none and minimum-fill orders say so wherever they are listed; partial (the default) shows nothing.
const fillBadge = o => { const r = D.fillRule(o); return r.fill === 'aon' ? '<span class="badge fill" title="All-or-none: only matches if the entire quantity executes in one go">All-or-none</span>' : r.fill === 'min' ? `<span class="badge fill" title="Minimum fill: only matches ${num(r.min)} shares or more at a time">Min ${num(r.min)}</span>` : ''; };
// Order as a card, used by feeds and the dashboard.
function orderCard(o, { showCompany = true, actions = false } = {}) {
  const c = D.company(o.companyId); const done = isDone(o); const isL = o.side === 'listing';
  const inner = `<div class="oc-head">${sideBadge(o)}${customBadge(o)}${fillBadge(o)}<span class="cname">${showCompany ? `${logo(c, 'sm')}<b>${esc(c.name)}</b>` : `<b class="oid">${esc(o.id)}</b>`}</span>${yoursBadge(o)}</div>
    <div class="oc-body"><div class="qp ${done ? 'done' : ''}">${num(o.qty)} <span class="per">@</span> ${money(o.price)}<span class="total">${money(o.price * o.qty, 0)}</span></div>
      <div class="sub">${done ? `${num(o.soldQty || o.qty)} shares ${isL ? 'sold' : 'purchased'}` : `${esc(o.shareType)} · ${esc(o.transferType)}${showCompany ? ' · ' + esc(o.id) : ''} · ${isL ? `${o.bidsCount || 0} ${o.bidsCount === 1 ? 'bid' : 'bids'}` : daysLeft(o) + 'd left'}`}</div>
    </div>`;
  if (!actions) return `<a class="order-card" href="#/order/${esc(o.id)}">${inner}</a>`;
  // Home page (Ben, Oct 4 2026): a Match button (take the other side on the order page) and a Contact a representative button about this order.
  const matchBtn = !done && o.status === 'live' && !o.mine ? `<a class="btn sm ${isL ? 'bid' : 'ask'}" href="#/order/${esc(o.id)}" title="${isL ? 'Bid on this ask' : 'Sell into this bid'} at its price">${isL ? ICON.cart : ICON.cash} Match</a>` : `<a class="btn outline sm" href="#/order/${esc(o.id)}">View</a>`;
  return `<div class="order-card"><a class="oc-link" href="#/order/${esc(o.id)}">${inner}</a><div class="oc-foot end oc-actions">${matchBtn}<button type="button" class="btn outline sm" data-contact="${esc(c.id)}" data-order="${esc(o.id)}" title="Message your primary representative about this order">${ICON.mail} Contact a representative</button></div></div>`;
}
// Order as a table row.
function orderRow(o, { showCompany = false, match = false } = {}) {
  const c = D.company(o.companyId); const done = isDone(o); const isL = o.side === 'listing';
  // Match column (Market activity): the member takes the other side of a live order in place.
  const matchCell = !match ? '' : `<td class="num">${!done && o.status === 'live' && !o.mine ? `<button type="button" class="btn sm ${isL ? 'bid' : 'ask'} match-btn" data-match-order="${esc(o.id)}" title="${isL ? 'Bid on this ask' : 'Sell into this bid'} at its price">${isL ? ICON.cart : ICON.cash} Match</button>` : ''}</td>`;
  // Ben, Oct 8 2026: no Activity column; "Yours" sits beside the order id and every row shows the date it was placed.
  return `<tr class="clickable ${done ? 'done' : ''} ${o.mine ? 'mine' : ''}" data-href="#/order/${esc(o.id)}">
    <td><span class="row" style="gap:6px">${sideBadge(o)}${customBadge(o)}${fillBadge(o)}<span class="oid">${esc(o.id)}</span>${yoursBadge(o)}</span></td>
    ${showCompany ? `<td><span class="row" style="gap:8px">${logo(c, 'sm')}<b>${esc(c.name)}</b></span></td>` : ''}
    <td class="num">${num(o.qty)}</td><td class="num px">${money(o.price)}</td><td class="num px">${money(o.price * o.qty, 0)}</td>
    <td class="dim">${esc(o.shareType)} · ${esc(o.transferType)}</td>
    <td class="dim">${done ? `<span class="badge status">${isL ? 'Sold' : 'Filled'}</span>` : o.status === 'cancelled' ? '<span class="badge status">Cancelled</span>' : `${daysLeft(o)}d`}</td>
    <td class="dim placed" title="${esc(fmtDate(o.created))}">${fmtDateShort(o.created)}</td>${matchCell}</tr>`;
}
// Table of orders, or an empty message.
function orderBook(list, { showCompany = false, match = false, empty = 'No live orders.' } = {}) {
  if (!list.length) return `<div class="empty" style="padding:36px 20px">${empty}</div>`;
  return `<table class="table compact ob"><thead><tr><th>Order</th>${showCompany ? '<th>Company</th>' : ''}<th class="num">Shares</th><th class="num">Price / sh</th><th class="num">Total</th><th>Class · transfer</th><th>Expires</th><th>Placed</th>${match ? '<th class="num">Match</th>' : ''}</tr></thead><tbody>${list.map(o => orderRow(o, { showCompany, match })).join('')}</tbody></table>`;
}
// RX price, highest bid, lowest ask strip for a company.
function pricingStrip(c, lg = false) {
  const lm = D.lastMatched(c.id); const hb = D.liveBids(c.id)[0], la = D.liveListings(c.id)[0]; const d1 = D.change(c, '1D');
  const cell = (k, v, s) => `<div class="ps-cell"><span class="label">${k}</span><div class="v">${v}</div><div class="s">${s}</div></div>`;
  return `<div class="pricing-strip ${lg ? 'lg' : ''}">
    ${cell('Highest bid', money(D.highestBid(c.id)), hb ? `${num(hb.qty)} sh · ${fmtDateShort(hb.created)}` : 'no live bids')}
    ${cell('Lowest ask', money(D.lowestAsk(c.id)), la ? `${num(la.qty)} sh · ${fmtDateShort(la.created)}` : 'no live asks')}
    ${cell('Last matched', money(lm ? lm.price : null), lm ? `${num(lm.qty)} sh · ${fmtDateShort(lm.ts)}` : 'no matches yet')}
    ${cell('RX price', money(D.price(c.id)), `<span class="${cls(d1)}">${pct(d1)}</span> today`)}</div>`;
}
// Small counts: live asks, bids, 30-day transactions.
function activityPills(c) {
  const l = D.liveListings(c.id).length, b = D.liveBids(c.id).length;
  return `<div class="pills row">${l ? `<span class="pill sm"><b>${l}</b> asks</span>` : ''}${b ? `<span class="pill sm"><b>${b}</b> bids</span>` : ''}${!l && !b ? '<span class="muted small">No live orders</span>' : ''}</div>`;
}
// Watchlist toggle button (star).
const watchBtn = (c, sm = false) => `<button class="btn watch ${sm ? 'sm' : ''} ${D.isWatched(c.id) ? 'on' : ''}" data-watch="${c.id}">${D.isWatched(c.id) ? ICON.starFill : ICON.star} ${D.isWatched(c.id) ? 'Watching' : 'Watchlist'}</button>`;
// Compact star toggle for tiles and rows.
const starBtn = c => `<button class="star-btn" data-watch="${c.id}" title="${D.isWatched(c.id) ? 'Remove from watchlist' : 'Add to watchlist'}">${D.isWatched(c.id) ? ICON.starFill : ICON.star}</button>`;
// Place Ask / Place Bid / Custom order buttons for a company.
function tradeBox(c) {
  const ok = D.canTrade();
  return `<div class="trade-box"><div class="between" style="align-items:flex-start"><div><b>Create an order</b><div class="small muted">Tell the market what you'd pay or take.</div></div>${activityPills(c)}</div>
    <div class="tb-btns"><a class="btn bid ${ok ? '' : 'disabled'}" href="#/new/bid/${c.id}">${ICON.cart} New bid</a><a class="btn ask ${ok ? '' : 'disabled'}" href="#/new/listing/${c.id}">${ICON.cash} New ask</a><a class="btn outline custom ${ok ? '' : 'disabled'}" href="#/new/custom/${c.id}">${ICON.sliders} Custom order</a></div>
    ${ok ? `<div class="tiny muted" style="margin-top:10px">Custom orders support price ladders, pegged prices, fill rules and guardrails.</div>` : '<div class="tiny muted" style="margin-top:10px">Complete <a class="link" href="#/profile/verification">investor verification</a> to place orders.</div>'}</div>`;
}
// Trade box plus pricing strip, used on the company page.
function tradeCards(c, { compact = false } = {}) {
  const id = c ? '/' + c.id : '';
  return `<div class="grid-3">
    <div class="card card-body trade-card"><span class="label">Place an ask</span><p>${compact ? 'Sell shares you hold.' : 'Post an ask for shares you have the ability to sell. Buyers bid directly on your ask and we broker the transfer.'}</p><a class="btn ask" href="#/new/listing${id}">${ICON.cash} Sell</a></div>
    <div class="card card-body trade-card"><span class="label">Make a bid</span><p>${compact ? 'Buy at a price any seller can accept.' : 'Bid on an existing ask, or post your own bid at the price you want that any seller can accept.'}</p><a class="btn bid" href="#/new/bid${id}">${ICON.cart} Buy</a></div>
    <div class="card card-body trade-card"><span class="label">Custom order</span><p>${compact ? 'Ladders, options, forwards, SPVs, special terms.' : 'A bid or ask with your own terms (ladders, pegged prices, fill rules), or a structured deal: an option, a forward, SPV units, or contingent pricing.'}</p><a class="btn outline custom" href="#/new/custom${id}">${ICON.sliders} Build</a></div></div>`;
}
// Human summary of a custom order's terms (ladder, peg, fill rules, expiry, visibility).
function customTermsBlock(o) {
  const k = o.custom; if (!k) return '';
  const sibs = D.groupOrders(o.groupId).filter(s => s.id !== o.id);
  const term = (kk, v) => `<div class="term"><div class="k">${kk}</div><div class="v wrap">${v}</div></div>`;
  const pricing = k.pricing === 'pegged' ? `Pegged to RX price ${k.offset >= 0 ? '+' : ''}${(k.offset * 100).toFixed(1)}%` : k.pricing === 'ladder' ? `Price ladder · tier ${k.tier} of ${k.tiers}` : 'Single price';
  const fill = k.fill === 'aon' ? 'All-or-none' : k.fill === 'min' ? `Minimum fill ${num(k.minFill)} shares` : 'Partial fills accepted';
  return `<div><div class="label" style="margin-bottom:8px">Custom terms · ${esc(o.groupId || '')}</div><div class="term-list">${term('Pricing', pricing)}${term('Fill rule', fill)}${term('Share class', esc(k.shareClass || 'Any'))}${term('Transfer types', (k.transfers || []).map(esc).join(', ') || 'Any')}${term('Expiry', k.gtc ? 'Good till cancelled' : `${fmtDateShort(o.expires)}${k.autoReconfirm ? ' · auto-reconfirms every 30 days' : ''}${o.reconfirmed ? ` · reconfirmed ×${o.reconfirmed}` : ''}`)}${term('Guardrail', k.guard ? `Cancel if RX price moves ${(k.guard * 100).toFixed(0)}% against` : 'None')}${term('Visibility', k.visibility === 'anonymous' ? 'Anonymous on the book' : 'Public on the book')}${sibs.length ? term('Other tiers', sibs.map(s => `<a class="link" href="#/order/${esc(s.id)}">${esc(s.id)}</a> ${num(s.qty)} @ ${money(s.price)}${s.status !== 'live' ? ` (${esc(s.status)})` : ''}`).join('<br>')) : ''}</div>${k.note ? `<div class="callout" style="margin-top:10px"><b>Note to your primary representative:</b> ${esc(k.note)}</div>` : ''}${o.cancelReason === 'guardrail' ? '<div class="callout coral" style="margin-top:10px">This order was cancelled automatically by its guardrail.</div>' : ''}</div>`;
}

// ---------------- page header (designed title block used by every list / tool page) ----------------
const PH = {
  funds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M21 8a9 9 0 0 0-6-4.5V8z"/></svg>',
  spvs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5L12 21l9-4.5"/></svg>',
  alts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="M3 21l3.5-7 3.5 7z"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  reps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/></svg>',
  desk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>',
  console: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  custom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="#fff"/><circle cx="15" cy="12" r="2" fill="#fff"/><circle cx="7" cy="18" r="2" fill="#fff"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>',
  client: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  verify: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
  forms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/></svg>',
  requests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v10H8l-4 4z"/><path d="M8 10h8M8 13h5"/></svg>',
  companies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-5h6v5"/><path d="M9 11h.01M15 11h.01M12 11h.01"/></svg>',
  settle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l4-5h4l3 3 3-3h4l-3 5"/><path d="M7 11l5 5 5-5"/><path d="M12 16v4"/></svg>',
  clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/></svg>',
  audit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M4 12h10M4 19h16"/><circle cx="18" cy="12" r="2.5"/></svg>',
};
// pageHead({ icon, title, sub, tag, crumb, actions, stats: [[label, value, sub], ...] })
function pageHead(o) {
  return `<div class="card page-head"><div class="ph-main"><span class="ph-ico ${o.iconClass || ''}">${o.icon || ''}</span><div class="ph-text">${o.crumb ? `<div class="ph-crumb">${o.crumb}</div>` : ''}<h1>${o.title}${o.tag ? ` <span class="badge ${o.tagClass || 'gold'}">${o.tag}</span>` : ''}</h1>${o.sub ? `<div class="ph-sub">${o.sub}</div>` : ''}</div>${o.actions ? `<div class="ph-actions">${o.actions}</div>` : ''}</div>${o.stats && o.stats.length ? `<div class="ph-stats" style="grid-template-columns:repeat(${o.stats.length},minmax(0,1fr))">${o.stats.map(st => `<div class="ph-stat"><span class="label dim">${st[0]}</span><div class="v">${st[1]}</div>${st[2] ? `<div class="s">${st[2]}</div>` : ''}</div>`).join('')}</div>` : ''}</div>`;
}
// ---------------- header ----------------
const LOCK = '<svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
// Switching to a staff role always goes through the passcode gate (#/staff/<role>); switching back locks the session.

// Verification badge for the member (verified / pending / unverified).
function verBadge() {
  const pr = D.profile();
  if (pr.verification === 'verified') return `<span class="badge verified">✓ Verified investor</span>`;
  if (pr.verification === 'pending') return `<span class="badge pending">Verification pending</span>`;
  return `<span class="badge status">Unverified</span>`;
}
// Accreditation basis options on the verification form.
const BASIS = {
  accredited: [['income', 'Income test · Individual income over $200,000 (or $300,000 joint) in each of the two most recent years, with a reasonable expectation of the same this year'], ['networth', 'Net worth test · Net worth over $1 million, individually or jointly, excluding primary residence'], ['license', 'Licensed professional · Holds a Series 7, 65 or 82 license in good standing'], ['entity', 'Qualifying entity · Entity with total assets over $5 million not formed for the purpose of this investment']],
  qib: [['qib100', '$100M institution · Institution that owns and invests on a discretionary basis at least $100 million in securities of unaffiliated issuers'], ['qibbd', 'Broker-dealer · Registered broker-dealer owning and investing at least $10 million in securities of unaffiliated issuers'], ['qibbank', 'Bank · Bank or savings institution meeting the $100 million threshold with audited net worth of at least $25 million']],
  institution: [['bank', 'Regulated institution · Bank, insurance company, registered investment company, or business development company'], ['plan', 'Benefit plan or trust · Employee benefit plan or trust with total assets over $5 million'], ['owners', 'All-accredited entity · Entity in which all equity owners are accredited investors'], ['family', 'Family office · Family office with over $5 million in assets under management']],
};
// Investor verification card: status, form, re-certification.
function verificationCard() {
  const pr = D.profile();
  if (pr.verification === 'verified') return `<div class="card-head"><span class="label">Investor verification</span>${verBadge()}</div><div class="card-body stack" style="gap:12px">
    <table class="kv tight"><tr><th>Status</th><td class="strong" style="color:#8a6a1c">✓ Verified</td></tr><tr><th>Investor type</th><td>${esc(D.INVESTOR_TYPES[pr.investorType])}</td></tr><tr><th>Basis</th><td>${(pr.basis || []).map(b => { const x = (BASIS[pr.investorType] || []).find(y => y[0] === b); return x ? esc(x[1].split(' · ')[0]) : esc(b); }).join('; ') || '—'}</td></tr><tr><th>Verified on</th><td>${fmtDate(pr.verifiedAt)}</td></tr><tr><th>Reviewed by</th><td>${esc(D.rep('rep-6').name)}, Chief Compliance Officer</td></tr></table>
    <div class="small muted">Rainmaker X brokers private securities only to accredited investors, qualified institutional buyers and institutional accounts. Re-verification is required annually or when your circumstances change.</div>
    <div><button class="btn outline sm" id="ver-reset">Update investor status</button>${pr.photo ? '<button class="btn ghost sm" id="photo-rm" type="button">Remove photo</button>' : ''}</div></div>`;
  if (pr.verification === 'pending') return `<div class="card-head"><span class="label">Investor verification</span>${verBadge()}</div><div class="card-body stack">
    <div class="callout">Your ${pr.recert ? 're-certification' : 'submission'} as <b>${esc(D.INVESTOR_TYPES[pr.investorType])}</b> is under review by compliance. ${pr.recert ? 'Your access continues while it is reviewed.' : 'Until approval, orders you submit are worked as requests and placed automatically once you are approved.'} Typical turnaround is one business day.</div>
    <div class="row"><button class="btn sm" id="ver-approve">Simulate compliance approval</button><button class="btn ghost sm" id="ver-reset">Edit submission</button></div></div>`;
  return `<div class="card-head"><span class="label">Investor verification</span>${verBadge()}</div><form class="card-body stack" id="ver-form">
    ${pr.rejectionNote ? `<div class="callout coral"><b>Sent back by compliance:</b> ${esc(pr.rejectionNote)}</div>` : ''}<div class="callout coral">Verification unlocks live trading. Rainmaker X can only place orders on the book for accredited investors, qualified institutional buyers (QIBs) and institutional accounts. Until you are verified, your bids, asks and other requests are worked by your primary representative and placed automatically once compliance approves you.</div>
    <div class="field"><label>I am investing as</label><select name="type"><option value="accredited">Accredited investor</option><option value="qib">Qualified institutional buyer (QIB)</option><option value="institution">Institutional account</option></select></div>
    <div class="field"><label>Firm or entity (optional)</label><input name="firm" placeholder="e.g. Martin Family Office LLC" value="${esc(pr.firm || '')}"></div>
    <div class="field"><label>Basis for qualification</label><div class="stack" id="basis-list" style="gap:8px"></div></div>
    <div class="field"><label>Supporting documents</label><div class="row"><button type="button" class="btn outline sm" id="ver-upload">Attach documents</button><span class="small muted">Brokerage statements, CPA letter, or entity formation documents. Reviewed by compliance only.</span></div></div>
    <label class="check"><input type="checkbox" name="attest" required><span>I certify that the information above is accurate and understand that Rainmaker X relies on it to determine my eligibility to transact in private securities.</span></label>
    <div class="form-foot"><button class="btn" type="submit">Submit for verification</button></div></form>`;
}
// Hook up the verification form.
function wireVerification(root) {
  const pin = root.querySelector('#photo-in'); if (pin) pin.addEventListener('change', () => { const f = pin.files[0]; if (!f) return; const img = new Image(); const url = URL.createObjectURL(f); img.onload = () => { const S = 160; const cv = document.createElement('canvas'); cv.width = S; cv.height = S; const cx = cv.getContext('2d'); const m = Math.min(img.width, img.height); cx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S); D.setPhoto(cv.toDataURL('image/jpeg', .85)); URL.revokeObjectURL(url); toast('Profile photo updated'); render(); }; img.src = url; });
  const prm = root.querySelector('#photo-rm'); if (prm) prm.onclick = () => { D.setPhoto(null); toast('Photo removed'); render(); };
  const f = root.querySelector('#ver-form');
  if (f) {
    const list = f.querySelector('#basis-list'); const drawBasis = () => { list.innerHTML = BASIS[f.type.value].map(([k, l]) => `<label class="check" style="font-weight:500"><input type="checkbox" name="basis" value="${k}"><span>${esc(l)}</span></label>`).join(''); };
    f.type.addEventListener('change', drawBasis); drawBasis();
    f.querySelector('#ver-upload').onclick = () => toast('Document upload is a placeholder in this prototype', false);
    f.addEventListener('submit', e => { e.preventDefault(); const basis = [...f.querySelectorAll('[name=basis]:checked')].map(x => x.value); if (!basis.length) { toast('Select at least one basis for qualification', false); return; } D.submitVerification({ investorType: f.type.value, basis, firm: f.firm.value.trim() }); toast('Verification submitted for compliance review'); render(); });
  }
  const a = root.querySelector('#ver-approve'); if (a) a.onclick = () => { D.approveVerification(); toast('Verification approved. You can now place bids and asks.'); render(); };
  const r = root.querySelector('#ver-reset'); if (r) r.onclick = () => { D.resetVerification(); render(); };
}
// Card shown to unverified members where a feature needs verification.
function gateCard(what = 'this') {
  const pr = D.profile(); const rep_ = D.rep(pr.rep);
  return `<div class="callout coral"><b>${pr.verification === 'pending' ? 'Verification in review.' : 'Investor verification not completed yet.'}</b> Live trading on the book is for verified accredited investors, QIBs and institutions, but you can submit ${what} as a <b>request</b> right now. ${esc(rep_.name)} works it off the book, and it is placed automatically the moment compliance approves you. <a class="link" href="#/profile/verification">${pr.verification === 'pending' ? 'Check status' : 'Complete verification'}</a></div>`;
}


// ---------------- home (overview) ----------------

// Type and status badges for a fund / SPV.
function fundBadges(f) { return `<span class="badge ${f.type === 'index' ? 'mine' : f.type === 'spv' ? 'custom' : 'gold'}">${f.type === 'index' ? 'Index' : f.type === 'spv' ? 'SPV' : 'Fund'}</span>${f.type === 'index' ? '' : ` <span class="badge ${f.status === 'Open' ? 'open' : f.status === 'Waitlist' ? 'pending' : 'status'}">${esc(f.status)}</span>`}`; }
// Filter state for the Funds, SPVs and Alternatives pages (kept across renders).
let fundsF = { status: 'all', q: '' }, spvF = { status: 'all', sector: 'all', q: '' }, altF = 'all';
// Generic filter bar: status chips + search box + optional extra control.
function filterBar(id, chips, cur, q, placeholder, extra) { return `<div class="card filter-bar" id="${id}"><div class="chips">${chips.map(([k, l]) => `<button class="chip ${cur === k ? 'on' : ''}" data-fk="${k}" type="button">${l}</button>`).join('')}</div>${extra || ''}<input class="mini" data-fq placeholder="${placeholder}" value="${esc(q || '')}"></div>`; }
// Hook a filter bar up to its state object and redraw callback.
function wireFilter(main, id, F, redraw) { const bar = main.querySelector('#' + id); if (!bar) return; bar.querySelectorAll('[data-fk]').forEach(b => b.onclick = () => { F.status = b.dataset.fk; redraw(); }); bar.querySelectorAll('[data-fs]').forEach(sl => sl.onchange = () => { F.sector = sl.value; redraw(); }); const q = bar.querySelector('[data-fq]'); q.addEventListener('input', () => { F.q = q.value; const pos = q.selectionStart; redraw(); const n = main.querySelector('#' + id + ' [data-fq]'); n.focus(); n.setSelectionRange(pos, pos); }); }

// Liquidity score 0..1 from how many live orders a company has (drives the liquidity dots).
const liqFrac = c => { const l = D.liveListings(c.id).length + D.liveBids(c.id).length; const m = Math.max(1, ...D.COMPANIES.map(x => D.liveListings(x.id).length + D.liveBids(x.id).length)); return { n: l, f: l / m }; };
// Search-style company row: logo, name, sector, price, change, liquidity dots.
function companyRow(c, extra = '') { const ch = D.change(c, '1D'); const lq = liqFrac(c); return `${logo(c, 'tile')}<span class="pal-body"><b>${esc(c.name)}</b><div class="tiny muted">${esc(c.ticker)} · ${esc(c.sector)}${c.liquid ? ' · RX50' : ''}</div></span><span class="pal-right"><span class="pal-px">${money(D.price(c.id))}</span><span class="tiny ${cls(ch)}">${pct(ch)}</span><span class="liq" style="--f:${lq.f.toFixed(2)}" title="${lq.n} live orders"></span>${extra}</span>`; }
// Company search field used by order forms and pickers.
function companyPicker(id, value, label = 'Company') {
  const c = D.company(value);
  return `<div class="field"><label>${label}</label><div class="cpick" id="${id}"><input type="hidden" name="company" value="${c ? c.id : ''}"><button type="button" class="cpick-btn">${c ? companyRow(c) : `<span class="pal-ico">${ICON.search}</span><span class="pal-body"><b>Select a company</b><div class="tiny muted">Search by name or ticker</div></span>`}<span class="cpick-chev">${ICON.chev}</span></button><div class="cpick-menu hidden"><div class="cpick-search">${ICON.search}<input placeholder="Search companies…" autocomplete="off"></div><div class="cpick-list"></div></div></div></div>`;
}
// Hook up a company picker: typeahead list and selection callback.
function wireCompanyPicker(root, id, onChange) {
  const box = root.querySelector('#' + id); if (!box) return; const btn = box.querySelector('.cpick-btn'), menu = box.querySelector('.cpick-menu'), inp = menu.querySelector('input'), list = menu.querySelector('.cpick-list'), hid = box.querySelector('input[type=hidden]');
  const draw = () => { const q = inp.value.trim().toLowerCase(); const cos = D.COMPANIES.filter(c => !q || c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q) || c.sector.toLowerCase().includes(q)).sort((x, y) => liqFrac(y).n - liqFrac(x).n).slice(0, 12); list.innerHTML = cos.length ? cos.map(c => `<button type="button" class="pal-item ${c.id === hid.value ? 'sel' : ''}" data-cid="${c.id}">${companyRow(c)}</button>`).join('') : '<div class="pal-empty">No matches.</div>'; };
  const close = () => { menu.classList.add('hidden'); };
  btn.onclick = e => { e.stopPropagation(); const open = menu.classList.contains('hidden'); document.querySelectorAll('.cpick-menu').forEach(m => m.classList.add('hidden')); if (open) { menu.classList.remove('hidden'); inp.value = ''; draw(); setTimeout(() => inp.focus(), 0); document.addEventListener('click', close, { once: true }); } };
  menu.addEventListener('click', e => e.stopPropagation());
  inp.addEventListener('input', draw);
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') close(); if (e.key === 'Enter') { e.preventDefault(); const f = list.querySelector('.pal-item'); if (f) f.click(); } });
  list.addEventListener('click', e => { const it = e.target.closest('[data-cid]'); if (!it) return; hid.value = it.dataset.cid; close(); const c = D.company(hid.value); btn.innerHTML = companyRow(c) + `<span class="cpick-chev">${ICON.chev}</span>`; onChange(hid.value); });
}
