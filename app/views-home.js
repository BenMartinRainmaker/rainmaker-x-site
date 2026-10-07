/* ==============================================================
   Rainmaker X · app · home
   Public landing page: gold hero with the fine rain canvas and the 2x2 stat tiles.
   ============================================================== */
'use strict';

// Fine metallic-gold rain on the hero canvas. Paused in hidden tabs and under reduced motion.
ICON.rain = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 15l-1.5 3"/><path d="M11.5 15L10 18"/><path d="M16 15l-1.5 3"/><path d="M20 15l-1.5 3"/><path d="M4 11.5A3.5 3.5 0 0 1 7.3 8a5 5 0 0 1 9.6-1.2A3.6 3.6 0 1 1 17 11.5H4z"/></svg>';
function goldenRain(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  // The rain stands still until the member presses "Make it rain" (Ben, Oct 1 2026); the choice lasts for the tab (sessionStorage).
  // Pressing it is an explicit request, so it also runs under the OS reduced-motion setting.
  let raining = sessionStorage.getItem(RX_CONFIG.storage.rainKey) === '1';
  let width = 0, height = 0, drops = [], frame = 0, previous = 0, copy = null;
  const random = (min, max) => min + Math.random() * (max - min);
  function resize() {
    const hero = canvas.parentElement;
    canvas.style.height = '';
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const text = canvas.parentElement.querySelector('.hero-text').getBoundingClientRect();
    copy = { left: text.left - bounds.left - 24, right: text.right - bounds.left + 24,
      top: text.top - bounds.top - 24, bottom: text.bottom - bounds.top + 24 };
    drops = Array.from({ length: Math.round(width / 8) }, () => {
      const depth = Math.random();
      return { x: random(0, width), y: random(-80, height), length: 12 + depth * 52,
        thickness: .5 + depth * 1.6, speed: 95 + depth * 190, alpha: .2 + depth * .65 };
    });
    draw(0);
  }
  function draw(delta) {
    ctx.clearRect(0, 0, width, height);
    for (const drop of drops) {
      drop.y += drop.speed * delta; drop.x -= drop.speed * delta * .09;
      if (drop.y - drop.length > height) { drop.y = -10; drop.x = random(0, width); }
      if (drop.x < -10) drop.x = width + 10;
      const dx = Math.max(copy.left - drop.x, 0, drop.x - copy.right);
      const dy = Math.max(copy.top - drop.y, 0, drop.y - copy.bottom);
      ctx.globalAlpha = drop.alpha * (.12 + .88 * Math.min(1, Math.max(dx, dy) / 70));
      const tailX = drop.x + drop.length * .09;
      const gold = ctx.createLinearGradient(tailX, drop.y - drop.length, drop.x, drop.y);
      gold.addColorStop(0, 'rgba(149,103,32,0)');
      gold.addColorStop(.35, '#8b6229');
      gold.addColorStop(.78, '#d4ab58');
      gold.addColorStop(.94, '#fff0bb');
      gold.addColorStop(1, '#b88836');
      ctx.strokeStyle = gold; ctx.lineWidth = drop.thickness; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tailX, drop.y - drop.length); ctx.lineTo(drop.x, drop.y); ctx.stroke();
      if (drop.thickness > 1.6) {
        ctx.fillStyle = '#f2d594'; ctx.beginPath();
        ctx.ellipse(drop.x, drop.y, drop.thickness * .65, drop.thickness * 1.2, .09, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function tick(now) {
    if (!canvas.isConnected) { cleanup(); return; }
    draw(previous ? Math.min((now - previous) / 1000, .05) : 0);
    previous = now; frame = requestAnimationFrame(tick);
  }
  function syncMotion() {
    cancelAnimationFrame(frame); previous = 0;
    if (raining && !document.hidden && canvas.isConnected) frame = requestAnimationFrame(tick);
    else draw(0);
  }
  // Start / pause from the "Make it rain" button.
  function setRaining(on) { raining = !!on; sessionStorage.setItem(RX_CONFIG.storage.rainKey, raining ? '1' : '0'); syncMotion(); }
  function cleanup() {
    cancelAnimationFrame(frame); observer.disconnect(); removal.disconnect();
    motion.removeEventListener('change', syncMotion);
    document.removeEventListener('visibilitychange', syncMotion);
  }
  const observer = new ResizeObserver(resize);
  const removal = new MutationObserver(() => { if (!canvas.isConnected) cleanup(); });
  observer.observe(canvas.parentElement);
  removal.observe(document.querySelector('#main'), { childList: true });
  motion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  resize(); syncMotion();
  return { setRaining, isRaining: () => raining };
}

// Landing page: gold hero, stat tiles, how it works, featured companies.
function viewHome(main) {
  const st = D.marketStats(); const pr = D.profile();
  const active = D.mostActive(6);
  // Every live order, newest first; the feed scrolls inside its box and the heading opens Market activity (Ben, Oct 5 2026).
  const recent = D.allOrders().filter(o => o.status === 'live').sort((a, b) => b.created - a.created);
  const idxCh = D.change(D.INDEX, '3M'); const idxLast = D.series(D.INDEX, '1D').slice(-1)[0].p;
  main.innerHTML = `<div class="page">
    <div class="hero hero-gold"><canvas class="hero-rain" aria-hidden="true"></canvas><button class="btn hero-outline hero-rain-btn" type="button" id="hero-rain-btn" aria-pressed="${sessionStorage.getItem(RX_CONFIG.storage.rainKey) === '1'}" title="Start or pause the golden rain">${ICON.rain}<span>${sessionStorage.getItem(RX_CONFIG.storage.rainKey) === '1' ? 'Pause the rain' : 'Make it rain'}</span></button><div class="hero-text"><div class="hero-brand">${LOGO}<span class="hero-wordmark">Rainmaker <em>X</em></span></div><p class="hero-lead">Rainmaker X is a private exchange providing accredited investors and institutions with broad access to the private secondaries market and alternative private securities. Investors can place orders in real time and every match is brokered and settled by our team of registered representatives.</p>
      <div class="row" style="margin-top:22px"><a class="btn" href="#/browse">Browse companies</a>${D.isVisitor() ? '' : pr.verification === 'verified' ? `<a class="btn hero-outline" href="#/profile">View my profile</a>` : `<a class="btn hero-outline" href="#/profile/verification">Complete investor verification</a>`}${D.isVisitor() ? `<a class="btn hero-outline" href="#/signin">Sign in</a><a class="btn hero-outline" href="#/signin/create">Create account</a>` : ''}</div></div>
      <div class="hero-stats"><div><span class="label">Companies</span><div class="v">${st.companies}</div></div><div><span class="label">Live asks</span><div class="v">${st.asks}</div><div class="s">${compact(st.askValue)} offered</div></div><div><span class="label">Live bids</span><div class="v">${st.bids}</div><div class="s">${compact(st.bidValue)} demand</div></div><div><span class="label">30-day volume</span><div class="v">${compact(st.vol30)}</div><div class="s">${st.tx30} transactions</div></div></div></div>
    <div class="how"><div class="card card-body"><div class="step">1</div><h3>Join, then get verified</h3><p>Anyone can join, browse, favorite, set alerts, message a rep and submit requests. Tell us whether you are an accredited investor, a QIB or an institution and compliance reviews once; then you trade live.</p><div>${verBadge()}</div></div>
      <div class="card card-body"><div class="step">2</div><h3>See the real market</h3><p>Every company shows its RX price, highest bid, lowest ask, live orders and full transaction history back to the first trade.</p><a class="link small" href="#/browse">Browse companies →</a></div>
      <div class="card card-body"><div class="step">3</div><h3>Bid, ask, and settle</h3><p>Post a bid or an ask at your price, or take a firm quote from the Rainmaker desk to buy or sell instantly. Every match is settled by a registered representative.</p><a class="link small" href="#/representatives">Meet the representatives →</a></div></div>
    <div class="dash" style="grid-template-columns: minmax(0,1fr) minmax(0,1fr);margin-top:22px">
      <div class="card" id="home-index"><div class="card-head"><div class="index-title" style="font-size:18px">RX<span class="fifty">50</span><span class="light">Index</span></div><a class="link small" href="#/funds">All RX Funds</a></div><div class="card-body"><div class="between" style="margin-bottom:10px"><div class="row"><span class="price-big" style="font-size:24px">${idxLast.toFixed(2)}</span><span class="chg ${cls(idxCh)}">${pct2(idxCh)}<span class="lbl">past 3 months</span></span></div></div><div class="chart-wrap"></div></div></div>
      <div class="card"><div class="card-head"><span class="label">Most active companies</span><a class="link small" href="#/dashboard">Dashboard</a></div><table class="table compact"><thead><tr><th>Company</th><th class="num">RX price</th><th class="num">Asks</th><th class="num">Bids</th><th>3M</th></tr></thead><tbody>${active.map(a => `<tr class="clickable" data-href="#/company/${a.c.id}"><td><span class="row">${logo(a.c, 'sm')}<b>${esc(a.c.name)}</b></span></td><td class="num strong">${money(D.price(a.c.id))}</td><td class="num">${a.listings}</td><td class="num">${a.bids}</td><td>${sparkline(D.series(a.c, '3M'), 64, 24)}</td></tr>`).join('')}</tbody></table></div>
    </div>
    <div class="section-row"><a class="section-title section-link" href="#/market" title="Open Market activity">Latest market activity ${ICON.chev}</a><a class="link small" href="#/market">${recent.length} live orders · open Market activity</a></div>
    <div class="home-feed" id="home-feed"><div class="company-grid">${recent.map(o => orderCard(o, { actions: true })).join('')}</div></div>
    <div class="home-feed-foot"><a class="btn outline sm" href="#/market">See all on Market activity</a></div>
    <div class="card card-body group-card"><div><div class="label dim">Part of Rainmaker Group</div><h3 style="font-size:18px;margin-top:4px">The exchange is one of the things we do.</h3><p class="muted" style="margin:6px 0 0">Rainmaker also advises on mergers and acquisitions and runs capital raises for private companies. The main Rainmaker site will link here; this prototype covers the exchange only.</p></div><div class="row"><span class="pill">M&amp;A advisory</span><span class="pill">Capital raising</span><span class="pill">Private exchange</span></div></div>
  </div>`;
  const rain = goldenRain(main.querySelector('.hero-rain'));
  // "Make it rain" starts the golden rain (and pauses it again); the label follows the state.
  const rb = main.querySelector('#hero-rain-btn'); if (rb && rain) rb.onclick = () => { rain.setRaining(!rain.isRaining()); rb.setAttribute('aria-pressed', String(rain.isRaining())); rb.querySelector('span').textContent = rain.isRaining() ? 'Pause the rain' : 'Make it rain'; };
  lineChart(main.querySelector('#home-index .chart-wrap'), { series: D.series(D.INDEX, '1Y'), period: '1Y', prefix: '', height: 200 });
}

// ---------------- RX Funds ----------------
