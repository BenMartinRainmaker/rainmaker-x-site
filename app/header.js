/* ==============================================================
   Rainmaker X · app · header
   Role switching, staff second row, the top bar (nav, ⌘K palette, ticker tape, profile menu)
   and the palette search groups.
   ============================================================== */
'use strict';

// Change the active role from the profile menu (staff roles go through the passcode gate).
function switchRole(r) { if (!D.ROLES[r]) return; if (r === 'client') { D.setRole('client'); toast('Switched to client view'); go('#/dashboard'); render(); } else if (D.role() === r) { go('#/admin'); } else if (D.isStaff()) { const x = D.staffSwitch(r); if (x.error) { go('#/staff/' + r); return; } toast('Switched to ' + D.ROLES[r] + ' view'); go('#/admin'); render(); } else { go('#/staff/' + r); } }
// Second nav row for staff: role, session timer, permitted queues with counts, Lock.
function staffBar(route) {
  if (!D.isStaff()) return '';
  const cl = D.clientsList(); const ver = cl.filter(c => c.status === 'pending').length; const req = D.requests().filter(r => r.status === 'pending').length + D.arrangements().filter(a => ['submitted', 'structuring', 'term sheet'].includes(a.status)).length;
  const inbox = D.messages().filter(m => m.from === 'you' && Date.now() - m.ts < 2 * DAYMS).length; const forms = D.can('forms') ? D.formsPending() : 0; const mins = Math.max(1, Math.ceil(D.staffRemaining() / 60000));
  const tab = (href, label, key, n, perm) => (!perm || D.can(perm)) ? `<a class="tab ${route === key ? 'active' : ''}" href="${href}">${label}${n ? `<span class="cnt" title="${n} waiting">${n}</span>` : ''}</a>` : '';
  return `<div class="staffbar"><div class="staffbar-inner"><span class="staff-role">${LOCK}${esc(D.ROLES[D.role()])}<span class="ttl">· secure session · locks in ${mins} min</span></span>${tab('#/admin', 'Overview', 'admin')}${tab('#/desk', 'Rep Desk', 'desk', D.pendingRepRequests().length, 'desk')}${tab('#/admin/verifications', 'Verifications', 'admin:verifications', ver, 'verifications')}${tab('#/admin/forms', 'Compliance forms', 'admin:forms', forms, 'forms')}${tab('#/admin/requests', 'Requests', 'admin:requests', req, 'requests')}${tab('#/admin/orders', 'Orders', 'admin:orders', 0, 'orders.view')}${tab('#/admin/matches', 'Matches', 'admin:matches', (D.pendingMatches().length + D.openSpvSubs().filter(x => x.stage === 2).length), 'matches')}${tab('#/admin/companies', 'Companies', 'admin:companies', 0, 'companies')}${tab('#/admin/inbox', 'Messages', 'admin:inbox', inbox, 'inbox')}${tab('#/admin/mailbox', 'Rainmaker mailbox', 'admin:mailbox', D.firmUnread(), 'inbox')}${tab('#/admin/clients', 'Clients', 'admin:clients', 0, 'clients')}${tab('#/admin/audit', 'Activity log', 'admin:audit', 0, 'audit')}<span class="spacer"></span><button class="btn xs" id="staff-lock" type="button" title="End the staff session">Lock</button></div></div>`;
}
// Top bar: logo, member / visitor nav, ⌘K search, mail and bell, New order, profile square and menu, ticker tape.
function renderHeader(route) {
  const h = document.getElementById('header');
  const link = (href, label, key, short) => `<a href="${href}" class="${route === key ? 'active' : ''}"><span class="nl">${label}</span><span class="ns">${short || label}</span></a>`;
  const productNav = `${link('#/funds', 'Funds', 'funds')}${link('#/spvs', 'SPVs', 'spvs')}${link('#/alternatives', 'Alternatives', 'alternatives', 'Alts')}`;
  const memberNav = `${link('#/home', 'Home', 'home')}${link('#/profile', 'My Profile', 'profile', 'Profile')}${link('#/account', 'Account', 'account')}${link('#/dashboard', 'Dashboard', 'dashboard')}${link('#/browse', 'Browse Companies', 'browse', 'Browse')}${link('#/market', 'Market activity', 'market', 'Market')}${productNav}${link('#/representatives', 'Representatives', 'representatives', 'Reps')}`;
  const visitorNav = `${link('#/home', 'Home', 'home')}${link('#/browse', 'Browse Companies', 'browse', 'Browse')}${link('#/market', 'Market activity', 'market', 'Market')}${productNav}${link('#/representatives', 'Representatives', 'representatives', 'Reps')}`;
  const notes = D.notifications().slice(0, 8);
  const liqOf = c => D.liveListings(c.id).length + D.liveBids(c.id).length; const maxLiq = Math.max(1, ...D.COMPANIES.map(liqOf));
  const tape = D.COMPANIES.map(c => { const ch = D.change(c, '1D'); return `<a class="tape-item" href="#/company/${c.id}">${logo(c, 'tile')}<span class="tape-txt"><b>${esc(c.name)}</b><span class="tape-px">${money(D.price(c.id))} <span class="${cls(ch)}">${pct(ch)}</span></span></span><span class="liq" style="--f:${(liqOf(c) / maxLiq).toFixed(2)}" title="${liqOf(c)} live orders"></span></a>`; }).join('');
  h.innerHTML = `<div class="topbar-inner">
    <a class="brand" href="#/home" title="Rainmaker X"><span class="brand-mark">${LOGO}</span><span class="brand-name">Rainmaker<span>X</span></span></a>
    <button class="nav-toggle" id="nav-toggle" aria-label="Menu">☰</button>
    <nav class="nav" id="nav">${D.isVisitor() ? visitorNav : memberNav}</nav>
    <button class="search-pill" id="gsearch-open" type="button">${ICON.search}<span>Search</span><kbd>⌘K</kbd></button>
    <div class="palette hidden" id="palette"><div class="palette-box"><div class="palette-input">${ICON.search}<input id="gsearch" placeholder="Search companies, industries, investors, orders…" autocomplete="off"><button class="palette-x" id="palette-x" type="button">✕</button></div><div class="palette-results" id="gsearch-menu"></div></div></div>
    <div class="topbar-right">${D.isVisitor() ? `<a class="btn outline sm hdr-login" href="#/signin">Sign in</a><a class="btn hdr" href="#/signin/create">${ICON.plus} <span class="lbl">Create account</span></a></div></div>` : `
      <div class="rel"><button class="btn hdr ${D.canTrade() ? '' : 'locked'}" id="new-order" title="${D.canTrade() ? 'Create an order' : 'Complete investor verification to unlock. Until then, use the order forms to submit requests.'}">${ICON.plus} <span class="lbl">New order</span> ${ICON.chev}</button>
        <div class="menu hidden" id="new-menu"><div class="menu-head">Create an order</div><a href="#/new/bid"><b>Place a bid</b><div class="tiny muted">Buy at a price any seller can accept</div></a><a href="#/new/listing"><b>Place an ask</b><div class="tiny muted">Sell shares you hold</div></a><a href="#/new/custom"><b>Custom order</b><div class="tiny muted">Ladders and fill rules, or options, forwards, SPVs and special terms</div></a></div></div>
      <a class="icon-btn" href="#/messages" title="Messages">${ICON.mail}${D.unreadMessages() ? `<span class="cnt-red">${D.unreadMessages()}</span>` : ''}</a>
      <div class="rel"><button class="icon-btn" id="bell" title="Notifications">${ICON.bell}${notes.length ? `<span class="cnt-red">${notes.length > 9 ? '9+' : notes.length}</span>` : ''}</button>
        <div class="menu hidden" id="bell-menu" style="min-width:320px"><div class="menu-head">Notifications</div>${notes.map(n => `<div class="note">${esc(n.text)}<div class="ts">${fmtPlaced(n.ts)}</div></div>`).join('') || '<div class="note muted">No notifications yet</div>'}</div></div>
      <div class="rel"><button class="profile-btn ${D.canTrade() ? 'verified' : 'unverified'} ${route === 'profile' ? 'on' : ''}" id="avatar" title="${D.canTrade() ? 'Verified investor' : 'Not yet verified'}"><span class="pic">${D.profile().photo ? `<img src="${D.profile().photo}" alt="">` : esc(D.profile().initials)}</span><span class="lbl">${esc(D.profile().name)}</span>${ICON.chev}</button>
        <div class="menu hidden" id="avatar-menu"><div class="menu-head">${esc(D.profile().name)} · ${verBadge()}</div><a href="#/profile"><b>Account</b><div class="tiny muted">Profile, photo, verification and brokerage details</div></a><div class="menu-head">Switch view (demo)</div><div class="role-row">${Object.entries(D.ROLES).map(([k, v]) => `<button class="chip ${D.role() === k ? 'on' : ''}" data-role="${k}">${v}</button>`).join('')}</div><button id="sign-out"><b>Log out</b></button><button id="reset-data" class="tiny muted">Reset demo data</button></div></div>
    </div></div>`}
    ${staffBar(route)}<div class="tape"><div class="tape-track">${tape}${tape}</div></div>${histBar()}`;
  wireHistBar(h);
  const sl = h.querySelector('#staff-lock'); if (sl) sl.onclick = () => { D.staffLock('locked by user'); toast('Staff session locked'); go('#/dashboard'); render(); };
  const closeMenus = () => document.querySelectorAll('.menu, .search-menu').forEach(m => m.classList.add('hidden'));
  const toggle = (btn, menu) => { const b = h.querySelector(btn); if (!b) return; b.onclick = e => { e.stopPropagation(); const m = h.querySelector(menu); const open = m.classList.contains('hidden'); closeMenus(); if (open) m.classList.remove('hidden'); }; };
  toggle('#new-order', '#new-menu'); toggle('#bell', '#bell-menu'); toggle('#avatar', '#avatar-menu');
  const rd = h.querySelector('#reset-data'); if (rd) rd.onclick = () => { if (confirm('Reset all locally saved orders, bids and watchlist?')) D.reset(); };
  const so = h.querySelector('#sign-out'); if (so) so.onclick = () => { D.signOut(); toast('Logged out'); go('#/home'); render(); };
  if (!window.__rxMenuClose) { window.__rxMenuClose = true; document.addEventListener('click', () => document.querySelectorAll('.menu, .search-menu').forEach(m => m.classList.add('hidden'))); document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.menu, .search-menu').forEach(m => m.classList.add('hidden')); }); }
  const nt = h.querySelector('#nav-toggle'); if (nt) nt.onclick = e => { e.stopPropagation(); h.querySelector('#nav').classList.toggle('open'); };
  h.querySelectorAll('[data-role]').forEach(b => b.onclick = e => { e.stopPropagation(); switchRole(b.dataset.role); });
  const pal = h.querySelector('#palette'), inp = h.querySelector('#gsearch'), menu = h.querySelector('#gsearch-menu'); let sel = 0, flat = [];
  const draw = () => { const groups = paletteGroups(inp.value); flat = groups.flatMap(g => g.items); let i = -1;
    menu.innerHTML = groups.length ? groups.map(g => `<div class="pal-group"><div class="pal-title">${esc(g.title)}</div>${g.items.map(it => { i++; return `<a class="pal-item ${i === sel ? 'sel' : ''}" data-i="${i}" href="${it.href}">${it.icon}<span class="pal-body"><b>${esc(it.label)}</b>${it.sub ? `<div class="tiny muted">${esc(it.sub)}</div>` : ''}</span><span class="pal-right">${it.right || ''}${i === sel ? '<kbd class="pal-enter">↵</kbd>' : ''}</span></a>`; }).join('')}</div>`).join('') : '<div class="pal-empty">No matches. Try a company name, ticker, industry, investor or order ID.</div>';
    const s = menu.querySelector('.pal-item.sel'); if (s) s.scrollIntoView({ block: 'nearest' }); };
  const openPal = () => { pal.classList.remove('hidden'); document.body.classList.add('pal-open'); sel = 0; draw(); setTimeout(() => { inp.focus(); inp.select(); }, 0); };
  const closePal = () => { pal.classList.add('hidden'); document.body.classList.remove('pal-open'); inp.value = ''; };
  h.querySelector('#gsearch-open').onclick = e => { e.stopPropagation(); openPal(); };
  h.querySelector('#palette-x').onclick = closePal;
  pal.addEventListener('click', e => { if (e.target === pal) closePal(); });
  pal.querySelector('.palette-box').addEventListener('click', e => e.stopPropagation());
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(flat.length - 1, sel + 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); } else if (e.key === 'Enter' && flat[sel]) { e.preventDefault(); const href = flat[sel].href; closePal(); go(href); } else if (e.key === 'Escape') { closePal(); } });
  menu.addEventListener('mousemove', e => { const it = e.target.closest('.pal-item'); if (it && +it.dataset.i !== sel) { sel = +it.dataset.i; menu.querySelectorAll('.pal-item').forEach(x => x.classList.toggle('sel', +x.dataset.i === sel)); } });
  menu.addEventListener('click', e => { if (e.target.closest('.pal-item')) closePal(); });
  window.__rxOpenPalette = openPal;
  if (!window.__rxKeys) { window.__rxKeys = true; document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (window.__rxOpenPalette) window.__rxOpenPalette(); } else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { e.preventDefault(); if (window.__rxOpenPalette) window.__rxOpenPalette(); } }); }
}

// ---------------- views ----------------

// Grouped search results for the ⌘K palette (companies, industries, funds, orders, pages …).
function paletteGroups(q) {
  q = (q || '').trim().toLowerCase(); const g = []; const liq = c => D.liveListings(c.id).length + D.liveBids(c.id).length; const maxLiq = Math.max(1, ...D.COMPANIES.map(liq));
  const coRow = c => ({ icon: logo(c, 'tile'), label: c.name, sub: `${c.ticker} · ${c.sector}${c.liquid ? ' · RX50' : ''}`, right: `<span class="pal-px">${money(D.price(c.id))}</span><span class="tiny ${cls(D.change(c, '1D'))}">${pct(D.change(c, '1D'))}</span><span class="liq" style="--f:${(liq(c) / maxLiq).toFixed(2)}" title="${liq(c)} live orders"></span>`, href: '#/company/' + c.id });
  const allInd = {}; D.COMPANIES.forEach(c => c.industries.forEach(i => { allInd[i] = (allInd[i] || 0) + 1; }));
  const allInv = {}; D.COMPANIES.forEach(c => c.investors.forEach(i => { allInv[i] = (allInv[i] || 0) + 1; }));
  const sectors = {}; D.COMPANIES.forEach(c => { sectors[c.sector] = (sectors[c.sector] || 0) + 1; });
  const indRow = ([i, n]) => ({ icon: '<span class="pal-ico">' + ICON.building + '</span>', label: i, sub: `${n} ${n === 1 ? 'company' : 'companies'}`, right: '', href: '#/browse/industry/' + encodeURIComponent(i) });
  const secRow = ([s, n]) => ({ icon: '<span class="pal-ico">' + ICON.tag + '</span>', label: s, sub: `${n} ${n === 1 ? 'company' : 'companies'}`, right: '', href: '#/browse/sector/' + encodeURIComponent(s) });
  const invRow = ([i, n]) => ({ icon: `<span class="pal-ico inv">${esc(i.split(/\s+/).map(x => x[0]).join('').slice(0, 2))}</span>`, label: i, sub: `${n} ${n === 1 ? 'position' : 'positions'} on the exchange`, right: '', href: '#/browse/investor/' + encodeURIComponent(i) });
  if (!q) {
    const watch = D.state.watchlist.map(id => D.company(id)).filter(Boolean).slice(0, 3); const active = D.mostActive(8).map(x => x.c).filter(c => !watch.includes(c)).slice(0, 6 - watch.length);
    g.push({ title: watch.length ? 'Your watchlist and most active' : 'Most active companies', items: watch.concat(active).map(coRow) });
    g.push({ title: 'Industries', items: Object.entries(allInd).sort((x, y) => y[1] - x[1]).slice(0, 5).map(indRow) });
    g.push({ title: 'Categories', items: Object.entries(sectors).sort((x, y) => y[1] - x[1]).slice(0, 4).map(secRow) });
    g.push({ title: 'Investors', items: Object.entries(allInv).sort((x, y) => y[1] - x[1]).slice(0, 4).map(invRow) });
    g.push({ title: 'Jump to', items: [['Dashboard', '#/dashboard'], ['Market activity', '#/market'], ['My Orders', '#/orders'], ['Account', '#/account'], ['Structured deal', '#/new/arrange']].map(p => ({ icon: '<span class="pal-ico">→</span>', label: p[0], sub: '', right: '', href: p[1] })) });
    return g;
  }
  const cos = D.COMPANIES.filter(c => c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q)).slice(0, 7); if (cos.length) g.push({ title: 'Companies', items: cos.map(coRow) });
  const inds = Object.entries(allInd).filter(([i]) => i.toLowerCase().includes(q)).slice(0, 4); if (inds.length) g.push({ title: 'Industries', items: inds.map(indRow) });
  const secs = Object.entries(sectors).filter(([s]) => s.toLowerCase().includes(q)).slice(0, 3); if (secs.length) g.push({ title: 'Categories', items: secs.map(secRow) });
  const invs = Object.entries(allInv).filter(([i]) => i.toLowerCase().includes(q)).slice(0, 4); if (invs.length) g.push({ title: 'Investors', items: invs.map(invRow) });
  const funds = D.FUNDS.filter(f => f.name.toLowerCase().includes(q) || (f.type === 'spv' && D.company(f.underlying).name.toLowerCase().includes(q))).slice(0, 4); if (funds.length) g.push({ title: 'Funds and SPVs', items: funds.map(f => ({ icon: `<span class="fund-mark ${f.type}" style="width:36px;height:36px;font-size:11px;border-radius:9px">${f.type === 'index' ? '50' : f.type === 'spv' ? 'SPV' : 'RX'}</span>`, label: f.name, sub: f.strategy, right: `<span class="pal-px">${f.type === 'index' ? f.nav.toFixed(2) : money(f.nav)}</span>`, href: '#/fund/' + f.id })) });
  if (q.length >= 3) { const ords = D.allOrders().filter(o => o.id.toLowerCase().includes(q)).slice(0, 4); if (ords.length) g.push({ title: 'Orders', items: ords.map(o => ({ icon: `<span class="pal-ico">${o.side === 'listing' ? 'A' : 'B'}</span>`, label: o.id, sub: `${D.company(o.companyId).name} · ${num(o.qty)} @ ${money(o.price)} · ${o.status}`, right: '', href: '#/order/' + o.id })) }); }
  const reqs = D.requests().filter(r => r.id.toLowerCase().includes(q) || (r.what || '').toLowerCase().includes(q)).slice(0, 3); if (reqs.length) g.push({ title: 'Requests', items: reqs.map(r => ({ icon: '<span class="pal-ico">R</span>', label: r.id, sub: r.what, right: '', href: '#/orders/requests' })) });
  const reps = D.REPS.filter(r => r.name.toLowerCase().includes(q) || (r.title || '').toLowerCase().includes(q)).slice(0, 3); if (reps.length) g.push({ title: 'Representatives', items: reps.map(r => ({ icon: `<span class="pal-ico inv" style="background:${r.color};color:#fff">${esc(r.name.split(' ').map(x => x[0]).join(''))}</span>`, label: r.name, sub: r.title, right: '', href: '#/representatives' })) });
  const pages = [['Dashboard', '#/dashboard'], ['Browse Companies', '#/browse'], ['Market activity', '#/market'], ['My Orders', '#/orders'], ['Account', '#/account'], ['Messages', '#/messages'], ['Funds', '#/funds'], ['SPVs', '#/spvs'], ['Alternatives', '#/alternatives'], ['Options', '#/alternatives/options'], ['Forwards', '#/alternatives/forwards'], ['DP interest', '#/alternatives/dp'], ['Liquid Security', '#/alternatives/liquid'], ['Your own contract', '#/alternatives/own'], ['Custom order', '#/new/custom'], ['Structured deal', '#/new/arrange'], ['Matches', '#/orders/matches'], ['Representatives', '#/representatives']].concat(D.isStaff() ? [['Console', '#/admin'], ['Rep Desk', '#/desk'], ['Compliance forms', '#/admin/forms'], ['Rainmaker mailbox', '#/admin/mailbox'], ['Matches queue', '#/admin/matches'], ['Activity log', '#/admin/audit']] : []).filter(p => p[0].toLowerCase().includes(q)).slice(0, 3); if (pages.length) g.push({ title: 'Pages', items: pages.map(p => ({ icon: '<span class="pal-ico">→</span>', label: p[0], sub: '', right: '', href: p[1] })) });
  return g;
}
// Flat search results, used by the keyboard navigation in the palette.
function searchAll(q) { return paletteGroups(q).flatMap(g => g.items.map(i => Object.assign({ type: g.title }, i))); }
// ---------------- statement (print-friendly) ----------------
