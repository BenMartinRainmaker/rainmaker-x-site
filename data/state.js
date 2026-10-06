/* ==============================================================
   Rainmaker X · data · persisted state
   Everything the member does lives in `state` (localStorage). Seeds run once for a new browser;
   staff company edits are re-applied to the generated market on load.
   ============================================================== */
'use strict';

const KEY = RX_CONFIG.storage.key;
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
const state = Object.assign({ watchlist: ['spx', 'anth', 'strp', 'dbx', 'opai'], userOrders: [], userBids: [], cancelled: [], userTx: [], pricePoints: {}, notifications: [], dismissedBanner: false }, load());
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
if (state.role) { delete state.role; save(); }
// One-time clean-up: audit runs before Oct 2 2026 could leak their test account name and test trust
// into the saved state (the restore raced a render). Strip them; nothing else about the account changes.
if (state.account && (state.account.name === 'Audit' || (state.account.extras || []).some(x => x.name === 'Audit Trust'))) { if (state.account.name === 'Audit') state.account.name = ''; state.account.extras = (state.account.extras || []).filter(x => x.name !== 'Audit Trust'); save(); }
if (!state.seeded) {
  [ { companyId: 'spx', side: 'bid', price: 198.00, qty: 500 }, { companyId: 'dbx', side: 'listing', price: 99.00, qty: 1500 }, { companyId: 'anth', side: 'bid', price: 58.00, qty: 1000 } ]
    .forEach((o, i) => state.userOrders.push(Object.assign({ id: o.companyId.toUpperCase() + '-U' + (i + 1), created: NOW_T - (i + 1) * 3 * DAY, expires: NOW_T + 60 * DAY, status: 'live', transferType: 'Direct', shareType: 'Common', bidsCount: 0, mine: true }, o)));
  state.seeded = true; save();
}

if (!state.profile) {
  const m = RX_CONFIG.demoMember;   // the member the prototype signs in as
  state.profile = { name: m.name, initials: m.initials, email: m.email, firm: m.firm, memberSince: NOW_T - m.memberSinceDays * DAY, investorType: m.investorType, verification: 'verified', verifiedAt: NOW_T - m.verifiedDays * DAY, basis: m.basis.slice(), rep: m.rep };
  save();
}
if (!state.holdingsSeeded) {
  state.lots = [
    { companyId: 'spx', qty: 600, price: 150.00, ts: NOW_T - 540 * DAY },
    { companyId: 'dbx', qty: 2000, price: 70.00, ts: NOW_T - 420 * DAY },
    { companyId: 'strp', qty: 12000, price: 21.00, ts: NOW_T - 610 * DAY },
    { companyId: 'opai', qty: 400, price: 230.00, ts: NOW_T - 300 * DAY },
    { companyId: 'anth', qty: 1500, price: 44.00, ts: NOW_T - 210 * DAY },
    { companyId: 'rvl', qty: 300, price: 700.00, ts: NOW_T - 150 * DAY },
    { companyId: 'ramp', qty: 15000, price: 14.00, ts: NOW_T - 95 * DAY },
  ];
  state.holdingsSeeded = true; save();
}

if (!state.settlements) {
  state.settlements = [
    { id: 'stl-seed-1', companyId: 'ramp', side: 'buy', qty: 15000, price: 14.00, gross: 210000, ts: NOW_T - 95 * DAY, stage: 4, counterparty: 'market', steps: { 0: NOW_T - 95 * DAY, 1: NOW_T - 92 * DAY, 2: NOW_T - 80 * DAY, 3: NOW_T - 74 * DAY, 4: NOW_T - 72 * DAY } },
    { id: 'stl-seed-2', companyId: 'rvl', side: 'buy', qty: 300, price: 700.00, gross: 210000, ts: NOW_T - 6 * DAY, stage: 1, counterparty: 'market', steps: { 0: NOW_T - 6 * DAY, 1: NOW_T - 5 * DAY } },
  ];
  state.alerts = [{ id: 'al-seed-1', companyId: 'spx', type: 'ask_below', price: 200, created: NOW_T - 10 * DAY, triggered: null }];
  state.iois = []; state.dataRoomAccess = {}; state.deskTrades = [];
  save();
}

// v6.9: settlement steps gained "contract signed by buyer and seller" and "broker fees paid". Remap stages saved under the old 5 / 4-step lists.
if (!state.settleV2) {
  (state.settlements || []).forEach(st => { const desk = st.counterparty === 'desk'; const map = desk ? [0, 1, 3, 4] : [0, 1, 2, 4, 5]; const old = st.steps || {}; const steps = {}; Object.keys(old).forEach(k => { const n = map[+k]; if (n != null) steps[n] = old[k]; });
    st.stage = map[Math.max(0, Math.min(st.stage || 0, map.length - 1))]; for (let i = 0; i <= st.stage; i++) if (!steps[i]) steps[i] = steps[i - 1] || st.ts; st.steps = steps;
    const signIdx = desk ? 1 : 2, feeIdx = desk ? 2 : 3; st.parties = st.parties || {}; if (st.stage >= signIdx) { st.parties.buyer = st.parties.buyer || steps[signIdx]; st.parties.seller = st.parties.seller || steps[signIdx]; } if (st.stage >= feeIdx) st.parties.fees = st.parties.fees || steps[feeIdx]; });
  state.settleV2 = true; save();
}

if (!state.messages) {
  state.messages = [
    { id: 'm1', ts: NOW_T - 390 * DAY, from: 'rep', key: 'general', text: 'Welcome to Rainmaker X, Ben. I am your registered representative. Every bid, ask and question on the exchange comes through me or the desk; buyers and sellers never deal with each other directly. Call or message me any time.', read: true },
    { id: 'm2', ts: NOW_T - 6 * DAY, from: 'rep', key: 'rvl', companyId: 'rvl', text: 'Your Revolut purchase (300 @ $700.00) is with the company for approval. Their counsel usually clears institutional buyers within a week. I will update the settlement tracker as soon as we hear back.', read: true },
    { id: 'm3', ts: NOW_T - 2 * DAY, from: 'desk', key: 'spx', companyId: 'spx', text: 'Desk note on SpaceX: a block of 6,000 shares may come available next week around the current lowest ask. Your standing bid SPX-U1 at $198.00 is below where it will likely clear. Want us to work a firm quote for you?', read: false },
    { id: 'm4', ts: NOW_T - 5 * 3600000, from: 'compliance', key: 'general', text: 'Reminder: annual re-verification of your investor status is due in October. Compliance will send the form two weeks ahead.', read: false },
  ];
  save();
}

function notify(text) { state.notifications.unshift({ text, ts: Date.now() }); state.notifications = state.notifications.slice(0, 50); save(); }
// Append to the audit trail (newest first, capped). The ip is simulated; the server records the real one.
function audit(type, detail, actor) { state.audit = state.audit || []; const cur = actor ? null : readStaff(); state.audit.unshift({ ts: Date.now(), type, detail, actor: actor || (cur && cur.role ? 'staff:' + cur.role : 'client'), ip: '73.162.' + (40 + (Date.now() % 50)) + '.' + (10 + (Date.now() % 200)) }); state.audit = state.audit.slice(0, 300); }
// staff-added companies, removed companies and edits survive reloads
(state.customCompanies || []).forEach((def, i) => { if (!COMPANIES.find(c => c.id === def.ticker.toLowerCase())) COMPANIES.push(buildCompany(def, CATALOG.length + i)); });
(state.hiddenCompanies || []).forEach(id => { const i = COMPANIES.findIndex(c => c.id === id); if (i >= 0) COMPANIES.splice(i, 1); });
Object.entries(state.companyOverrides || {}).forEach(([id, patch]) => { const c = COMPANIES.find(x => x.id === id); if (c) { Object.assign(c, patch.fields || {}); if (patch.policy) Object.assign(c.policy, patch.policy); } });
