/* Stimmlabor – kleine SVG-Diagramme mit Tap/Hover-Tooltip */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const fmtDate = ms => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

  function frame(container, h) {
    container.innerHTML = '';
    container.classList.add('chart');
    const w = Math.max(280, container.clientWidth || 320);
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, height: h });
    container.appendChild(svg);
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; container.appendChild(tip);
    return { svg, w, h, tip };
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1; const step0 = span / n; const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => span / s <= n) || mag * 10;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function hoverLayer(f, pts, x0, x1, render) {
    // pts: [{px, py, html}] – nächstgelegener Punkt per x
    const cross = el('line', { y1: 8, y2: f.h - 22, stroke: 'var(--muted)', 'stroke-dasharray': '3 3', opacity: 0 }, f.svg);
    const dot = el('circle', { r: 5, fill: 'var(--blue)', stroke: 'var(--surface)', 'stroke-width': 2, opacity: 0 }, f.svg);
    const hit = el('rect', { x: x0, y: 0, width: Math.max(1, x1 - x0), height: f.h, fill: 'transparent' }, f.svg);
    const move = ev => {
      const r = f.svg.getBoundingClientRect(); const sx = (ev.clientX - r.left) * f.w / r.width;
      let best = null, bd = 1e9; for (const p of pts) { const d = Math.abs(p.px - sx); if (d < bd) { bd = d; best = p; } }
      if (!best) return;
      cross.setAttribute('x1', best.px); cross.setAttribute('x2', best.px); cross.setAttribute('opacity', 1);
      dot.setAttribute('cx', best.px); dot.setAttribute('cy', best.py); dot.setAttribute('opacity', 1);
      f.tip.innerHTML = best.html; f.tip.hidden = false;
      f.tip.style.left = (best.px / f.w * 100) + '%'; f.tip.style.top = (best.py / f.h * r.height) + 'px';
    };
    const leave = () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); f.tip.hidden = true; };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move); hit.addEventListener('pointerleave', leave);
  }

  // Liniendiagramm über Zeit: points [{x(ms), y, html}], opts {yMin, yMax, unit, avg:true}
  function line(container, points, opts) {
    opts = opts || {};
    const f = frame(container, opts.height || 180);
    if (!points.length) { container.innerHTML = '<div class="empty">Noch keine Daten – nach den ersten Aufnahmen erscheint hier dein Verlauf.</div>'; return; }
    const pl = 34, pr = 10, pt = 10, pb = 22;
    const ys = points.map(p => p.y);
    let y0 = opts.yMin != null ? opts.yMin : Math.min(...ys), y1 = opts.yMax != null ? opts.yMax : Math.max(...ys);
    if (y1 - y0 < 1) { y0 -= 1; y1 += 1; }
    const xs = points.map(p => p.x); let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x1 === x0) { x0 -= 86400000; x1 += 86400000; }
    // Achse bis zum nächsten runden Tick verlängern, damit kein Punkt über der obersten Linie schwebt
    if (opts.yMax == null) { const tk = niceTicks(y0, y1, 4); const stp = tk.length > 1 ? tk[1] - tk[0] : 1; if (tk.length && tk[tk.length - 1] < y1) y1 = tk[tk.length - 1] + stp; }
    const X = x => pl + (x - x0) / (x1 - x0) * (f.w - pl - pr);
    const Y = y => pt + (1 - (y - y0) / (y1 - y0)) * (f.h - pt - pb);
    const g = el('g', { class: 'grid' }, f.svg), ax = el('g', { class: 'axis' }, f.svg);
    for (const t of niceTicks(y0, y1, 4)) { el('line', { x1: pl, x2: f.w - pr, y1: Y(t), y2: Y(t) }, g); el('text', { x: pl - 6, y: Y(t) + 4, 'text-anchor': 'end' }, ax).textContent = t + (opts.unit || ''); }
    const n = Math.min(4, points.length);
    for (let i = 0; i < n; i++) { const xv = x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)); el('text', { x: X(xv), y: f.h - 5, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, ax).textContent = fmtDate(xv); }
    // Punkte (einzelne Aufnahmen) dezent, gleitender Mittelwert als Linie
    const dots = el('g', {}, f.svg);
    points.forEach(p => el('circle', { cx: X(p.x), cy: Y(p.y), r: 3, fill: 'var(--blue)', opacity: .35 }, dots));
    if (opts.avg !== false && points.length > 1) {
      const k = Math.max(2, Math.min(5, Math.floor(points.length / 3) || 2));
      const sm = points.map((p, i) => { const a = points.slice(Math.max(0, i - k + 1), i + 1); return { x: p.x, y: a.reduce((s, q) => s + q.y, 0) / a.length }; });
      el('path', { d: sm.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(''), fill: 'none', stroke: 'var(--blue)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, f.svg);
    }
    hoverLayer(f, points.map(p => ({ px: X(p.x), py: Y(p.y), html: p.html || `${fmtDate(p.x)}: <b>${p.y}${opts.unit || ''}</b>` })), pl, f.w - pr);
  }

  // Stimmumfang über Zeit: [{x, lo, hi}] in MIDI
  function band(container, pts, opts) {
    opts = opts || {};
    const f = frame(container, opts.height || 200);
    if (!pts.length) { container.innerHTML = '<div class="empty">Mach den Stimmumfang-Test unter „Üben“, um deinen Umfang zu messen.</div>'; return; }
    const pl = 38, pr = 10, pt = 10, pb = 22;
    let y0 = Math.min(...pts.map(p => p.lo)) - 2, y1 = Math.max(...pts.map(p => p.hi)) + 2;
    const xs = pts.map(p => p.x); let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x1 === x0) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
    const X = x => pl + (x - x0) / (x1 - x0) * (f.w - pl - pr);
    const Y = y => pt + (1 - (y - y0) / (y1 - y0)) * (f.h - pt - pb);
    const g = el('g', { class: 'grid' }, f.svg), ax = el('g', { class: 'axis' }, f.svg);
    for (let m = Math.ceil(y0); m <= y1; m++) if (m % 12 === 0 || m % 12 === 7) { el('line', { x1: pl, x2: f.w - pr, y1: Y(m), y2: Y(m) }, g); el('text', { x: pl - 6, y: Y(m) + 4, 'text-anchor': 'end' }, ax).textContent = Core.midiToName(m); }
    el('text', { x: pl, y: f.h - 5 }, ax).textContent = fmtDate(x0);
    el('text', { x: f.w - pr, y: f.h - 5, 'text-anchor': 'end' }, ax).textContent = fmtDate(x1);
    if (pts.length > 1) {
      const top = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x) + ' ' + Y(p.hi)).join('');
      const bot = pts.slice().reverse().map(p => 'L' + X(p.x) + ' ' + Y(p.lo)).join('');
      el('path', { d: top + bot + 'Z', fill: 'var(--accent)', opacity: .18 }, f.svg);
    }
    const hp = [];
    pts.forEach(p => {
      el('line', { x1: X(p.x), x2: X(p.x), y1: Y(p.lo), y2: Y(p.hi), stroke: 'var(--accent)', 'stroke-width': 4, 'stroke-linecap': 'round' }, f.svg);
      hp.push({ px: X(p.x), py: Y(p.hi), html: `${fmtDate(p.x)}: <b>${Core.midiToName(p.lo)} – ${Core.midiToName(p.hi)}</b> (${Math.round(p.hi - p.lo)} HT)` });
    });
    hoverLayer(f, hp, pl, f.w - pr);
  }

  // Kalender-Heatmap: dayMinutes {yyyy-mm-dd: minutes}
  function calendar(container, dayMinutes, weeks) {
    weeks = weeks || 15;
    container.innerHTML = '';
    const grid = document.createElement('div'); grid.className = 'calendar';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7; // Mo=0
    const start = new Date(today); start.setDate(start.getDate() - dow - (weeks - 1) * 7);
    const steps = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab'];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // lokales Datum (toISOString wäre UTC → Tag verschoben)
      const c = document.createElement('i');
      const v = dayMinutes[key] || 0;
      if (d > today) c.style.visibility = 'hidden';
      else if (v > 0) c.style.background = steps[v < 5 ? 0 : v < 12 ? 1 : v < 25 ? 2 : 3];
      c.title = `${d.toLocaleDateString('de-DE')}: ${Math.round(v)} min`;
      grid.appendChild(c);
    }
    container.appendChild(grid);
    const lg = document.createElement('div'); lg.className = 'legend';
    lg.innerHTML = `<span>weniger</span>${steps.map(s => `<span><i style="background:${s}"></i></span>`).join('')}<span>mehr (Minuten/Tag)</span>`;
    container.appendChild(lg);
  }

  // Klaviatur-Heatmap: stats {midi: {abs, n}}
  function keyboard(container, stats, lo, hi) {
    container.innerHTML = '';
    const k = document.createElement('div'); k.className = 'kbd';
    for (let m = lo; m <= hi; m++) {
      const pc = ((m % 12) + 12) % 12, black = [1, 3, 6, 8, 10].includes(pc);
      const d = document.createElement('div'); d.className = 'key' + (black ? ' black' : '');
      const s = stats[m];
      if (s && s.n >= 3) { d.classList.add(s.abs <= 25 ? 'good' : s.abs <= 50 ? 'warn' : 'bad'); }
      d.textContent = pc === 0 ? Core.midiToName(m) : '';
      d.title = `${Core.midiToName(m)}: ${s ? `Ø ${Math.round(s.abs)} ct Abweichung (${s.n} Töne)` : 'keine Daten'}`;
      d.addEventListener('click', () => root.App && root.App.toast(d.title));
      k.appendChild(d);
    }
    container.appendChild(k);
    const lg = document.createElement('div'); lg.className = 'legend';
    lg.innerHTML = '<span><i style="background:var(--good)"></i>≤25 ct · sicher</span><span><i style="background:var(--warn)"></i>26–50 ct · knapp</span><span><i style="background:var(--bad)"></i>>50 ct · daneben</span><span><i style="background:var(--surface-2);border:1px solid var(--line)"></i>zu wenig Daten</span>';
    container.appendChild(lg);
  }

  root.Charts = { line, band, calendar, keyboard };
})(self);
