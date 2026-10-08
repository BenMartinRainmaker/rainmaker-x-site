/* ==============================================================
   Rainmaker X · Data API · records and exports
   One unified order ledger that the back office, the client page
   and the exports all read, plus one-click CSV / JSON exports of
   orders, compliance forms and the complete record set. Every
   export is permission-checked and written to the audit log.
   This file loads last in the data layer and publishes window.Data.
   ============================================================== */
'use strict';

Object.assign(Data, {
  // ----- unified order records -----
  // One row per bid, ask, custom order, structured deal and stand-alone settlement.
  // The status vocabulary (live / matched / completed / cancelled) is defined once, here.
  orderRecords() {
    const me = { id: 'you', name: state.profile.name };
    const isOff = s => ['declined', 'withdrawn'].includes(s);
    // Orders carry no settlement state: a live order is Live (or Partially filled), a used-up order is Filled, otherwise Cancelled. Settlement lives on the match.
    const rows = this.allOrders().map(o => {
      const status = o.status === 'live' ? 'live' : o.status === 'cancelled' ? 'cancelled' : 'filled';
      const label = status === 'live' ? (o.soldQty ? 'Partially filled' : 'Live') : status === 'cancelled' ? 'Cancelled' : 'Filled';
      return { kind: o.custom ? 'custom' : 'standard', o, id: o.id, c: this.company(o.companyId), cl: this.orderClient(o), rep: this.assignedRep(o), qty: o.qty, price: o.price, total: o.qty * o.price, ts: o.created, side: o.side === 'listing' ? 'ask' : 'bid', status, label, matches: this.matchesFor(o.id), href: '#/order/' + o.id };
    });
    this.allArrangements().forEach(a => {
      const c = a.companyId ? this.company(a.companyId) : null;
      const price = +a.price || +a.strike || +a.fwdPrice || 0; const qty = +a.qty || 0;
      const cl = a.clientId && a.clientId !== 'you' ? (this.client(a.clientId) || { id: a.clientId, name: a.clientId }) : me;
      const status = a.status === 'executed' ? 'filled' : isOff(a.status) ? 'cancelled' : 'live';
      rows.push({ kind: 'structured', a, id: a.id, c, cl: { id: cl.id, name: cl.name }, rep: a.rep || cl.rep || state.profile.rep, qty, price, total: qty * price || +a.amount || +a.commit || 0, ts: a.created, side: a.side === 'sell' ? 'ask' : 'bid', status, label: status === 'filled' ? 'Executed' : status === 'cancelled' ? 'Cancelled' : 'Live', matches: [], href: '#/admin/requests' });
    });
    return rows.sort((a, b) => b.ts - a.ts);
  },
  // Human status for a record: what the Orders list shows and what the export says.
  recordStatus(r) { return r.label || (r.status === 'cancelled' ? 'Cancelled' : r.status === 'filled' ? 'Filled' : 'Live'); },
  // Matches export: one row per match (or legacy settlement), with both parties and the settlement status.
  MATCH_COLUMNS: [['id', 'Match'], ['company', 'Company'], ['buyerId', 'Buyer id'], ['buyer', 'Buyer'], ['sellerId', 'Seller id'], ['seller', 'Seller'], ['rep', 'Representative'], ['qty', 'Shares'], ['price', 'Price'], ['gross', 'Gross'], ['matched', 'Matched'], ['status', 'Status'], ['approved', 'Approved'], ['by', 'Approved by'], ['settlement', 'Settlement'], ['stage', 'Settlement step'], ['buyFee', 'Buy-side fee'], ['sellFee', 'Sell-side fee'], ['bidId', 'Bid'], ['askId', 'Ask'], ['note', 'Note']],
  exportMatches() {
    if (!this.can('matches')) return { error: 'Not permitted' }; const iso = t => t ? new Date(t).toISOString() : '';
    const rows = this.matchRecords().map(r => { const m = r.m || {}; const st = r.settlement; const f = st ? this.settlementFees(st) : null; const repObj = this.rep(r.rep); return { id: r.id, company: r.c ? r.c.name : '', buyerId: r.buyer.id, buyer: r.buyer.name, sellerId: r.seller.id, seller: r.seller.name, rep: repObj ? repObj.name : '', qty: r.qty, price: r.price, gross: r.gross, matched: iso(r.ts), status: r.label, approved: iso(m.approvedAt), by: m.approvedBy || '', settlement: st ? st.id : '', stage: st ? this.settleSteps(st)[st.stage] : '', buyFee: f ? f.buy : '', sellFee: f ? f.sell : '', bidId: m.bidId || '', askId: m.askId || '', note: m.declineReason || '' }; });
    audit('export.matches', rows.length + ' rows'); save(); return { rows, columns: this.MATCH_COLUMNS };
  },

  // ----- exports -----
  // Column keys and headings, in output order. The same list drives CSV and JSON.
  ORDER_COLUMNS: [['id', 'Order'], ['kind', 'Kind'], ['type', 'Type'], ['side', 'Side'], ['company', 'Company'], ['clientId', 'Client id'], ['client', 'Client'], ['rep', 'Representative'], ['qty', 'Shares'], ['price', 'Price'], ['total', 'Value'], ['entered', 'Entered'], ['expires', 'Expires'], ['status', 'Status'], ['matches', 'Matches'], ['shareType', 'Share class'], ['transferType', 'Transfer'], ['fill', 'Fill rule'], ['recordedBy', 'Recorded by'], ['terms', 'Terms / notes']],
  FORM_COLUMNS: [['id', 'Form'], ['kind', 'Type'], ['clientId', 'Client id'], ['client', 'Client'], ['email', 'Email'], ['detail', 'Detail'], ['submitted', 'Submitted'], ['status', 'Status'], ['reviewedAt', 'Reviewed'], ['by', 'Reviewed by'], ['note', 'Note']],

  // Flat, spreadsheet-friendly rows for every order on the exchange.
  exportOrders() {
    if (!this.can('orders.view')) return { error: 'Not permitted' };
    const iso = t => t ? new Date(t).toISOString() : '';
    const flat = obj => Object.entries(obj || {}).filter(([, v]) => v != null && v !== '' && v !== false).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ');
    const rows = this.orderRecords().map(r => {
      const o = r.o || {}; const a = r.a || {}; const repObj = this.rep(r.rep);
      return {
        id: r.id, kind: r.kind, type: r.a ? this.ARRANGEMENT_TYPES[a.type] || a.type : r.kind === 'custom' ? 'Custom order' : 'Standard order', side: r.side,
        company: r.c ? r.c.name : '', clientId: r.cl.id, client: r.cl.name, rep: repObj ? repObj.name : r.rep || '',
        qty: r.qty || '', price: r.price || '', total: r.total || '', entered: iso(r.ts), expires: iso(o.expires), status: this.recordStatus(r), matches: (r.matches || []).map(m => m.id).join('; '),
        shareType: o.shareType || '', transferType: o.transferType || '', fill: r.o ? this.fillLabel(o) : '', recordedBy: o.recorded ? o.recorded.by || 'staff' : a.recorded ? a.recorded.by || 'staff' : '',
        terms: r.a ? a.what || '' : [o.note, o.custom ? flat(o.custom) : ''].filter(Boolean).join(' · '),
      };
    });
    audit('export.orders', rows.length + ' rows'); save();
    return { rows, columns: this.ORDER_COLUMNS };
  },

  // Every compliance form with its decision.
  exportForms() {
    if (!this.can('forms')) return { error: 'Not permitted' };
    const iso = t => t ? new Date(t).toISOString() : '';
    const rows = this.forms().map(f => ({ id: f.id, kind: this.FORM_KINDS[f.kind] || f.kind, clientId: f.client ? f.client.id : '', client: f.client ? f.client.name : '', email: f.client ? f.client.email || '' : '', detail: f.detail, submitted: iso(f.submitted), status: f.status, reviewedAt: iso(f.reviewedAt), by: f.by || '', note: f.note || '' }));
    audit('export.forms', rows.length + ' rows'); save();
    return { rows, columns: this.FORM_COLUMNS };
  },

  // The complete record set as one JSON document: what an off-site books-and-records
  // system or a regulator request would need. Compliance / admin only.
  exportBundle() {
    if (!this.can('audit')) return { error: 'Not permitted' };
    const orders = this.exportOrders(); const forms = this.exportForms(); const matches = this.exportMatches();
    const bundle = {
      exportedAt: new Date().toISOString(), app: RX_CONFIG.app.name, version: RX_CONFIG.app.version, exportedBy: 'staff:' + this.role(),
      counts: { orders: orders.rows.length, forms: forms.rows.length, matches: matches.rows.length, settlements: this.allSettlements().length, requests: this.requests().length, arrangements: this.allArrangements().length, clients: this.clientsList().length, messages: this.allMessages().length, audit: this.auditLog().length, spvUnits: this.spvLots().length },
      orders: orders.rows, forms: forms.rows,
      matches: matches.rows, settlements: this.allSettlements().map(x => Object.assign({}, x, { fees: this.settlementFees(x), status: this.settlementStatus(x) })),
      requests: this.requests(), arrangements: this.allArrangements(), clients: this.clientsList(),
      spvUnits: this.spvLots().map(l => Object.assign({ fund: (this.fund(l.fundId) || {}).name }, l)),
      spvSubscriptions: this.spvSubs().map(x => Object.assign({ fund: (this.fund(x.fundId) || {}).name, label: this.spvSubLabel(x) }, x)),
      messages: this.allMessages().map(m => Object.assign({}, m, { attachments: (m.attachments || []).map(a => ({ name: a.name, size: a.size, type: a.type })) })),
      feedback: this.feedback(),
      audit: this.auditLog(),
    };
    audit('export.bundle', Object.entries(bundle.counts).map(([k, v]) => `${k} ${v}`).join(', ')); save();
    return bundle;
  },

  // CSV text from rows + [[key, heading]] columns. Cells are quoted, and cells that start with
  // a formula character are prefixed so spreadsheets never execute them (CSV injection).
  toCSV(rows, columns) {
    const cell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const head = columns.map(([, label]) => cell(label)).join(',');
    return [head].concat(rows.map(r => columns.map(([k]) => cell(r[k])).join(','))).join('\r\n');
  },

  // Wipe everything this browser has saved and start the demo again.
  reset() { localStorage.removeItem(KEY); location.hash = '#/dashboard'; location.reload(); },
});

window.Data = Data;
