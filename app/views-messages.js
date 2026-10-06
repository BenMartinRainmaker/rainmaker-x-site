/* ==============================================================
   Rainmaker X · app · messages
   Message threads with the representative / desk / compliance / support, attachments,
   the Contact us panel and the Ask Rainmaker card.
   ============================================================== */
'use strict';

// Who a message bubble is from: you, rep, desk, compliance, support.
const SENDER = { you: () => ({ name: D.profile().name, initials: D.profile().initials, color: 'var(--teal)' }), rep: () => { const r = D.rep(D.profile().rep); return { name: r.name + ' · your primary representative', initials: r.name.split(' ').map(x => x[0]).join(''), color: r.color }; }, desk: () => ({ name: 'Rainmaker desk', initials: 'RX', color: 'var(--coral)' }), compliance: () => ({ name: 'Rainmaker compliance', initials: 'GW', color: '#7d6b5a' }), support: () => ({ name: 'Rainmaker Securities · support', initials: 'RS', color: '#10305f' }) };
// One message bubble with attachments.
function bubble(m) { const sd = (SENDER[m.from] || SENDER.rep)(); const you = m.from === 'you'; return `<div class="msg ${you ? 'you' : ''}"><span class="avatar sm" style="background:${sd.color}">${esc(sd.initials)}</span><div class="msg-body"><div class="msg-meta"><b>${esc(sd.name)}</b>${you && m.to === 'support' ? ' → Rainmaker Securities support' : ''} · ${fmtPlaced(m.ts)}</div><div class="msg-text">${esc(m.text)}</div>${m.attachments && m.attachments.length ? `<div class="attach-list msg-att">${attachChips(m.attachments)}</div>` : ''}</div></div>`; }
// ---- attachments (documents, screenshots) on messages. Images under ~700 KB keep a data URL so they preview; everything else is name + size.
function fmtSize(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : (n || 0) + ' B'; }
// Read chosen files into small attachment objects (images under 700 KB keep a preview).
function readAttachments(files) { return Promise.all([...files].slice(0, 8).map(f => new Promise(res => { const base = { name: f.name, size: f.size, type: f.type || 'application/octet-stream' }; if (f.type.startsWith('image/') && f.size <= 700 * 1024) { const r = new FileReader(); r.onload = () => res(Object.assign(base, { dataUrl: r.result })); r.onerror = () => res(base); r.readAsDataURL(f); } else res(base); }))); }
// Attachment chips, optionally removable.
function attachChips(list, removable) { return list.map((a, i) => `<span class="attach ${a.dataUrl ? 'img' : ''}" title="${esc(a.name)}">${a.dataUrl ? `<img src="${a.dataUrl}" alt="" data-ax-view="1">` : ICON.doc}<span class="an">${esc(a.name)}</span><span class="tiny muted">${fmtSize(a.size)}</span>${removable ? `<button type="button" class="ax" data-ax="${i}" title="Remove">✕</button>` : ''}</span>`).join(''); }
// Contact us / a representative: from every company page, the Messages page and the order pages. Routes to the member's rep or to
// Rainmaker Securities support (operations, not a broker). Supports attached documents and screenshots. Buyers and sellers never meet.
function openContact(companyId, orderId) {
  if (D.isVisitor()) { go('#/signin'); return; }
  const c = companyId ? D.company(companyId) : null;
  // About a specific order (home page cards): the subject names the order and the message starts with its terms.
  const o = orderId ? D.order(orderId) : null; const oLine = o ? `About order ${o.id} (${o.side === 'listing' ? 'ask' : 'bid'} · ${num(o.qty)} ${c ? c.name + ' ' : ''}shares @ ${money(o.price)}): ` : ''; const rep_ = D.rep(D.profile().rep); let files = [];
  const old = document.getElementById('contact-modal'); if (old) old.remove();
  const el = document.createElement('div'); el.className = 'modal-wrap'; el.id = 'contact-modal';
  el.innerHTML = `<div class="modal card"><div class="card-head"><div><b>Contact ${o ? 'us about order ' + esc(o.id) : c ? 'us about ' + esc(c.name) : 'Rainmaker'}</b><div class="tiny muted">Your primary representative or Rainmaker Securities support. Buyers and sellers are never put in touch directly.</div></div><button class="btn ghost sm" type="button" data-x>Close</button></div>
    <form class="card-body stack" id="contact-form" style="gap:12px">${D.canRequest() ? '' : gateCard('a message')}
      <div class="field"><label>Send to</label><div class="opt-cards" style="grid-template-columns:1fr 1fr"><label class="opt-card on"><input type="radio" name="to" value="rep" checked><b>${esc(rep_.name)}</b><span>Your registered representative · ${esc(rep_.phone)}</span></label><label class="opt-card"><input type="radio" name="to" value="support"><b>${esc(D.SUPPORT.name)}</b><span>Operations and account help, not a broker · ${esc(D.SUPPORT.email)}</span></label></div></div>
      <div class="field"><label>Message</label><textarea name="text" required placeholder="${c ? `e.g. Can you check whether ${esc(c.name)} will approve a transfer into an SPV?` : 'How can we help?'}">${esc(oLine)}</textarea></div>
      <div class="field"><label>Documents or screenshots</label><div class="row" style="gap:10px;flex-wrap:wrap"><label class="btn outline sm attach-btn">${ICON.doc} Attach files<input type="file" name="files" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"></label><span class="tiny muted">PDF, Word, Excel, CSV or images · up to 8 files. Stored only in this browser in the prototype.</span></div><div class="attach-list" id="ct-att"></div></div>
      <div class="between" style="flex-wrap:wrap;gap:8px"><a class="link small" href="mailto:${D.SUPPORT.email}?subject=${encodeURIComponent('Rainmaker X' + (c ? ' · ' + c.name : ''))}">Prefer email? ${esc(D.SUPPORT.email)}</a><button class="btn sm" type="submit" ${D.canRequest() ? '' : 'disabled'}>Send</button></div></form></div>`;
  document.body.appendChild(el);
  const close = () => el.remove(); el.querySelector('[data-x]').onclick = close; el.addEventListener('click', e => { if (e.target === el) close(); });
  const att = el.querySelector('#ct-att'); const drawAtt = () => { att.innerHTML = attachChips(files, true); att.querySelectorAll('[data-ax]').forEach(b => b.onclick = () => { files.splice(+b.dataset.ax, 1); drawAtt(); }); };
  el.querySelector('input[type=file]').addEventListener('change', async e => { files = files.concat(await readAttachments(e.target.files)).slice(0, 8); e.target.value = ''; drawAtt(); });
  el.querySelectorAll('input[name=to]').forEach(r => r.onchange = () => el.querySelectorAll('.opt-card').forEach(o => o.classList.toggle('on', o.querySelector('input').checked)));
  el.querySelector('#contact-form').addEventListener('submit', e => { e.preventDefault(); const f = e.target; const text = f.text.value.trim(); if (!text) return; const to = f.to.value; D.sendMessage({ companyId: c ? c.id : null, text, to: to === 'support' ? 'support' : undefined, attachments: files }); close(); toast(to === 'support' ? 'Sent to Rainmaker Securities support' : `Sent to ${rep_.name}`); go(to === 'support' ? '#/messages/support' : `#/messages/${c ? c.id : 'general'}`); });
  el.querySelector('textarea').focus();
}
// Full-size image preview overlay.
function openLightbox(src) { const el = document.createElement('div'); el.className = 'modal-wrap'; el.innerHTML = `<div class="modal card lightbox"><div class="card-head"><b>Attachment</b><button class="btn ghost sm" type="button" data-x>Close</button></div><div class="card-body"><img src="${src}" alt=""></div></div>`; document.body.appendChild(el); const close = () => el.remove(); el.querySelector('[data-x]').onclick = close; el.addEventListener('click', e => { if (e.target === el) close(); }); }
// Ask Rainmaker about this company / order: message form that routes to the rep.
function askRainmakerCard(c, o) {
  const rep_ = D.rep(D.profile().rep); const key = D.threadKey(c.id, o ? o.id : null); const t = D.thread(key); const msgs = t ? t.msgs.slice(-4) : [];
  return `<div class="card" id="ask-rx"><div class="card-head"><h2 style="font-size:20px">Ask Rainmaker about this ${o ? (o.side === 'listing' ? 'ask' : 'bid') : 'company'}</h2><span class="badge mine">Brokered</span></div><div class="card-body stack">
    <p style="margin:0;color:var(--ink-2);font-size:14px">Buyers and sellers never contact each other on Rainmaker X. Your message goes to <b>${esc(rep_.name)}</b>, who speaks with the counterparty for you. When Rainmaker acts as dealer, the desk quotes you directly.</p>
    ${msgs.length ? `<div class="msg-list compact">${msgs.map(bubble).join('')}</div><a class="link small" href="#/messages/${esc(key)}">Open full conversation →</a>` : ''}
    ${D.canRequest() ? `<form id="ask-rx-form" class="stack" style="gap:10px"><div class="field"><textarea name="text" placeholder="e.g. Would the seller take 4,000 at $27.50? Any transfer restrictions I should know about?" required></textarea></div><div class="between"><span class="tiny muted">Replies typically within one business day. Also visible to compliance.</span><button class="btn sm" type="submit">Send to ${esc(rep_.name.split(' ')[0])}</button></div></form>` : '<div class="small muted">Verify your investor status to message your primary representative.</div>'}
  </div></div>`;
}
// Hook up the Ask Rainmaker form.
function wireAskRainmaker(root, c, o) { const f = root.querySelector('#ask-rx-form'); if (!f) return; f.addEventListener('submit', e => { e.preventDefault(); const text = f.text.value.trim(); if (!text) return; D.sendMessage({ companyId: c.id, orderId: o ? o.id : null, text }); toast('Sent to your primary representative'); render(); }); }
// Messages page: thread list, conversation, New message, Email support.
function viewMessages(main, key) {
  const threads = D.threads(); const cur = threads.find(t => t.key === key) || threads[0]; if (cur) D.markRead(cur.key);
  const rep_ = D.rep(D.profile().rep);
  main.innerHTML = `<div class="page wide">${pageHead({ icon: PH.mail, title: 'Messages', sub: 'Every conversation on Rainmaker X runs through your primary representative, the desk, or compliance. Counterparties are never put in touch directly.', actions: `<button class="btn sm" type="button" data-contact="">${ICON.mail} New message</button><a class="btn outline sm" href="#/representatives">${esc(rep_.name)} · ${esc(rep_.phone)}</a><a class="btn outline sm" href="mailto:${D.SUPPORT.email}?subject=Rainmaker%20X%20support" title="Email Rainmaker Securities operations (not a broker)">Email Rainmaker Securities</a>`, stats: [['Conversations', threads.length], ['Unread', D.unreadMessages()], ['Your primary representative', esc(rep_.name), esc(rep_.title)], ['Rainmaker Securities support', esc(D.SUPPORT.email), esc(D.SUPPORT.phone + ' · ' + D.SUPPORT.hours)]] })}
    <div class="msg-layout">
      <div class="card thread-list">${threads.map(t => `<a class="thread ${cur && t.key === cur.key ? 'on' : ''}" href="#/messages/${esc(t.key)}"><div class="between"><b>${esc(t.title)}</b>${t.unread ? `<span class="cnt coral">${t.unread}</span>` : ''}</div><div class="small muted ellipsis">${t.last ? esc(t.last.text) : 'Start a conversation'}</div><div class="tiny muted">${t.last ? fmtPlaced(t.last.ts) : ''}</div></a>`).join('')}</div>
      <div class="card conv"><div class="card-head"><div><b>${cur ? esc(cur.title) : 'Your primary representative'}</b>${cur && cur.companyId ? ` <a class="link small" href="#/company/${cur.companyId}">Company page</a>` : ''}${cur && cur.orderId ? ` · <a class="link small" href="#/order/${esc(cur.orderId)}">Order</a>` : ''}</div><span class="small muted">To: ${cur && cur.support ? esc(D.SUPPORT.name) + ' (operations, not a broker)' : esc(rep_.name)}</span></div>
        <div class="msg-list" id="msg-list">${cur && cur.msgs.length ? cur.msgs.map(bubble).join('') : '<div class="empty">No messages yet.</div>'}</div>
        ${D.canRequest() ? `<div class="attach-list" id="comp-att" style="padding:0 22px"></div><form class="composer" id="composer"><textarea name="text" placeholder="Message ${cur && cur.support ? 'Rainmaker Securities support' : esc(rep_.name.split(' ')[0])}…" required></textarea><label class="btn outline sm attach-btn" title="Attach documents or screenshots">${ICON.doc}<input type="file" name="files" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"></label><button class="btn sm" type="submit">Send</button></form>` : `<div class="card-foot">Verify your investor status to send messages.</div>`}
      </div></div></div>`;
  const list = main.querySelector('#msg-list'); if (list) list.scrollTop = list.scrollHeight;
  let files = []; const att = main.querySelector('#comp-att'); const drawAtt = () => { if (!att) return; att.innerHTML = attachChips(files, true); att.querySelectorAll('[data-ax]').forEach(b => b.onclick = () => { files.splice(+b.dataset.ax, 1); drawAtt(); }); };
  const fi = main.querySelector('#composer input[type=file]'); if (fi) fi.addEventListener('change', async e => { files = files.concat(await readAttachments(e.target.files)).slice(0, 8); e.target.value = ''; drawAtt(); });
  const f = main.querySelector('#composer'); if (f) f.addEventListener('submit', e => { e.preventDefault(); const text = f.text.value.trim(); if (!text) return; D.sendMessage({ companyId: cur ? cur.companyId : null, orderId: cur ? cur.orderId : null, text, to: cur && cur.support ? 'support' : undefined, attachments: files }); files = []; render(); });
}

// ---------------- verification helpers ----------------
