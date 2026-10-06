/* ==============================================================
   Rainmaker X · Data API · market
   Companies, live order books, transactions, price series, notifications, data room access.
   ============================================================== */
'use strict';

const Data = {
  NOW, NOW_T, DAY, COMPANIES, INDEX, FUNDS, REPS, state, save,
  fund(id) { return FUNDS.find(f => f.id === id); },
  rep(id) { return REPS.find(r => r.id === id); },
  profile() { return state.profile; },
  INVESTOR_TYPES: { accredited: 'Accredited investor', qib: 'Qualified institutional buyer (QIB)', institution: 'Institutional account' },
  canTrade() { return state.profile.verification === 'verified'; },
  submitVerification({ investorType, basis, firm }) { audit('verification.submit', investorType); Object.assign(state.profile, { investorType, basis, firm: firm || state.profile.firm, verification: 'pending', submittedAt: Date.now(), rejectionNote: null }); notify(`Investor verification submitted as ${this.INVESTOR_TYPES[investorType]}. Compliance review typically takes 1 business day.`); save(); },
  approveVerification() { audit('verification.approve', state.profile.name, 'staff:compliance'); Object.assign(state.profile, { verification: 'verified', verifiedAt: Date.now(), rejectionNote: null }); notify(`Your investor verification was approved by compliance.`); save(); this.convertRequests(); },
  resetVerification() { Object.assign(state.profile, { verification: 'unverified', investorType: null, basis: [] }); save(); },
  requestAllocation(fundId, amount) { state.allocations = state.allocations || []; const f = this.fund(fundId); state.allocations.push({ fundId, amount: +amount, ts: Date.now(), status: 'requested' }); notify(`Allocation request of $${(+amount).toLocaleString()} to ${f.name} sent to ${this.rep(state.profile.rep).name}.`); save(); },
  allocations() { return (state.allocations || []).slice().sort((a, b) => b.ts - a.ts); },
  // ----- SPV units: buy from Rainmaker's inventory, sell back when Rainmaker provides liquidity (Ben, Oct 5 2026) -----
  SPV_SPREAD: RX_CONFIG.products.spvBuybackSpread,
  // Units Rainmaker still holds for sale in a vehicle: the catalog inventory plus what members sold back, minus what they bought.
  spvInventory(f) { const d = (state.spvInv || {})[f.id] || 0; return Math.max(0, (f.inventoryUnits || 0) + d); },
  // Standing bid for units when Rainmaker provides liquidity: unit value less the buy-back spread.
  spvBid(f) { return +(f.nav * (1 - this.SPV_SPREAD)).toFixed(2); },
  // What a member can do in a vehicle right now: buy from us (inventory), sell back to us (liquidity), and what they hold.
  spvOffer(f) { const units = Math.max(0, this.spvInventory(f) - this.spvReservedUnits(f)); const held = this.spvHolding(f.id); const minUnits = Math.max(RX_CONFIG.products.spvMinUnits, Math.ceil(f.min / f.nav));
    return { price: f.nav, units, minUnits, canBuy: units > 0, canSell: !!f.liquidity, bid: this.spvBid(f), held: held ? held.qty : 0, holding: held }; },
  spvLots() { return state.spvLots || []; },
  // The member's position in one vehicle (units, cost basis, value, gain), or null.
  spvHolding(fundId) { const f = this.fund(fundId); if (!f) return null; let qty = 0, cost = 0, first = null;
    this.spvLots().filter(l => l.fundId === fundId).forEach(l => { if (l.qty > 0) { qty += l.qty; cost += l.qty * l.price; } else { const avg = qty ? cost / qty : l.price; qty += l.qty; cost += l.qty * avg; } first = first == null ? l.ts : Math.min(first, l.ts); });
    if (qty <= 0) return null; const value = qty * f.nav; return { f, qty, cost, avgCost: cost / qty, price: f.nav, value, gain: value - cost, gainPct: cost ? (value - cost) / cost : 0, first }; },
  // Every vehicle the member holds units in, largest first.
  spvHoldings() { return FUNDS.filter(f => f.type === 'spv').map(f => this.spvHolding(f.id)).filter(Boolean).sort((a, b) => b.value - a.value); },
  _spvLot(f, qty, price, side, subId) { state.spvLots = state.spvLots || []; state.spvInv = state.spvInv || {}; state.spvLots.push({ id: 'spv-' + Date.now().toString(36) + Math.floor(Math.random() * 1e3), fundId: f.id, qty, price, side, ts: Date.now(), subId: subId || null }); state.spvInv[f.id] = (state.spvInv[f.id] || 0) - qty; },
  // ----- buying units from Rainmaker is a PROCESS (Ben, Oct 5 2026), not an instant trade -----
  // A subscription moves through SPV_STEPS: the member submits it (cash reserved), signs the subscription agreement, moves the
  // funds to escrow (cash debited), then Rainmaker issues the units (lot booked, inventory lowered). Either side can cancel before
  // the units are issued; funded escrow is returned. Records live in state.spvSubs; the fund page, Account and the staff Matches tab show them.
  SPV_STEPS: ['Subscription submitted', 'Subscription agreement signed', 'Funds moved to escrow', 'Units issued by Rainmaker'],
  spvSubs() { return (state.spvSubs || []).slice().sort((a, b) => b.ts - a.ts); },
  spvSub(id) { return (state.spvSubs || []).find(x => x.id === id) || null; },
  openSpvSubs() { return this.spvSubs().filter(x => x.status === 'open'); },
  // Units Rainmaker has promised to open subscriptions (not yet issued), so the offer never oversells the inventory.
  spvReservedUnits(f) { return this.openSpvSubs().filter(x => x.fundId === f.id).reduce((s_, x) => s_ + x.units, 0); },
  // What a subscription is waiting for, in the member's words.
  spvSubLabel(x) { return x.status === 'closed' ? 'Units issued' : x.status === 'cancelled' ? 'Cancelled' : x.status === 'declined' ? 'Declined by Rainmaker' : x.stage === 0 ? 'Awaiting your signature' : x.stage === 1 ? 'Awaiting your funds' : 'Awaiting Rainmaker'; },
  // Step 1: submit a subscription for units from Rainmaker's inventory at unit value. Verified investors only; the notional is reserved from buying power.
  buySPV(fundId, units) { const f = this.fund(fundId); const u = Math.floor(+units || 0); if (!f || f.type !== 'spv') return { error: 'Unknown vehicle.' };
    if (!this.canTrade()) return { error: 'Buying units directly is for verified investors. Submit a request and your primary representative will work it.' };
    const off = this.spvOffer(f); if (!off.canBuy) return { error: 'Rainmaker has no units of this vehicle available right now.' };
    if (u < off.minUnits) return { error: `The minimum is ${off.minUnits.toLocaleString()} units (${'$' + f.min.toLocaleString()}).` };
    if (u > off.units) return { error: `Only ${off.units.toLocaleString()} units are available.` };
    const notional = +(u * f.nav).toFixed(2); if (notional > this.buyingPower()) return { error: 'That exceeds your buying power. Deposit cash first.' };
    state.spvSubs = state.spvSubs || []; const now = Date.now(); const sub = { id: 'SUB-' + String(state.spvSubs.length + 1).padStart(3, '0'), fundId: f.id, units: u, price: f.nav, notional, ts: now, stage: 0, steps: { 0: now }, status: 'open', docs: {} };
    state.spvSubs.push(sub); audit('spv.subscribe', `${sub.id} · ${u} ${f.name} @ $${f.nav.toFixed(2)}`); notify(`Subscription ${sub.id} opened for ${u.toLocaleString()} units of ${f.name} @ $${f.nav.toFixed(2)} (${'$' + Math.round(notional).toLocaleString()}). Next: sign the subscription agreement.`); save(); return { sub, price: f.nav, units: u, notional }; },
  // Step 2: the member signs the subscription agreement.
  signSpvSub(id) { const x = this.spvSub(id); if (!x || x.status !== 'open') return { error: 'Subscription not open.' }; if (x.stage !== 0) return { error: 'Already signed.' }; const now = Date.now(); x.stage = 1; x.steps[1] = now; x.docs['Subscription agreement'] = now; const f = this.fund(x.fundId); audit('spv.sign', x.id); notify(`${x.id}: subscription agreement signed for ${f.name}. Next: move ${'$' + Math.round(x.notional).toLocaleString()} to escrow from your account.`); save(); return { sub: x }; },
  // Step 3: the member moves the notional from the primary account to escrow (the reservation becomes a debit).
  fundSpvSub(id) { const x = this.spvSub(id); if (!x || x.status !== 'open') return { error: 'Subscription not open.' }; if (x.stage < 1) return { error: 'Sign the subscription agreement first.' }; if (x.stage >= 2) return { error: 'Escrow is already funded.' };
    if (this.cashBalance() - (this.reservedCash() - x.notional) < x.notional) return { error: 'Not enough cash in your account to fund escrow. Deposit first.' };
    const now = Date.now(); x.stage = 2; x.steps[2] = now; x.fundedAt = now; const f = this.fund(x.fundId); audit('spv.fund', `${x.id} · $${Math.round(x.notional).toLocaleString()}`); notify(`${x.id}: ${'$' + Math.round(x.notional).toLocaleString()} moved to escrow for ${f.name}. Rainmaker will issue the units.`); save(); return { sub: x }; },
  // Step 4 (staff, perm matches): Rainmaker issues the units: the lot is booked, inventory lowered, the member notified.
  issueSpvSub(id) { if (!this.can('matches')) return { error: 'Not permitted' }; const x = this.spvSub(id); if (!x || x.status !== 'open') return { error: 'Subscription not open.' }; if (x.stage < 2) return { error: 'Escrow is not funded yet.' };
    const f = this.fund(x.fundId); const now = Date.now(); this._spvLot(f, x.units, x.price, 'buy', x.id); x.stage = 3; x.steps[3] = now; x.issuedAt = now; x.status = 'closed'; x.by = 'staff:' + this.role();
    audit('spv.issue', `${x.id} · ${x.units} ${f.name}`, x.by); notify(`${x.id}: Rainmaker issued ${x.units.toLocaleString()} units of ${f.name} to your account.`); save(); return { sub: x }; },
  // Cancel (member) or decline (staff) before the units are issued; funded escrow is returned to the account.
  cancelSpvSub(id, reason) { const x = this.spvSub(id); if (!x || x.status !== 'open') return { error: 'Subscription not open.' }; const staff = this.isStaff(); if (!staff && !this.canTrade()) return { error: 'Not permitted' };
    x.status = staff ? 'declined' : 'cancelled'; x.endedAt = Date.now(); x.reason = (reason || '').trim(); const f = this.fund(x.fundId); audit(staff ? 'spv.decline' : 'spv.cancel', `${x.id}${x.reason ? ' · ' + x.reason : ''}`, staff ? 'staff:' + this.role() : 'client'); notify(`${x.id} for ${f.name} was ${x.status}${x.reason ? ': ' + x.reason : ''}.${x.fundedAt ? ' The escrow was returned to your account.' : ''}`); save(); return { sub: x }; },
  // Sell units back to Rainmaker at the standing bid. Only when Rainmaker provides liquidity in the vehicle.
  sellSPV(fundId, units) { const f = this.fund(fundId); const u = Math.floor(+units || 0); if (!f || f.type !== 'spv') return { error: 'Unknown vehicle.' };
    if (!this.canTrade()) return { error: 'Selling units back is for verified investors. Submit a request and your primary representative will work it.' };
    if (!f.liquidity) return { error: 'Rainmaker is not providing liquidity in this vehicle right now. Ask your primary representative to list the units on the exchange.' };
    const held = this.spvHolding(f.id); if (!held || held.qty < u) return { error: `You hold ${held ? held.qty.toLocaleString() : 0} units of this vehicle.` };
    if (u < 1) return { error: 'Enter the number of units to sell.' };
    const bid = this.spvBid(f); const notional = u * bid; this._spvLot(f, -u, bid, 'sell'); audit('spv.sell', `${u} ${f.name} @ $${bid.toFixed(2)}`); notify(`You sold ${u.toLocaleString()} units of ${f.name} back to Rainmaker @ $${bid.toFixed(2)} (${'$' + Math.round(notional).toLocaleString()}).`); save(); return { price: bid, units: u, notional }; },
  marketStats() { const asks = this.allOrders().filter(o => o.side === 'listing' && o.status === 'live'); const bids = this.allOrders().filter(o => o.side === 'bid' && o.status === 'live'); const cut = NOW_T - 30 * DAY; let vol = 0, n = 0; COMPANIES.forEach(c => this.transactions(c.id).forEach(t => { if (t.ts >= cut && t.status !== 'canceled') { vol += t.price * t.qty; n++; } })); return { companies: COMPANIES.length, asks: asks.length, bids: bids.length, askValue: asks.reduce((s, o) => s + o.price * o.qty, 0), bidValue: bids.reduce((s, o) => s + o.price * o.qty, 0), vol30: vol, tx30: n }; },
  company(id) { return COMPANIES.find(c => c.id === id); },
  // Valuation at the last round ("market cap") in dollars, parsed from the catalog's "$61.5b" / "$500m" strings.
  // Euro / sterling valuations are treated at face value (the prototype does not convert currencies).
  // Was something entered between two calendar dates (inclusive, local time, 'YYYY-MM-DD' strings from a date input)? Blank = open-ended (Ben, Oct 1 2026).
  placedBetween(ts, from, to) { if (from) { const a = new Date(from + 'T00:00:00'); if (!isNaN(a) && ts < a.getTime()) return false; } if (to) { const b = new Date(to + 'T23:59:59.999'); if (!isNaN(b) && ts > b.getTime()) return false; } return true; },
  marketCap(c) { const m = /[$€£]\s*([\d.]+)\s*(b|m|t)?/i.exec((c && c.round && c.round.post) || ''); return m ? parseFloat(m[1]) * ({ b: 1e9, m: 1e6, t: 1e12 }[(m[2] || 'm').toLowerCase()]) : 0; },
  // ----- orders -----
  orders(companyId) {
    const c = this.company(companyId);
    const base = c.orders.filter(o => !state.cancelled.includes(o.id)).map(o => Object.assign({}, o, this._overlay(o.id)));
    const mine = state.userOrders.filter(o => o.companyId === companyId);
    const staff = (state.staffOrders || []).filter(o => o.companyId === companyId && !state.cancelled.includes(o.id)).map(o => Object.assign({}, o, this._overlay(o.id)));
    return base.concat(staff, mine);
  },
  _overlay(id) { return state.overlays && state.overlays[id] ? state.overlays[id] : {}; },
  order(id) { for (const c of COMPANIES) { const o = this.orders(c.id).find(o => o.id === id); if (o) return o; } return null; },
  listings(companyId) { return this.orders(companyId).filter(o => o.side === 'listing').sort((a, b) => a.price - b.price); },
  standingBids(companyId) { return this.orders(companyId).filter(o => o.side === 'bid').sort((a, b) => b.price - a.price); },
  liveListings(companyId) { return this.listings(companyId).filter(o => o.status === 'live'); },
  liveBids(companyId) { return this.standingBids(companyId).filter(o => o.status === 'live'); },
  highestBid(companyId) { const b = this.liveBids(companyId); const lb = state.userBids.filter(x => x.companyId === companyId && x.status === 'live').map(x => x.price); const all = b.map(x => x.price).concat(lb); return all.length ? Math.max(...all) : null; },
  lowestAsk(companyId) { const a = this.liveListings(companyId); return a.length ? a[0].price : null; },
  lastMatched(companyId) { return this.transactions(companyId).find(t => t.status !== 'canceled') || null; },
  groupOrders(groupId) { return groupId ? state.userOrders.filter(o => o.groupId === groupId) : []; },
  price(companyId) { const pp = state.pricePoints[companyId]; return pp && pp.length ? pp[pp.length - 1].p : this.company(companyId).price; },
  allOrders() { return COMPANIES.flatMap(c => this.orders(c.id)); },
  recentOrders(side, n) { return this.allOrders().filter(o => o.side === side).sort((a, b) => b.created - a.created).slice(0, n || 30); },
  myOrders() { return state.userOrders.slice().sort((a, b) => b.created - a.created); },
  myListingBids() { return state.userBids.slice().sort((a, b) => b.created - a.created); },
  listingBids(listingId) { return state.userBids.filter(b => b.listingId === listingId); },
  // ----- transactions -----
  transactions(companyId) { return this.company(companyId).transactions.concat(state.userTx.filter(t => t.companyId === companyId), (state.staffTx || []).filter(t => t.companyId === companyId)).sort((a, b) => b.ts - a.ts); },
  // ----- series -----
  series(obj, period) {
    const isIndex = obj === INDEX;
    const extra = isIndex ? [] : (state.pricePoints[obj.id] || []);
    if (period === '1D') return obj.intraday.concat(extra.filter(e => e.t > obj.intraday[0].t));
    const days = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365, '5Y': 1826, 'MAX': Infinity }[period];
    let h = obj.history.concat(extra);
    if (days === Infinity) return h;
    const cut = NOW_T - days * DAY; const s = h.filter(p => p.t >= cut); return s.length > 1 ? s : h.slice(-2);
  },
  change(obj, period) { const s = this.series(obj, period); const a = s[0].p, b = s[s.length - 1].p; return (b - a) / a; },
  mostActive(n) { return COMPANIES.map(c => ({ c, listings: this.liveListings(c.id).length, bids: this.liveBids(c.id).length })).sort((a, b) => (b.listings + b.bids) - (a.listings + a.bids)).slice(0, n || 6); },
  // ----- notifications -----
  notifications() {
    const gen = this.allOrders().filter(o => !o.mine).sort((a, b) => b.created - a.created).slice(0, 14).map(o => {
      const c = this.company(o.companyId);
      return o.side === 'listing' ? { text: `New ${c.name} ask ${o.id}`, ts: o.created } : { text: `A potential ${c.name} buyer has placed a new bid ${o.id}`, ts: o.created };
    });
    return state.notifications.concat(gen).sort((a, b) => b.ts - a.ts).slice(0, 20);
  },
  // ----- data room -----
  dataRoomAccess(companyId) { return !!state.dataRoomAccess[companyId]; },
  grantDataRoom(companyId) { state.dataRoomAccess[companyId] = Date.now(); const c = this.company(companyId); notify(`Data room access granted for ${c.name}. NDA accepted on file.`); save(); },
};
