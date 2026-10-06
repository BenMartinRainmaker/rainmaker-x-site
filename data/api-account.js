/* ==============================================================
   Rainmaker X · Data API · portfolio and brokerage accounts
   Positions, valuations, one or more brokerage accounts with their own cash ledger,
   demo deposits / withdrawals, tax lots (FIFO) and holdings import.
   ============================================================== */
'use strict';

Object.assign(Data, {
  // ----- portfolio -----
  lots() { return (state.lots || []).concat(state.userTx.map(t => ({ companyId: t.companyId, qty: t.side === 'sell' ? -t.qty : t.qty, price: t.price, ts: t.ts }))); },
  // Price of a company at a past timestamp (nearest history point).
  priceAt(c, t) {
    const h = c.history; if (t >= h[h.length - 1].t) { const pp = state.pricePoints[c.id] || []; const later = pp.filter(p => p.t <= t); if (later.length) return later[later.length - 1].p; const intra = c.intraday.filter(p => p.t <= t); return intra.length ? intra[intra.length - 1].p : c.price; }
    const i = Math.max(0, Math.min(h.length - 1, Math.round((t - h[0].t) / DAY))); return h[i].p;
  },
  // Positions with current value and gain / loss, for one account or the primary.
  holdings(acct) {
    const by = {}; const lots = acct && !this.isPrimary(acct) ? this.lots().filter(l => l.account === acct.number) : this.lots();
    lots.forEach(l => { const o = by[l.companyId] || (by[l.companyId] = { companyId: l.companyId, qty: 0, cost: 0, first: l.ts }); if (l.qty > 0) { o.qty += l.qty; o.cost += l.qty * l.price; } else { const avg = o.qty ? o.cost / o.qty : l.price; o.qty += l.qty; o.cost += l.qty * avg; } o.first = Math.min(o.first, l.ts); });
    return Object.values(by).filter(o => o.qty > 0).map(o => { const c = this.company(o.companyId); const price = this.price(c.id); const value = o.qty * price; return { c, qty: o.qty, cost: o.cost, avgCost: o.cost / o.qty, price, value, gain: value - o.cost, gainPct: (value - o.cost) / o.cost, first: o.first }; }).sort((a, b) => b.value - a.value);
  },
  // Portfolio value over time for the account chart.
  portfolioSeries(period) {
    const lots = this.lots();
    const grid = period === '1D' ? INDEX.intraday.map(p => p.t) : this.series(INDEX, period).map(p => p.t);
    const first = Math.min(...lots.map(l => l.ts));
    const ts = grid.filter(t => t >= first - DAY); const use = ts.length > 1 ? ts : grid.slice(-2);
    const pts = use.map(t => { let v = 0; lots.forEach(l => { if (l.ts <= t) v += l.qty * this.priceAt(this.company(l.companyId), t); }); return { t, p: +v.toFixed(2) }; });
    if (period === '1D' || pts[pts.length - 1].t < NOW_T) { /* ensure last point is current */ const cur = lots.reduce((v, l) => v + l.qty * this.price(l.companyId), 0); pts[pts.length - 1] = { t: pts[pts.length - 1].t, p: +cur.toFixed(2) }; }
    return pts;
  },
  portfolioChange(period) { const s = this.portfolioSeries(period); return { abs: s[s.length - 1].p - s[0].p, pct: (s[s.length - 1].p - s[0].p) / (s[0].p || 1) }; },
  myActivity() { return state.userTx.slice().sort((a, b) => b.ts - a.ts); },
  // ----- brokerage account (introducing broker model: cash + positions tracked here, custody at transfer agent / SPV administrator) -----
  hasAccount() { return !state.needsAccount && !!this.account(); },
  ACCOUNT_STUB: { number: '—', type: 'No brokerage account yet', status: 'Not opened', opened: null, taxStatus: 'Not on file', bank: 'No bank linked', extras: [], movements: [] },
  // Open the first brokerage account (instant in the prototype) and seed its cash.
  openPrimaryAccount({ type, name, bank, taxStatus }) {
    const number = 'RX-' + (3000 + Math.floor(Math.random() * 900)) + '-' + (1000 + Math.floor(Math.random() * 9000));
    state.account = { number, type: type || 'Individual brokerage', name: name || '', status: 'Open · limited', opened: Date.now(), taxStatus: taxStatus || 'W-9 not yet on file', bank: bank || 'No bank linked', extras: [], movements: [] };
    state.needsAccount = false; audit('account.opened', number + ' · ' + (type || 'Individual brokerage'), 'client'); notify(`Brokerage account ${number} is open. Wire funds or link a bank to start bidding.`); save(); return state.account;
  },
  // The primary brokerage account record.
  account() {
    if (state.needsAccount) return this.ACCOUNT_STUB;
    if (!state.account) { state.account = { number: 'RX-2048-7719', type: 'Individual brokerage', status: 'Open', opened: NOW_T - 400 * DAY, taxStatus: 'W-9 on file', bank: 'JPMorgan Chase ···4410', extras: [], movements: [
      { id: 'mv-1', ts: NOW_T - 395 * DAY, type: 'deposit', amount: 400000, note: 'Initial wire · JPMorgan ···4410' },
      { id: 'mv-2', ts: NOW_T - 200 * DAY, type: 'deposit', amount: 150000, note: 'Wire in · JPMorgan ···4410' },
      { id: 'mv-3', ts: NOW_T - 60 * DAY, type: 'withdrawal', amount: 25000, note: 'Wire out · JPMorgan ···4410' } ] }; save(); }
    return state.account;
  },
  // Every account, primary first, closed ones included (they stay on record with a Closed status).
  accounts() { const a = this.account(); (a.extras || []).forEach(x => { if (!x.movements) x.movements = []; }); return [Object.assign({ primary: true }, a)].concat(a.extras || []); },
  openAccounts() { return this.accounts().filter(x => x.status !== 'Closed'); },
  // Filtered view of the accounts list for the Account page: keyword, status (open / closed / all) and type.
  filterAccounts({ q, status, type } = {}) { const has = v => !q || String(v || '').toLowerCase().includes(q.trim().toLowerCase()); return this.accounts().filter(x => (!status || status === 'all' || (status === 'closed' ? x.status === 'Closed' : x.status !== 'Closed')) && (!type || type === 'all' || x.type === type) && (has(x.number) || has(x.type) || has(x.name))); },
  currentAccount() { const all = this.openAccounts(); return all.find(x => x.number === state.acctSel) || all[0]; },
  // Switching, opening and closing accounts is for verified (accredited) investors only (Ben, Sep 30 2026).
  canManageAccounts() { return this.canTrade(); },
  selectAccount(number) { if (!this.canManageAccounts()) return { error: 'Complete investor verification to use more than one account.' }; const acc = this.openAccounts().find(x => x.number === number); if (!acc) return { error: 'That account is not open.' }; state.acctSel = number; save(); return {}; },
  isPrimary(acct) { return !acct || acct.number === this.account().number; },
  ACCOUNT_TYPES: ['Individual brokerage', 'Joint brokerage', 'Trust', 'LLC / entity', 'Self-directed IRA (via custodian)', 'SPV / fund vehicle'],
  openAccount({ type, name }) { if (!this.canManageAccounts()) return { error: 'Additional accounts are available to verified accredited investors. Complete investor verification first.' }; if (!this.ACCOUNT_TYPES.includes(type)) return { error: 'Choose an account type.' }; const a = this.account(); a.extras = a.extras || []; const acc = { number: 'RX-' + (2049 + a.extras.length) + '-' + String(1000 + Math.floor(Math.random() * 9000)), type, name: name || '', status: 'Open · limited', opened: Date.now(), taxStatus: a.taxStatus, bank: a.bank, movements: [] }; a.extras.push(acc); state.acctSel = acc.number; audit('account.opened', acc.number + ' · ' + type, 'client'); notify(`${type} account ${acc.number} is open (demo: opened instantly; in production compliance reviews new accounts within 2 business days). It has its own cash, positions and statements.`); save(); return acc; },
  // Close an additional account. The primary account cannot be closed here; an account with cash or positions must be emptied first.
  // Closed accounts stay on the list with a Closed status (books and records) and can no longer be selected.
  closeAccount(number, reason) {
    if (!this.canManageAccounts()) return { error: 'Complete investor verification to manage accounts.' };
    const acc = this.accounts().find(x => x.number === number); if (!acc) return { error: 'Account not found.' };
    if (acc.primary) return { error: 'Your primary account cannot be closed here. Contact your primary representative to close it.' };
    if (acc.status === 'Closed') return { error: 'That account is already closed.' };
    if (this.cashBalance(acc) > 0 || this.holdings(acc).length) return { error: 'Withdraw the cash and transfer the positions before closing this account.' };
    const real = (this.account().extras || []).find(x => x.number === number); Object.assign(real, { status: 'Closed', closedAt: Date.now(), closeReason: reason || '' });
    if (state.acctSel === number) state.acctSel = this.account().number;
    audit('account.closed', number + ' · ' + acc.type + (reason ? ' · ' + reason : ''), 'client'); notify(`${acc.type} account ${number} is closed. Statements stay available under your primary account.`); save(); return {};
  },
  // Cash movements newest first: deposits, withdrawals, trades, fees.
  cashLedger(acct) {
    const a = acct || this.account(); const primary = this.isPrimary(a);
    const rows = (a.movements || []).map(m => ({ ts: m.ts, kind: m.type === 'deposit' ? 'Deposit' : 'Withdrawal', amount: m.type === 'deposit' ? m.amount : -m.amount, note: m.note, pending: !!m.pending && Date.now() - m.ts < 60000 }));   // wires show as Pending for a minute, then as posted
    if (primary) state.userTx.forEach(t => { const c = this.company(t.companyId); const gross = t.price * t.qty; const fee = Math.max(this.FEES.brokerageMin, gross * this.FEES.rate(t.side));
      if (t.side === 'buy') rows.push({ ts: t.ts, kind: t.counterparty === 'desk' ? 'Buy (desk)' : 'Buy', amount: -(gross + fee + (c.policy.transferFee || 0)), note: `${t.qty.toLocaleString()} ${c.name} @ $${t.price.toFixed(2)} incl. fees`, companyId: c.id });
      else rows.push({ ts: t.ts, kind: t.counterparty === 'desk' ? 'Sell (desk)' : 'Sell', amount: gross - fee, note: `${t.qty.toLocaleString()} ${c.name} @ $${t.price.toFixed(2)} net of fees`, companyId: c.id }); });
    if (primary) this.spvSubs().forEach(x => { const f = this.fund(x.fundId); if (!f || !x.fundedAt) return; const what = `${x.units.toLocaleString()} ${f.name} units · subscription ${x.id}`;
      if (x.status === 'closed') rows.push({ ts: x.fundedAt, kind: 'Buy units', amount: -x.notional, note: `${what} @ $${x.price.toFixed(2)}, issued ${new Date(x.issuedAt).toLocaleDateString()}`, fundId: f.id });
      else { rows.push({ ts: x.fundedAt, kind: 'Escrow', amount: -x.notional, note: `${what} · held in escrow until Rainmaker issues the units`, fundId: f.id, pending: x.status === 'open' }); if (x.status !== 'open') rows.push({ ts: x.endedAt || x.fundedAt, kind: 'Refund', amount: x.notional, note: `${what} · escrow returned (${x.status})`, fundId: f.id }); } });
    if (primary) this.spvLots().forEach(l => { if (l.subId) return; const f = this.fund(l.fundId); if (!f) return; const gross = Math.abs(l.qty) * l.price;
      rows.push(l.qty > 0 ? { ts: l.ts, kind: 'Buy units', amount: -gross, note: `${l.qty.toLocaleString()} ${f.name} units from Rainmaker @ $${l.price.toFixed(2)}`, fundId: f.id } : { ts: l.ts, kind: 'Sell units', amount: gross, note: `${Math.abs(l.qty).toLocaleString()} ${f.name} units back to Rainmaker @ $${l.price.toFixed(2)}`, fundId: f.id }); });
    return rows.sort((x, y) => y.ts - x.ts);
  },
  cashBalance(acct) { return this.cashLedger(acct).reduce((s_, r) => s_ + r.amount, 0); },
  reservedCash(acct) { if (acct && !this.isPrimary(acct)) return 0; const bids = state.userOrders.filter(o => o.side === 'bid' && o.status === 'live').reduce((s_, o) => s_ + o.price * o.qty, 0); const lb = state.userBids.filter(b => b.status === 'live').reduce((s_, b) => s_ + b.price * b.qty, 0); const subs = this.openSpvSubs().filter(x => x.stage < 2).reduce((s_, x) => s_ + x.notional, 0); return bids + lb + subs; },   // SPV subscriptions reserve cash until escrow is funded
  buyingPower(acct) { return this.cashBalance(acct) - this.reservedCash(acct); },
  // The account a cash movement lands on: the number given, else the account being viewed (primary or an extra). Closed accounts refuse.
  _cashAccount(number) { const a = this.account(); const acc = !number || number === a.number ? a : (a.extras || []).find(x => x.number === number); if (!acc) return { error: 'Unknown account.' }; if (acc.status === 'Closed') return { error: 'That account is closed.' }; acc.movements = acc.movements || []; return acc; },
  // Deposit: the wire posts to the account at once (simulated) and counts toward cash and buying power immediately; the ledger shows it as Pending for a minute (Ben, Oct 5 2026: deposits must add to the cash balance).
  deposit(amount, number) { const amt = Math.round(+amount || 0); if (amt <= 0) return { error: 'Enter an amount to deposit.' }; const a = this._cashAccount(number); if (a.error) return a; audit('cash.deposit', '$' + amt.toLocaleString() + ' · ' + a.number); a.movements.push({ id: 'mv-' + Date.now().toString(36), ts: Date.now(), type: 'deposit', amount: amt, note: 'Wire in · ' + a.bank, pending: true }); save(); notify(`Deposit of $${amt.toLocaleString()} from ${a.bank} posted to ${a.number}. Cash balance now $${Math.round(this.cashBalance(a)).toLocaleString()}.`); return { amount: amt, balance: this.cashBalance(a), account: a.number }; },
  // Withdraw: limited to the account's available cash (cash minus reservations for open bids and unfunded subscriptions); the ledger shows it as Pending for a minute.
  withdraw(amount, number) { const amt = Math.round(+amount || 0); if (amt <= 0) return { error: 'Enter an amount to withdraw.' }; const a = this._cashAccount(number); if (a.error) return a; if (amt > this.buyingPower(a)) return { error: `That exceeds the available cash in ${a.number} ($${Math.round(this.buyingPower(a)).toLocaleString()}: cash minus what is reserved for open bids and subscriptions).` }; audit('cash.withdraw', '$' + amt.toLocaleString() + ' · ' + a.number); a.movements.push({ id: 'mv-' + Date.now().toString(36), ts: Date.now(), type: 'withdrawal', amount: amt, note: 'Wire out · ' + a.bank, pending: true }); save(); notify(`Withdrawal of $${amt.toLocaleString()} to ${a.bank} taken from ${a.number}. Cash balance now $${Math.round(this.cashBalance(a)).toLocaleString()}.`); return { amount: amt, balance: this.cashBalance(a), account: a.number }; },
  statements() { const out = []; const d = new Date(NOW_T); for (let i = 0; i < 6; i++) { const m = new Date(d.getFullYear(), d.getMonth() - i - 1, 1); out.push({ id: 'st-' + i, label: m.toLocaleString('en-US', { month: 'long', year: 'numeric' }) + ' statement', ts: new Date(m.getFullYear(), m.getMonth() + 1, 3).getTime() }); } return out; },
  ACCOUNT_DOCS: ['Customer account agreement', 'Form CRS · relationship summary', 'Accredited investor certification', 'W-9 · tax certification', 'Privacy notice', 'Private securities risk disclosure'],
  // ----- tax lots and realized gains (FIFO) -----
  taxLots() {
    const buys = (state.lots || []).map(l => Object.assign({}, l)).concat(state.userTx.filter(t => t.side !== 'sell').map(t => ({ companyId: t.companyId, qty: t.qty, price: t.price, ts: t.ts }))).sort((a, b) => a.ts - b.ts);
    const sells = state.userTx.filter(t => t.side === 'sell').map(t => ({ companyId: t.companyId, qty: t.qty, price: t.price, ts: t.ts })).sort((a, b) => a.ts - b.ts);
    const realized = [];
    sells.forEach(sl => { let rem = sl.qty; for (const b of buys) { if (rem <= 0) break; if (b.companyId !== sl.companyId || b.qty <= 0) continue; const q = Math.min(rem, b.qty); realized.push({ companyId: sl.companyId, qty: q, proceeds: q * sl.price, cost: q * b.price, gain: q * (sl.price - b.price), term: sl.ts - b.ts > 365 * DAY ? 'Long' : 'Short', ts: sl.ts, acquired: b.ts }); b.qty -= q; rem -= q; } });
    const open = buys.filter(b => b.qty > 0).map(b => { const c = this.company(b.companyId); if (!c) return null; const px = this.price(c.id); return { c, qty: b.qty, price: b.price, ts: b.ts, value: b.qty * px, cost: b.qty * b.price, gain: b.qty * (px - b.price), term: Date.now() - b.ts > 365 * DAY ? 'Long' : 'Short', longOn: b.ts + 365 * DAY }; }).filter(Boolean);
    return { open, realized: realized.filter(r => this.company(r.companyId)) };
  },
  // ----- imports -----
  importWatchlist(text) { const tokens = String(text || '').split(/[\n,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean); const added = [], unknown = []; tokens.forEach(t => { const c = COMPANIES.find(x => x.ticker.toLowerCase() === t || x.name.toLowerCase() === t || x.name.toLowerCase().startsWith(t)); if (!c) unknown.push(t); else if (!state.watchlist.includes(c.id)) { state.watchlist.push(c.id); added.push(c.name); } }); audit('watchlist.import', added.length + ' added'); save(); return { added, unknown }; },
  importHoldings(text) { const rows = String(text || '').split(/\n+/).map(x => x.trim()).filter(Boolean); const added = [], bad = []; rows.forEach(r => { const p = r.split(/[\t,;]+/).map(x => x.trim()); const c = COMPANIES.find(x => x.ticker.toLowerCase() === (p[0] || '').toLowerCase() || x.name.toLowerCase() === (p[0] || '').toLowerCase()); const qty = +String(p[1] || '').replace(/[^0-9.]/g, ''), cost = +String(p[2] || '').replace(/[^0-9.]/g, ''); if (!c || !(qty > 0) || !(cost > 0)) { bad.push(r); return; } state.lots = state.lots || []; state.lots.push({ companyId: c.id, qty, price: cost, ts: p[3] && !isNaN(Date.parse(p[3])) ? Date.parse(p[3]) : Date.now(), imported: true }); added.push(`${qty.toLocaleString()} ${c.name}`); }); audit('holdings.import', added.length + ' lots'); if (added.length) notify(`${added.length} position${added.length === 1 ? '' : 's'} imported. Positions are recorded as transferred-in until the transfer agent confirms.`); save(); return { added, bad }; },
});
