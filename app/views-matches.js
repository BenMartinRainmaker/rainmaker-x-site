/* ==============================================================
   Rainmaker X · app · matches
   The match page (both parties, approval, settlement panel or tracker, documents) and the shared
   match tables used by My Orders, My Profile, the Rep Desk and the back-office Matches queue.
   ============================================================== */
'use strict';

// Status badge for a match record label (Awaiting approval / Settling / Completed / Declined).
const matchBadge = label => `<span class="badge ${label === 'Awaiting approval' ? 'pending' : label === 'Completed' ? 'verified' : label === 'Declined' ? 'status' : 'open'}">${esc(label)}</span>`;
// One match as a table row. Staff see both parties; members see "you" and "another member".
function matchRow(r, { staff = false } = {}) {
  const party = p => p.id === 'you' ? `<b>${esc(p.name)}</b> <span class="badge mine">You</span>` : staff && p.id !== 'cp' && p.id !== 'desk' ? `<a class="link" href="#/client/${esc(p.id)}">${esc(p.name)}</a>` : r.desk ? 'Rainmaker desk' : (p.id === 'cp' || !staff) ? 'Another member' : esc(p.name);
  return `<tr class="clickable ${r.status === 'declined' ? 'done' : ''}" data-href="${r.href}"><td><span class="oid">${esc(r.id)}</span>${r.m && r.m.kind === 'negotiation' ? '<div class="tiny muted">negotiated</div>' : ''}</td><td><span class="row" style="gap:8px">${logo(r.c, 'sm')}<b>${esc(r.c.name)}</b></span></td><td class="small">${party(r.buyer)}</td><td class="small">${party(r.seller)}</td><td class="num">${num(r.qty)}</td><td class="num px">${money(r.price)}</td><td class="num px">${money(r.gross, 0)}</td><td class="small" style="white-space:nowrap">${fmtPlaced(r.ts)}</td><td>${matchBadge(r.label)}${r.settlement && r.status === 'approved' && r.label !== 'Completed' ? `<div class="tiny muted">${esc(D.settleSteps(r.settlement)[r.settlement.stage])}</div>` : r.m && r.m.declineReason ? `<div class="tiny muted">${esc(r.m.declineReason)}</div>` : ''}</td>${staff ? `<td class="num">${r.status === 'pending' ? `<span class="row" style="justify-content:flex-end;gap:6px"><button class="btn bid sm" type="button" data-match-approve="${esc(r.id)}">Approve</button><button class="btn danger sm" type="button" data-match-decline="${esc(r.id)}">Decline</button></span>` : ''}</td>` : ''}</tr>`;
}
// Table of match records, or an empty message.
function matchesTable(rows, { staff = false, empty = 'No matches yet.' } = {}) {
  if (!rows.length) return `<div class="empty">${empty}</div>`;
  return `<table class="table compact ob"><thead><tr><th>Match</th><th>Company</th><th>Buyer</th><th>Seller</th><th class="num">Shares</th><th class="num">Price / sh</th><th class="num">Gross</th><th>Matched</th><th>Status</th>${staff ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(r => matchRow(r, { staff })).join('')}</tbody></table>`;
}
// Match page: the clearance event, both parties, Rainmaker's decision, then the settlement (panel for staff, tracker for members).
function viewMatch(main, id) {
  const r = D.matchRecord(id); if (!r) { main.innerHTML = '<div class="page"><div class="card empty">Match not found.</div></div>'; return; }
  if (!D.isStaff() && !r.mine) { D.accessDenied('#/match/' + id); viewNotFound(main); return; }
  const c = r.c; const m = r.m; const st = r.settlement; const staff = D.isStaff(); const youBuy = r.buyer.id === 'you', youSell = r.seller.id === 'you';
  const who = p => p.id === 'you' ? `${esc(p.name)} (you)` : staff && p.id !== 'cp' && p.id !== 'desk' ? `<a class="link" href="#/client/${esc(p.id)}">${esc(p.name)}</a>` : r.desk ? 'Rainmaker desk (principal)' : staff ? esc(p.name) : 'Another member · brokered by Rainmaker';
  const f = st ? D.settlementFees(st) : null;
  const decision = m ? (m.status === 'pending' ? `<div class="callout"><b>Awaiting Rainmaker's approval.</b> A bid and an ask crossed in price and both fill rules were met, so both orders were lowered by ${num(r.qty)} shares. Rainmaker reviews every match (the clearance event) before the parties are introduced and settlement begins.${staff && D.can('matches') ? ` <span class="row" style="gap:6px;margin-top:8px"><button class="btn bid sm" type="button" data-match-approve="${esc(m.id)}">Approve match</button><button class="btn danger sm" type="button" data-match-decline="${esc(m.id)}">Decline</button></span>` : ''}</div>` : m.status === 'declined' ? `<div class="callout coral"><b>Declined ${fmtPlaced(m.declinedAt)}</b>${m.declineReason ? ': ' + esc(m.declineReason) : ''}. Both orders got their quantity back.</div>` : `<div class="callout green"><b>Approved by Rainmaker ${fmtPlaced(m.approvedAt)}</b>${staff && m.approvedBy ? ` · ${esc(m.approvedBy.replace('staff:', ''))}` : ''}. Both parties were notified and settlement began.</div>`) : '<div class="callout green"><b>Matched and approved.</b> This trade predates the match queue; its settlement record is below.</div>';
  main.innerHTML = `<div class="page narrow"><div class="card">
      <div class="order-hero"><div class="oh-head"><h1><span class="badge custom">Match</span><span class="oid" style="font-size:20px">${esc(r.id)}</span></h1><a class="company-chip" href="#/company/${c.id}">${logo(c, 'sm')}${esc(c.name)}</a></div>
        <div class="qp-box"><div class="cell"><span class="label">Shares</span><div class="v">${num(r.qty)}</div></div><div class="at">@ ${money(r.price)}</div><div class="cell"><span class="label">Gross</span><div class="v">${money(r.gross, 0)}</div></div></div>
        <div class="note">${m && m.kind === 'negotiation' ? 'Terms agreed through a brokered negotiation' : r.desk ? 'Trade with the Rainmaker desk' : 'Bid and ask crossed on the exchange'} · ${fmtPlaced(r.ts)}</div></div>
      <div class="card-body stack">
        <div class="expires"><span class="label">Status</span><span>${matchBadge(r.label)}</span>${youBuy || youSell ? `<span class="badge mine" style="margin-left:auto">You ${youBuy ? 'buy' : 'sell'}</span>` : ''}</div>
        <div class="type-cards"><div class="type-card"><span class="label">Buyer</span><span>${who(r.buyer)}</span>${m ? `<span class="tiny muted"><a class="link" href="#/order/${esc(m.bidId)}">${esc(m.bidId)}</a></span>` : ''}</div><div class="type-card"><span class="label">Seller</span><span>${who(r.seller)}</span>${m ? `<span class="tiny muted"><a class="link" href="#/order/${esc(m.askId)}">${esc(m.askId)}</a></span>` : ''}</div><div class="type-card"><span class="label">Broker fees</span><span>${f ? `${money(f.buy, 0)} buy · ${money(f.sell, 0)} sell` : `${feePct(D.FEES.buy)} buy · ${feePct(D.FEES.sell)} sell`}</span><span class="tiny muted">${f && f.paidAt ? 'paid ' + fmtDateShort(f.paidAt) : 'collected after both sign'}</span></div></div>
        ${decision}
        ${st ? (staff ? settlementPanel(st) : `<div><div class="label" style="margin-bottom:8px">Settlement</div>${trackerBlock(st)}</div>`) : m && m.status === 'pending' ? '<div class="small muted">The settlement tracker appears here once Rainmaker approves the match.</div>' : ''}
        ${m && m.history ? `<div><div class="label" style="margin-bottom:8px">History</div><table class="table compact"><tbody>${m.history.map(h => `<tr><td class="tiny muted" style="white-space:nowrap">${fmtPlaced(h.ts)}</td><td><span class="badge status">${esc(h.status)}</span></td><td class="small">${esc(h.note || '')}</td><td class="tiny muted">${esc(String(h.by || '').replace('staff:', ''))}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div></div></div>`;
  document.title = `Rainmaker X · Match ${r.id}`;
  wireFeeForms(main);
}
