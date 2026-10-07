/* ==============================================================
   Rainmaker X · app · router
   Hash → view dispatch, visitor and staff gates, idle-lock timer, global click / key handlers.
   Loaded last: the final line renders the first page.
   ============================================================== */
'use strict';

// Split the hash into [route, arg1, arg2, arg3].
function parse() { const h = location.hash.replace(/^#\/?/, '') || 'home'; return h.split('/').map(decodeURIComponent); }
// Render the page for the current hash. Visitors and non-staff are redirected or shown not-found.
function render() {
  const [route, a, b, c2] = parse(); const main = document.getElementById('main');
  NAV.record(location.hash || '#/home');   // in-app Back / Forward history
  D.checkAlerts(); D.checkGuards();
  renderHeader(route === 'company' || route === 'order' || route === 'chart' ? 'browse' : route === 'match' ? '' : route === 'new' ? '' : route === 'index' ? 'funds' : route === 'fund' ? ((D.fund(a) || {}).type === 'spv' ? 'spvs' : 'funds') : route === 'orders' || route === 'messages' ? '' : route === 'admin' && a ? 'admin:' + a : route === 'client' ? 'admin:clients' : route);
  // Signed out: member pages stay in the nav and render as themselves with "Sign in to access" (Ben, Oct 6 2026); staff routes go to the plain sign-in form.
  if (D.isVisitor() && ['new', 'orders', 'order', 'match', 'account', 'profile', 'messages', 'dashboard'].includes(route)) { viewLocked(main, route, location.hash); return; }
  if (D.isVisitor() && ['admin', 'client', 'desk', 'staff'].includes(route)) { viewSignIn(main, 'signin', location.hash); document.title = 'Rainmaker X · Sign in'; return; }
  // Staff areas are never rendered for non-staff: the address answers "not found" and the attempt is logged.
  if (['admin', 'client', 'desk'].includes(route) && !D.isStaff()) { D.accessDenied('#/' + route); viewNotFound(main); document.title = 'Rainmaker X'; return; }
  if (route === 'signin') viewSignIn(main, a === 'create' ? 'create' : 'signin');
  else if (route === 'home') viewHome(main);
  else if (route === 'profile') { viewProfile(main); wireVerification(main); if (a === 'verification') { const v = main.querySelector('#verification'); if (v) setTimeout(() => v.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); } }
  else if (route === 'account') { if (a === 'statement') viewStatement(main, b); else viewAccount(main, a); }
  else if (route === 'admin') viewAdmin(main, a, b);
  else if (route === 'role') { switchRole(a); return; }
  else if (route === 'staff') viewStaffGate(main, a);
  else if (route === 'spvs') viewSPVs(main);
  else if (route === 'alternatives') viewAlternatives(main, a);
  else if (route === 'client') viewClient(main, a);
  else if (route === 'join') viewJoin(main);
  else if (route === 'funds') viewFunds(main);
  else if (route === 'fund') viewFund(main, a);
  else if (route === 'representatives') viewReps(main);
  else if (route === 'desk') viewDesk(main);
  else if (route === 'messages') viewMessages(main, a);
  else if (route === 'chart') viewChart(main, a);
  else if (route === 'dashboard') viewDashboard(main);
  else if (route === 'market') viewMarket(main);
  else if (route === 'browse') { if (a === 'industry' && b) { browseState.industries = [b]; browseState.investor = ''; browseState.sector = ''; browseState.page = 1; } else if (a === 'investor' && b) { browseState.investor = b; browseState.industries = []; browseState.sector = ''; browseState.page = 1; } else if (a === 'sector' && b) { browseState.sector = b; browseState.investor = ''; browseState.industries = []; browseState.page = 1; } viewBrowse(main); }
  else if (route === 'company') { viewCompany(main, a, b); if (b === 'desk') setTimeout(() => { const d = main.querySelector('#desk'); if (d) { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); d.classList.add('flash'); } }, 60); }
  else if (route === 'order') viewOrder(main, a);
  else if (route === 'match') viewMatch(main, a);
  else if (route === 'index') viewIndex(main);
  else if (route === 'orders') { if (a) ordersTab = a; viewOrders(main); }
  else if (route === 'new') { if (a === 'custom') viewCustomOrder(main, b, c2); else if (a === 'arrange') { const isCo = !!D.company(b); viewArrangement(main, isCo ? c2 : b, isCo ? b : c2); } else viewNewOrder(main, a === 'listing' ? 'listing' : 'bid', b); }
  else viewHome(main);
  document.title = 'Rainmaker X · Exchange';
  main.querySelectorAll('tr.clickable, .ccard, .order-card, .todo-item').forEach(el => { if (!el.hasAttribute('tabindex')) el.tabIndex = 0; });
}
document.addEventListener('keydown', e => {
  const el = document.activeElement; if (!el || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
  if (e.key === 'Enter' && el.dataset && el.dataset.href) { go(el.dataset.href); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const rows = [...document.querySelectorAll('[tabindex="0"]')].filter(r => r.offsetParent); const i = rows.indexOf(el); if (i < 0) return; const n = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { e.preventDefault(); n.focus(); n.scrollIntoView({ block: 'nearest' }); } }
});
// delegated handlers: watch stars, cancel buttons, clickable rows/cards
// SPV subscription cancel / decline form (inline reason, no browser dialog).
document.addEventListener('submit', e => { const f = e.target.closest('[data-sub-cancel-form]'); if (!f) return; e.preventDefault(); const r = D.cancelSpvSub(f.dataset.subCancelForm, f.reason.value); if (r.error) { toast(r.error, false); return; } toast(`${f.dataset.subCancelForm} ${r.sub.status}${r.sub.fundedAt ? ' · escrow returned' : ''}`); render(); });
document.addEventListener('click', e => {
  const w = e.target.closest('[data-watch]'); if (w) { e.preventDefault(); e.stopPropagation(); D.toggleWatch(w.dataset.watch); toast(D.isWatched(w.dataset.watch) ? 'Added to your watchlist' : 'Removed from your watchlist'); render(); return; }
  const al = e.target.closest('[data-alert]'); if (al) { e.preventDefault(); const box = document.querySelector('#alert-box'); if (box) box.classList.toggle('hidden'); else toast('Open a company page to set alerts', false); return; }
  const ad = e.target.closest('[data-alert-del]'); if (ad) { e.preventDefault(); D.removeAlert(ad.dataset.alertDel); toast('Alert removed'); render(); return; }
  const wd = e.target.closest('[data-withdraw]'); if (wd) { e.preventDefault(); D.withdrawIOI(wd.dataset.withdraw); toast('Indication withdrawn'); render(); return; }
  // SPV subscription steps (Ben, Oct 5 2026): sign → fund escrow → Rainmaker issues; cancel / decline with an inline reason.
  const ss = e.target.closest('[data-sub-sign]'); if (ss) { e.preventDefault(); const r = D.signSpvSub(ss.dataset.subSign); if (r.error) { toast(r.error, false); return; } toast(`${ss.dataset.subSign}: subscription agreement signed`); render(); return; }
  const sf = e.target.closest('[data-sub-fund]'); if (sf) { e.preventDefault(); const r = D.fundSpvSub(sf.dataset.subFund); if (r.error) { toast(r.error, false); return; } toast(`${sf.dataset.subFund}: ${money(r.sub.notional, 0)} moved to escrow`); render(); return; }
  const si = e.target.closest('[data-sub-issue]'); if (si) { e.preventDefault(); const r = D.issueSpvSub(si.dataset.subIssue); if (r.error) { toast(r.error, false); return; } toast(`${si.dataset.subIssue}: ${num(r.sub.units)} units issued`); render(); return; }
  const sc = e.target.closest('[data-sub-cancel]'); if (sc) { e.preventDefault(); const box = sc.closest('.spv-sub').querySelector('.sub-cancel'); box.hidden = !box.hidden; if (!box.hidden) box.querySelector('input').focus(); return; }
  const scn = e.target.closest('[data-sub-cancel-no]'); if (scn) { e.preventDefault(); scn.closest('.sub-cancel').hidden = true; return; }
  const adv = e.target.closest('[data-advance]'); if (adv) { e.preventDefault(); D.advanceSettlement(adv.dataset.advance); render(); return; }
  const ct = e.target.closest('[data-contact]'); if (ct) { e.preventDefault(); e.stopPropagation(); openContact(ct.dataset.contact || null, ct.dataset.order || null); return; }
  const sm = e.target.closest('[data-stl-mark]'); if (sm) { e.preventDefault(); D.settlementMark(sm.dataset.stlMark, sm.dataset.what); toast(sm.dataset.what === 'fees' ? 'Broker fee payment recorded' : `${sm.dataset.what[0].toUpperCase() + sm.dataset.what.slice(1)} signature recorded`); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const axv = e.target.closest('[data-ax-view]'); if (axv) { e.preventDefault(); e.stopPropagation(); openLightbox(axv.getAttribute('src')); return; }
  const dr = e.target.closest('[data-dataroom]'); if (dr) { e.preventDefault(); D.grantDataRoom(dr.dataset.dataroom); toast('Data room access granted'); render(); return; }
  const dq = e.target.closest('[data-desk-request]'); if (dq) { e.preventDefault(); const qEl = document.querySelector('#desk-req-qty'); const rq = D.submitRequest({ kind: 'desk', companyId: dq.dataset.deskRequest, qty: qEl ? +qEl.value || 1000 : 1000 }); toast(`Request ${rq.id} sent to the desk`); render(); return; }
  const drq = e.target.closest('[data-dr-request]'); if (drq) { e.preventDefault(); const rq = D.submitRequest({ kind: 'dataroom', companyId: drq.dataset.drRequest }); toast(`Request ${rq.id} sent to compliance`); render(); return; }
  const wr = e.target.closest('[data-withdraw-req]'); if (wr) { e.preventDefault(); D.withdrawRequest(wr.dataset.withdrawReq); toast('Request withdrawn'); render(); return; }
  const sg = e.target.closest('[data-sign]'); if (sg) { e.preventDefault(); e.stopPropagation(); D.signDoc(sg.dataset.sign, sg.dataset.doc); toast(`${sg.dataset.doc} signed`); render(); return; }
  const rcf = e.target.closest('[data-recertify]'); if (rcf) { e.preventDefault(); D.recertify(); toast('Re-certification submitted'); render(); return; }
  const rl = e.target.closest('[data-role]'); if (rl && !rl.closest('#avatar-menu')) { e.preventDefault(); switchRole(rl.dataset.role); return; }
  const fa = e.target.closest('[data-form-approve]'); if (fa) { e.preventDefault(); D.reviewForm(fa.dataset.formApprove, 'approve'); toast('Form approved'); render(); return; }
  const fr = e.target.closest('[data-form-return]'); if (fr) { e.preventDefault(); const why = prompt('What needs to change (sent to the client):', 'Signature date is missing on page 3.'); if (why === null) return; D.reviewForm(fr.dataset.formReturn, 'return', why); toast('Form returned to the client'); render(); return; }
  const fo = e.target.closest('[data-form-reopen]'); if (fo) { e.preventDefault(); D.reviewForm(fo.dataset.formReopen, 'reopen'); toast('Form reopened for review'); render(); return; }
  const va = e.target.closest('[data-ver-approve]'); if (va) { e.preventDefault(); D.reviewVerification(va.dataset.verApprove, 'approve'); toast('Verification approved'); render(); return; }
  const vr = e.target.closest('[data-ver-reject]'); if (vr) { e.preventDefault(); const note = prompt('Note to the client (what is missing or why it was revoked):', 'Please attach a current brokerage statement or CPA letter.'); if (note === null) return; D.reviewVerification(vr.dataset.verReject, 'reject', note); toast('Client notified'); render(); return; }
  const ra = e.target.closest('[data-req-approve]'); if (ra) { e.preventDefault(); D.approveRequest(ra.dataset.reqApprove, ''); toast('Request approved'); render(); return; }
  const rr = e.target.closest('[data-req-reject]'); if (rr) { e.preventDefault(); const why = prompt('Reason sent to the client:', 'Price is too far from the market to work.'); if (why === null) return; D.rejectRequest(rr.dataset.reqReject, why); toast('Request declined'); render(); return; }
  const mapv = e.target.closest('[data-match-approve]'); if (mapv) { e.preventDefault(); e.stopPropagation(); const res = D.approveMatch(mapv.dataset.matchApprove); if (res.error) { toast(res.error, false); return; } toast(`${mapv.dataset.matchApprove} approved · both parties notified · settlement opened`); render(); return; }
  const mdec = e.target.closest('[data-match-decline]'); if (mdec) { e.preventDefault(); e.stopPropagation(); const why = prompt('Reason for declining ' + mdec.dataset.matchDecline + ' (sent to the parties, recorded in the activity log):', 'Counterparty failed clearance checks.'); if (why === null) return; const res = D.declineMatch(mdec.dataset.matchDecline, why); if (res.error) { toast(res.error, false); return; } toast(`${mdec.dataset.matchDecline} declined · quantities restored`); render(); return; }
  const rra = e.target.closest('[data-rr-approve]'); if (rra) { e.preventDefault(); const res = D.decideRepRequest(rra.dataset.rrApprove, 'approve'); if (res.error) { toast(res.error, false); return; } toast('Accepted as primary representative · client notified'); render(); return; }
  const rrd = e.target.closest('[data-rr-deny]'); if (rrd) { e.preventDefault(); const why = prompt('Reason (sent to the client):', 'My book is full at the moment.'); if (why === null) return; const res = D.decideRepRequest(rrd.dataset.rrDeny, 'deny', why); if (res.error) { toast(res.error, false); return; } toast('Denied · client notified'); render(); return; }
  const ofl = e.target.closest('[data-order-flag]'); if (ofl) { e.preventDefault(); D.flagOrder(ofl.dataset.orderFlag); render(); return; }
  const crm = e.target.closest('[data-co-remove]'); if (crm) { e.preventDefault(); const c = D.company(crm.dataset.coRemove); const why = prompt('Remove ' + c.name + ' from the exchange? Reason:', 'Company requested delisting.'); if (why === null) return; D.removeCompany(c.id, why); toast(c.name + ' removed'); render(); return; }
  const arx = e.target.closest('[data-arr]'); if (arx) { e.preventDefault(); const st = arx.dataset.arr; const note = st === 'term sheet' ? prompt('Term sheet headline (sent to the client):', 'Premium $4.10/sh, 12-month American call, physical settlement, collateral 25%.') : st === 'declined' ? prompt('Reason:', 'The desk cannot take this exposure at these terms.') : ''; if (note === null) return; D.advanceArrangement(arx.dataset.aid, st, note); toast(`${arx.dataset.aid} → ${st}`); render(); return; }
  const arw = e.target.closest('[data-arr-withdraw]'); if (arw) { e.preventDefault(); D.withdrawArrangement(arw.dataset.arrWithdraw); toast('Withdrawn'); render(); return; }
  const rc = e.target.closest('[data-reconfirm]'); if (rc) { e.preventDefault(); D.reconfirmOrder(rc.dataset.reconfirm); toast('Reconfirmed for another 30 days'); render(); return; }
  const cn = e.target.closest('[data-cancel]'); if (cn) { e.preventDefault(); e.stopPropagation(); if (confirm('Cancel order ' + cn.dataset.cancel + '?')) { D.cancelOrder(cn.dataset.cancel); toast('Order cancelled'); render(); } return; }
  const dv = e.target.closest('[data-doc]'); if (dv && !dv.dataset.sign) { e.preventDefault(); toast('Documents are placeholders in this prototype', false); return; }
  const r = e.target.closest('[data-href]'); if (r && !e.target.closest('a, button, input, select')) { go(r.dataset.href); }
});
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
['click', 'keydown'].forEach(ev => document.addEventListener(ev, () => D.touchStaff(), true));
// Poll the staff session so an idle lock takes effect on screen.
let staffWas = D.isStaff();
setInterval(() => { const now = D.isStaff(); if (staffWas && !now) { toast('Staff session locked after inactivity'); if (['admin', 'client', 'desk'].includes(parse()[0])) go('#/dashboard'); render(); } else if (now) { const t = document.querySelector('.staff-role .ttl'); if (t) t.textContent = `· secure session · locks in ${Math.max(1, Math.ceil(D.staffRemaining() / 60000))} min`; } staffWas = now; }, 60000);
window.addEventListener('rx-messages', () => { const r = parse()[0]; if (r === 'messages' || r === 'order' || r === 'desk' || r === 'profile') { const y = window.scrollY; render(); window.scrollTo(0, y); } else renderHeader(r); });
render();
