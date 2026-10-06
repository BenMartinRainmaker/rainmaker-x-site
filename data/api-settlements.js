/* ==============================================================
   Rainmaker X · Data API · settlements
   Settlement tracker (signatures, broker fee, escrow, close), per-deal fees, who owns an order,
   closing records and settlement documents.
   ============================================================== */
'use strict';

Object.assign(Data, {
  // ----- settlements -----
  // The broker (Rainmaker) has BOTH the buyer and the seller sign the contract, then collects the broker fee (3% buy side, 2% sell side,
  // adjustable per deal), before funds move and shares transfer. `parties` records each signature and the fee payment separately.
  SETTLE_STEPS: { market: ['Terms agreed', 'Company notified / ROFR window', 'Contract signed by buyer and seller', 'Broker fees paid', 'Funds wired to escrow', 'Closed and shares transferred'], desk: ['Terms agreed with desk', 'Contract signed by buyer and seller', 'Broker fee paid', 'Funds settled', 'Closed and shares transferred'] },
  SETTLE_SIGN: { market: 2, desk: 1 }, SETTLE_FEE: { market: 3, desk: 2 },
  settleKind(st) { return st.counterparty === 'desk' ? 'desk' : 'market'; },
  settleSteps(st) { return this.SETTLE_STEPS[this.settleKind(st)]; },
  settlementDone(st) { return st.stage >= this.settleSteps(st).length - 1; },
  settlementStatus(st) { return this.settlementDone(st) ? 'Complete' : 'In progress'; },
  settlements() { return state.settlements.slice().sort((a, b) => b.ts - a.ts); },   // the member's own
  allSettlements() { return state.settlements.concat(state.staffSettlements || []).sort((a, b) => b.ts - a.ts); },   // every party (staff)
  settlement(id) { return state.settlements.concat(state.staffSettlements || []).find(s_ => s_.id === id || s_.txId === id); },
  settlementFees(st) { const f = st.fees || {}; const buyRate = f.buy != null ? +f.buy : this.FEES.buy; const sellRate = f.sell != null ? +f.sell : this.FEES.sell; const buy = Math.max(this.FEES.brokerageMin, st.gross * buyRate), sell = Math.max(this.FEES.brokerageMin, st.gross * sellRate); return { buyRate, sellRate, buy, sell, total: buy + sell, custom: f.buy != null || f.sell != null, paidAt: (st.parties || {}).fees || null }; },
  setSettlementFees(id, buyRate, sellRate) { if (!this.isStaff()) return { error: 'Staff only' }; const st = this.settlement(id); if (!st) return { error: 'Not found' }; const b = Math.max(0, Math.min(0.2, +buyRate || 0)), s_ = Math.max(0, Math.min(0.2, +sellRate || 0)); st.fees = { buy: b, sell: s_ }; audit('settlement.fees', `${st.id} · buy ${(b * 100).toFixed(2)}% · sell ${(s_ * 100).toFixed(2)}%`, 'staff:' + this.role()); save(); return { fees: this.settlementFees(st) }; },
  _settleTo(st, idx) { while (st.stage < idx) { st.stage++; if (!st.steps[st.stage]) st.steps[st.stage] = Date.now(); } },
  // what = 'buyer' | 'seller' (contract signature) | 'fees' (broker fee received). The tracker advances once both sides have signed / the fee is in.
  settlementMark(id, what) { const st = this.settlement(id); if (!st || !['buyer', 'seller', 'fees'].includes(what)) return; st.parties = st.parties || {}; if (st.parties[what]) return; const kind = this.settleKind(st); st.parties[what] = Date.now();
    if (what === 'fees') { if (!st.parties.buyer) st.parties.buyer = Date.now(); if (!st.parties.seller) st.parties.seller = Date.now(); this._settleTo(st, this.SETTLE_FEE[kind]); } else if (st.parties.buyer && st.parties.seller) this._settleTo(st, this.SETTLE_SIGN[kind]);
    const c = this.company(st.companyId); const label = what === 'fees' ? 'broker fee received' : `contract signed by the ${what}`; audit('settlement.' + what, st.id, this.isStaff() ? 'staff:' + this.role() : 'client'); notify(`${c.name} settlement ${st.id.slice(-6).toUpperCase()}: ${label}.`); save(); },
  advanceSettlement(id) { const st = this.settlement(id); if (!st) return; const steps = this.settleSteps(st); const kind = this.settleKind(st); if (st.stage < steps.length - 1) { st.stage++; st.steps[st.stage] = Date.now(); st.parties = st.parties || {}; if (st.stage >= this.SETTLE_SIGN[kind]) { st.parties.buyer = st.parties.buyer || Date.now(); st.parties.seller = st.parties.seller || Date.now(); } if (st.stage >= this.SETTLE_FEE[kind]) st.parties.fees = st.parties.fees || Date.now(); const c = this.company(st.companyId); if (this.isStaff()) audit('settlement.advance', st.id + ' · ' + steps[st.stage], 'staff:' + this.role()); notify(`${c.name} settlement ${st.id.slice(-6).toUpperCase()}: ${steps[st.stage]}`); save(); } },
  // ----- who owns what (rep assignment, client behind an order) -----
  // Generated orders belong to sample clients; the assignment is deterministic so filters are stable between reloads.
  assignedRep(o) { if (!o) return state.profile.rep; if (o.mine || o.you || o.clientId === 'you') return state.profile.rep; if (o.rep) return o.rep; return o.id ? this.orderClient(o).rep : REPS[hashStr(String(o.companyId || '')) % 5].id; },
  orderClient(o) { if (o.mine || o.clientId === 'you') return { id: 'you', name: state.profile.name, you: true, rep: state.profile.rep }; if (o.clientId) { const k = this.client(o.clientId); if (k) return { id: k.id, name: k.name, rep: k.rep }; } const others = this.CLIENTS.slice(1).map((c, i) => Object.assign({ id: 'c' + (i + 1) }, c)).filter(c => c.status === 'verified'); const cl = others[hashStr(String(o.id) + ':client') % others.length]; return { id: cl.id, name: cl.name, rep: cl.rep }; },
  // Settlement status for any order: real settlement for the member's own trades, otherwise derived from the match date and the company's settlement time.
  orderSettlement(o) { return o.txId ? this.settlement(o.txId) || null : null; },
  orderCloseRecord(o) { if (!['sold', 'completed'].includes(o.status)) return null; const c = this.company(o.companyId); const st = this.orderSettlement(o); const side = o.side === 'listing' ? 'sell' : 'buy'; const gross = (o.soldQty || o.qty) * o.price;
    if (st) { const f = this.settlementFees(st); return { status: this.settlementStatus(st), matchedAt: st.ts, settledAt: this.settlementDone(st) ? (st.steps[this.settleSteps(st).length - 1] || st.ts) : null, expectedAt: st.ts + (st.counterparty === 'desk' ? 3 : c.policy.settleDays) * DAY, gross, fee: side === 'sell' ? f.sell : f.buy, feeRate: side === 'sell' ? f.sellRate : f.buyRate, settlement: st }; }
    const matchedAt = o.created + ((hashStr(String(o.id)) % 9) + 1) * DAY; const settledAt = matchedAt + c.policy.settleDays * DAY; const done = settledAt <= NOW_T; const rate = this.FEES.rate(side);
    return { status: done ? 'Complete' : 'In progress', matchedAt, settledAt: done ? settledAt : null, expectedAt: settledAt, gross, fee: Math.max(this.FEES.brokerageMin, gross * rate), feeRate: rate, settlement: null }; },
  orderSettleStatus(o) { const r = this.orderCloseRecord(o); return r ? r.status : null; },
  // ----- settlement documents -----
  SETTLE_DOCS: { market: [{ name: 'Term sheet', stage: 0, sign: true }, { name: 'Company transfer notice', stage: 1, sign: false }, { name: 'ROFR waiver / company approval', stage: 1, sign: false }, { name: 'Stock transfer agreement', stage: 2, sign: true }, { name: 'Broker fee invoice', stage: 3, sign: false }, { name: 'Wire confirmation', stage: 4, sign: false }, { name: 'Closing statement', stage: 5, sign: false }], desk: [{ name: 'Desk trade confirmation', stage: 0, sign: true }, { name: 'Stock transfer agreement', stage: 1, sign: true }, { name: 'Broker fee invoice', stage: 2, sign: false }, { name: 'Wire confirmation', stage: 3, sign: false }, { name: 'Closing statement', stage: 4, sign: false }] },
  settlementDocs(st) { const defs = this.SETTLE_DOCS[st.counterparty === 'desk' ? 'desk' : 'market']; const signed = st.docs || {}; return defs.map(d => { const ready = st.stage >= d.stage; const s = signed[d.name]; return Object.assign({}, d, { ready, signedAt: s || null, status: !ready ? 'Not yet' : d.sign ? (s ? 'Signed' : 'Awaiting your signature') : (st.stage > d.stage || s ? 'On file' : 'In progress') }); }); },
  signDoc(stId, name) { const st = this.settlement(stId); if (!st) return; st.docs = st.docs || {}; st.docs[name] = Date.now(); audit('settlement.sign', `${stId} · ${name}`); notify(`${name} signed for settlement ${stId.slice(-6).toUpperCase()}.`); save(); },
});
