/* ==============================================================
   Rainmaker X · Data API · staff and back office
   Rep desk, recording orders for clients, roles and permissions, compliance forms,
   verification queue, request / order review and company administration.
   ============================================================== */
'use strict';

Object.assign(Data, {
  // ----- rep desk -----
  CLIENTS: [
    { name: 'Martin Family Office', type: 'accredited', status: 'verified', rep: 'rep-2', aum: 1.54e6 }, { name: 'Halcyon Capital Partners', type: 'qib', status: 'verified', rep: 'rep-1', aum: 42e6 }, { name: 'Northbridge Endowment', type: 'institution', status: 'verified', rep: 'rep-4', aum: 118e6 },
    { name: 'J. Alvarez', type: 'accredited', status: 'pending', rep: 'rep-3', aum: 0 }, { name: 'Crestline Secondaries', type: 'qib', status: 'verified', rep: 'rep-1', aum: 260e6 }, { name: 'S. Ibrahim', type: 'accredited', status: 'unverified', rep: 'rep-5', aum: 0 },
    { name: 'Lakeside Ventures GP', type: 'institution', status: 'pending', rep: 'rep-4', aum: 0 }, { name: 'R. Chen', type: 'accredited', status: 'verified', rep: 'rep-2', aum: 820000 },
  ],
  // ----- staff: record an order for a client (rep took it by phone / email). Bids and asks go straight onto the book as live orders;
  // options, forwards and special-terms deals are recorded as live structured deals in the desk pipeline (term sheet stage).
  RECORD_KINDS: { bid: 'Bid', ask: 'Ask', option: 'Option contract', forward: 'Forward', structured: 'Bid / ask with special terms', spv: 'SPV', dp: 'DP interest', liquid: 'Liquid Security' },
  // Staff records an order a client gave by phone / email. Bids and asks go live on the book; structured kinds become live arrangements.
  recordOrder(spec) {
    const role = this.role(); if (role === 'client') return { error: 'Staff only.' };
    const by = 'staff:' + role; const c = this.company(spec.companyId); if (!c) return { error: 'Choose a company.' };
    const cl = this.client(spec.clientId) || this.client('you'); const qty = +spec.qty || 0, price = +spec.price || 0; const now = Date.now();
    const rec = { by, ts: now, note: spec.note || '' };
    if (spec.kind === 'bid' || spec.kind === 'ask') {
      if (!(qty > 0 && price > 0)) return { error: 'Shares and price are required.' };
      const side = spec.kind === 'ask' ? 'listing' : 'bid';
      if (cl.you) {
        const { order, match } = this.placeOrder({ companyId: c.id, side, price, qty, transferType: spec.transferType, shareType: spec.shareType, days: spec.days, fill: spec.fill, minFill: spec.minFill, silent: true });
        order.recorded = rec; audit('order.record', `${order.id} ${spec.kind} ${qty.toLocaleString()} ${c.name} @ $${price.toFixed(2)} for ${cl.name}`, by);
        notify(`${this.rep(cl.rep).name} recorded your ${spec.kind} for ${qty.toLocaleString()} ${c.name} @ $${price.toFixed(2)}. It is live on the book as ${order.id}.`); save();
        return { id: order.id, href: '#/order/' + order.id, match };
      }
      state.staffOrders = state.staffOrders || [];
      const id = c.ticker + '-S' + String(state.staffOrders.length + 1).padStart(2, '0');
      const o = { id, companyId: c.id, side, price, qty, created: now, expires: now + (+spec.days || 30) * DAY, status: 'live', transferType: spec.transferType || 'Direct', shareType: spec.shareType || 'Common', fill: this.FILL_RULES[spec.fill] ? spec.fill : 'partial', minFill: spec.fill === 'min' ? +spec.minFill || 0 : 0, bidsCount: 0, mine: false, clientId: cl.id, rep: cl.rep, recorded: rec };
      state.staffOrders.push(o); audit('order.record', `${id} ${spec.kind} ${qty.toLocaleString()} ${c.name} @ $${price.toFixed(2)} for ${cl.name}`, by);
      const match = this._crossOrder(o);   // a recorded order crosses the book like any other, e.g. against the member's ask
      save(); return { id, href: '#/order/' + id, match };
    }
    state.arrangements = state.arrangements || [];
    const T = this.ARRANGEMENT_TYPES[spec.kind] || 'Structured deal'; const q = qty ? qty.toLocaleString() : ''; const sideWord = spec.side === 'sell' ? 'sell' : 'buy';
    let what = `${T} on ${c.name}`; const a = { id: 'ARR-' + String(state.arrangements.length + 1).padStart(3, '0'), type: spec.kind, companyId: c.id, created: now, status: 'term sheet', clientId: cl.id, rep: cl.rep, recorded: rec, qty, side: spec.side || 'buy', note: spec.note || '', history: [{ ts: now, status: 'recorded', by }, { ts: now, status: 'term sheet', by }] };
    if (spec.kind === 'option') { a.optType = spec.optType || 'call'; a.strike = +spec.strike || price; a.months = +spec.months || 12; a.premium = price; what = `${sideWord} ${a.optType} option on ${q} ${c.name} · strike $${a.strike.toFixed(2)} · ${a.months} months${price ? ' · premium $' + price.toFixed(2) + '/sh' : ''}`; }
    else if (spec.kind === 'forward') { a.fwdPrice = price; a.months = +spec.months || 6; what = `forward ${sideWord} of ${q} ${c.name} @ $${price.toFixed(2)} settling in ${a.months} months`; }
    else if (spec.kind === 'structured') { a.price = price; what = `${sideWord === 'sell' ? 'ask' : 'bid'} with special terms: ${q} ${c.name} @ $${price.toFixed(2)}${spec.terms ? ' · ' + spec.terms : ''}`; }
    else if (spec.kind === 'spv') { a.amount = qty * price || +spec.amount || 0; a.price = price; what = `SPV ${sideWord === 'sell' ? 'exit' : 'entry'} on ${c.name}${q ? ' · ' + q + ' units' : ''}${price ? ' @ $' + price.toFixed(2) : ''}`; }
    else if (spec.kind === 'dp') { a.price = price; what = `DP interest in ${c.name}${q ? ' · ' + q + ' shares' : ''}${price ? ' @ $' + price.toFixed(2) : ''}`; }
    else if (spec.kind === 'liquid') { a.price = price; what = `Liquid Security on ${q} ${c.name}${price ? ' · reference $' + price.toFixed(2) : ''}`; }
    if (spec.terms && spec.kind !== 'structured') what += ' · ' + spec.terms;
    a.what = what; state.arrangements.push(a); audit('order.record', `${a.id} ${what} for ${cl.name}`, by);
    if (cl.you) notify(`${this.rep(cl.rep).name} recorded a ${T.toLowerCase()} for you: ${what}. It is live with the desk at term-sheet stage.`);
    save(); return { id: a.id, href: '#/admin/requests' };
  },
  arrangement(id) { return (state.arrangements || []).find(a => a.id === id); },
  // Member submits a structured deal (option, forward, SPV, special terms, DP, liquid, own) to the desk.
  submitArrangement(spec) {
    state.arrangements = state.arrangements || [];
    const c = spec.companyId ? this.company(spec.companyId) : null; const rep_ = this.rep(state.profile.rep);
    const a = Object.assign({ id: 'ARR-' + String(state.arrangements.length + 1).padStart(3, '0'), created: Date.now(), status: 'submitted', history: [{ ts: Date.now(), status: 'submitted', by: 'client' }] }, spec);
    state.arrangements.push(a); audit('arrangement.submit', `${a.id} ${a.what}`);
    notify(`${this.ARRANGEMENT_TYPES[a.type]} request ${a.id} received: ${a.what}. ${rep_.name} and the desk will structure it and come back with a term sheet.`);
    this.sendMessage({ companyId: c ? c.id : null, text: `${this.ARRANGEMENT_TYPES[a.type]} request ${a.id}: ${a.what}.${a.note ? ' ' + a.note : ''} Please structure this and send me a term sheet.` });
    save(); return a;
  },
  withdrawArrangement(id) { const a = this.arrangement(id); if (a && a.status !== 'executed') { a.status = 'withdrawn'; a.history.push({ ts: Date.now(), status: 'withdrawn', by: 'client' }); audit('arrangement.withdraw', id); save(); } },
  // Staff moves an arrangement to the next pipeline stage.
  advanceArrangement(id, status, note) {
    const a = this.arrangement(id); if (!a) return; const c = a.companyId ? this.company(a.companyId) : null;
    a.status = status; a.staffNote = note || a.staffNote || ''; a.history.push({ ts: Date.now(), status, by: this.role(), note: note || '' });
    audit('arrangement.' + status.replace(' ', '-'), id + (note ? ' · ' + note : ''), 'staff:' + this.role());
    const msg = { structuring: `${a.id} is being structured by the desk. Expect a term sheet within two business days.`, 'term sheet': `Term sheet issued for ${a.id}${note ? ': ' + note : ''}. Review it under My Orders → Arrangements and reply to your primary representative to execute.`, executed: `${a.id} executed${c ? ' on ' + c.name : ''}. Documents and settlement details are in your account.`, declined: `${a.id} was declined${note ? ': ' + note : ''}.` }[status];
    if (msg) { notify(msg); this.sendMessage({ companyId: c ? c.id : null, text: msg, from: 'rep' }); }
    if (status === 'executed' && a.type === 'spv' && a.mode === 'join' && a.fundId) { this.requestAllocation(a.fundId, a.amount); }
    save();
  },
  DISCLOSURE_VERSION: '2026-09',
  DISCLOSURES: ['Rainmaker Securities, LLC acts as agent and, when the desk quotes you, as principal. Brokerage fee 3% for buyers and 2% for sellers (min $500), adjustable per deal, plus any company transfer fee, shown before you submit.', 'The RX price is an indicative estimate blended from confirmed transactions and the bid/ask midpoint. It is not a quote, a valuation opinion or a guarantee of execution.', 'Private securities are illiquid, may be subject to company approval and rights of first refusal, and can lose all value. You have read the Form CRS and the private securities risk disclosure.'],
  auditLog() { return (state.audit || []).slice(); },
  // ----- roles: client vs authorized staff (representative / compliance / admin) -----
  ROLES: { client: 'Client', rep: 'Representative', compliance: 'Compliance', admin: 'Admin' },
  STAFF_PERMS: { rep: ['desk', 'requests', 'clients', 'inbox', 'settlements', 'matches', 'orders.view', 'orders.edit'], compliance: ['desk', 'verifications', 'forms', 'requests', 'clients', 'inbox', 'settlements', 'matches', 'orders.view', 'orders.edit', 'orders.remove', 'audit'], admin: ['desk', 'verifications', 'forms', 'requests', 'clients', 'inbox', 'settlements', 'matches', 'orders.view', 'orders.edit', 'orders.remove', 'audit', 'companies', 'users'] },
  role() { const s_ = staffSession(); return s_ ? s_.role : 'client'; },
  isStaff() { return this.role() !== 'client'; },
  can(perm) { const r = this.role(); return r !== 'client' && (this.STAFF_PERMS[r] || []).includes(perm); },
  STAFF_IDLE_MS: STAFF_IDLE,
  // Passcode gate: compare the hash, start a session in sessionStorage, audit either way.
  staffSignIn(role, passcode) {
    if (!this.ROLES[role] || role === 'client') return { error: 'Unknown role.' };
    if (hash53(String(passcode || '').trim().toLowerCase()) !== STAFF_PASS_HASH) { audit('staff.denied', role + ' · wrong passcode', 'anonymous'); save(); return { error: 'That passcode is not right. Attempts are recorded.' }; }
    sessionStorage.setItem(STAFF_KEY, JSON.stringify({ role, started: Date.now(), last: Date.now() })); audit('staff.signin', role, 'staff:' + role); save(); return {};
  },
  staffSwitch(role) { const s_ = readStaff(); if (!s_ || !this.ROLES[role] || role === 'client') return { error: 'Sign in as staff first.' }; audit('staff.switch', s_.role + ' → ' + role, 'staff:' + s_.role); sessionStorage.setItem(STAFF_KEY, JSON.stringify({ role, started: s_.started, last: Date.now() })); save(); return {}; },
  staffLock(reason) { const s_ = readStaff(); sessionStorage.removeItem(STAFF_KEY); if (s_ && s_.role) { audit('staff.lock', s_.role + (reason ? ' · ' + reason : ''), 'staff:' + s_.role); save(); } },
  touchStaff() { const s_ = staffSession(); if (s_) { s_.last = Date.now(); sessionStorage.setItem(STAFF_KEY, JSON.stringify(s_)); } },
  staffRemaining() { const s_ = staffSession(); return s_ ? Math.max(0, STAFF_IDLE - (Date.now() - s_.last)) : 0; },
  accessDenied(what) { audit('access.denied', what, this.isVisitor() ? 'visitor' : 'client'); save(); },
  setRole(r) { if (r === 'client') this.staffLock('switched to client view'); },
  // ---------------- compliance forms ----------------
  FORM_KINDS: { acc: 'Accredited investor certification', kyc: 'KYC / AML screening', w9: 'W-9 tax certification', sub: 'Subscription agreement', ts: 'Term sheet sign-off', stp: 'Stock transfer paperwork' },
  // Derive every compliance form (accreditation, KYC, W-9, subscription, term sheet, transfer) from the records, with any saved decision.
  forms() {
    const rv = state.formReviews || {}; const list = []; const me = this.clientsList()[0];
    const push = (id, f, seedApproved) => { const r = rv[id]; const base = Object.assign({ id, status: seedApproved ? 'Approved' : 'Awaiting review', reviewedAt: seedApproved ? f.submitted + DAY : null, by: seedApproved ? 'compliance' : null, note: '' }, f); if (r) Object.assign(base, { status: r.status, reviewedAt: r.ts, note: r.note || '', by: r.by }); list.push(base); };
    this.clientsList().forEach(c => {
      if (c.status === 'unverified') return; const ok = c.status === 'verified' && !c.you || (c.you && state.profile.verifiedAt && !state.profile.recert); const sub = c.submittedAt || NOW_T - 6 * DAY;
      push('acc-' + c.id, { kind: 'acc', client: c, submitted: sub, detail: `${this.INVESTOR_TYPES[c.type] || c.type} · basis: ${(c.basis || []).join(', ') || 'n/a'}${c.firm ? ' · ' + c.firm : ''}`, href: c.you ? '#/admin/verifications' : '#/client/' + c.id }, ok);
      push('kyc-' + c.id, { kind: 'kyc', client: c, submitted: sub, detail: `Identity, sanctions and PEP screening for ${c.name}`, href: '#/client/' + c.id }, ok);
      push('w9-' + c.id, { kind: 'w9', client: c, submitted: sub + 3600e3, detail: `Tax certification on file for ${c.email}`, href: '#/client/' + c.id }, ok);
    });
    (state.allocations || []).forEach((a, i) => { const f = this.fund(a.fundId); if (f) push('sub-' + i, { kind: 'sub', client: me, submitted: a.ts, detail: `${f.name} · $${(+a.amount).toLocaleString()}`, href: '#/fund/' + f.id }, false); });
    this.arrangements().filter(a => ['term sheet', 'executed'].includes(a.status)).forEach(a => push('ts-' + a.id, { kind: 'ts', client: me, submitted: (a.history.find(h => h.status === 'term sheet') || a.history[a.history.length - 1]).ts, detail: `${this.ARRANGEMENT_TYPES[a.type]} ${a.id} · ${a.what}`, href: '#/admin/requests' }, a.status === 'executed'));
    this.settlements().forEach(x => { const c = this.company(x.companyId); if (!c) return; const done = x.stage >= this.SETTLE_STEPS[x.counterparty === 'desk' ? 'desk' : 'market'].length - 1; push('stp-' + x.id, { kind: 'stp', client: me, submitted: x.ts, detail: `${c.name} · ${x.side === 'buy' ? 'buy' : 'sell'} ${(+x.qty).toLocaleString()} @ $${(+x.price).toFixed(2)}`, href: '#/order/' + (x.txId || x.id) }, done); });
    const rank = { 'Awaiting review': 0, 'Returned': 1, 'Approved': 2 };
    return list.sort((a, b) => rank[a.status] - rank[b.status] || b.submitted - a.submitted);
  },
  formsPending() { return this.forms().filter(f => f.status === 'Awaiting review').length; },
  reviewForm(id, decision, note) { if (!this.can('forms')) return { error: 'Not permitted' }; state.formReviews = state.formReviews || {}; state.formReviews[id] = { status: decision === 'approve' ? 'Approved' : decision === 'reopen' ? 'Awaiting review' : 'Returned', ts: Date.now(), note: note || '', by: this.role() }; audit('form.' + decision, id + (note ? ' · ' + note : ''), 'staff:' + this.role()); save(); return {}; },
  // ----- verification queue (compliance) -----
  clientsList() {
    const me = state.profile; const st = state.clientStatus || {};
    const mine = { id: 'you', name: me.name, type: me.investorType || 'accredited', status: me.verification, rep: me.rep, aum: this.holdings().reduce((s_, h) => s_ + h.value, 0), submittedAt: me.submittedAt, basis: me.basis || [], firm: me.firm, email: me.email, you: true, cash: this.cashBalance(), liveOrders: state.userOrders.filter(o => o.status === 'live').length, requests: (state.requests || []).filter(r => r.status === 'pending').length };
    const rov = state.repOverride || {};
    const others = this.CLIENTS.slice(1).map((c, i) => Object.assign({ id: 'c' + (i + 1), email: c.name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', submittedAt: NOW_T - (3 + i) * DAY, basis: ['income'], cash: c.aum * 0.08, liveOrders: Math.floor(c.aum / 5e6) % 6, requests: c.status === 'unverified' ? 1 : 0 }, c, st[c.name] ? { status: st[c.name].status, reviewedAt: st[c.name].ts, note: st[c.name].note } : {}, rov['c' + (i + 1)] ? { rep: rov['c' + (i + 1)] } : {}));
    return [mine].concat(others);
  },
  client(id) { return this.clientsList().find(c => c.id === id); },
  INVESTOR_FILTERS: RX_CONFIG.investorFilters,
  ORDER_VALUE_BUCKETS: RX_CONFIG.orderValueBuckets,
  // Select options for the order-value filter.
  valueOpts() { return this.ORDER_VALUE_BUCKETS.map(b => [b[0], b[1]]); },
  // Does an order's total (shares × price) fall in the chosen value bucket? Unknown bucket = everything.
  inValueBucket(total, key) { const b = this.ORDER_VALUE_BUCKETS.find(x => x[0] === key); if (!b || key === 'all') return true; const v = +total || 0; return v >= b[2] && (b[3] === Infinity || v < b[3]); },
  // Investor class of a client for the Orders filters (Ben, Oct 1 2026): type (accredited / qib / institution), verification status and
  // whether they count as a qualified investor (verified, any of the three types). Unknown clients are treated as unverified.
  investorClass(clientId) { const k = this.client(clientId); const type = k ? k.type || 'accredited' : 'accredited'; const status = k ? k.status : 'unverified'; return { type, status, qualified: status === 'verified', institutional: status === 'verified' && (type === 'institution' || type === 'qib') }; },
  // Does this client pass the investor-class filter (keys from RX_CONFIG.investorFilters)?
  investorMatches(clientId, filter) { if (!filter || filter === 'all') return true; const ic = this.investorClass(clientId); if (filter === 'qualified') return ic.qualified; if (filter === 'institution') return ic.institutional; if (filter === 'accredited') return ic.qualified && ic.type === 'accredited'; if (filter === 'unverified') return !ic.qualified; return true; },
  // ----- primary representative (Ben, Sep 30 2026): every member has one; a change is proposed by the member or an admin and the
  // representative approves or denies being that member's primary. Nothing changes until the rep says yes. -----
  repRequests() { state.repRequests = state.repRequests || []; return state.repRequests.slice().sort((a, b) => b.ts - a.ts); },
  pendingRepRequests() { return this.repRequests().filter(r => r.status === 'pending'); },
  repRequestFor(clientId) { return this.pendingRepRequests().find(r => r.clientId === clientId) || null; },
  // Propose a new primary representative for a client. Members may only ask for themselves; staff need the users permission (admin).
  requestPrimaryRep(clientId, repId, note) {
    const cl = this.client(clientId); const to = this.rep(repId); if (!cl || !to) return { error: 'Choose a client and a representative.' };
    const staff = this.isStaff(); if (staff && !this.can('users')) return { error: 'Only an administrator can change a primary representative.' }; if (!staff && !cl.you) return { error: 'You can only change your own primary representative.' };
    if (cl.rep === repId) return { error: `${to.name} is already the primary representative.` };
    state.repRequests = state.repRequests || []; state.repRequests.filter(r => r.clientId === clientId && r.status === 'pending').forEach(r => { r.status = 'superseded'; });
    const by = staff ? 'staff:' + this.role() : 'client'; const r = { id: 'RR-' + String(state.repRequests.length + 1).padStart(3, '0'), clientId, clientName: cl.name, from: cl.rep, to: repId, by, ts: Date.now(), status: 'pending', note: note || '' };
    state.repRequests.push(r); audit('rep.request', `${r.id} · ${cl.name}: ${this.rep(cl.rep).name} → ${to.name}`, by);
    if (cl.you) notify(`Request sent: ${to.name} has been asked to become your primary representative. Nothing changes until they accept.`);
    save(); return r;
  },
  // The representative accepts or declines being the client's primary (admins can decide too, as an override; audited either way).
  decideRepRequest(id, decision, note) {
    if (!(this.role() === 'rep' || this.can('users'))) return { error: 'Only the representative (or an administrator) can decide this.' };
    const r = (state.repRequests || []).find(x => x.id === id); if (!r) return { error: 'Request not found.' }; if (r.status !== 'pending') return { error: 'That request is already ' + r.status + '.' };
    const by = 'staff:' + this.role(); const to = this.rep(r.to); const cl = this.client(r.clientId); const ok = decision === 'approve';
    Object.assign(r, { status: ok ? 'approved' : 'denied', decidedAt: Date.now(), decidedBy: by, decision: note || '' });
    if (ok) { if (r.clientId === 'you') state.profile.rep = r.to; else { state.repOverride = state.repOverride || {}; state.repOverride[r.clientId] = r.to; } }
    audit(ok ? 'rep.approved' : 'rep.denied', `${r.id} · ${cl ? cl.name : r.clientId} → ${to.name}${note ? ' · ' + note : ''}`, by);
    if (r.clientId === 'you') { notify(ok ? `${to.name} accepted and is now your primary representative.` : `${to.name} was unable to take you on as primary representative${note ? ': ' + note : ''}. ${this.rep(state.profile.rep).name} remains your primary representative.`); if (ok) this.sendMessage({ text: `Hello ${state.profile.name.split(' ')[0]}, I am now your primary representative at Rainmaker Securities. Reply here any time; I will take over your open orders and settlements.`, from: 'rep' }); }
    save(); return {};
  },
  // Compliance approves or returns an investor verification.
  reviewVerification(clientId, decision, note) {
    const cl = this.client(clientId); if (!cl) return;
    audit('verification.' + decision, cl.name + (note ? ' · ' + note : ''), 'staff:' + this.role());
    if (cl.you) { if (decision === 'approve') { this.approveVerification(); } else { Object.assign(state.profile, { verification: 'unverified', rejectionNote: note || 'Compliance could not verify the basis you selected.' }); notify(`Compliance could not approve your verification: ${state.profile.rejectionNote} Update your submission and resubmit.`); } }
    else { state.clientStatus = state.clientStatus || {}; state.clientStatus[cl.name] = { status: decision === 'approve' ? 'verified' : 'unverified', ts: Date.now(), note: note || '' }; }
    save();
  },
  // ----- requests (rep / compliance) -----
  approveRequest(id, note) { const r = (state.requests || []).find(x => x.id === id); if (!r || r.status !== 'pending') return; audit('request.approve', id, 'staff:' + this.role()); r.staffNote = note || ''; r.reviewedAt = Date.now(); if (this.canTrade()) { r.status = 'pending'; this.convertRequests(); } else { r.status = 'approved'; notify(`Request ${id} was approved by ${this.rep(state.profile.rep).name}. It goes on the book the moment your verification clears.`); } save(); },
  rejectRequest(id, reason) { const r = (state.requests || []).find(x => x.id === id); if (!r || r.status !== 'pending') return; audit('request.reject', id + ' · ' + reason, 'staff:' + this.role()); r.status = 'rejected'; r.staffNote = reason || ''; r.reviewedAt = Date.now(); notify(`Request ${id} was declined: ${reason || 'see message from your primary representative'}.`); this.sendMessage({ companyId: r.companyId || null, orderId: r.orderId || null, text: `Regarding request ${id} (${r.what}): we are not able to work this as submitted. ${reason || ''} Reply here if you would like to adjust the terms.`, from: 'rep' }); save(); },
  // ----- orders (staff): edit or remove any live order from the Orders tab. Both are audited; the member is told when it is their own order. -----
  ARR_CLOSED: ['executed', 'declined', 'withdrawn'],
  // Find a live order wherever it lives: the member's own (state.userOrders), staff-recorded (state.staffOrders) or generated (patched through an overlay).
  _orderTarget(id) {
    const mine = state.userOrders.find(x => x.id === id); if (mine) return { o: mine, where: 'mine' };
    const st = (state.staffOrders || []).find(x => x.id === id); if (st) return { o: st, where: 'staff' };
    const o = this.order(id); if (o) return { o, where: 'generated' };
    return null;
  },
  // Staff removes a live order or open structured deal from the book with a reason. It stays in the Orders list as Cancelled (books and records), audited.
  removeOrder(id, reason) {
    if (!this.can('orders.remove')) return { error: 'Not permitted' };
    const role = this.role(); const by = 'staff:' + role; const why = reason || 'removed by ' + this.ROLES[role].toLowerCase(); const now = Date.now();
    const a = this.arrangement(id);
    if (a) {
      if (this.ARR_CLOSED.includes(a.status)) return { error: 'That deal is already closed.' };
      a.status = 'declined'; a.staffNote = why; a.history.push({ ts: now, status: 'declined', by, note: why });
      if (!a.clientId || a.clientId === 'you') notify(`Your structured deal ${id} was removed by ${this.ROLES[role]}: ${why}`);
    } else {
      const t = this._orderTarget(id); if (!t) return { error: 'Order not found.' };
      if (t.o.status !== 'live') return { error: 'Only live orders can be removed.' };
      const patch = { status: 'cancelled', cancelReason: why, removedBy: by, removedAt: now };
      if (t.where === 'generated') this._setOverlay(id, patch); else Object.assign(t.o, patch);
      if (t.where === 'mine') notify(`Your order ${id} was removed by ${this.ROLES[role]}: ${why}`);
    }
    state.removed = state.removed || {}; state.removed[id] = { ts: now, reason: why, by: role };
    audit('order.remove', id + ' · ' + why, by); save(); return {};
  },
  // Remove several live orders at once with one reason (Ben, Oct 1 2026): each goes through removeOrder (own checks, notifications, audit);
  // the batch is audited as orders.bulkRemove. Returns the ids removed and the ones that failed with their reasons.
  removeOrders(ids, reason) {
    if (!this.can('orders.remove')) return { error: 'Not permitted' };
    const list = Array.from(new Set(ids || [])).filter(Boolean); if (!list.length) return { error: 'Select at least one live order.' };
    const removed = [], failed = [];
    list.forEach(id => { const r = this.removeOrder(id, reason); if (r && r.error) failed.push({ id, error: r.error }); else removed.push(id); });
    if (removed.length) audit('orders.bulkRemove', removed.length + ' orders · ' + (reason || '') + ' · ' + removed.join(', '), 'staff:' + this.role());
    save(); return { removed, failed };
  },
  // Staff corrects a live order: shares, price, validity, share class, transfer type, note. Structured deals take shares, price / strike and terms.
  // Client, company and side never change (remove and record again). Audited with the before / after values; the member is notified if it is theirs.
  updateOrder(id, patch) {
    if (!this.can('orders.edit')) return { error: 'Not permitted' };
    const role = this.role(); const by = 'staff:' + role; const changes = []; const now = Date.now(); patch = patch || {};
    const num = (v, old) => v === '' || v == null ? old : +v;
    const a = this.arrangement(id);
    if (a) {
      if (this.ARR_CLOSED.includes(a.status)) return { error: 'That deal is already closed.' };
      const pk = a.type === 'option' ? 'strike' : a.type === 'forward' ? 'fwdPrice' : 'price';
      const qty = num(patch.qty, +a.qty || 0), price = num(patch.price, +a[pk] || 0);
      if (qty < 0 || price < 0) return { error: 'Shares and price cannot be negative.' };
      if (qty !== (+a.qty || 0)) { changes.push(`shares ${(+a.qty || 0).toLocaleString()} → ${qty.toLocaleString()}`); a.qty = qty; }
      if (price !== (+a[pk] || 0)) { changes.push(`${pk === 'strike' ? 'strike' : 'price'} $${(+a[pk] || 0).toFixed(2)} → $${price.toFixed(2)}`); a[pk] = price; }
      if (patch.what != null && patch.what.trim() && patch.what.trim() !== a.what) { changes.push('terms'); a.what = patch.what.trim(); }
      if (patch.note != null && patch.note !== (a.note || '')) { changes.push('note'); a.note = patch.note; }
      if (!changes.length) return { error: 'Nothing changed.' };
      a.edited = { by, ts: now, changes }; a.history.push({ ts: now, status: 'edited', by, note: changes.join(', ') });
      if (!a.clientId || a.clientId === 'you') notify(`${this.ROLES[role]} updated your structured deal ${id}: ${changes.join(', ')}.`);
      audit('order.edit', id + ' · ' + changes.join(', '), by); save(); return { changes };
    }
    const t = this._orderTarget(id); if (!t) return { error: 'Order not found.' };
    const o = t.o; if (o.status !== 'live') return { error: 'Only live orders can be edited.' };
    const qty = num(patch.qty, o.qty), price = num(patch.price, o.price);
    if (!(qty > 0 && price > 0)) return { error: 'Shares and price must be positive.' };
    const p = {};
    if (qty !== o.qty) { changes.push(`shares ${o.qty.toLocaleString()} → ${qty.toLocaleString()}`); p.qty = qty; }
    if (price !== o.price) { changes.push(`price $${o.price.toFixed(2)} → $${price.toFixed(2)}`); p.price = price; }
    if (patch.days !== '' && patch.days != null && +patch.days > 0) { const exp = now + (+patch.days) * DAY; if (Math.round((exp - o.expires) / DAY) !== 0) { changes.push(`valid ${+patch.days} days`); p.expires = exp; p.expiryNoticed = false; } }
    ['shareType', 'transferType'].forEach(k => { if (patch[k] && patch[k] !== o[k]) { changes.push(`${k === 'shareType' ? 'class' : 'transfer'} ${o[k]} → ${patch[k]}`); p[k] = patch[k]; } });
    if (patch.note != null && patch.note !== (o.note || '')) { changes.push('note'); p.note = patch.note; }
    const cur = this.fillRule(o); const nf = this.FILL_RULES[patch.fill] ? patch.fill : cur.fill; const nm = nf === 'min' ? (patch.minFill === '' || patch.minFill == null ? cur.min : +patch.minFill) : 0;
    if (nf === 'min' && !(nm > 0)) return { error: 'Minimum fill needs a share count.' };
    if (nf !== cur.fill || nm !== cur.min) { changes.push(`fill ${this.fillLabel(o).toLowerCase()} → ${this.fillLabel({ fill: nf, minFill: nm, qty }).toLowerCase()}`); p.fill = nf; p.minFill = nm; if (o.custom) { o.custom.fill = nf; o.custom.minFill = nm; } }
    if (!changes.length) return { error: 'Nothing changed.' };
    p.edited = { by, ts: now, changes };
    if (t.where === 'generated') this._setOverlay(id, p); else Object.assign(o, p);
    if (t.where === 'mine') notify(`${this.ROLES[role]} updated your order ${id}: ${changes.join(', ')}.`);
    audit('order.edit', id + ' · ' + changes.join(', '), by); save(); return { changes };
  },
  flagOrder(id, note) { state.flags = state.flags || {}; if (state.flags[id]) delete state.flags[id]; else state.flags[id] = { ts: Date.now(), note: note || '', by: this.role() }; audit('order.flag', id, 'staff:' + this.role()); save(); },
  flagged(id) { return (state.flags || {})[id] || null; },
  removedInfo(id) { return (state.removed || {})[id] || null; },
  // ----- companies (admin) -----
  addCompany(def) { // new companies carry listedAt so the Console can sort by date entered
    const palette = ['#2f6fed', '#e8635b', '#2f9e5f', '#8e44ad', '#e67e22', '#16a085', '#5a4fcf', '#d4a017', '#1e3a45', '#c0392b'];
    const ticker = (def.ticker || def.name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (COMPANIES.find(c => c.id === ticker.toLowerCase())) return { error: 'That ticker is already in use.' };
    const full = { name: def.name, ticker, sector: def.sector || 'Technology', color: palette[COMPANIES.length % palette.length], liquid: !!def.liquid, base: +def.base || 10, drift: 0.6, vol: 0.9, years: 3, desc: def.desc || '', round: { post: def.post || '—', pps: +def.pps || +def.base || 10, date: def.roundDate || 'Recent', series: def.series || 'Series A', raised: def.raised || '—', total: def.total || '—' }, investors: (def.investors || '').split(',').map(x => x.trim()).filter(Boolean), industries: (def.industries || '').split(',').map(x => x.trim()).filter(Boolean), info: def.info || '', listedAt: Date.now() };
    state.customCompanies = state.customCompanies || []; state.customCompanies.push(full);
    const built = buildCompany(full, CATALOG.length + state.customCompanies.length); COMPANIES.push(built);
    audit('company.add', full.name + ' (' + ticker + ')', 'staff:admin'); notify(`${full.name} (${ticker}) was added to the exchange by an administrator.`); save();
    return { company: built };
  },
  removeCompany(id, reason) { const i = COMPANIES.findIndex(c => c.id === id); if (i < 0) return; const c = COMPANIES[i]; state.hiddenCompanies = state.hiddenCompanies || []; state.hiddenCompanies.push(id); state.watchlist = state.watchlist.filter(x => x !== id); state.userOrders.filter(o => o.companyId === id && o.status === 'live').forEach(o => { o.status = 'cancelled'; o.cancelReason = 'company removed'; }); COMPANIES.splice(i, 1); audit('company.remove', c.name + ' · ' + (reason || ''), 'staff:admin'); notify(`${c.name} was removed from the exchange${reason ? ': ' + reason : ''}. Open orders were cancelled.`); save(); },
  updateCompany(id, fields, policy) { const c = COMPANIES.find(x => x.id === id); if (!c) return; state.companyOverrides = state.companyOverrides || {}; const ov = state.companyOverrides[id] || { fields: {}, policy: {} }; Object.assign(ov.fields, fields || {}); Object.assign(ov.policy, policy || {}); state.companyOverrides[id] = ov; Object.assign(c, fields || {}); if (policy) Object.assign(c.policy, policy); audit('company.edit', c.name, 'staff:admin'); save(); },
});
