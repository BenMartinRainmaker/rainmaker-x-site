/* ==============================================================
   Rainmaker X · app · trade and company page pieces
   Fee / policy / tracker blocks, desk quote card, IOIs, data room, alerts,
   match preview, to-do panel, depth chart, negotiation thread, documents, tax lots, imports, audit card.
   ============================================================== */
'use strict';

// Gross / broker fee / net table for a trade at this company.
function feeBlock(companyId, gross, side) {
  const f = D.fees(companyId, gross, side); const c = D.company(companyId);
  return `<table class="kv tight fee-table"><tr><th>Gross value</th><td class="num">${money(gross)}</td></tr><tr><th>Rainmaker brokerage fee</th><td class="num">${money(f.brokerage)} <span class="tiny muted">(${(D.FEES.rate(side) * 100).toFixed(0)}% ${side === 'buy' ? 'buy side' : 'sell side'}, min ${money(D.FEES.brokerageMin, 0)})</span></td></tr>${side === 'buy' ? `<tr><th>Company transfer fee</th><td class="num">${f.transfer ? money(f.transfer, 0) : 'None'} <span class="tiny muted">(${esc(c.name)} policy)</span></td></tr>` : ''}<tr class="total"><th>${side === 'buy' ? 'All-in total you pay' : 'Net proceeds you receive'}</th><td class="num strong">${money(f.allIn)}</td></tr></table>`;
}
// The company's transfer policy (ROFR, window, approval) as a small callout.
function policyBlock(c) {
  const p = c.policy; const tone = p.policy === 'Open' || (p.policy === 'Window' && p.open) ? 'open' : p.policy === 'Window' ? 'status' : 'pending';
  return `<div class="label">Company transfer policy</div><div class="row" style="flex-wrap:wrap"><span class="badge ${tone}">${esc(p.label)}</span>${p.policy === 'Window' ? `<span class="small muted">${p.open ? 'Closes ' + fmtDate(p.windowClose) : 'Next window opens ' + fmtDate(p.windowOpen)}</span>` : ''}<span class="small muted">· Typical settlement ${p.settleDays} days</span></div><p style="margin:0">${esc(p.detail)} ${p.transferFee ? `The company charges a transfer fee of ${money(p.transferFee, 0)}, paid by the buyer.` : 'No company transfer fee.'}</p>`;
}
// Closing record for a matched order: match date, settlement date (or expected), broker fee for that side, documents, and the settlement status.
function closeRecordBlock(o) {
  const r = D.orderCloseRecord(o); if (!r) return ''; const isL = o.side === 'listing';
  return `<div class="close-rec"><div class="between" style="margin-bottom:8px"><span class="label">Settlement</span>${stlBadge(r.status)}</div><table class="kv tight"><tr><th>Matched</th><td>${fmtPlaced(r.matchedAt)}</td></tr><tr><th>${r.settledAt ? 'Settled' : 'Expected close'}</th><td>${fmtPlaced(r.settledAt || r.expectedAt)}${r.settledAt ? '' : ' · in progress'}</td></tr><tr><th>Gross</th><td>${money(r.gross, 0)}</td></tr><tr><th>Broker fee · ${isL ? 'sell side' : 'buy side'}</th><td>${money(r.fee, 0)} <span class="tiny muted">${feePct(r.feeRate)}${r.settlement && r.settlement.fees ? ' · adjusted for this deal' : ''}${r.settlement && r.settlement.parties && r.settlement.parties.fees ? ' · paid ' + fmtDateShort(r.settlement.parties.fees) : ''}</span></td></tr>${r.settlement ? `<tr><th>Signatures</th><td>Buyer ${r.settlement.parties && r.settlement.parties.buyer ? 'signed ' + fmtDateShort(r.settlement.parties.buyer) : 'pending'} · seller ${r.settlement.parties && r.settlement.parties.seller ? 'signed ' + fmtDateShort(r.settlement.parties.seller) : 'pending'}</td></tr>` : ''}<tr><th>Documents</th><td class="small">${r.status === 'Complete' ? 'Stock transfer agreement signed by buyer and seller · broker fee invoice · wire confirmation · closing statement on file' : 'Term sheet on file · stock transfer agreement out for signature by buyer and seller'}</td></tr></table></div>`;
}
// Settlement progress steps, optionally compact.
function trackerBlock(st, { compact = false } = {}) {
  const steps = D.SETTLE_STEPS[st.counterparty === 'desk' ? 'desk' : 'market']; const c = D.company(st.companyId); const done = st.stage >= steps.length - 1;
  return `<div class="tracker ${compact ? 'compact' : ''}">${steps.map((label, i) => `<div class="tstep ${i < st.stage ? 'done' : ''} ${i === st.stage ? (done ? 'done' : 'current') : ''}"><span class="tdot">${i < st.stage || done ? '✓' : i + 1}</span><div class="tl">${label}</div><div class="tiny muted">${st.steps[i] ? fmtDateShort(st.steps[i]) : i === st.stage + 1 ? 'Next' : ''}</div></div>`).join('')}</div>
    ${compact ? '' : docsBlock(st)}${compact ? '' : `<div class="between small" style="margin-top:12px"><span class="muted">${st.side === 'buy' ? 'Buying' : 'Selling'} ${num(st.qty)} ${esc(c.name)} @ ${money(st.price)} · ${st.counterparty === 'desk' ? 'Rainmaker desk' : 'Matched on exchange'} · ${done ? 'Closed' : 'Expected close ' + fmtDate(st.ts + (st.counterparty === 'desk' ? 3 : c.policy.settleDays) * D.DAY)}</span>${done ? '<span class="badge verified">Closed</span>' : `<button class="btn outline sm" data-advance="${st.id}">Simulate next step</button>`}</div>`}`;
}
// Buy from / sell to the Rainmaker desk at a firm quote (verified investors only).
function deskCard(c) {
  if (!D.canTrade()) return `<div class="card desk-card" id="desk"><div class="card-head"><span class="label">Buy from us · Sell to us</span><span class="badge gold">Rainmaker desk</span></div><div class="card-body stack">${gateCard('a desk quote')}<div class="row" style="gap:8px;flex-wrap:wrap"><input id="desk-req-qty" class="mini" type="number" step="100" value="1000" style="width:120px"><button class="btn sm dark" data-desk-request="${c.id}">Ask the desk for a firm quote</button></div></div></div>`;
  return `<div class="card desk-card" id="desk"><div class="card-head"><div><span class="label">Buy from us · Sell to us</span><div class="small muted" style="margin-top:2px">Firm two-way quote from the Rainmaker desk. Instant execution, no waiting for a counterparty.</div></div><span class="badge gold">Rainmaker desk</span></div>
    <div class="card-body stack" style="gap:14px">
      <div class="row" style="gap:14px"><div class="field" style="flex:1"><label>Number of shares</label><input id="desk-qty" type="number" min="100" step="100" value="1000"></div><div class="small muted" style="flex:1.4;padding-top:24px" id="desk-market"></div></div>
      <div class="desk-quotes"><div class="dq buy"><span class="label">Buy from us</span><div class="dq-p" id="dq-buy">—</div><div class="small" id="dq-buy-n"></div><button class="btn block sm" data-desk="buy">${ICON.cart} Buy from us</button></div><div class="dq sell"><span class="label">Sell to us</span><div class="dq-p" id="dq-sell">—</div><div class="small" id="dq-sell-n"></div><button class="btn block sm outline" data-desk="sell">${ICON.cash} Sell to us</button></div></div>
      <div class="between small muted"><span id="desk-spread"></span><span id="desk-timer"></span></div>
      <div class="tiny muted">Rainmaker earns the spread between the two prices. The spread tightens when the order book is deep and widens with the size of your order relative to recent volume. Desk trades settle in about 3 business days.</div>
    </div></div>`;
}
// Hook up the desk card: quote refresh, side toggle, submit.
function wireDesk(root, c) {
  const qtyEl = root.querySelector('#desk-qty'); if (!qtyEl) return; let q = null;
  const draw = () => { q = D.deskQuote(c.id, qtyEl.value); root.querySelector('#dq-buy').textContent = money(q.buy); root.querySelector('#dq-sell').textContent = money(q.sell);
    root.querySelector('#dq-buy-n').textContent = q.qty ? `${num(q.qty)} shares · ${money(q.buyNotional, 0)} all-in` : ''; root.querySelector('#dq-sell-n').textContent = q.qty ? `${num(q.qty)} shares · ${money(q.sellNotional, 0)} net` : '';
    root.querySelector('#desk-market').innerHTML = `Market mid <b>${money(q.mid)}</b> · highest bid ${money(q.hb)} · lowest ask ${money(q.la)}<br>Avg daily volume ${compact(q.adv)} · ${q.liq} live orders`;
    root.querySelector('#desk-spread').textContent = `Desk spread ${(q.half * 200).toFixed(1)}% (${(q.baseHalf * 200).toFixed(1)}% liquidity + ${(q.impact * 200).toFixed(1)}% size)`; };
  let left = 60; const tick = () => { const t = root.querySelector('#desk-timer'); if (!t || !document.body.contains(t)) return; left--; if (left <= 0) { left = 60; draw(); } t.textContent = `Quote refreshes in ${left}s`; setTimeout(tick, 1000); };
  qtyEl.addEventListener('input', () => { left = 60; draw(); }); draw(); tick();
  root.querySelectorAll('[data-desk]').forEach(b => b.onclick = () => { const side = b.dataset.desk; const qty = +qtyEl.value; if (!(qty > 0)) return; const px = side === 'buy' ? q.buy : q.sell;
    if (!confirm(`${side === 'buy' ? 'Buy' : 'Sell'} ${num(qty)} ${c.name} ${side === 'buy' ? 'from' : 'to'} the Rainmaker desk @ ${money(px)} (${money(px * qty, 0)})?`)) return;
    const r = D.deskTrade(c.id, side, qty); if (r.error) { toast(r.error, false); return; } toast(`${side === 'buy' ? 'Bought' : 'Sold'} ${num(r.qty)} shares @ ${money(r.price)} with the desk`); render(); });
}
// Indications of interest: soft buy / sell interest that a rep follows up.
function ioiCard(c) {
  const sm = D.ioiSummary(c.id); const mine = D.myIOIs().filter(i => i.companyId === c.id && i.status === 'active');
  return `<div class="card"><div class="card-head"><span class="label">Indications of interest</span><span class="small muted">Non-binding · visible to your primary representative</span></div><div class="card-body stack" style="gap:12px">
    <div class="ioi-summary"><div><div class="v">${sm.buys}</div><div class="small muted">buyers interested${sm.topBuy ? ` up to <b>${money(sm.topBuy)}</b>` : ''}</div><div class="tiny muted">${num(sm.buyQty)} shares of demand</div></div><div><div class="v">${sm.sells}</div><div class="small muted">sellers interested${sm.lowSell ? ` from <b>${money(sm.lowSell)}</b>` : ''}</div><div class="tiny muted">${num(sm.sellQty)} shares of supply</div></div></div>
    ${mine.length ? `<div class="small">${mine.map(i => `<div class="between"><span>Yours: ${i.side === 'buy' ? 'buy up to' : 'sell from'} <b>${money(i.price)}</b> · ${num(i.qty)} shares</span><button class="btn ghost sm" data-withdraw="${i.id}">Withdraw</button></div>`).join('')}</div>` : ''}
    ${D.canRequest() ? `<form id="ioi-form" class="row" style="gap:8px;flex-wrap:wrap"><select name="side" class="mini"><option value="buy">I'd buy up to</option><option value="sell">I'd sell from</option></select><input name="price" class="mini" type="number" step="0.01" placeholder="$ / share" value="${D.price(c.id).toFixed(2)}" required style="width:110px"><input name="qty" class="mini" type="number" step="100" placeholder="Shares" required style="width:110px"><button class="btn sm dark" type="submit">Indicate interest</button></form>` : `<div class="small muted">Verify your investor status to submit an indication.</div>`}
  </div></div>`;
}
// Data room access request and document list.
function dataRoomCard(c) {
  const dr = c.dataRoom; const has = D.dataRoomAccess(c.id);
  return `<div class="card"><div class="card-head"><span class="label">Data room</span><span class="row">${has ? '<span class="badge verified">Access granted</span>' : '<span class="badge gold">Premium</span>'}<span class="small muted">Updated ${fmtDate(dr.updated)}</span></span></div>
    ${has ? `<div class="card-body stack">
      <div><div class="label dim" style="margin-bottom:8px">409A valuation history</div><table class="table compact"><thead><tr><th>Date</th><th class="num">409A / share</th><th class="num">RX price at the time</th><th class="num">Premium to 409A</th></tr></thead><tbody>${dr.valuations409a.map(v => { const rx = D.priceAt(c, v.date); return `<tr><td>${fmtDate(v.date)}</td><td class="num">${money(v.price)}</td><td class="num">${money(rx)}</td><td class="num ${cls(rx / v.price - 1)}">${pct(rx / v.price - 1)}</td></tr>`; }).join('')}</tbody></table></div>
      <div><div class="label dim" style="margin-bottom:8px">Cap table summary · ${num(dr.capTable.totalShares)} fully diluted shares</div><div class="alloc lg"><span style="width:${dr.capTable.preferred}%;background:var(--teal)"></span><span style="width:${dr.capTable.common}%;background:var(--blue)"></span><span style="width:${dr.capTable.pool}%;background:var(--coral)"></span></div><div class="row small" style="gap:18px;margin-top:8px"><span><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--teal)"></span> Preferred ${dr.capTable.preferred}%</span><span><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--blue)"></span> Common ${dr.capTable.common}%</span><span><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--coral)"></span> Option pool ${dr.capTable.pool}%</span></div></div>
      <div><div class="label dim" style="margin-bottom:6px">Documents</div>${dr.docs.map(d => `<div class="between doc-row"><span class="row">${ICON.doc}${esc(d)}</span><button class="btn outline sm" data-doc="${esc(d)}">View</button></div>`).join('')}</div>
    </div>` : `<div class="card-body stack"><p style="margin:0;color:var(--ink-2)">Cap table summary, 409A valuation history, articles, investor updates and a trailing financial summary provided by the company or sourced by Rainmaker. Access requires a verified investor status and acceptance of the company NDA.</p><div class="row small muted" style="gap:14px">${dr.docs.slice(0, 4).map(d => `<span class="row" style="gap:4px">${ICON.doc}${esc(d)}</span>`).join('')}</div><div>${D.canTrade() ? `<button class="btn sm" data-dataroom="${c.id}">Accept NDA and request access</button>` : `<button class="btn sm outline" data-dr-request="${c.id}">Accept NDA and request access</button> <span class="tiny muted">Granted once your verification is approved.</span>`}</div></div>`}
  </div>`;
}
// Price / match alert form for one company.
function alertBox(c) {
  const mine = D.alerts(c.id);
  return `<div class="alert-box hidden" id="alert-box"><form id="alert-form" class="row" style="gap:8px;flex-wrap:wrap"><select name="type" class="mini" id="alert-type">${Object.entries(D.ALERT_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input name="price" class="mini" type="number" step="0.01" value="${D.price(c.id).toFixed(2)}" style="width:120px"><button class="btn sm dark" type="submit">Save alert</button></form>
    ${mine.length ? `<div class="stack" style="gap:6px;margin-top:10px">${mine.map(a => `<div class="between small"><span>${a.triggered ? '<span class="badge verified">Fired</span> ' : '<span class="badge status">Armed</span> '} ${esc(D.ALERT_TYPES[a.type])} ${D.ALERT_NO_PRICE.includes(a.type) ? (a.type === 'cost_cross' && a.basis ? '(' + money(a.basis) + ')' : '') : money(a.price)}</span><button class="btn ghost sm" data-alert-del="${a.id}">Remove</button></div>`).join('')}</div>` : '<div class="small muted" style="margin-top:8px">No alerts for this company yet.</div>'}</div>`;
}

// ---------------- messaging (routed to Rainmaker) ----------------

// Fund or SPV tile for the Funds and SPVs grids.
function fundCard(f) { const ch = D.change(f, '1Y'); return `<div class="card ccard fund-card" data-href="#/fund/${f.id}">
      <div class="ch"><span class="fund-mark ${f.type}">${f.type === 'index' ? '50' : 'RX'}</span><span class="name" style="font-size:19px">${esc(f.name)}</span></div>
      <div class="row">${fundBadges(f)}${f.type === 'spv' ? spvBadges(f) : ''}<span class="muted small">${esc(f.strategy)}</span></div>
      <div class="between"><div><span class="label dim">${f.type === 'index' ? 'Index level' : 'NAV per unit'}</span><div class="price-big" style="font-size:26px">${f.type === 'index' ? f.nav.toFixed(2) : money(f.nav)}</div><div class="chg ${cls(ch)}">${pct2(ch)}<span class="lbl">past year</span></div></div>${sparkline(D.series(f, '1Y'), 140, 44)}</div>
      <table class="kv tight"><tr><th>${f.type === 'index' ? 'Constituents' : 'Holdings'}</th><td>${f.basket.length} companies</td></tr>${f.type === 'index' ? '' : `<tr><th>${f.type === 'spv' ? 'Committed' : 'AUM'}</th><td>${compact(f.aum)}</td></tr><tr><th>Minimum</th><td>${money(f.min, 0)}</td></tr><tr><th>Fee</th><td>${(f.fee * 100).toFixed(2)}% per year${f.carry ? ` + ${(f.carry * 100).toFixed(0)}% carry` : ''}</td></tr>`}<tr><th>Inception</th><td>${fmtDate(f.inception)}</td></tr></table>
      ${f.type === 'spv' ? `<div><div class="between small"><span>${compact(f.aum)} of ${compact(f.capacity)} committed</span><b>${Math.round(f.filled * 100)}%</b></div><div class="alloc" style="margin-top:4px"><span style="width:${Math.round(f.filled * 100)}%;background:var(--teal)"></span></div><div class="tiny muted" style="margin-top:4px">${f.status === 'Closed' ? 'Closed ' : 'Closes '}${fmtDate(f.closeDate)} · entry ${money(f.entryPrice)} vs RX ${money(D.price(f.underlying))} (<span class="${cls((D.price(f.underlying) - f.entryPrice) / f.entryPrice)}">${pct((D.price(f.underlying) - f.entryPrice) / f.entryPrice)}</span>)</div></div>${spvActions(f)}` : `<div class="row" style="gap:4px">${f.basket.slice(0, 8).map(b => logo(b.c, 'sm')).join('')}</div>`}
    </div>`; }
// SPV card extras: "Buy from us" when Rainmaker holds units, "Sell-back" when it provides liquidity; both open the vehicle page.
function spvBadges(f) { const off = D.spvOffer(f); return off.held ? `<span class="badge mine" style="white-space:nowrap" title="Units you hold in this vehicle">${num(off.held)} units</span>` : ''; }
function spvActions(f) { const off = D.spvOffer(f); if (!off.canBuy && !off.canSell) return ''; return `<div class="row spv-actions" style="gap:6px">${off.canBuy ? `<a class="btn bid sm" href="#/fund/${f.id}">${ICON.cart} Buy from us</a>` : ''}${off.canSell ? `<a class="btn ask sm" href="#/fund/${f.id}">${ICON.cash} Sell back to us</a>` : ''}</div>`; }

// Live preview of what an order at this price / size would match against.
function matchPreview(c, side, price, qty) {
  if (!c || !(price > 0)) return '';
  const opp = side === 'bid' ? D.liveListings(c.id) : D.liveBids(c.id);
  const mine = { qty: +qty || 0, fill: arguments[4] || 'partial', minFill: +arguments[5] || 0 };
  const priced = opp.filter(o => side === 'bid' ? o.price <= price : o.price >= price);
  const m = priced.find(o => { const q = Math.min(mine.qty || o.qty, o.qty); return D.fillOk(o, q) && (!mine.qty || D.fillOk(mine, q)); });
  const blocked = !m && priced[0];
  if (blocked) return `<div class="callout"><b>Price would match</b> <span class="oid">${esc(blocked.id)}</span> at ${money(blocked.price)}, but a fill rule stops it: ${D.fillLabel(blocked).toLowerCase()} on that order${mine.fill !== 'partial' ? `, ${D.fillLabel(mine).toLowerCase()} on yours` : ''}. Your order rests on the book${blocked.qty > mine.qty ? `; ${num(blocked.qty)} shares would need to be taken in full` : ''}.</div>`;
  if (m) return `<div class="callout green"><b>Matches now</b> against <span class="oid">${esc(m.id)}</span>: ${num(Math.min(qty || m.qty, m.qty))} shares @ ${money(m.price)}${qty > m.qty ? `; the remaining ${num(qty - m.qty)} rest on the book` : ''}. Both orders are lowered at once; Rainmaker approves the match, then settlement begins.</div>`;
  const ref = side === 'bid' ? D.lowestAsk(c.id) : D.highestBid(c.id); const rx = D.price(c.id);
  const same = side === 'bid' ? D.liveBids(c.id) : D.liveListings(c.id); const ahead = side === 'bid' ? same.filter(o => o.price > price).length : same.filter(o => o.price < price).length;
  return `<div class="callout"><b>Rests on the book.</b> ${ref != null ? `${pct((price - ref) / ref)} vs the ${side === 'bid' ? 'lowest ask' : 'highest bid'} of ${money(ref)}` : `No ${side === 'bid' ? 'asks' : 'bids'} to match against yet`} · ${pct((price - rx) / rx)} vs RX price ${money(rx)} · ${ahead} ${side === 'bid' ? 'bid' : 'ask'}${ahead === 1 ? '' : 's'} ahead of you in price.</div>`;
}
// Standard risk disclosure shown under every order form.
function disclosureBlock() {
  return `<details class="disc"><summary>Disclosures · version ${esc(D.DISCLOSURE_VERSION)} · recorded with your order</summary><ol class="small">${D.DISCLOSURES.map(t => `<li>${esc(t)}</li>`).join('')}</ol></details>`;
}
// Dashboard to-do list: expiring orders, pending signatures, renewals, unread messages.
function todoPanel() {
  if (D.isVisitor()) return '';
  const pr = D.profile(); const items = [];
  if (pr.verification === 'unverified') items.push({ t: 'Complete investor verification', s: pr.rejectionNote ? 'Compliance sent it back: ' + pr.rejectionNote : 'Unlocks live trading; pending requests place automatically', href: '#/profile/verification', tone: 'coral' });
  if (pr.verification === 'pending') items.push({ t: 'Verification in review', s: 'Compliance typically replies within a business day', href: '#/profile/verification' });
  if (D.renewalDue()) items.push({ t: 'Annual re-certification due ' + fmtDateShort(D.verificationExpiry()), s: 'Re-certify to keep trading without interruption', href: '#/profile/verification', tone: 'coral' });
  D.myOrders().filter(o => o.status === 'live' && o.expires - Date.now() < 7 * DAYMS).forEach(o => items.push({ t: `${o.id} expires in ${daysLeft(o)}d`, s: `${o.side === 'listing' ? 'Ask' : 'Bid'} ${num(o.qty)} ${D.company(o.companyId).name} @ ${money(o.price)} · reconfirm to keep it live`, href: '#/order/' + o.id, action: `<button class="btn outline sm" data-reconfirm="${o.id}">Reconfirm</button>` }));
  const reqs = D.requests().filter(r => r.status === 'pending'); if (reqs.length) items.push({ t: `${reqs.length} request${reqs.length > 1 ? 's' : ''} with your primary representative`, s: reqs.map(r => r.id).join(', '), href: '#/orders/requests' });
  D.settlements().forEach(st => { const docs = D.settlementDocs(st).filter(d => d.status === 'Awaiting your signature'); if (docs.length) items.push({ t: `Sign the ${docs[0].name.toLowerCase()}`, s: `${D.company(st.companyId).name} settlement ${st.id.slice(-6).toUpperCase()}`, href: '#/orders/matches', action: `<button class="btn sm" data-sign="${st.id}" data-doc="${esc(docs[0].name)}">Sign</button>` }); });
  Object.entries(D.state.negotiations || {}).forEach(([oid, list]) => { const last = list[list.length - 1]; if (last && last.from === 'cp' && (last.type === 'counter' || last.type === 'accept')) { const o = D.order(oid); if (o) items.push({ t: `${last.type === 'accept' ? 'Counterparty accepted' : 'Counter-offer received'} on ${oid}`, s: `${num(last.qty)} @ ${money(last.price)} · respond on the order page`, href: '#/order/' + oid, tone: 'green' }); } });
  if (D.unreadMessages()) items.push({ t: `${D.unreadMessages()} unread message${D.unreadMessages() > 1 ? 's' : ''}`, s: 'From your primary representative, the desk or compliance', href: '#/messages' });
  if (D.buyingPower() < 0) items.push({ t: 'Buying power is negative', s: `Open bids reserve ${money(D.reservedCash(), 0)} against ${money(D.cashBalance(), 0)} cash. Deposit or cancel a bid.`, href: '#/account/deposit', tone: 'coral' });
  if (!D.state.watchlist.length) items.push({ t: 'Build your watchlist', s: 'Star companies to track their bids, asks and RX price here', href: '#/browse' });
  return `<div class="card todo"><div class="card-head"><span class="label">What needs your attention</span><span class="small muted">${items.length ? items.length + ' item' + (items.length > 1 ? 's' : '') : 'All clear'}</span></div>${items.length ? `<div class="todo-list">${items.map(i => `<a class="todo-item ${i.tone || ''}" href="${i.href}"><span class="todo-dot"></span><span class="todo-body"><b>${esc(i.t)}</b><div class="small muted">${esc(i.s)}</div></span>${i.action ? `<span class="todo-act">${i.action}</span>` : ''}</a>`).join('')}</div>` : '<div class="card-body small muted">Nothing is waiting on you. Expiring orders, requests, signatures and counter-offers show up here when they need a decision.</div>'}</div>`;
}
// Cumulative bid / ask depth for one company as an SVG area chart.
function depthChart(c, W = 640, H = 210) {
  const bids = D.liveBids(c.id).slice().sort((a, b) => b.price - a.price), asks = D.liveListings(c.id).slice().sort((a, b) => a.price - b.price);
  if (!bids.length && !asks.length) return '<div class="empty" style="padding:30px">No live orders to chart yet.</div>';
  let cum = 0; const bp = bids.map(o => ({ p: o.price, q: (cum += o.qty) })); cum = 0; const ap = asks.map(o => ({ p: o.price, q: (cum += o.qty) }));
  const prices = bids.map(o => o.price).concat(asks.map(o => o.price)); const rx = D.price(c.id); const pmin = Math.min(...prices, rx), pmax = Math.max(...prices, rx); const qmax = Math.max(bp.length ? bp[bp.length - 1].q : 0, ap.length ? ap[ap.length - 1].q : 0);
  const pad = { l: 10, r: 56, t: 12, b: 28 }; const X = p => pad.l + (p - pmin) / (pmax - pmin || 1) * (W - pad.l - pad.r); const Y = q => pad.t + (1 - q / (qmax || 1)) * (H - pad.t - pad.b);
  const bidPath = bp.length ? `M${X(bp[0].p).toFixed(1)} ${Y(0).toFixed(1)} ` + bp.map((pt, i) => `L${X(pt.p).toFixed(1)} ${Y(i ? bp[i - 1].q : 0).toFixed(1)} L${X(pt.p).toFixed(1)} ${Y(pt.q).toFixed(1)}`).join(' ') + ` L${X(pmin).toFixed(1)} ${Y(bp[bp.length - 1].q).toFixed(1)} L${X(pmin).toFixed(1)} ${Y(0).toFixed(1)} Z` : '';
  const askPath = ap.length ? `M${X(ap[0].p).toFixed(1)} ${Y(0).toFixed(1)} ` + ap.map((pt, i) => `L${X(pt.p).toFixed(1)} ${Y(i ? ap[i - 1].q : 0).toFixed(1)} L${X(pt.p).toFixed(1)} ${Y(pt.q).toFixed(1)}`).join(' ') + ` L${X(pmax).toFixed(1)} ${Y(ap[ap.length - 1].q).toFixed(1)} L${X(pmax).toFixed(1)} ${Y(0).toFixed(1)} Z` : '';
  const xt = [0, .25, .5, .75, 1].map(f => pmin + (pmax - pmin) * f); const yt = niceTicks(0, qmax, 4).filter(v => v <= qmax);
  const hb = D.highestBid(c.id), la = D.lowestAsk(c.id);
  return `<div class="chart-wrap depth"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${yt.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#eef0f2"/><text x="${W - pad.r + 6}" y="${(Y(v) + 4).toFixed(1)}" font-size="10" fill="#8b929c">${v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : v}</text>`).join('')}
    <path d="${bidPath}" fill="#dbe8fb" fill-opacity=".85" stroke="#10305f" stroke-width="1.5"/><path d="${askPath}" fill="#f7eec9" fill-opacity=".9" stroke="#b8912e" stroke-width="1.5"/>
    <line x1="${X(rx).toFixed(1)}" x2="${X(rx).toFixed(1)}" y1="${pad.t}" y2="${H - pad.b}" stroke="#10305f" stroke-dasharray="4 3"/><text x="${(X(rx) + 4).toFixed(1)}" y="${pad.t + 10}" font-size="10" font-weight="600" fill="#10305f">RX ${money(rx)}</text>
    ${xt.map(p => `<text x="${X(p).toFixed(1)}" y="${H - 8}" font-size="10" fill="#8b929c" text-anchor="middle">${money(p)}</text>`).join('')}
  </svg></div><div class="legend" style="margin-top:8px"><span class="li"><span class="sw" style="background:#dbe8fb;border:1px solid #10305f"></span>Cumulative bids (demand at or above a price)</span><span class="li"><span class="sw" style="background:#f7eec9;border:1px solid #b8912e"></span>Cumulative asks (supply at or below a price)</span><span class="li">Spread ${hb && la ? money(la - hb) + ' (' + ((la - hb) / la * 100).toFixed(1) + '%)' : '—'}</span></div>`;
}
// Three companies in the same sector, for the company page sidebar.
function similarCompanies(c) {
  const score = x => (x.sector === c.sector ? 2 : 0) + x.industries.filter(i => c.industries.includes(i)).length;
  const list = D.COMPANIES.filter(x => x.id !== c.id).map(x => ({ x, s: score(x) })).filter(o => o.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
  if (!list.length) return '';
  return `<div class="card"><div class="card-head"><span class="label">Similar companies</span><a class="link small" href="#/browse">Browse all</a></div><div class="sim-grid">${list.map(({ x }) => { const ch = D.change(x, '3M'); return `<a class="sim" href="#/company/${x.id}">${logo(x)}<span class="sim-body"><b>${esc(x.name)}</b><div class="tiny muted">${esc(x.sector)} · ${D.liveListings(x.id).length} asks · ${D.liveBids(x.id).length} bids</div></span><span class="sim-px">${money(D.price(x.id))}<div class="tiny ${cls(ch)}">${pct(ch)} 3M</div></span></a>`; }).join('')}</div></div>`;
}
// Brokered negotiation thread on an order: offers, counters, accept / decline.
function negotiationCard(o) {
  const list = D.negotiation(o.id); if (!list.length) return '';
  const isL = o.side === 'listing'; const last = list[list.length - 1]; const rep_ = D.rep(D.profile().rep);
  const agreed = list.some(e => e.type === 'agreed'); const closed = agreed || last.type === 'decline';
  const canRespond = !closed && last.from === 'cp' && (last.type === 'counter' || last.type === 'accept');
  const who = e => e.from === 'you' ? 'You' : (isL ? 'Seller' : 'Buyer') + ' via ' + rep_.name.split(' ')[0];
  const verb = e => ({ offer: 'offered', counter: 'countered', accept: 'accepted', agreed: 'agreed', decline: 'declined' })[e.type];
  return `<div class="card neg" id="neg"><div class="card-head"><h2 style="font-size:18px">Negotiation</h2><span class="badge ${agreed ? 'verified' : closed ? 'status' : 'pending'}">${agreed ? 'Terms agreed' : closed ? 'Closed' : last.from === 'you' ? 'Waiting for the ' + (isL ? 'seller' : 'buyer') : 'Your move'}</span></div>
    <div class="card-body stack"><p class="small muted" style="margin:0">Every offer goes through ${esc(rep_.name)}, who relays it to the ${isL ? 'seller' : 'buyer'}. Names are never shared. The ${isL ? 'ask' : 'bid'} on the book is ${money(o.price)}.</p>
      <div class="neg-timeline">${list.map(e => `<div class="neg-item ${e.from} ${e.type}"><div class="neg-meta"><b>${who(e)}</b> · ${verb(e)} · ${fmtPlaced(e.ts)}</div>${e.price ? `<div class="neg-terms">${num(e.qty)} sh @ ${money(e.price)} <span class="muted small">= ${money(e.price * e.qty, 0)}</span></div>` : ''}${e.text ? `<div class="small">${esc(e.text)}</div>` : ''}</div>`).join('')}${!closed && last.from === 'you' ? `<div class="neg-item wait"><div class="neg-meta muted">Waiting for the ${isL ? 'seller' : 'buyer'} to respond…</div></div>` : ''}</div>
      ${canRespond ? `<div class="neg-actions"><button class="btn bid sm" data-neg="accept" data-oid="${esc(o.id)}">${last.type === 'accept' ? 'Confirm terms' : 'Accept ' + money(last.price)}</button><form class="row" id="neg-counter" style="gap:6px"><input class="mini" name="price" type="number" step="0.01" placeholder="Counter $" style="width:110px" required><input class="mini" name="qty" type="number" step="100" value="${last.qty}" style="width:100px" required><button class="btn outline sm" type="submit">Counter</button></form><button class="btn ghost sm" data-neg="decline" data-oid="${esc(o.id)}">Decline</button></div>` : ''}
    </div></div>`;
}
// Hook up the negotiation buttons.
function wireNegotiation(root, o) {
  root.querySelectorAll('[data-neg]').forEach(b => b.onclick = () => { const act = b.dataset.neg; if (act === 'decline' && !confirm('Decline and close this negotiation?')) return; const r = D.respondNegotiation(o.id, act); if (r && r.error) { toast(r.error, false); return; } toast(act === 'accept' ? 'Terms agreed. Settlement opened.' : 'Negotiation closed'); render(); });
  const f = root.querySelector('#neg-counter'); if (f) f.addEventListener('submit', e => { e.preventDefault(); D.respondNegotiation(o.id, 'counter', +f.price.value, +f.qty.value); toast('Counter sent via your primary representative'); render(); });
}
// Settlement documents with sign / download actions.
function docsBlock(st) {
  const docs = D.settlementDocs(st);
  return `<div class="docs"><div class="label dim" style="margin:12px 0 6px">Documents</div>${docs.map(d => `<div class="doc-row between small"><span class="row">${ICON.doc}${esc(d.name)}${d.signedAt ? `<span class="tiny muted">· signed ${fmtDateShort(d.signedAt)}</span>` : ''}</span><span class="row">${d.status === 'Awaiting your signature' ? `<button class="btn sm" data-sign="${st.id}" data-doc="${esc(d.name)}">Sign</button>` : `<span class="badge ${d.status === 'Signed' || d.status === 'On file' ? 'verified' : d.status === 'In progress' ? 'pending' : 'status'}">${esc(d.status)}</span>`}${d.ready ? `<button class="btn ghost sm" data-doc="${esc(d.name)}">View</button>` : ''}</span></div>`).join('')}</div>`;
}
// Tax lots (FIFO) and realized gains card for the Account page.
function taxCard() {
  const t = D.taxLots(); const yr = new Date().getFullYear();
  const ytd = t.realized.filter(r => new Date(r.ts).getFullYear() === yr); const sum = (arr, k) => arr.reduce((s, r) => s + r[k], 0);
  const st = ytd.filter(r => r.term === 'Short'), lt = ytd.filter(r => r.term === 'Long');
  return `<div class="card"><div class="card-head"><span class="label">Tax lots &amp; realized gains</span><span class="small muted">${yr} year to date · FIFO</span></div>
    <div class="tiles" style="padding:16px 20px 0;margin:0;grid-template-columns:repeat(3,1fr)"><div class="tile" style="padding:0"><span class="label dim">Realized, short-term</span><div class="v ${cls(sum(st, 'gain'))}" style="font-size:20px">${money(sum(st, 'gain'), 0)}</div></div><div class="tile" style="padding:0"><span class="label dim">Realized, long-term</span><div class="v ${cls(sum(lt, 'gain'))}" style="font-size:20px">${money(sum(lt, 'gain'), 0)}</div></div><div class="tile" style="padding:0"><span class="label dim">Unrealized (open lots)</span><div class="v ${cls(sum(t.open, 'gain'))}" style="font-size:20px">${money(sum(t.open, 'gain'), 0)}</div></div></div>
    <div class="card-body" style="padding-top:12px"><div class="label dim" style="margin-bottom:6px">Open lots</div>${t.open.length ? `<table class="table compact"><thead><tr><th>Company</th><th>Acquired</th><th class="num">Shares</th><th class="num">Cost / sh</th><th class="num">Value</th><th class="num">Gain</th><th>Term</th></tr></thead><tbody>${t.open.map(l => `<tr class="clickable" data-href="#/company/${l.c.id}"><td><span class="row">${logo(l.c, 'sm')}${esc(l.c.name)}</span></td><td>${fmtDate(l.ts)}</td><td class="num">${num(l.qty)}</td><td class="num">${money(l.price)}</td><td class="num">${money(l.value, 0)}</td><td class="num ${cls(l.gain)}">${money(l.gain, 0)}</td><td><span class="badge ${l.term === 'Long' ? 'verified' : 'status'}">${l.term}</span>${l.term === 'Short' ? `<div class="tiny muted">long on ${fmtDateShort(l.longOn)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="small muted">No open lots.</div>'}
      <div class="label dim" style="margin:14px 0 6px">Realized</div>${t.realized.length ? `<table class="table compact"><thead><tr><th>Company</th><th>Sold</th><th class="num">Shares</th><th class="num">Proceeds</th><th class="num">Cost</th><th class="num">Gain</th><th>Term</th></tr></thead><tbody>${t.realized.map(r => { const c = D.company(r.companyId); return `<tr><td>${esc(c.name)}</td><td>${fmtDate(r.ts)}</td><td class="num">${num(r.qty)}</td><td class="num">${money(r.proceeds, 0)}</td><td class="num">${money(r.cost, 0)}</td><td class="num ${cls(r.gain)}">${money(r.gain, 0)}</td><td>${r.term}</td></tr>`; }).join('')}</tbody></table>` : '<div class="small muted">No sales yet. Realized gains appear here when a sale settles, matched FIFO against your lots.</div>'}
      <div class="tiny muted" style="margin-top:10px">Prototype figures for illustration. Rainmaker issues Form 1099-B style reporting after year end; consult your tax adviser.</div></div></div>`;
}
// Recent audit entries (staff only).
function auditCard(limit = 12) {
  const log = D.auditLog().slice(0, limit);
  return `<div class="card"><div class="card-head"><span class="label">Activity log</span><a class="link small" href="#/admin/audit">Full log with filters</a></div>${log.length ? `<table class="table compact audit"><tbody>${log.map(a => `<tr><td class="tiny muted" style="white-space:nowrap">${fmtPlaced(a.ts)}</td><td><span class="badge status">${esc(a.type)}</span></td><td class="small">${esc(a.detail)}</td><td class="tiny muted" style="white-space:nowrap">${esc(a.actor)} · ${esc(a.ip)}</td></tr>`).join('')}</tbody></table>` : '<div class="card-body small muted">No activity recorded yet.</div>'}</div>`;
}

// ---- SPV subscriptions (Ben, Oct 5 2026: "Buy from us" starts a process). Tracker over D.SPV_STEPS, the member's card on the
// fund page / Account with the next action, and the staff rows on the Matches tab (Issue units / Decline).
function spvTracker(x, { compact = false } = {}) {
  const steps = D.SPV_STEPS; const ended = x.status !== 'open' && x.status !== 'closed'; const done = x.status === 'closed';
  return `<div class="tracker ${compact ? 'compact' : ''} ${ended ? 'ended' : ''}">${steps.map((label, i) => `<div class="tstep ${i < x.stage || done ? 'done' : ''} ${i === x.stage && !done ? 'current' : ''}"><span class="tdot">${i < x.stage || done ? '✓' : i + 1}</span><div class="tl">${label}</div><div class="tiny muted">${x.steps[i] ? fmtDateShort(x.steps[i]) : i === x.stage + 1 && !ended ? 'Next' : ''}</div></div>`).join('')}</div>`;
}
// Badge for a subscription's state.
const spvSubBadge = x => `<span class="badge ${x.status === 'closed' ? 'verified' : x.status === 'open' ? (x.stage === 2 ? 'pending' : 'open') : 'status'}">${esc(D.spvSubLabel(x))}</span>`;
// One subscription with its tracker and the member's next step (sign → fund → wait for Rainmaker), plus Cancel with an inline reason.
function spvSubBlock(x, { compact = false, link = false } = {}) {
  const f = D.fund(x.fundId); if (!f) return ''; const staff = D.isStaff();
  const next = x.status !== 'open' ? '' : x.stage === 0 ? `<button class="btn primary sm" type="button" data-sub-sign="${esc(x.id)}">${ICON.doc} Sign subscription agreement</button>` : x.stage === 1 ? `<button class="btn primary sm" type="button" data-sub-fund="${esc(x.id)}">Move ${money(x.notional, 0)} to escrow</button>` : staff && D.can('matches') ? `<button class="btn bid sm" type="button" data-sub-issue="${esc(x.id)}">Issue units</button>` : `<span class="small muted">Escrow funded · Rainmaker issues the units next</span>`;
  const cancel = x.status === 'open' ? `<button class="btn ghost sm" type="button" data-sub-cancel="${esc(x.id)}">${staff ? 'Decline' : 'Cancel'}</button>` : '';
  return `<div class="spv-sub" data-sub="${esc(x.id)}"><div class="between small" style="margin-bottom:6px;flex-wrap:wrap;gap:6px"><span>${link ? `<a class="link" href="#/fund/${esc(f.id)}"><b>${esc(f.name)}</b></a>` : `<b>${esc(f.name)}</b>`} · <span class="oid">${esc(x.id)}</span> · ${num(x.units)} units @ ${money(x.price)} · <b>${money(x.notional, 0)}</b></span>${spvSubBadge(x)}</div>${spvTracker(x, { compact })}${x.status === 'open' || x.reason ? `<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">${next}${cancel}${x.reason ? `<span class="small muted">${esc(x.reason)}</span>` : ''}</div><div class="sub-cancel" hidden><form class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px" data-sub-cancel-form="${esc(x.id)}"><input class="mini" name="reason" placeholder="Reason (optional)" style="flex:1;min-width:180px"><button class="btn danger sm" type="submit">${staff ? 'Decline subscription' : 'Cancel subscription'}</button><button class="btn ghost sm" type="button" data-sub-cancel-no="1">Keep it</button></form></div>` : ''}</div>`;
}
// The member's subscriptions in one vehicle (fund page), newest first.
function spvSubsCard(f) {
  const subs = D.spvSubs().filter(x => x.fundId === f.id); if (!subs.length) return '';
  return `<div class="card" id="spv-subs"><div class="card-head"><h2 style="font-size:20px">Your subscriptions</h2><span class="small muted">${subs.filter(x => x.status === 'open').length} open</span></div><div class="card-body stack" style="gap:18px">${subs.map(x => spvSubBlock(x)).join('')}<div class="tiny muted">A subscription reserves the cash, then you sign the subscription agreement, move the funds to escrow, and Rainmaker issues the units to your account. You can cancel until the units are issued; funded escrow is returned.</div></div></div>`;
}
