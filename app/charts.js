/* ==============================================================
   Rainmaker X · app · charts
   SVG line chart, sparkline and the price-chart mount with period buttons.
   ============================================================== */
'use strict';

// Period buttons shown on every price chart.
const PERIODS = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX'];
// Round axis ticks (5, 10, 25 …) that cover min..max.
function niceTicks(min, max, n = 5) {
  const span = max - min || 1; const step0 = span / (n - 1); const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag; const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step; const ticks = []; for (let v = start; v <= max + step * 0.5; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}
// Short x-axis label for a timestamp, depending on how long the period is.
function xLabel(t, period) {
  const d = new Date(t);
  if (period === '1D') return time12(d).replace(':00', '');
  if (period === '1W' || period === '1M') return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  if (period === '3M' || period === '6M' || period === '1Y') return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}
// Date shown in the hover tooltip.
function tipDate(t, period) { const d = new Date(t); return period === '1D' ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${time12(d)}` : fmtDate(t); }
// Renders an area/line chart with optional scatter points and a crosshair tooltip.
function lineChart(el, opts) {
  const { series, period, prefix = '$', height = 300, scatter = [], onHover, yFmt, onDot, lines = [], hlines = [], padRight, color } = opts;
  const render = () => {
    const W = Math.max(320, el.clientWidth || 700), H = height;
    const pad = { l: 12, r: padRight || 52, t: 14, b: 30 };
    const xs = series.map(p => p.t), ys = series.map(p => p.p);
    const dirCol = color || (ys[ys.length - 1] >= ys[0] ? '#00a000' : '#ff0000');
    let ymin = Math.min(...ys), ymax = Math.max(...ys);
    if (scatter.length) { ymin = Math.min(ymin, ...scatter.map(s => s.price)); ymax = Math.max(ymax, ...scatter.map(s => s.price)); }
    const padY = (ymax - ymin) * 0.12 || ymax * 0.05 || 1; ymin = Math.max(0, ymin - padY); ymax = ymax + padY;
    const tmin = xs[0], tmax = xs[xs.length - 1];
    const X = t => pad.l + (t - tmin) / (tmax - tmin || 1) * (W - pad.l - pad.r);
    const Y = v => pad.t + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - pad.t - pad.b);
    const ticks = niceTicks(ymin, ymax, 5).filter(v => v >= ymin && v <= ymax);
    const nX = 4; const xt = []; for (let i = 0; i <= nX; i++) xt.push(tmin + (tmax - tmin) * i / nX);
    const path = series.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.p).toFixed(1)).join(' ');
    const area = path + ` L${X(tmax).toFixed(1)} ${Y(ymin).toFixed(1)} L${X(tmin).toFixed(1)} ${Y(ymin).toFixed(1)} Z`;
    const gid = 'g' + Math.random().toString(36).slice(2, 8);
    const dotPos = scatter.map(s => ({ s, x: X(s.ts), y: Y(s.price) }));
    const dots = dotPos.map(d => { const s = d.s; const col = s.status === 'closed' ? '#1d5f8a' : s.status === 'matched' ? '#7fc4ea' : '#c4c9ce'; return `<circle class="dot" data-id="${s.id}" cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${s.r || 3}" fill="${col}" fill-opacity=".9" stroke="#fff" stroke-width="1"/>`; }).join('');
    const extraLines = lines.map(l => `<path d="${l.series.filter(p => p.t >= tmin && p.t <= tmax).map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.p).toFixed(1)).join(' ')}" fill="none" stroke="${l.color}" stroke-width="${l.width || 1.5}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''} stroke-linejoin="round"/>`).join('');
    const refLines = hlines.filter(h => h.v >= ymin && h.v <= ymax).map(h => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(h.v).toFixed(1)}" y2="${Y(h.v).toFixed(1)}" stroke="${h.color}" stroke-width="1" stroke-dasharray="4 3"/><text x="${pad.l + 4}" y="${(Y(h.v) - 4).toFixed(1)}" font-size="10" font-weight="600" fill="${h.color}">${h.label}</text>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${dirCol}" stop-opacity=".18"/><stop offset="1" stop-color="${dirCol}" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#eceef0"/><text x="${W - pad.r + 8}" y="${(Y(v) + 3.5).toFixed(1)}" font-size="10" fill="#8b929c">${yFmt ? yFmt(v) : prefix + (v >= 100 ? Math.round(v) : v)}</text>`).join('')}
      ${xt.map(t => `<line x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${pad.t}" y2="${H - pad.b}" stroke="#f0f2f4"/><text x="${X(t).toFixed(1)}" y="${H - 10}" font-size="10" fill="#8b929c" text-anchor="${t === tmin ? 'start' : t === tmax ? 'end' : 'middle'}">${xLabel(t, period)}</text>`).join('')}
      <path class="main-area" d="${area}" fill="url(#${gid})"/>
      ${extraLines}${refLines}
      <path class="main-line" d="${path}" fill="none" stroke="${dirCol}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      <g class="hover" style="display:none"><line class="hl" y1="${pad.t}" y2="${H - pad.b}" stroke="#1b1f24" stroke-width="1" stroke-dasharray="3 3"/><circle class="hd" r="4.5" fill="${dirCol}" stroke="#fff" stroke-width="2"/></g>
      <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="transparent"/>
    </svg><div class="chart-tip"></div>`;
    const svg = el.querySelector('svg'), hit = el.querySelector('.hit'), hg = el.querySelector('.hover'), hl = el.querySelector('.hl'), hd = el.querySelector('.hd'), tip = el.querySelector('.chart-tip');
    const move = e => {
      const r = svg.getBoundingClientRect(); const sx = W / r.width; const mx = (e.clientX - r.left) * sx;
      const t = tmin + (mx - pad.l) / (W - pad.l - pad.r) * (tmax - tmin);
      let lo = 0, hi = series.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (series[mid].t < t) lo = mid; else hi = mid; }
      const p = (t - series[lo].t) < (series[hi].t - t) ? series[lo] : series[hi];
      const x = X(p.t), y = Y(p.p);
      hg.style.display = ''; hl.setAttribute('x1', x); hl.setAttribute('x2', x); hd.setAttribute('cx', x); hd.setAttribute('cy', y);
      tip.style.display = 'block'; tip.style.left = (x / sx) + 'px'; tip.style.top = (y / sx - 12) + 'px';
      tip.innerHTML = `<div class="tv">${yFmt ? yFmt(p.p, true) : prefix + p.p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div class="tl">${tipDate(p.t, period)}</div>`;
      onHover && onHover(p);
      if (onDot) { const my = (e.clientY - r.top) * sx; let best = null, bd = 12; dotPos.forEach(d => { const dd = Math.hypot(d.x - mx, d.y - my); if (dd < bd + (d.s.r || 3)) { bd = dd; best = d.s; } }); onDot(best); }
    };
    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', () => { hg.style.display = 'none'; tip.style.display = 'none'; onHover && onHover(null); });
  };
  render();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (document.body.contains(el)) render(); else ro.disconnect(); }); ro.observe(el); }
}
// Tiny inline chart for company rows and tiles. Green if up over the series, red if down.
function sparkline(series, w = 80, h = 30) {
  const ys = series.map(p => p.p); const min = Math.min(...ys), max = Math.max(...ys);
  const up = ys[ys.length - 1] >= ys[0]; const col = up ? '#00a000' : '#ff0000';
  const pts = series.map((p, i) => `${(i / (series.length - 1) * (w - 2) + 1).toFixed(1)},${(h - 2 - (p.p - min) / (max - min || 1) * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}
// Wires up a period toggle + chart + price/change readout.
function mountPriceChart(root, obj, { prefix = '$', height = 300, periods = PERIODS, initial = 'MAX', scatterFn = null, labelEl = null, changeEl = null }) {
  const segEl = root.querySelector('.seg'), chartEl = root.querySelector('.chart-wrap');
  let period = initial;
  const draw = () => {
    segEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === period));
    const series = D.series(obj, period); const ch = D.change(obj, period);
    const last = series[series.length - 1].p;
    if (labelEl) labelEl.textContent = prefix + last.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (changeEl) { changeEl.className = 'chg ' + cls(ch); changeEl.innerHTML = `${pct2(ch)}<span class="lbl">${period === 'MAX' ? 'all time' : period === '1D' ? 'today' : 'past ' + period.replace('W', ' week').replace('M', ' month').replace('Y', ' year').replace(/^1 /, '').replace(/^(\d) (\w+)/, '$1 $2s')}</span>`; }
    lineChart(chartEl, { series, period, prefix, height, scatter: scatterFn ? scatterFn(series) : [], onHover: p => {
      if (!labelEl) return; if (p) { labelEl.textContent = prefix + p.p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } else { labelEl.textContent = prefix + last.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    } });
  };
  segEl.innerHTML = periods.map(p => `<button data-p="${p}">${p}</button>`).join('');
  segEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; period = b.dataset.p; draw(); });
  draw();
  return { redraw: draw };
}

// ---------------- shared partials ----------------
// ---------------- shared pieces ----------------
ICON.sliders = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
ICON.building = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M4 21h16M8 8h2M8 12h2M8 16h2M17 13h1M17 17h1"/></svg>';
ICON.tag = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.3" fill="currentColor"/></svg>';
