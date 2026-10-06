/* ==============================================================
   Rainmaker X · data · sample market generators
   Deterministic price history, order books, transactions, policies, data rooms and IOIs
   built from the catalog. Same seed → same market on every reload.
   ============================================================== */
'use strict';

function genHistory(seed, base, drift, vol, years) {
  const rnd = mulberry32(hashStr(seed));
  const n = Math.round(years * 365);
  const pts = [];
  let p = base * (0.45 + rnd() * 0.5);
  const start = NOW_T - n * DAY;
  let hold = 0;
  for (let i = 0; i <= n; i++) {
    if (hold <= 0) { const jump = (rnd() - 0.47 + drift * 0.02) * vol * 0.12; p = Math.max(base * 0.12, p * (1 + jump)); hold = 2 + Math.floor(rnd() * 12); }
    else { p = p * (1 + (rnd() - 0.5) * vol * 0.012); hold--; }
    pts.push({ t: start + i * DAY, p });
  }
  const k = base / pts[pts.length - 1].p;
  pts.forEach(pt => pt.p = +(pt.p * k).toFixed(2));
  return pts;
}
function genIntraday(seed, price, vol) {
  const rnd = mulberry32(hashStr(seed + ':intra'));
  const pts = []; let p = price * (1 - (rnd() - 0.5) * vol * 0.02);
  for (let i = 24; i >= 0; i--) { p = p * (1 + (rnd() - 0.5) * vol * 0.004); pts.push({ t: NOW_T - i * 3600000, p: +p.toFixed(2) }); }
  pts[pts.length - 1].p = price; return pts;
}
function orderId(ticker, rnd) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'; let s = '';
  for (let i = 0; i < 3; i++) s += chars[Math.floor(rnd() * chars.length)];
  return ticker + '-' + s;
}
function roundQty(q) { return Math.max(100, Math.round(q / 100) * 100); }
function genOrders(c) {
  const rnd = mulberry32(hashStr(c.ticker + ':orders'));
  const nList = c.liquid ? 12 + Math.floor(rnd() * 40) : 2 + Math.floor(rnd() * 12);
  const nBid = c.liquid ? 8 + Math.floor(rnd() * 30) : 1 + Math.floor(rnd() * 10);
  const out = [];
  const mk = (side) => {
    const spread = 0.16;
    const price = side === 'listing' ? c.price * (1 + rnd() * spread + 0.02) : c.price * (1 - rnd() * spread - 0.005);
    const qty = roundQty(c.price > 100 ? 100 + rnd() * 3000 : c.price > 30 ? 500 + rnd() * 15000 : 1000 + rnd() * 40000);
    const created = NOW_T - Math.floor(rnd() * 40) * DAY - Math.floor(rnd() * 20) * 3600000;
    const doneRoll = rnd();
    const status = doneRoll < 0.18 ? (side === 'listing' ? 'sold' : 'completed') : 'live';
    const id = orderId(c.ticker, rnd);
    const fh = hashStr(id + ':fill') % 100; const fill = fh < 22 ? 'aon' : fh < 34 ? 'min' : 'partial';   // fill rule from the id, so the rest of the stream is unchanged
    return { id, companyId: c.id, side, price: +price.toFixed(2), qty, created, expires: created + (30 + Math.floor(rnd() * 60)) * DAY,
      status, transferType: rnd() < 0.72 ? 'Direct' : (rnd() < 0.6 ? 'SPV' : 'Forward'), shareType: rnd() < 0.8 ? 'Common' : 'Preferred',
      fill, minFill: fill === 'min' ? roundQty(qty * (0.2 + (fh % 10) / 40)) : 0,
      bidsCount: side === 'listing' ? Math.floor(rnd() * rnd() * 7) : 0, mine: false };
  };
  for (let i = 0; i < nList; i++) out.push(mk('listing'));
  for (let i = 0; i < nBid; i++) out.push(mk('bid'));
  return out;
}
function genTransactions(c) {
  const rnd = mulberry32(hashStr(c.ticker + ':tx'));
  const n = c.liquid ? 120 + Math.floor(rnd() * 400) : 10 + Math.floor(rnd() * 60);
  const h = c.history; const span = h.length;
  const tx = [];
  for (let i = 0; i < n; i++) {
    // bias toward recent
    const idx = Math.min(span - 1, Math.floor(Math.pow(rnd(), 0.55) * span));
    const t = h[idx].t + Math.floor(rnd() * 24) * 3600000;
    const price = h[idx].p * (1 + (rnd() - 0.5) * 0.22);
    const qty = roundQty(c.price > 100 ? 100 + rnd() * 2500 : c.price > 30 ? 300 + rnd() * 9000 : 800 + rnd() * 30000);
    const r = rnd(); const status = r < 0.55 ? 'closed' : r < 0.85 ? 'matched' : 'canceled';
    tx.push({ id: c.ticker + '-tx-' + i, companyId: c.id, price: +price.toFixed(2), qty, ts: t, status, transferType: rnd() < 0.75 ? 'Direct' : (rnd() < 0.7 ? 'SPV' : 'Forward'), shareType: rnd() < 0.8 ? 'Common' : 'Preferred' });
  }
  return tx.sort((a, b) => b.ts - a.ts);
}

function buildCompany(c, i) {
  const history = genHistory(c.ticker, c.base, c.drift, c.vol, c.years);
  const o = Object.assign({}, c, { id: c.ticker.toLowerCase(), price: c.base, history, intraday: genIntraday(c.ticker, c.base, c.vol), letter: c.name[0] }); if (o.round && o.round.pps == null) o.round.pps = +(c.base * 0.92).toFixed(2);
  o.policy = genPolicy(o, i); o.dataRoom = genDataRoom(o); o.iois = genIOIs(o); o.orders = genOrders(o); o.transactions = genTransactions(o);
  o.matches = o.transactions.filter(t => t.status !== 'canceled').length;
  o.volume = o.transactions.filter(t => t.status === 'closed').reduce((s, t) => s + t.price * t.qty, 0);
  return o;
}
function genPolicy(c, i) {
  const rnd = mulberry32(hashStr(c.ticker + ':policy'));
  const base = POLICIES[i % POLICIES.length]; const p = Object.assign({}, base);
  if (p.policy === 'Window') { const openIn = Math.floor(rnd() * 3) - 1; p.windowOpen = NOW_T + openIn * 20 * DAY; p.windowClose = p.windowOpen + 30 * DAY; p.open = p.windowOpen <= NOW_T && NOW_T <= p.windowClose; p.label = p.open ? 'Trading window open' : 'Trading window closed'; }
  p.transferFee = [0, 500, 1000, 1500, 2500][Math.floor(rnd() * 5)];
  return p;
}
function genDataRoom(c) {
  const rnd = mulberry32(hashStr(c.ticker + ':dataroom'));
  const h = c.history; const q = [];
  for (let t = h[0].t; t <= NOW_T; t += 91 * DAY) { const i = Math.min(h.length - 1, Math.round((t - h[0].t) / DAY)); q.push({ date: t, price: +(h[i].p * (0.55 + rnd() * 0.15)).toFixed(2) }); }
  const common = 45 + Math.floor(rnd() * 20), pool = 8 + Math.floor(rnd() * 8);
  return { valuations409a: q.slice(-6), capTable: { totalShares: (120 + Math.floor(rnd() * 400)) * 1e6, common, preferred: 100 - common - pool, pool }, docs: ['Cap table summary', '409A valuation report', 'Certificate of incorporation', 'Latest investor update', 'Financial summary (trailing 12 months)', 'Stock transfer policy'], updated: NOW_T - Math.floor(rnd() * 40) * DAY };
}
function genIOIs(c) {
  const rnd = mulberry32(hashStr(c.ticker + ':ioi'));
  const n = c.liquid ? 4 + Math.floor(rnd() * 12) : Math.floor(rnd() * 5); const out = [];
  for (let i = 0; i < n; i++) { const side = rnd() < 0.6 ? 'buy' : 'sell'; out.push({ id: c.ticker + '-IOI' + i, companyId: c.id, side, price: +(c.price * (side === 'buy' ? 0.9 + rnd() * 0.18 : 0.95 + rnd() * 0.25)).toFixed(2), qty: roundQty(500 + rnd() * 20000), created: NOW_T - Math.floor(rnd() * 30) * DAY, mine: false }); }
  return out;
}

const COMPANIES = CATALOG.map((c, i) => buildCompany(c, i));

function buildIndex() {
  const members = COMPANIES.filter(c => c.liquid);
  const minLen = Math.min(...members.map(c => c.history.length));
  const pts = [];
  for (let i = 0; i < minLen; i++) {
    let sum = 0;
    members.forEach(c => { const h = c.history; sum += h[h.length - minLen + i].p / h[h.length - minLen].p; });
    pts.push({ t: members[0].history[members[0].history.length - minLen + i].t, p: +((sum / members.length) * 100).toFixed(2) });
  }
  const last = pts[pts.length - 1].p;
  const intraday = [];
  for (let i = 0; i <= 24; i++) {
    let sum = 0; members.forEach(c => sum += c.intraday[i].p / c.price);
    intraday.push({ t: members[0].intraday[i].t, p: +((sum / members.length) * last).toFixed(2) });
  }
  return { id: 'rx50', name: 'RX50 Index', history: pts, intraday, members };
}
const INDEX = buildIndex();

// ---------------- funds (RX50 index + managed vehicles) ----------------
function buildFund(def) {
  const rnd = mulberry32(hashStr(def.id));
  const basket = def.basket.map(b => ({ c: COMPANIES.find(x => x.id === b.companyId), w: b.w }));
  const start = NOW_T - def.years * 365 * DAY;
  const pts = []; const base = def.nav0;
  for (let t = start; t <= NOW_T; t += DAY) {
    let v = 0; basket.forEach(b => { const h = b.c.history; const i0 = Math.max(0, Math.min(h.length - 1, Math.round((start - h[0].t) / DAY))); const i = Math.max(0, Math.min(h.length - 1, Math.round((t - h[0].t) / DAY))); v += b.w * h[i].p / h[i0].p; });
    pts.push({ t, p: +(base * v * (1 - def.fee * ((t - start) / DAY / 365))).toFixed(2) });
  }
  const last = pts[pts.length - 1].p;
  const intraday = []; for (let i = 0; i <= 24; i++) { let v = 0; basket.forEach(b => v += b.w * b.c.intraday[i].p / b.c.price); intraday.push({ t: basket[0].c.intraday[i].t, p: +(last * v).toFixed(2) }); }
  return Object.assign({}, def, { basket, history: pts, intraday, nav: last, inception: start, aum: def.aumM * 1e6, capacity: def.capacityM ? def.capacityM * 1e6 : null, filled: def.capacityM ? Math.min(1, def.aumM / def.capacityM) : null });
}
const FUNDS = [Object.assign(INDEX, { type: 'index', status: 'Index', strategy: 'Equal-weight liquidity index', desc: 'The RX50 is an equal-weight price index of the most liquid securities on Rainmaker X. It is generated directly from user orders and transactions on the platform and is intended to be a barometer for the direction and momentum of the late-stage private market.', nav: INDEX.history[INDEX.history.length - 1].p, inception: INDEX.history[0].t, basket: INDEX.members.map(c => ({ c, w: 1 / INDEX.members.length })), fee: 0, min: 0, aum: 0 })].concat(FUND_DEFS.map(buildFund));

// ---------------- registered representatives ----------------
