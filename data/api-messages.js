/* ==============================================================
   Rainmaker X · Data API · messages
   Threads with the representative, desk, compliance and support. Never member-to-member.
   ============================================================== */
'use strict';

Object.assign(Data, {
  // ----- feedback (Ben, Oct 8 2026): the "Give us feedback" section in the profile menu -----
  FEEDBACK_TOPICS: RX_CONFIG.feedback.topics,
  // Every piece of feedback this member has sent, newest first.
  feedback() { return (state.feedback || []).slice().sort((a, b) => b.ts - a.ts); },
  // Record feedback (rating 1-5, topic, text, the page it was sent from), post it to the support thread so Rainmaker's
  // mailbox sees it, and audit it. Visitors cannot send; the text is required and capped.
  sendFeedback({ rating, topic, text, page }) {
    if (state.visitor) return { error: 'Sign in to send feedback' };
    const t = String(text || '').trim().slice(0, RX_CONFIG.feedback.maxLength); if (!t) return { error: 'Tell us something first' };
    const r = Math.min(5, Math.max(0, Math.round(+rating || 0))); const tp = this.FEEDBACK_TOPICS[topic] ? topic : 'app';
    const f = { id: 'FB-' + Date.now().toString(36), ts: Date.now(), rating: r, topic: tp, text: t, page: page || '', role: this.role(), name: state.profile.name };
    state.feedback = state.feedback || []; state.feedback.unshift(f);
    const m = this.sendMessage({ text: `Feedback${r ? ` · ${r} / 5` : ''} · ${this.FEEDBACK_TOPICS[tp]}${f.page ? ` · from ${f.page}` : ''}\n${t}`, to: 'support' });
    f.messageId = m.id; audit('feedback.sent', `${f.id} · ${r ? r + '/5 · ' : ''}${this.FEEDBACK_TOPICS[tp]}`); save();
    return f;
  },
  // ----- messages (all routed to Rainmaker, never to counterparties) -----
  messages() { return state.messages.slice().sort((a, b) => a.ts - b.ts); },
  threadKey(companyId, orderId) { return orderId || companyId || 'general'; },
  SUPPORT: RX_CONFIG.support,
  // Message threads grouped by company / order, always including General and Support.
  threads() {
    const by = {}; this.messages().forEach(m => { const t = by[m.key] || (by[m.key] = { key: m.key, companyId: m.companyId || null, orderId: m.orderId || null, msgs: [], unread: 0 }); t.msgs.push(m); if (!m.read && m.from !== 'you') t.unread++; });
    if (!by.general) by.general = { key: 'general', companyId: null, orderId: null, msgs: [], unread: 0 };
    if (!by.support) by.support = { key: 'support', companyId: null, orderId: null, msgs: [], unread: 0 };
    return Object.values(by).map(t => { const c = t.companyId ? this.company(t.companyId) : null; t.support = t.key === 'support'; t.title = t.support ? this.SUPPORT.name : t.orderId ? `${c ? c.name : ''} · ${t.orderId}` : c ? c.name : 'Your primary representative'; t.last = t.msgs[t.msgs.length - 1]; return t; }).sort((a, b) => (b.last ? b.last.ts : 0) - (a.last ? a.last.ts : 0));
  },
  // Every message from every member, for the staff Messages monitor. The member's own thread is live state; sample clients get
  // deterministic sample traffic so the monitor can be filtered by user, representative, sender and keyword.
  allMessages() { const me = state.profile; const mine = state.messages.map(m => Object.assign({}, m, { clientId: 'you', clientName: me.name, rep: me.rep })); return mine.concat(this._sampleMessages()).sort((a, b) => b.ts - a.ts); },
  _sampleMessages() { if (this._smCache) return this._smCache; const rnd = mulberry32(hashStr('sample-messages')); const out = []; const liquid = COMPANIES.filter(c => c.liquid);
    const asks = ['Is there any movement on {c}? I would take 2,000 at the current best bid.', 'Please send the transfer documents for my {c} purchase when the company clears it.', 'What is the desk\'s view on {c} ahead of the tender?', 'Can you get me a firm quote for 5,000 {c} shares?', 'My {c} ask has had no bids for two weeks. Should I lower it?', 'Attaching my updated brokerage statement for the annual re-verification.', 'Who do I speak to about a wire that has not landed for my {c} settlement?'];
    const reps = ['Thanks, I have spoken with the holder behind the {c} ask and will revert tomorrow.', 'Received. Compliance has your statement; verification renews within one business day.', 'The desk can show you a firm quote on {c} this afternoon. Are you around at 3pm?', 'The company\'s counsel has the {c} transfer notice. ROFR window closes next week.', 'Your {c} broker fee invoice is attached; the wire to escrow follows once it is paid.'];
    this.CLIENTS.slice(1).forEach((cl, i) => { if (cl.status === 'unverified' && rnd() < 0.5) return; const n = 2 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) { const c = liquid[Math.floor(rnd() * liquid.length)]; const fromClient = rnd() < 0.6; const pool = fromClient ? asks : reps; const text = pool[Math.floor(rnd() * pool.length)].replace(/\{c\}/g, c.name); const ts = NOW_T - Math.floor(rnd() * 25 * DAY) - Math.floor(rnd() * 12 * 3600000); out.push({ id: `sm-${i}-${k}`, ts, from: fromClient ? 'you' : (rnd() < 0.2 ? 'compliance' : 'rep'), key: c.id, companyId: c.id, orderId: null, text, read: true, clientId: 'c' + (i + 1), clientName: cl.name, rep: cl.rep, sample: true }); } });
    // A few members write to the firm itself (support / operations) rather than to a representative: these land in the Rainmaker mailbox.
    const toFirm = ['My wire to escrow left our bank yesterday; can you confirm receipt?', 'Please update the email on my account to my new firm address.', 'I need a copy of last quarter\'s statement for my auditors.', 'Can someone walk me through opening a second brokerage account for my trust?', 'Who do I speak to about a duplicate broker fee invoice?'];
    this.CLIENTS.slice(1).forEach((cl, i) => { if (cl.status === 'unverified' || i % 2) return; out.push({ id: `sf-${i}`, ts: NOW_T - Math.floor(rnd() * 6 * DAY) - Math.floor(rnd() * 8 * 3600000), from: 'you', key: 'support', companyId: null, orderId: null, to: 'support', text: toFirm[i % toFirm.length], read: true, clientId: 'c' + (i + 1), clientName: cl.name, rep: cl.rep, sample: true }); });
    return this._smCache = out; },
  // ----- Rainmaker mailbox: the firm (Rainmaker Securities) as a correspondent, separate from the representatives' conversations. -----
  // Inbox = everything members send to the firm (the support channel) across every user; Sent = everything the firm has sent out.
  firmInbox() { const rd = state.firmRead || {}; return this.allMessages().filter(m => m.from === 'you' && (m.to === 'support' || m.key === 'support')).map(m => Object.assign({}, m, { firmRead: !!rd[m.id] })); },
  firmSent() { const mine = state.messages.filter(m => m.from === 'support').map(m => Object.assign({}, m, { clientId: 'you', clientName: state.profile.name })); return mine.concat(state.firmSent || []).sort((a, b) => b.ts - a.ts); },
  firmUnread() { return this.firmInbox().filter(m => !m.firmRead).length; },
  firmMarkRead(id) { state.firmRead = state.firmRead || {}; if (!state.firmRead[id]) { state.firmRead[id] = Date.now(); save(); } },
  // Staff sends a message from Rainmaker Securities to a client. The demo member gets it in their Messages page (support thread);
  // sample clients only keep the sent record. Audited.
  firmSend({ clientId, companyId, text, replyTo }) {
    if (!this.can('inbox')) return { error: 'Not permitted' }; text = (text || '').trim(); if (!text) return { error: 'Write a message.' };
    const cl = this.client(clientId); if (!cl) return { error: 'Choose a client.' }; const by = 'staff:' + this.role(); const now = Date.now(); const c = companyId && this.company(companyId) ? companyId : null; let m;
    if (cl.you) { m = { id: 'm-' + now.toString(36), ts: now, from: 'support', key: 'support', companyId: c, orderId: null, text, read: false, by }; state.messages.push(m); notify('New message from Rainmaker Securities'); window.dispatchEvent(new Event('rx-messages')); }
    else { state.firmSent = state.firmSent || []; m = { id: 'fs-' + now.toString(36), ts: now, from: 'support', key: 'support', companyId: c, orderId: null, text, clientId: cl.id, clientName: cl.name, by, sample: true }; state.firmSent.push(m); }
    if (replyTo) this.firmMarkRead(replyTo);
    audit('mail.send', `to ${cl.name}${c ? ' · ' + this.company(c).name : ''} · ${text.slice(0, 60)}`, by); save(); return m;
  },
  thread(key) { return this.threads().find(t => t.key === key); },
  unreadMessages() { return state.messages.filter(m => !m.read && m.from !== 'you').length; },
  markRead(key) { let n = 0; state.messages.forEach(m => { if (m.key === key && !m.read) { m.read = true; n++; } }); if (n) save(); },
  // to = 'support' routes to Rainmaker Securities operations (not a broker); attachments = [{ name, size, type, dataUrl? }] (documents, screenshots).
  sendMessage({ companyId, orderId, text, from, to, attachments }) {
    const support = to === 'support'; const key = support ? 'support' : this.threadKey(companyId, orderId); const att = Array.isArray(attachments) && attachments.length ? attachments.slice(0, 8) : null;
    const m = { id: 'm-' + Date.now().toString(36), ts: Date.now(), from: from || 'you', key, companyId: companyId || null, orderId: orderId || null, to: support ? 'support' : null, text, read: from === 'you' || !from }; if (att) m.attachments = att;
    state.messages.push(m); save();
    if ((!from || from === 'you') && support) {
      const n = att ? att.length : 0; const canned = `Thanks, Rainmaker Securities support has your message${n ? ` and the ${n} attached file${n === 1 ? '' : 's'}` : ''}. A member of our operations team (not a broker) will reply within one business day. For urgent settlement or account matters call ${this.SUPPORT.phone}, ${this.SUPPORT.hours}.`;
      setTimeout(() => { state.messages.push({ id: 'm-' + Date.now().toString(36), ts: Date.now(), from: 'support', key, companyId: null, orderId: null, text: canned, read: false }); notify('New message from Rainmaker Securities support'); save(); window.dispatchEvent(new Event('rx-messages')); }, 1800);
      return m;
    }
    if (!from || from === 'you') {
      const c = companyId ? this.company(companyId) : null; const o = orderId ? this.order(orderId) : null; const rep_ = this.rep(state.profile.rep);
      const canned = o ? (o.side === 'listing' ? `Thanks Ben. I have reached out to the seller behind ${o.id} on your behalf. Their ask is ${'$' + o.price.toFixed(2)}; if you want, I can also get you a firm desk quote for ${o.qty.toLocaleString()} shares so you do not have to wait. I will come back within one business day.` : `Thanks Ben. I will speak with the buyer behind ${o.id} and confirm whether they will take your size at ${'$' + o.price.toFixed(2)} or better. I will come back within one business day.`) : c ? `Thanks Ben. I will pull the latest ${c.name} order flow and the desk's view and call you this afternoon.` : `Thanks Ben, received. I will come back to you shortly.`;
      setTimeout(() => { state.messages.push({ id: 'm-' + Date.now().toString(36), ts: Date.now(), from: 'rep', key, companyId: companyId || null, orderId: orderId || null, text: canned, read: false }); notify(`New message from ${rep_.name}${c ? ' about ' + c.name : ''}`); save(); window.dispatchEvent(new Event('rx-messages')); }, 1800);
    }
    return m;
  },
});
