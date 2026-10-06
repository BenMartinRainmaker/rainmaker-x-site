/* ==============================================================
   Rainmaker X · Data API · membership and requests
   Anyone can join; unverified members submit requests that convert to live orders on approval.
   Structured arrangements pipeline and accreditation renewal.
   ============================================================== */
'use strict';

Object.assign(Data, {
  // ----- membership + requests: anyone can join; unverified members submit requests that a representative works off the book -----
  canRequest() { return true; },
  setPhoto(url) { state.profile.photo = url || null; audit('profile.photo', url ? 'updated' : 'removed'); save(); },
  isVisitor() { return !!state.visitor; },
  signOut() { state.visitor = true; save(); },
  signIn() { state.visitor = false; save(); },
  requests() { state.requests = state.requests || []; return state.requests.slice().sort((a, b) => b.created - a.created); },
  // Unverified member submits an order request; a rep works it until compliance approves.
  submitRequest(req) {
    state.requests = state.requests || [];
    const c = req.companyId ? this.company(req.companyId) : null; const f = req.fundId ? this.fund(req.fundId) : null; const rep_ = this.rep(state.profile.rep);
    const r = Object.assign({ id: 'REQ-' + String(state.requests.length + 1).padStart(3, '0'), created: Date.now(), status: 'pending' }, req);
    const q = r.qty ? (+r.qty).toLocaleString() : '', px = r.price ? '$' + (+r.price).toFixed(2) : '';
    const fw = r.fill === 'aon' ? ' (all-or-none)' : r.fill === 'min' && r.minFill ? ` (min fill ${(+r.minFill).toLocaleString()})` : '';
    r.what = r.kind === 'ask' ? `ask for ${q} ${c.name} @ ${px}${fw}` : r.kind === 'bid' ? `bid for ${q} ${c.name} @ ${px}${fw}` : r.kind === 'custom' ? `custom ${r.spec.side === 'bid' ? 'bid' : 'ask'} on ${c.name} (${r.summary})` : r.kind === 'bid-on-ask' ? `bid of ${q} @ ${px} on ask ${r.orderId}` : r.kind === 'sell-into-bid' ? `sale of ${q} @ ${px} into bid ${r.orderId}` : r.kind === 'desk' ? `firm desk quote for ${q} ${c.name}` : r.kind === 'allocation' ? `allocation of $${(+r.amount).toLocaleString()} to ${f.name}` : r.kind === 'spv-buy' ? `purchase of ${q} ${f.name} units from Rainmaker @ ${px}` : r.kind === 'spv-sell' ? `sale of ${q} ${f.name} units back to Rainmaker @ ${px}` : r.kind === 'dataroom' ? `${c.name} data room access` : 'request';
    state.requests.push(r); audit('request.submit', `${r.id} ${r.what}`);
    notify(`Request ${r.id} received: ${r.what}. ${rep_.name} will work it off the book; it is placed automatically once your investor verification is approved.`);
    this.sendMessage({ companyId: c ? c.id : null, orderId: r.orderId || null, text: `Request ${r.id}: please work this ${r.what} for me while my investor verification is reviewed.${r.note ? ' ' + r.note : ''}` });
    save(); return r;
  },
  withdrawRequest(id) { const r = (state.requests || []).find(x => x.id === id); if (r && r.status === 'pending') { r.status = 'withdrawn'; save(); } },
  // On approval, place every pending request on the book as a live order.
  convertRequests() {
    if (!this.canTrade()) return 0; let n = 0;
    (state.requests || []).filter(r => r.status === 'pending' || r.status === 'approved').forEach(r => {
      try {
        let res = null;
        if (r.kind === 'bid' || r.kind === 'ask') res = this.placeOrder({ companyId: r.companyId, side: r.kind === 'ask' ? 'listing' : 'bid', price: r.price, qty: r.qty, transferType: r.transferType, shareType: r.shareType, days: r.days, fill: r.fill, minFill: r.minFill }).order.id;
        else if (r.kind === 'custom') { const out = this.placeCustomOrder(r.spec); res = out.private ? out.ioi.id : out.groupId; }
        else if (r.kind === 'bid-on-ask') { const o = this.bidOnListing(r.orderId, r.price, r.qty, r.days); res = o ? o.bid.id : null; }
        else if (r.kind === 'sell-into-bid') { this.sellIntoBid(r.orderId, r.price, r.qty); res = r.orderId; }
        else if (r.kind === 'allocation') { this.requestAllocation(r.fundId, r.amount); res = r.fundId; }
        else if (r.kind === 'spv-buy') { this.buySPV(r.fundId, r.qty); res = r.fundId; }
        else if (r.kind === 'spv-sell') { this.sellSPV(r.fundId, r.qty); res = r.fundId; }
        else if (r.kind === 'dataroom') { this.grantDataRoom(r.companyId); res = r.companyId; }
        else res = 'handled by desk';
        r.status = 'converted'; r.result = res; r.convertedAt = Date.now(); n++;
      } catch (e) { r.status = 'failed'; r.error = String(e); }
    });
    if (n) { notify(`${n} pending ${n === 1 ? 'request was' : 'requests were'} placed now that your verification is approved.`); save(); }
    return n;
  },
  // Create a brand-new unverified member (the "Join" flow).
  joinMember({ name, email, firm, selfType }) {
    const initials = name.split(/\s+/).map(x => x[0] || '').join('').slice(0, 2).toUpperCase() || 'RX';
    Object.assign(state.profile, { name, initials, email, firm: firm || '', investorType: selfType || null, verification: 'unverified', basis: [], memberSince: Date.now(), verifiedAt: null });
    state.account = null; state.needsAccount = true; state.acctSel = null; state.staffOrders = [];
    state.visitor = false; sessionStorage.removeItem(STAFF_KEY); state.negotiations = {}; state.audit = []; state.arrangements = []; state.watchlist = []; state.userOrders = []; state.userBids = []; state.requests = []; state.lots = []; state.userTx = []; state.settlements = []; state.iois = []; state.alerts = []; state.deskTrades = []; state.dataRoomAccess = {}; state.allocations = []; state.spvLots = []; state.spvInv = {}; state.spvSubs = []; state.messages = []; state.notifications = [];
    notify(`Welcome to Rainmaker X, ${name.split(' ')[0]}. You can browse every company, favorite them, set alerts, message ${this.rep(state.profile.rep).name} and submit requests right away. Complete investor verification to trade live on the book.`);
    save();
  },
  // ----- structured arrangements: options, forwards, SPVs, bids/asks with unusual terms (always structured by the rep / desk) -----
  ARRANGEMENT_TYPES: { option: 'Option contract', forward: 'Forward purchase / sale', spv: 'SPV', structured: 'Bid / ask with special terms', dp: 'DP interest', liquid: 'Liquid Security', own: 'Your own contract' },
  ARR_STAGES: ['submitted', 'structuring', 'term sheet', 'executed'],
  sigmaFor(c) { return Math.min(0.95, 0.32 + (c.vol || 0.8) * 0.3); },
  // Black-Scholes indicative premium for option contracts.
  optionPrice({ S, K, T, sigma, r = 0.04, type = 'call' }) {
    if (!(S > 0 && K > 0 && T > 0 && sigma > 0)) return 0;
    const N = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const dd = 0.3989423 * Math.exp(-x * x / 2); const p = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T)); const d2 = d1 - sigma * Math.sqrt(T);
    return type === 'call' ? S * N(d1) - K * Math.exp(-r * T) * N(d2) : K * Math.exp(-r * T) * N(-d2) - S * N(-d1);
  },
  arrangements() { state.arrangements = state.arrangements || []; return state.arrangements.filter(a => !a.clientId || a.clientId === 'you').sort((a, b) => b.created - a.created); },
  allArrangements() { state.arrangements = state.arrangements || []; return state.arrangements.slice().sort((a, b) => b.created - a.created); },
  // Open structured deals for the Market activity page: type, company, size and price only, never the client.
  marketArrangements() { return this.allArrangements().filter(a => ['submitted', 'structuring', 'term sheet'].includes(a.status) && a.companyId).map(a => ({ id: a.id, type: a.type, companyId: a.companyId, side: a.side || 'buy', qty: +a.qty || 0, price: +a.price || +a.strike || +a.fwdPrice || 0, created: a.created, status: a.status })); },
  // ----- accreditation renewal -----
  verificationExpiry() { return state.profile.verifiedAt ? state.profile.verifiedAt + RX_CONFIG.verification.validDays * DAY : null; },
  renewalDue() { const e = this.verificationExpiry(); return state.profile.verification === 'verified' && e != null && e - Date.now() < RX_CONFIG.verification.renewalNoticeDays * DAY; },
  recertify() { audit('verification.recertify', state.profile.investorType); Object.assign(state.profile, { verification: 'pending', submittedAt: Date.now(), recert: true }); notify('Re-certification submitted. Compliance reviews annual renewals within one business day; your access continues meanwhile.'); save(); },
});
