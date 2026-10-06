/* ==============================================================
   Rainmaker X · Data API · trading
   Placing / cancelling bids and asks, custom orders, bidding on asks, selling into bids,
   fees, the desk (buy from / sell to Rainmaker), IOIs, alerts and the brokered negotiation thread.
   ============================================================== */
'use strict';

Object.assign(Data, {
  // ----- actions -----
  _recordTx(companyId, price, qty, side, counterparty) {
    const id = 'utx-' + Date.now().toString(36) + Math.floor(Math.random() * 1e3);
    state.userTx.push({ id, companyId, price, qty, ts: Date.now(), status: counterparty === 'desk' ? 'closed' : 'matched', transferType: 'Direct', mine: true, side: side || 'buy', counterparty: counterparty || 'market' });
    state.settlements.push({ id: 'stl-' + id, txId: id, companyId, side: side || 'buy', qty, price, gross: price * qty, ts: Date.now(), stage: 0, counterparty: counterparty || 'market', steps: { 0: Date.now() } });
    this.checkAlerts();
    if (!state.pricePoints[companyId]) state.pricePoints[companyId] = [];
    state.pricePoints[companyId].push({ t: Date.now(), p: price });
  },
  _setOverlay(id, patch) { state.overlays = state.overlays || {}; state.overlays[id] = Object.assign(state.overlays[id] || {}, patch); },
  // Place a standard bid or ask. Checks buying power, then matches against the book.
  // ----- fill rules: every order says whether partial fills are acceptable, only the entire quantity, or chunks of at least N shares -----
  FILL_RULES: RX_CONFIG.fillRules,
  // Fill rule of an order: custom orders carry it in custom.fill, everything else in o.fill (default: partial fills accepted).
  fillRule(o) { const k = o.custom && o.custom.fill ? o.custom : o; return { fill: this.FILL_RULES[k.fill] ? k.fill : 'partial', min: +k.minFill || 0 }; },
  // Would a fill of q shares satisfy this order's rule? All-or-none needs the whole order; minimum fill needs at least N (or the whole order if smaller).
  fillOk(o, q) { const r = this.fillRule(o); if (r.fill === 'aon') return q >= o.qty; if (r.fill === 'min') return q >= Math.min(r.min || 1, o.qty); return true; },
  fillLabel(o) { const r = this.fillRule(o); return r.fill === 'aon' ? 'All-or-none' : r.fill === 'min' ? `Minimum fill ${r.min.toLocaleString()} shares` : 'Partial fills accepted'; },
  placeOrder({ companyId, side, price, qty, transferType, shareType, days, custom, groupId, silent, fill, minFill }) {
    const c = this.company(companyId);
    const id = c.ticker + '-U' + (state.userOrders.length + 1);
    const order = { id, companyId, side, price: +price, qty: +qty, created: Date.now(), expires: Date.now() + (+days || 30) * DAY, status: 'live', transferType: transferType || 'Direct', shareType: shareType || 'Common', bidsCount: 0, mine: true };
    order.fill = custom ? (this.FILL_RULES[custom.fill] ? custom.fill : 'partial') : (this.FILL_RULES[fill] ? fill : 'partial'); order.minFill = order.fill === 'min' ? +(custom ? custom.minFill : minFill) || 0 : 0;
    if (custom) { order.custom = custom; order.groupId = groupId || null; if (custom.visibility === 'anonymous') order.anonymous = true; }
    order.disclosures = { version: this.DISCLOSURE_VERSION, acceptedAt: Date.now() };
    audit('order.place', `${id} ${side === 'listing' ? 'ask' : 'bid'} ${(+qty).toLocaleString()} ${c.name} @ $${(+price).toFixed(2)}`);
    let match = null;
    // Custom orders carry constraints (share class, accepted transfer types); every order has a fill rule, and BOTH sides' rules must be met.
    const fits = o => {
      if (custom) {
        if (custom.shareClass && custom.shareClass !== 'Any' && o.shareType !== custom.shareClass) return false;
        if (custom.transfers && custom.transfers.length && !custom.transfers.includes(o.transferType)) return false;
      }
      const q = Math.min(order.qty, o.qty);
      return this.fillOk(order, q) && this.fillOk(o, q);
    };
    // Crossing creates a pending match (the clearance event) and lowers both orders; the settlement starts once Rainmaker approves.
    match = this._crossOrder(order, fits);
    state.userOrders.push(order);
    if (!silent) notify(side === 'listing' ? `Your ${c.name} ask ${id} is live` : `Your ${c.name} bid ${id} is live`);
    save();
    return { order, match };
  },
  // Custom order builder: one spec can become several linked orders (a ladder), a pegged order, or a private indication.
  placeCustomOrder(spec) {
    const c = this.company(spec.companyId); const rx = this.price(c.id);
    const groupId = c.ticker + '-C' + (state.userOrders.filter(o => o.groupId).length + 1);
    const meta = { pricing: spec.pricing, offset: spec.offset || 0, fill: spec.fill, minFill: spec.minFill || 0, shareClass: spec.shareClass || 'Any', transfers: spec.transfers || [], autoReconfirm: !!spec.autoReconfirm, gtc: !!spec.gtc, guard: spec.guard || 0, visibility: spec.visibility || 'public', note: spec.note || '' };
    const tiers = spec.pricing === 'ladder' ? spec.tiers : [{ qty: spec.qty, price: spec.pricing === 'pegged' ? Math.round(rx * (1 + meta.offset) * 100) / 100 : spec.price }];
    const totalQty = tiers.reduce((s_, t) => s_ + t.qty, 0);
    const days = meta.gtc ? 3650 : (spec.days || 30);
    const sideWord = spec.side === 'bid' ? 'bid' : 'ask';
    const describe = () => `${tiers.length > 1 ? tiers.length + '-tier ' : ''}${meta.pricing === 'pegged' ? 'pegged ' : ''}${sideWord} for ${totalQty.toLocaleString()} shares (${tiers.map(t => t.qty.toLocaleString() + ' @ $' + t.price.toFixed(2)).join(', ')}); ${meta.fill === 'aon' ? 'all-or-none' : meta.fill === 'min' ? 'min fill ' + meta.minFill.toLocaleString() : 'partial fills ok'}; ${meta.shareClass} shares; ${meta.transfers.join('/') || 'any'} transfer`;
    if (meta.visibility === 'rep') {
      const ioi = this.addIOI({ companyId: c.id, side: spec.side === 'bid' ? 'buy' : 'sell', price: tiers[0].price, qty: totalQty, note: 'Private custom order · ' + describe() });
      this.sendMessage({ companyId: c.id, text: `Private custom ${sideWord} on ${c.name}, please work this off the book: ${describe()}.${meta.note ? ' ' + meta.note : ''}` });
      return { private: true, ioi, groupId };
    }
    const shareType = meta.shareClass === 'Any' ? 'Common' : meta.shareClass;
    const transferType = meta.transfers.length === 1 ? meta.transfers[0] : (meta.transfers[0] || 'Direct');
    const results = tiers.map((t, i) => this.placeOrder({ companyId: c.id, side: spec.side, price: t.price, qty: t.qty, transferType, shareType, days, custom: Object.assign({ tier: i + 1, tiers: tiers.length }, meta), groupId, silent: true }));
    notify(`Your custom ${c.name} ${sideWord} ${groupId} is live: ${describe()}`);
    if (meta.note) this.sendMessage({ companyId: c.id, orderId: results[0].order.id, text: meta.note });
    save();
    return { orders: results.map(r => r.order), matches: results.filter(r => r.match).map(r => r.match), groupId };
  },
  reconfirmOrder(id) { const o = state.userOrders.find(o => o.id === id); if (!o || o.status !== 'live') return; o.expires = Date.now() + 30 * DAY; o.reconfirmed = (o.reconfirmed || 0) + 1; o.expiryNoticed = false; audit('order.reconfirm', id); notify(`${id} reconfirmed for another 30 days`); save(); },
  // Runs on every render: re-peg pegged orders, enforce guardrails, auto-reconfirm.
  checkGuards() {
    let changed = false;
    state.userOrders.forEach(o => {
      if (o.status === 'live' && !o.expiryNoticed && o.expires - Date.now() < 3 * DAY && !(o.custom && (o.custom.gtc || o.custom.autoReconfirm))) { o.expiryNoticed = true; notify(`${o.id} expires in ${Math.max(1, Math.ceil((o.expires - Date.now()) / DAY))} day(s). Reconfirm it from the order page to keep it on the book.`); changed = true; }
      if (o.status !== 'live' || !o.custom) return; const k = o.custom; const rx = this.price(o.companyId);
      if (k.pricing === 'pegged') { const p = Math.round(rx * (1 + (k.offset || 0)) * 100) / 100; if (p !== o.price) { o.price = p; changed = true; } }
      if (k.guard > 0) { const adverse = o.side === 'bid' ? (rx - o.price) / o.price : (o.price - rx) / o.price; if (adverse > k.guard) { o.status = 'cancelled'; o.cancelReason = 'guardrail'; notify(`${o.id} was cancelled by its guardrail: the RX price moved ${(adverse * 100).toFixed(1)}% against it`); changed = true; return; } }
      if (k.autoReconfirm && !k.gtc && o.expires - Date.now() < 3 * DAY) { o.expires = Date.now() + 30 * DAY; o.reconfirmed = (o.reconfirmed || 0) + 1; notify(`${o.id} auto-reconfirmed for another 30 days`); changed = true; }
    });
    if (changed) save();
  },
  // Bid on someone else's ask; matches when the price meets it.
  bidOnListing(listingId, price, qty, days) {
    const l = this.order(listingId); if (!l) return null;
    const c = this.company(l.companyId);
    const bid = { id: l.id + '-B' + (this.listingBids(listingId).length + 1), listingId, companyId: l.companyId, price: +price, qty: +qty, created: Date.now(), expires: Date.now() + (+days || 7) * DAY, status: 'live', mine: true };
    let match = null; const fillBlocked = bid.price >= l.price && !this.fillOk(l, Math.min(bid.qty, l.qty));   // price meets the ask but its fill rule does not
    if (bid.price >= l.price && !fillBlocked && !this._sameParty(bid, l)) {
      const q = Math.min(bid.qty, l.qty); state.userBids.push(bid);
      const m = this._createMatch({ bid, ask: l, price: l.price, qty: q }); match = { price: l.price, qty: q, matchId: m.id };
    } else {
      if (l.mine) { const mo = state.userOrders.find(o => o.id === l.id); mo.bidsCount = (mo.bidsCount || 0) + 1; }
      else this._setOverlay(l.id, { bidsCount: (l.bidsCount || 0) + 1 });
      this.openNegotiation(l.id, { price: +price, qty: +qty });
    }
    bid.disclosures = { version: this.DISCLOSURE_VERSION, acceptedAt: Date.now() };
    audit('order.bid-on-ask', `${bid.id} ${(+qty).toLocaleString()} @ $${(+price).toFixed(2)} on ${l.id}`);
    if (!match) state.userBids.push(bid);
    notify(match ? `Your bid on ${c.name} ask ${l.id} matched ${match.qty.toLocaleString()} shares @ $${match.price.toFixed(2)} (${match.matchId}, awaiting Rainmaker's approval)` : fillBlocked ? `Your bid on ${c.name} ask ${l.id} meets the price but not its fill rule (${this.fillLabel(l).toLowerCase()}). Your primary representative has it as a negotiation.` : `Your bid on ${c.name} ask ${l.id} was placed`);
    save();
    return { bid, match };
  },
  // Sell into someone else's bid at their price.
  sellIntoBid(bidId, price, qty) {
    const b = this.order(bidId); if (!b) return null;
    const c = this.company(b.companyId);
    let match = null; const fillBlocked = +price <= b.price && !this.fillOk(b, Math.min(+qty, b.qty));
    if (+price <= b.price && !fillBlocked && !this._sameParty({ mine: true }, b)) {
      const q = Math.min(+qty, b.qty);
      // The sale is recorded as an ask of the member's own, matched at once against the bid.
      const ask = { id: b.id + '-S' + (state.userOrders.filter(o => o.intoBid === b.id).length + 1), companyId: b.companyId, side: 'listing', price: b.price, qty: q, created: Date.now(), expires: Date.now() + 7 * DAY, status: 'live', transferType: 'Direct', shareType: 'Common', fill: 'partial', minFill: 0, bidsCount: 0, mine: true, intoBid: b.id, disclosures: { version: this.DISCLOSURE_VERSION, acceptedAt: Date.now() } };
      state.userOrders.push(ask); const m = this._createMatch({ bid: b, ask, price: b.price, qty: q }); match = { price: b.price, qty: q, matchId: m.id };
      notify(`You sold ${q.toLocaleString()} ${c.name} shares @ $${b.price.toFixed(2)} into bid ${b.id} (${m.id}, awaiting Rainmaker's approval)`);
    } else {
      notify(fillBlocked ? `Your sale into ${c.name} bid ${b.id} meets the price but not its fill rule (${this.fillLabel(b).toLowerCase()}). Your primary representative has it as a negotiation.` : `Your counter-offer of $${(+price).toFixed(2)} on ${c.name} bid ${b.id} was sent`);
      this.openNegotiation(b.id, { price: +price, qty: +qty });
    }
    audit('order.sell-into-bid', `${(+qty).toLocaleString()} @ $${(+price).toFixed(2)} into ${b.id}`);
    save();
    return { match };
  },
  // Cancel a live order and release its reserved cash.
  cancelOrder(id) {
    audit('order.cancel', id);
    const o = state.userOrders.find(o => o.id === id); if (o) { o.status = 'cancelled'; }
    const b = state.userBids.find(o => o.id === id); if (b) { b.status = 'cancelled'; }
    save();
  },
  toggleWatch(id) { const i = state.watchlist.indexOf(id); if (i >= 0) state.watchlist.splice(i, 1); else state.watchlist.push(id); audit('watchlist.toggle', id); save(); },
  isWatched(id) { return state.watchlist.includes(id); },
  dismissBanner() { state.dismissedBanner = true; save(); },
  // ----- fees -----
  // Brokerage: 3% on the buy side, 2% on the sell side (min $500). Staff can adjust both rates per deal on the settlement.
  FEES: Object.assign({ rate(side) { return side === 'sell' ? this.sell : this.buy; } }, RX_CONFIG.fees),
  fees(companyId, gross, side) { const c = this.company(companyId); const brokerage = Math.max(this.FEES.brokerageMin, gross * this.FEES.rate(side)); const transfer = side === 'buy' ? c.policy.transferFee : 0; return { brokerage, transfer, total: brokerage + transfer, allIn: side === 'buy' ? gross + brokerage + transfer : gross - brokerage }; },
  // ----- desk (buy from us / sell to us) -----
  deskQuote(companyId, qty) {
    const c = this.company(companyId); const hb = this.highestBid(companyId), la = this.lowestAsk(companyId), rx = this.price(companyId);
    const mid = hb != null && la != null ? (hb + la) / 2 : rx;
    const liq = this.liveListings(companyId).length + this.liveBids(companyId).length;
    const cut = NOW_T - 30 * DAY; const vol30 = this.transactions(companyId).filter(t => t.ts >= cut && t.status !== 'canceled').reduce((s_, t) => s_ + t.price * t.qty, 0);
    const adv = Math.max(vol30 / 30, 25000);
    const q = Math.max(0, +qty || 0); const notional = q * mid;
    const baseHalf = 0.015 + 0.055 / (1 + liq / 15);           // 1.5% (deep book) to 7% (thin book)
    const impact = Math.min(0.08, 0.35 * Math.sqrt(notional / (adv * 5 + 1)) * 0.1); // grows with size vs. average daily volume
    const half = Math.min(0.15, baseHalf + impact);
    const buy = +(mid * (1 + half)).toFixed(2), sell = +(mid * (1 - half)).toFixed(2);
    return { mid, hb, la, rx, liq, adv, vol30, half, baseHalf, impact, buy, sell, qty: q, buyNotional: buy * q, sellNotional: sell * q, spreadCapture: (buy - sell) * q, expires: Date.now() + 60000 };
  },
  // Buy from / sell to the Rainmaker desk at the quoted price; settles through the desk pipeline.
  deskTrade(companyId, side, qty) {
    const c = this.company(companyId); const qd = this.deskQuote(companyId, qty); const price = side === 'buy' ? qd.buy : qd.sell;
    if (side === 'sell') { const h = this.holdings().find(x => x.c.id === companyId); if (!h || h.qty < qty) return { error: 'You do not hold enough shares to sell that quantity.' }; }
    this._recordTx(companyId, price, +qty, side, 'desk');
    if (!state.pricePoints[companyId]) state.pricePoints[companyId] = []; state.pricePoints[companyId].push({ t: Date.now(), p: +qd.mid.toFixed(2) });
    state.deskTrades.push({ companyId, side, qty: +qty, price, mid: qd.mid, half: qd.half, capture: Math.abs(price - qd.mid) * qty, ts: Date.now() });
    notify(side === 'buy' ? `You bought ${(+qty).toLocaleString()} ${c.name} from the Rainmaker desk @ $${price.toFixed(2)}` : `You sold ${(+qty).toLocaleString()} ${c.name} to the Rainmaker desk @ $${price.toFixed(2)}`);
    save(); return { price, qty: +qty, notional: price * qty };
  },
  deskTrades() { return state.deskTrades.slice().sort((a, b) => b.ts - a.ts); },
  // ----- indications of interest -----
  iois(companyId) { return this.company(companyId).iois.concat(state.iois.filter(i => i.companyId === companyId && i.status !== 'withdrawn')); },
  ioiSummary(companyId) { const all = this.iois(companyId); const buys = all.filter(i => i.side === 'buy'), sells = all.filter(i => i.side === 'sell'); return { buys: buys.length, sells: sells.length, buyQty: buys.reduce((s_, i) => s_ + i.qty, 0), sellQty: sells.reduce((s_, i) => s_ + i.qty, 0), topBuy: buys.length ? Math.max(...buys.map(i => i.price)) : null, lowSell: sells.length ? Math.min(...sells.map(i => i.price)) : null }; },
  addIOI({ companyId, side, price, qty, note }) { const c = this.company(companyId); const ioi = { id: c.ticker + '-IOI-U' + (state.iois.length + 1), companyId, side, price: +price, qty: +qty, note: note || '', created: Date.now(), mine: true, status: 'active' }; state.iois.push(ioi); notify(`Indication of interest recorded: ${side === 'buy' ? 'buy up to' : 'sell from'} $${(+price).toFixed(2)} on ${c.name}. ${this.rep(state.profile.rep).name} will call when the market moves.`); save(); return ioi; },
  myIOIs() { return state.iois.slice().sort((a, b) => b.created - a.created); },
  withdrawIOI(id) { const i = state.iois.find(x => x.id === id); if (i) i.status = 'withdrawn'; save(); },
  // ----- alerts -----
  ALERT_TYPES: { ask_below: 'New ask at or below', bid_above: 'New bid at or above', price_above: 'RX price rises above', price_below: 'RX price falls below', match: 'A match prints (any price)', ask_below_bid: 'New ask below my highest bid', cost_cross: 'RX price crosses my cost basis' },
  ALERT_NO_PRICE: ['match', 'ask_below_bid', 'cost_cross'],
  addAlert({ companyId, type, price }) { const c = this.company(companyId); const rx = this.price(companyId); const h = this.holdings().find(x => x.c.id === companyId); const a = { id: 'al-' + Date.now().toString(36), companyId, type, price: +price || 0, created: Date.now(), triggered: null }; if (type === 'cost_cross') { a.basis = h ? h.avgCost : rx; a.startAbove = rx >= a.basis; } audit('alert.add', `${c.name} ${type}`); state.alerts.push(a); save(); this.checkAlerts(); },
  removeAlert(id) { state.alerts = state.alerts.filter(a => a.id !== id); save(); },
  alerts(companyId) { return state.alerts.filter(a => !companyId || a.companyId === companyId); },
  checkAlerts() { let fired = 0; state.alerts.forEach(a => { if (a.triggered) return; const c = this.company(a.companyId); const la = this.lowestAsk(a.companyId), hb = this.highestBid(a.companyId), rx = this.price(a.companyId); let hit = false;
    if (a.type === 'ask_below' && la != null && la <= a.price) hit = true; if (a.type === 'bid_above' && hb != null && hb >= a.price) hit = true; if (a.type === 'price_above' && rx > a.price) hit = true; if (a.type === 'price_below' && rx < a.price) hit = true;
    if (a.type === 'match') { const t = this.transactions(a.companyId).find(x => x.status !== 'canceled'); if (t && t.ts > a.created) hit = true; }
    if (a.type === 'ask_below_bid') { const my = state.userOrders.filter(o => o.companyId === a.companyId && o.side === 'bid' && o.status === 'live').map(o => o.price); if (my.length && la != null && la < Math.max(...my)) hit = true; }
    if (a.type === 'cost_cross' && a.basis != null) { const above = rx >= a.basis; if (above !== a.startAbove) hit = true; }
    if (hit) { a.triggered = Date.now(); fired++; const detail = a.type === 'match' ? `a match printed at $${this.transactions(a.companyId)[0].price.toFixed(2)}` : a.type === 'ask_below_bid' ? `lowest ask is now $${la.toFixed(2)}, below your bid` : a.type === 'cost_cross' ? `RX price $${rx.toFixed(2)} crossed your $${a.basis.toFixed(2)} cost basis` : `${this.ALERT_TYPES[a.type].toLowerCase()} $${a.price.toFixed(2)} (now ${a.type === 'ask_below' ? '$' + la.toFixed(2) : a.type === 'bid_above' ? '$' + hb.toFixed(2) : '$' + rx.toFixed(2)})`; notify(`Alert: ${c.name} — ${detail}.`); } }); if (fired) save(); return fired; },
  // ----- negotiation (always brokered by the rep) -----
  negotiation(orderId) { return ((state.negotiations || {})[orderId] || []).slice(); },
  _neg(orderId) { state.negotiations = state.negotiations || {}; return state.negotiations[orderId] = state.negotiations[orderId] || []; },
  // Start a brokered negotiation on an order with an opening offer.
  openNegotiation(orderId, { price, qty }) {
    const o = this.order(orderId); if (!o) return; const list = this._neg(orderId);
    list.push({ id: 'n' + Date.now().toString(36), ts: Date.now(), from: 'you', type: list.length ? 'counter' : 'offer', price: +price, qty: +qty });
    audit('negotiation.offer', `${orderId} @ $${(+price).toFixed(2)}`); save();
    this._scheduleCounterparty(orderId);
  },
  // Simulated counterparty reply after a short delay (prototype only).
  _scheduleCounterparty(orderId) {
    setTimeout(() => {
      const o = this.order(orderId); if (!o) return; const list = this._neg(orderId); const last = list[list.length - 1]; if (!last || last.from !== 'you') return;
      const isL = o.side === 'listing'; const gap = Math.abs(last.price - o.price) / o.price; const c = this.company(o.companyId); const rep_ = this.rep(state.profile.rep);
      if (gap <= 0.03) { list.push({ id: 'n' + Date.now().toString(36), ts: Date.now(), from: 'cp', type: 'accept', price: last.price, qty: last.qty, text: `${rep_.name.split(' ')[0]}: the ${isL ? 'seller' : 'buyer'} accepts ${last.qty.toLocaleString()} @ $${last.price.toFixed(2)}. Confirm to lock terms.` }); }
      else if (gap > 0.25) { list.push({ id: 'n' + Date.now().toString(36), ts: Date.now(), from: 'cp', type: 'decline', price: last.price, qty: last.qty, text: `${rep_.name.split(' ')[0]}: the ${isL ? 'seller' : 'buyer'} declined; they are not moving more than a few percent from $${o.price.toFixed(2)}.` }); }
      else { const mid = +((last.price + o.price) / 2).toFixed(2); list.push({ id: 'n' + Date.now().toString(36), ts: Date.now(), from: 'cp', type: 'counter', price: mid, qty: last.qty, text: `${rep_.name.split(' ')[0]}: the ${isL ? 'seller' : 'buyer'} counters at $${mid.toFixed(2)} for ${last.qty.toLocaleString()} shares.` }); }
      notify(`${c.name} ${o.id}: the counterparty responded to your ${last.type}. Open the order to accept, counter or decline.`); save(); window.dispatchEvent(new Event('rx-messages'));
    }, 2200);
  },
  // Counter, accept or decline the latest offer in a negotiation.
  respondNegotiation(orderId, action, price, qty) {
    const o = this.order(orderId); if (!o) return { error: 'Order not found' }; const list = this._neg(orderId); const last = list[list.length - 1]; const c = this.company(o.companyId); const isL = o.side === 'listing';
    if (action === 'decline') { list.push({ id: 'n' + Date.now().toString(36), ts: Date.now(), from: 'you', type: 'decline' }); audit('negotiation.decline', orderId); save(); return {}; }
    if (action === 'counter') { list.push({ id: 'n' + Date.now().toString(36), ts: Date.now(), from: 'you', type: 'counter', price: +price, qty: +qty }); audit('negotiation.counter', `${orderId} @ $${(+price).toFixed(2)}`); save(); this._scheduleCounterparty(orderId); return {}; }
    // accept: trade at the counterparty's last price
    const px = last && last.from === 'cp' ? last.price : o.price; const q = Math.min(+qty || (last ? last.qty : o.qty), o.qty);
    // Agreed terms become a match (clearance event) like any crossing: it waits for Rainmaker's approval, then settlement opens.
    let m;
    if (isL) { let myBid = state.userBids.find(b => b.listingId === o.id && b.status === 'live'); if (!myBid) { myBid = { id: o.id + '-B' + (this.listingBids(o.id).length + 1), listingId: o.id, companyId: o.companyId, price: px, qty: q, created: Date.now(), expires: Date.now() + 7 * DAY, status: 'live', mine: true, negotiated: true }; state.userBids.push(myBid); } myBid.price = px; myBid.qty = q; m = this._createMatch({ bid: myBid, ask: o, price: px, qty: q, kind: 'negotiation' }); }
    else { const ask = { id: o.id + '-S' + (state.userOrders.filter(x => x.intoBid === o.id).length + 1), companyId: o.companyId, side: 'listing', price: px, qty: q, created: Date.now(), expires: Date.now() + 7 * DAY, status: 'live', transferType: 'Direct', shareType: 'Common', fill: 'partial', minFill: 0, bidsCount: 0, mine: true, intoBid: o.id, negotiated: true }; state.userOrders.push(ask); m = this._createMatch({ bid: o, ask, price: px, qty: q, kind: 'negotiation' }); }
    list.push({ id: 'n' + Date.now().toString(36), ts: Date.now(), from: 'you', type: 'agreed', price: px, qty: q, text: `Terms agreed: ${q.toLocaleString()} @ $${px.toFixed(2)}. Match ${m.id} sent to Rainmaker for approval.` });
    audit('negotiation.accept', `${orderId} ${q} @ $${px.toFixed(2)} · ${m.id}`); save();
    return { match: { price: px, qty: q, matchId: m.id } };
  },
});
