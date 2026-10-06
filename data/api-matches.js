/* ==============================================================
   Rainmaker X · Data API · matches
   A match is the clearance event: a bid and an ask from two different parties cross in price and both
   fill rules are met. Both orders are lowered by the matched quantity at once. The match waits for
   Rainmaker's approval; on approval both parties are notified and the settlement process begins.
   Orders never carry settlement state: settlement hangs off the match (Ben, Sep 30 2026).
   ============================================================== */
'use strict';

Object.assign(Data, {
  MATCH_STATUS: { pending: 'Awaiting approval', approved: 'Approved', declined: 'Declined' },
  matches() { state.matches = state.matches || []; return state.matches.slice().sort((a, b) => b.ts - a.ts); },
  match(id) { return (state.matches || []).find(m => m.id === id); },
  pendingMatches() { return this.matches().filter(m => m.status === 'pending'); },
  // The member's own matches (either side), newest first.
  myMatches() { return this.matches().filter(m => m.buyerId === 'you' || m.sellerId === 'you'); },
  matchesFor(orderId) { return this.matches().filter(m => m.bidId === orderId || m.askId === orderId); },
  matchSettlement(m) { return m && m.settlementId ? this.settlement(m.settlementId) : null; },
  // Find the live object behind an order wherever it lives (own orders, bids on asks, staff-recorded), or null for generated orders.
  _orderObj(o) { return state.userOrders.find(x => x.id === o.id) || state.userBids.find(x => x.id === o.id) || (state.staffOrders || []).find(x => x.id === o.id) || null; },
  // Two orders from the same party never match each other.
  _sameParty(a, b) { return this.orderClient(a).id === this.orderClient(b).id; },
  // Lower an order by the matched quantity. Fully used orders leave the book (sold / completed); partly used ones stay live for the rest.
  _applyFill(o, q) {
    const real = this._orderObj(o) || (o.mine || o.clientId ? o : null); const cur = real || this.order(o.id) || o;
    const left = Math.max(0, cur.qty - q); const patch = { qty: left, soldQty: (cur.soldQty || 0) + q, origQty: cur.origQty || cur.qty };
    if (left === 0) patch.status = o.listingId ? 'matched' : o.side === 'listing' ? 'sold' : 'completed';
    if (real) Object.assign(real, patch); else this._setOverlay(o.id, patch);
  },
  // Put the quantity back when a match is declined (the order returns to the book if it had left it).
  _restoreFill(o, q) {
    const real = this._orderObj(o); const cur = real || this.order(o.id); if (!cur) return;
    const patch = { qty: cur.qty + q, soldQty: Math.max(0, (cur.soldQty || 0) - q) }; if (['sold', 'completed', 'matched'].includes(cur.status) && cur.expires > Date.now()) patch.status = 'live';
    if (real) Object.assign(real, patch); else this._setOverlay(o.id, patch);
  },
  // Try to cross a new order against the book. Returns { price, qty, against, matchId } or null. Both fill rules must hold; same party never matches.
  _crossOrder(order, fits) {
    const book = order.side === 'bid' ? this.liveListings(order.companyId) : this.liveBids(order.companyId);
    const opp = book.find(o => o.id !== order.id && ((order.side === 'bid' && order.price >= o.price) || (order.side === 'listing' && order.price <= o.price)) && (!fits || fits(o)) && this.fillOk(order, Math.min(order.qty, o.qty)) && this.fillOk(o, Math.min(order.qty, o.qty)) && !this._sameParty(order, o));
    if (!opp) return null;
    const q = Math.min(order.qty, opp.qty); const m = this._createMatch({ bid: order.side === 'bid' ? order : opp, ask: order.side === 'bid' ? opp : order, price: opp.price, qty: q });
    return { price: opp.price, qty: q, against: opp.id, matchId: m.id };
  },
  // Record the clearance event: lower both orders, create the pending match, tell the member if they are a party, tell Rainmaker (queue + activity log).
  _createMatch({ bid, ask, price, qty, kind }) {
    state.matches = state.matches || []; const c = this.company(bid.companyId || ask.companyId); const now = Date.now();
    const bc = this.orderClient(bid), ac = this.orderClient(ask); const id = 'MT-' + String(state.matches.length + 1).padStart(3, '0');
    this._applyFill(bid, qty); this._applyFill(ask, qty);
    const left = o => { const cur = this._orderObj(o) || this.order(o.id) || o; return cur.qty; };
    const m = { id, companyId: c.id, bidId: bid.id, askId: ask.id, buyerId: bc.id, buyerName: bc.name, sellerId: ac.id, sellerName: ac.name, rep: bc.you ? state.profile.rep : ac.you ? state.profile.rep : bc.rep, price: +price, qty: +qty, gross: +price * +qty, ts: now, status: 'pending', kind: kind || 'market', history: [{ ts: now, status: 'pending', by: 'system' }] };
    state.matches.push(m);
    audit('match.created', `${id} · ${(+qty).toLocaleString()} ${c.name} @ $${(+price).toFixed(2)} · ${bc.name} buys from ${ac.name} · awaiting approval`, 'system');
    if (bc.you || ac.you) { const mineO = bc.you ? bid : ask; const rest = left(mineO); notify(`Match ${id}: your ${bc.you ? 'bid' : 'ask'} ${mineO.id} crossed with ${bc.you ? 'an ask' : 'a bid'} from another member for ${(+qty).toLocaleString()} ${c.name} @ $${(+price).toFixed(2)}. ${rest > 0 ? `Your order stays live for the remaining ${rest.toLocaleString()} shares. ` : 'Your order is fully matched. '}Rainmaker is reviewing the match; you will be notified when it is approved and settlement begins.`); }
    save(); return m;
  },
  // Rainmaker approves the match (clearance): the transaction prints, a settlement opens, and both parties are told a match was made with them.
  approveMatch(id) {
    if (!this.can('matches')) return { error: 'Not permitted' }; const m = this.match(id); if (!m) return { error: 'Match not found.' }; if (m.status !== 'pending') return { error: 'That match is already ' + m.status + '.' };
    const by = 'staff:' + this.role(); const now = Date.now(); const c = this.company(m.companyId); const buyerYou = m.buyerId === 'you', sellerYou = m.sellerId === 'you'; const mine = buyerYou || sellerYou;
    m.status = 'approved'; m.approvedAt = now; m.approvedBy = by; m.history.push({ ts: now, status: 'approved', by });
    const txId = 'utx-' + now.toString(36) + Math.floor(Math.random() * 1e3);
    const tx = { id: txId, companyId: m.companyId, price: m.price, qty: m.qty, ts: now, status: 'matched', transferType: 'Direct', mine, side: buyerYou ? 'buy' : 'sell', counterparty: 'market', matchId: id };
    const st = { id: 'stl-' + txId, txId, matchId: id, companyId: m.companyId, side: tx.side, qty: m.qty, price: m.price, gross: m.gross, ts: now, stage: 0, counterparty: 'market', steps: { 0: now }, buyerId: m.buyerId, buyerName: m.buyerName, sellerId: m.sellerId, sellerName: m.sellerName };
    if (mine) { state.userTx.push(tx); state.settlements.push(st); } else { state.staffTx = state.staffTx || []; state.staffTx.push(tx); state.staffSettlements = state.staffSettlements || []; state.staffSettlements.push(st); }
    m.txId = txId; m.settlementId = st.id;
    [m.bidId, m.askId].forEach(oid => { const real = state.userOrders.find(x => x.id === oid) || state.userBids.find(x => x.id === oid) || (state.staffOrders || []).find(x => x.id === oid); if (real) { real.txId = real.txId || txId; if (real.status === 'matched') real.status = 'completed'; } });
    if (!state.pricePoints[m.companyId]) state.pricePoints[m.companyId] = []; state.pricePoints[m.companyId].push({ t: now, p: m.price });
    audit('match.approved', `${id} · ${m.qty.toLocaleString()} ${c.name} @ $${m.price.toFixed(2)} · settlement ${st.id} opened`, by);
    if (mine) { const text = `Match ${id} approved by Rainmaker: you are ${buyerYou ? 'buying' : 'selling'} ${m.qty.toLocaleString()} ${c.name} @ $${m.price.toFixed(2)} ${buyerYou ? 'from' : 'to'} another member (${money0(m.gross)} gross). Settlement has begun: Rainmaker will have both sides sign the stock transfer agreement, collect the broker fee, then move funds to escrow and transfer the shares.`; notify(text); this.sendMessage({ companyId: m.companyId, orderId: buyerYou ? m.bidId : m.askId, text: text + ' Open the match to follow each step and sign.', from: 'rep' }); }
    this.checkAlerts(); save(); return { settlement: st };
  },
  // Rainmaker declines the match: both orders get their quantity back and return to the book; the member is told.
  declineMatch(id, reason) {
    if (!this.can('matches')) return { error: 'Not permitted' }; const m = this.match(id); if (!m) return { error: 'Match not found.' }; if (m.status !== 'pending') return { error: 'That match is already ' + m.status + '.' };
    const by = 'staff:' + this.role(); const now = Date.now(); const c = this.company(m.companyId); const why = reason || 'declined by Rainmaker';
    m.status = 'declined'; m.declinedAt = now; m.declineReason = why; m.history.push({ ts: now, status: 'declined', by, note: why });
    const bid = this.order(m.bidId) || state.userBids.find(b => b.id === m.bidId); const ask = this.order(m.askId);
    if (bid) this._restoreFill(bid, m.qty); if (ask) this._restoreFill(ask, m.qty);
    audit('match.declined', `${id} · ${why}`, by);
    if (m.buyerId === 'you' || m.sellerId === 'you') notify(`Match ${id} on ${c.name} was not approved: ${why}. Your order is back on the book for the full quantity.`);
    save(); return {};
  },
  // Human status for a match: pending → Awaiting approval; approved → Settling / Completed (from its settlement); declined → Declined.
  matchLabel(m) { if (m.status === 'pending') return 'Awaiting approval'; if (m.status === 'declined') return 'Declined'; const st = this.matchSettlement(m); return st && this.settlementDone(st) ? 'Completed' : 'Settling'; },
  // Every match as a row for the Matches pages, plus legacy settlements that predate matches (seeded holdings, desk trades) so nothing is lost.
  matchRecords() {
    const rows = this.matches().map(m => ({ id: m.id, m, c: this.company(m.companyId), buyer: { id: m.buyerId, name: m.buyerName }, seller: { id: m.sellerId, name: m.sellerName }, rep: m.rep, qty: m.qty, price: m.price, gross: m.gross, ts: m.ts, status: m.status, label: this.matchLabel(m), settlement: this.matchSettlement(m), href: '#/match/' + m.id, mine: m.buyerId === 'you' || m.sellerId === 'you' }));
    const me = { id: 'you', name: state.profile.name };
    this.allSettlements().filter(x => !x.matchId).forEach(x => { const c = this.company(x.companyId); if (!c) return; const desk = x.counterparty === 'desk'; const other = { id: desk ? 'desk' : 'cp', name: desk ? 'Rainmaker desk' : 'Counterparty · brokered' };
      rows.push({ id: x.id.replace(/^stl-/, '').toUpperCase(), legacy: true, c, buyer: x.side === 'buy' ? me : other, seller: x.side === 'sell' ? me : other, rep: state.profile.rep, qty: x.qty, price: x.price, gross: x.gross, ts: x.ts, status: 'approved', label: this.settlementDone(x) ? 'Completed' : 'Settling', settlement: x, href: '#/match/' + x.id, mine: true, desk }); });
    return rows.sort((a, b) => b.ts - a.ts);
  },
  matchRecord(id) { return this.matchRecords().find(r => r.id === id || (r.settlement && (r.settlement.id === id || r.settlement.txId === id))); },
});
// Whole-dollar money for notifications (the app layer has its own formatters).
function money0(n) { return '$' + Math.round(+n || 0).toLocaleString(); }
