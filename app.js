/* Stimmlabor – App */
(function () {
  'use strict';
  const C = Core;
  const VERSION = '1.1.0';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dayKey = ts => { const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtDT = ts => new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const hitClass = h => h >= 0.6 ? 'good' : h >= 0.3 ? 'warn' : 'bad';
  const lvlClass = s => s == null ? '' : s >= 80 ? 'good' : s >= 55 ? 'warn' : 'bad';
  const ICON = {
    play: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
    pause: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/></svg>',
    close: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    share: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    redo: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"/></svg>',
    check: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
    mic: '<svg class="ico" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>',
    stop: '<svg class="ico" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>'
  };

  // ---------------- Einstellungen ----------------
  const DEF = { voice: null, range: null, latencyMs: 0, a4: 440, headphones: true, guide: true, accomp: true, onboarded: false, gate: 0.006, songPrefs: {} };
  let S = (() => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem('sl.settings') || '{}')); } catch (e) { return Object.assign({}, DEF); } })();
  const saveS = () => { try { localStorage.setItem('sl.settings', JSON.stringify(S)); } catch (e) { } };
  const myRange = () => S.range || (S.voice === 'hoch' ? { low: 55, high: 74 } : { low: 45, high: 64 });

  // ---------------- IndexedDB ----------------
  const DB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('stimmlabor', 1);
        r.onupgradeneeded = () => { const d = r.result;['takes', 'songs', 'sessions'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); }); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async tx(store, mode, fn) {
      const d = await this.open();
      return new Promise((res, rej) => {
        const t = d.transaction(store, mode); const st = t.objectStore(store); let out; const rq = fn(st);
        if (rq) rq.onsuccess = () => { out = rq.result; };
        t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    },
    put(s, v) { return this.tx(s, 'readwrite', st => st.put(v)); },
    get(s, k) { return this.tx(s, 'readonly', st => st.get(k)); },
    all(s) { return this.tx(s, 'readonly', st => st.getAll()); },
    del(s, k) { return this.tx(s, 'readwrite', st => st.delete(k)); },
    clear(s) { return this.tx(s, 'readwrite', st => st.clear()); }
  };
  let TAKES = [], IMPORTED = [];
  async function reload() {
    try { TAKES = (await DB.all('takes')).sort((a, b) => a.ts - b.ts); IMPORTED = await DB.all('songs'); }
    catch (e) { TAKES = []; IMPORTED = []; console.error(e); }
  }

  // ---------------- Audio ----------------
  const A = {
    ctx: null, stream: null, src: null, an: null, buf: null, det: null, sink: null,
    async ensure() {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC({ latencyHint: 'interactive' }); }
      if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) { } }
      return this.ctx;
    },
    live() { return this.stream && this.stream.getAudioTracks().some(t => t.readyState === 'live'); },
    async mic() {
      await this.ensure();
      if (this.live()) return this.stream;
      if (this.src) { try { this.src.disconnect(); this.an.disconnect(); this.sink.disconnect(); } catch (e) { } }
      try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) { }
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      this.src = this.ctx.createMediaStreamSource(this.stream);
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0;
      this.sink = this.ctx.createGain(); this.sink.gain.value = 0;
      this.src.connect(this.an); this.an.connect(this.sink); this.sink.connect(this.ctx.destination);
      this.buf = new Float32Array(this.an.fftSize);
      this.det = C.createDetector(this.ctx.sampleRate, this.an.fftSize);
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return this.stream;
    },
    release() {
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; try { this.src.disconnect(); this.an.disconnect(); this.sink.disconnect(); } catch (e) { } }
      try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch (e) { }
    },
    read() {
      this.an.getFloatTimeDomainData(this.buf);
      const r = this.det(this.buf);
      let m = null;
      if (r.f > 60 && r.f < 1250 && r.clarity > 0.86 && r.rms > S.gate) m = C.hzToMidi(r.f, S.a4);
      return { m, rms: r.rms, clarity: r.clarity };
    },
    latency() { const c = this.ctx; return (c.outputLatency || 0) + (c.baseLatency || 0) + (this.an ? this.an.fftSize / 2 / c.sampleRate : 0) + S.latencyMs / 1000; },
    _buf: new Map(),
    async decode(key, blob) {
      if (!blob) return null;
      if (this._buf.has(key)) return this._buf.get(key);
      const b = await this.ctx.decodeAudioData(await blob.arrayBuffer());
      if (this._buf.size > 4) this._buf.delete(this._buf.keys().next().value);
      this._buf.set(key, b); return b;
    },
    bus(vol) { const g = this.ctx.createGain(); g.gain.value = vol == null ? 1 : vol; g.connect(this.ctx.destination); return g; },
    tone(bus, m, t, d, vol) {
      const c = this.ctx, f = C.midiToHz(m, S.a4);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.setTargetAtTime(vol * 0.55, t + 0.015, 0.15);
      const end = t + Math.max(0.09, d - 0.04); g.gain.setTargetAtTime(0.0001, end, 0.035);
      const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; const g2 = c.createGain(); g2.gain.value = 0.18;
      o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(bus);
      o1.start(t); o2.start(t); o1.stop(end + 0.3); o2.stop(end + 0.3);
    },
    click(bus, t, accent) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.value = accent ? 1760 : 1200;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(accent ? 0.12 : 0.07, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.06);
    },
    chord(bus, ch, t, d) {
      const c = this.ctx;
      const voice = (m, type, vol, att) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = C.midiToHz(m, S.a4);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.setTargetAtTime(0.0001, t + d - 0.05, 0.08);
        o.connect(g); g.connect(bus); o.start(t); o.stop(t + d + 0.4);
      };
      ch.pcs.forEach(pc => { let m = 52 + ((pc - 52) % 12 + 12) % 12; voice(m, 'sine', 0.035, 0.08); });
      let r = 36 + ((ch.root - 36) % 12 + 12) % 12; voice(r, 'triangle', 0.10, 0.01);
    }
  };

  // ---------------- UI-Helfer ----------------
  const view = $('#view'), overlay = $('#overlay');
  let toastT = null;
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 2600); }
  window.App = { toast };
  let COL = {};
  function readColors() { const cs = getComputedStyle(document.documentElement); ['--good', '--warn', '--bad', '--accent', '--blue', '--line', '--text', '--muted', '--listen', '--surface', '--text-2'].forEach(k => COL[k.slice(2)] = cs.getPropertyValue(k).trim()); }
  readColors();
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: light)').addEventListener && window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { readColors(); render(); });
  const devCol = c => { const a = Math.abs(c); return a <= 25 ? COL.good : a <= 50 ? COL.warn : COL.bad; };
  function openOverlay(html) { overlay.innerHTML = html; overlay.hidden = false; overlay.scrollTop = 0; return overlay; }
  let overlayCleanup = null;
  let ACTIVE = null; // finish-Funktion der laufenden Aufnahme (für Hintergrund-Wechsel)
  function closeOverlay() { if (overlayCleanup) { try { overlayCleanup(); } catch (e) { } overlayCleanup = null; } overlay.hidden = true; overlay.innerHTML = ''; render(); }
  function setupCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1); const r = cv.getBoundingClientRect();
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, w: r.width, h: r.height };
  }
  function rrect(g, x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // Pianorolle (live & Auswertung)
  function drawRoll(cv, st) {
    const { g, w, h } = setupCanvas(cv);
    g.clearRect(0, 0, w, h);
    const tA = st.tA, tB = st.tB;
    const X = t => (t - tA) / (tB - tA) * w;
    const padT = 16, padB = st.lyrics ? 28 : 12;
    const span = st.hi - st.lo;
    const Y = m => padT + (1 - (m - st.lo) / span) * (h - padT - padB);
    const rowH = (h - padT - padB) / span;
    g.font = '10px -apple-system, system-ui, sans-serif'; g.textBaseline = 'middle';
    for (let m = Math.ceil(st.lo); m <= st.hi; m++) {
      const pc = ((m % 12) + 12) % 12;
      g.globalAlpha = pc === 0 ? 0.9 : 0.35; g.strokeStyle = COL.line; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, Y(m)); g.lineTo(w, Y(m)); g.stroke();
      if (pc === 0 || (span <= 24 && (pc === 7 || pc === 4))) { g.globalAlpha = 0.8; g.fillStyle = COL.muted; g.fillText(C.midiToName(m), 4, Y(m) - 6); }
    }
    g.globalAlpha = 1;
    const bh = Math.max(7, Math.min(18, rowH * 0.85));
    let lyrEnd = -1e9;
    for (const n of st.notes) {
      if (n.t + n.d < tA || n.t > tB) continue;
      const x = X(n.t), x2 = X(n.t + n.d), y = Y(n.m);
      let fill;
      if (n.kind === 'listen') { fill = COL.listen; g.globalAlpha = 0.55; }
      else if (n.res != null) { fill = n.res >= 0.6 ? COL.good : n.res >= 0.3 ? COL.warn : COL.bad; g.globalAlpha = 0.5; }
      else { fill = COL.accent; g.globalAlpha = 0.5; }
      g.fillStyle = fill; rrect(g, x, y - bh / 2, Math.max(3, x2 - x - 2), bh, 4); g.fill();
      g.globalAlpha = 1;
      if (st.lyrics && n.lyr && n.kind !== 'listen' && x >= lyrEnd) { g.font = '12px -apple-system, system-ui, sans-serif'; g.fillStyle = COL['text-2']; g.textBaseline = 'alphabetic'; g.fillText(n.lyr, x + 1, h - 9); lyrEnd = x + 1 + g.measureText(n.lyr).width + 4; g.textBaseline = 'middle'; g.font = '10px -apple-system, system-ui, sans-serif'; }
    }
    // Referenzkurve (importierte Songs)
    if (st.curve) {
      const cu = st.curve; g.strokeStyle = COL.muted; g.globalAlpha = 0.7; g.lineWidth = 1.5; g.beginPath(); let pen = false;
      const i0 = Math.max(0, Math.floor((tA - cu.t0) / cu.dt)), i1 = Math.min(cu.m.length - 1, Math.ceil((tB - cu.t0) / cu.dt));
      for (let i = i0; i <= i1; i++) {
        const v = cu.m[i]; if (v == null) { pen = false; continue; }
        let mv = v + (st.curveShift || 0);
        const x = X(cu.t0 + i * cu.dt), y = Y(mv); if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
      }
      g.stroke(); g.globalAlpha = 1;
    }
    // eigene Tonhöhe
    const fr = st.frames; g.lineWidth = 3; g.lineCap = 'round';
    // nur den sichtbaren Ausschnitt zeichnen (binäre Suche statt alle Frames)
    let lo = 0, hi = fr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (fr[mid].t < tA) lo = mid + 1; else hi = mid; }
    for (let i = Math.max(1, lo); i < fr.length; i++) {
      const a = fr[i - 1], b = fr[i];
      if (a.t > tB) break;
      if (a.m == null || b.m == null || b.t - a.t > 0.12) continue;
      let ma = a.m, mb = b.m;
      if (st.tol && b.n) { const k = Math.round((b.n.m - mb) / 12) * 12; ma += k; mb += k; }
      g.strokeStyle = b.c == null ? COL.blue : devCol(b.c);
      g.beginPath(); g.moveTo(X(a.t), Y(ma)); g.lineTo(X(b.t), Y(mb)); g.stroke();
    }
    if (st.cursor != null) { g.strokeStyle = COL.text; g.globalAlpha = 0.55; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(st.cursor), 0); g.lineTo(X(st.cursor), h); g.stroke(); g.globalAlpha = 1; }
  }
  // aktive Note & Abweichung je Frame annotieren
  function annotate(frames, notes, tol) {
    const sing = notes.filter(n => n.kind === 'sing'); let k = 0;
    for (const f of frames) {
      while (k < sing.length && sing[k].t + sing[k].d <= f.t) k++;
      const n = sing[k];
      if (n && f.t >= n.t && f.m != null) { let c = (f.m - n.m) * 100; if (tol) c = C.foldCents(c); f.c = c; f.n = n; } else { f.c = null; f.n = null; }
    }
  }

  // ---------------- Session ----------------
  function todaySession() {
    let s = null; try { s = JSON.parse(localStorage.getItem('sl.session') || 'null'); } catch (e) { }
    const today = dayKey(Date.now());
    if (!s || s.day !== today) {
      s = { id: 'se_' + Date.now(), day: today, done: {}, takes: [], ex: pickExercise(), song: pickSong() };
      saveSession(s);
    }
    return s;
  }
  function saveSession(s) { try { localStorage.setItem('sl.session', JSON.stringify(s)); } catch (e) { } }
  function pickExercise() {
    const recent = TAKES.filter(t => t.metrics && (t.type === 'exercise' || t.type === 'song')).slice(-12);
    const stab = recent.map(t => t.metrics.stability).filter(v => v != null);
    const att = recent.map(t => t.metrics.attackMs).filter(v => v != null);
    const iv = TAKES.filter(t => t.refId === 'intervals' && t.metrics).slice(-3).map(t => t.metrics.score);
    if (stab.length >= 2 && C.mean(stab) > 20) return { id: 'hold', why: `Deine langen Töne schwankten zuletzt um ±${Math.round(C.mean(stab))} ct.` };
    if (att.length >= 2 && C.median(att) > 260) return { id: 'hold', why: `Du brauchst zuletzt ~${Math.round(C.median(att))} ms, bis ein Ton sitzt.` };
    if (iv.length && C.mean(iv) < 65) return { id: 'intervals', why: `Intervalle lagen zuletzt bei ${Math.round(C.mean(iv))}% Treffsicherheit.` };
    const rot = ['scale', 'hold', 'intervals', 'arpeggio'];
    const d = Math.floor(Date.now() / 86400000);
    return { id: rot[d % rot.length], why: 'Rotation: jeden Tag ein anderer Schwerpunkt.' };
  }
  function pickSong() {
    const all = C.SONGS.slice().sort((a, b) => a.level - b.level);
    const best = id => Math.max(-1, ...TAKES.filter(t => t.refId === id && t.metrics).map(t => t.metrics.score));
    const open = all.find(s => best(s.id) < 80);
    return (open || all[Math.floor(Date.now() / 86400000) % all.length]).id;
  }
  function streak() {
    const days = new Set(TAKES.map(t => dayKey(t.ts)));
    let n = 0; const d = new Date();
    if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d.getTime()))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ---------------- Navigation ----------------
  let TAB = 'heute';
  $$('#tabbar button').forEach(b => b.addEventListener('click', () => { TAB = b.dataset.tab; render(); view.scrollTop = 0; }));
  $('#btnSettings').addEventListener('click', openSettings);
  function render() {
    $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === TAB));
    const titles = { heute: 'Stimmlabor', songs: 'Songs', ueben: 'Üben', fortschritt: 'Fortschritt', aufnahmen: 'Aufnahmen' };
    $('#pageTitle').textContent = titles[TAB];
    ({ heute: renderToday, songs: renderSongs, ueben: renderPractice, fortschritt: renderProgress, aufnahmen: renderTakes })[TAB]();
  }

  // ---------------- Heute ----------------
  function renderToday() {
    const s = todaySession();
    const ex = C.EXERCISES.find(e => e.id === s.ex.id);
    const song = songDef(s.song) || C.SONGS[0];
    const h = new Date().getHours();
    const greet = h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
    const st = streak();
    const tk = id => TAKES.find(t => t.id === id);
    const stepScore = key => { const ids = (s.done[key] || []); const t = ids.map(tk).filter(t => t && t.metrics && t.metrics.score != null).pop(); return t ? t.metrics.score : null; };
    const steps = [
      { key: 'warmup', title: 'Warm-up', meta: 'Lippenflattern 1 min · Sirene 30 s' },
      { key: 'exercise', title: 'Übung: ' + ex.title, meta: esc(s.ex.why) },
      { key: 'song', title: 'Song: ' + song.title, meta: esc(song.artist || '') + ' · <a href="#" data-act="changesong">ändern</a>' },
      { key: 'review', title: 'Auswertung', meta: 'Deine Session im Vergleich zu deinem Schnitt' },
      { key: 'progress', title: 'Fortschritt', meta: 'Verlauf, Stimmumfang, Problem-Töne' }
    ];
    const cur = steps.findIndex(x => !s.done[x.key]);
    view.innerHTML = `
      <h1>${greet}${S.onboarded ? '' : '!'}</h1>
      <p class="sub">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}${st ? ` · <span class="chip accent">${st} ${st === 1 ? 'Tag' : 'Tage'} Serie</span>` : ''}</p>
      ${S.onboarded ? '' : `<div class="hero stack" style="margin-top:12px"><h3>Willkommen im Stimmlabor</h3><p class="sub">Einmal kurz einrichten: Stimmlage wählen, Mikrofon testen und deinen Stimmumfang messen. Dauert 2 Minuten.</p><button class="btn primary block" data-act="onboard">Einrichten</button></div>`}
      <h2>Deine Session heute <span class="muted small">· ca. 15 min</span></h2>
      <div class="steps">
        ${steps.map((x, i) => {
          const done = !!s.done[x.key], sc = stepScore(x.key);
          return `<div class="step ${done ? 'done' : ''} ${i === cur ? 'current' : ''}">
            <div class="num">${done ? '✓' : i + 1}</div>
            <div class="grow"><h3>${esc(x.title)}</h3><div class="meta">${x.meta}</div></div>
            <div class="row" style="gap:6px">${sc != null ? `<span class="chip ${lvlClass(sc)}">${sc}%</span>` : ''}<button class="btn sm ${i === cur ? 'primary' : 'ghost'}" data-step="${x.key}" aria-label="${esc(x.title)} ${done ? 'wiederholen' : 'starten'}">${done ? (sc != null ? '↻' : 'Nochmal') : 'Start'}</button></div>
          </div>`;
        }).join('')}
      </div>
      ${cur === -1 ? `<div class="card" style="margin-top:12px"><b>Session geschafft.</b> <span class="sub">Morgen wartet ein neuer Schwerpunkt. Du kannst unter „Songs“ und „Üben“ jederzeit frei weitermachen.</span></div>` : ''}
      <h2>Zuletzt</h2>
      <div class="list" id="recent"></div>`;
    takeList($('#recent'), TAKES.slice(-3).reverse(), 'Noch keine Aufnahmen. Starte mit dem Warm-up.');
    $$('[data-step]').forEach(b => b.addEventListener('click', () => runStep(b.dataset.step)));
    const cs = $('[data-act="changesong"]'); if (cs) cs.addEventListener('click', e => { e.preventDefault(); chooseSong(); });
    const ob = $('[data-act="onboard"]'); if (ob) ob.addEventListener('click', openOnboarding);
  }
  function markDone(key, takeId) {
    const s = todaySession(); s.done[key] = s.done[key] || []; if (takeId) s.done[key].push(takeId); else if (!s.done[key].length) s.done[key].push('x');
    if (takeId) s.takes.push(takeId); saveSession(s);
  }
  async function runStep(key) {
    const s = todaySession();
    if (key === 'warmup') {
      runTimer(C.EXERCISES[0], () => runFree(C.EXERCISES.find(e => e.id === 'siren'), take => { markDone('warmup', take && take.id); closeOverlay(); toast('Warm-up erledigt – weiter mit der Übung'); }, 'session'));
    } else if (key === 'exercise') {
      runPhrase(s.ex.id, take => markDone('exercise', take.id));
    } else if (key === 'song') {
      startSong(songDef(s.song), take => markDone('song', take.id));
    } else if (key === 'review') {
      sessionReview(); markDone('review');
    } else if (key === 'progress') {
      markDone('progress'); TAB = 'fortschritt'; render();
    }
  }
  function chooseSong() {
    const all = [...C.SONGS, ...IMPORTED];
    const o = openOverlay(`<div class="ovhead"><button class="iconbtn" data-x>${ICON.back}</button><div class="t">Song für heute</div></div>
      <div class="ovbody"><div class="list">${all.map(s => `<button class="item" data-id="${esc(s.id)}"><div class="grow"><div class="ttl">${esc(s.title)}</div><div class="meta">${esc(s.artist || '')}${s.level ? ' · ' + '●'.repeat(s.level) : ' · eigener Song'}</div></div></button>`).join('')}</div></div>`);
    $('[data-x]', o).onclick = closeOverlay;
    $$('[data-id]', o).forEach(b => b.onclick = () => { const s = todaySession(); s.song = b.dataset.id; saveSession(s); closeOverlay(); });
  }
  function sessionReview() {
    const s = todaySession();
    const takes = s.takes.map(id => TAKES.find(t => t.id === id)).filter(Boolean);
    const rows = takes.filter(t => t.metrics && t.metrics.score != null).map(t => {
      const prev = TAKES.filter(p => p.refId === t.refId && p.ts < t.ts && p.metrics && p.metrics.score != null);
      const avg = prev.length ? Math.round(C.mean(prev.map(p => p.metrics.score))) : null;
      return { t, avg };
    });
    const ranges = takes.filter(t => t.metrics && t.metrics.low != null);
    const ins = [];
    rows.forEach(r => C.insights(r.t.metrics).filter(i => i.lvl === 'warn').slice(0, 1).forEach(i => ins.push({ lvl: 'warn', txt: `${r.t.title}: ${i.txt}` })));
    const o = openOverlay(`<div class="ovhead"><button class="iconbtn" data-x>${ICON.back}</button><div class="t">Auswertung der Session</div></div>
      <div class="ovbody stack">
        ${rows.length ? `<table class="tbl"><thead><tr><th>Teil</th><th class="num">Heute</th><th class="num">Dein Ø</th><th class="num">Δ</th></tr></thead><tbody>
          ${rows.map(r => `<tr data-take="${r.t.id}"><td>${esc(r.t.title)}</td><td class="num"><span class="chip ${lvlClass(r.t.metrics.score)}">${r.t.metrics.score}%</span></td><td class="num">${r.avg != null ? r.avg + '%' : '–'}</td><td class="num">${r.avg != null ? (r.t.metrics.score - r.avg > 0 ? '+' : '') + (r.t.metrics.score - r.avg) : 'neu'}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">Noch keine bewerteten Aufnahmen in dieser Session. Mach erst Übung und Song.</div>'}
        ${ranges.length ? `<div class="card"><b>Umfang heute (Sirene):</b> ${C.midiToName(Math.min(...ranges.map(r => r.metrics.low)))} – ${C.midiToName(Math.max(...ranges.map(r => r.metrics.high)))}</div>` : ''}
        ${ins.length ? '<h2>Woran du arbeiten kannst</h2>' + ins.map(i => `<div class="insight ${i.lvl}"><span class="dot"></span><div>${esc(i.txt)}</div></div>`).join('') : ''}
        <button class="btn primary block" data-next>Weiter zum Fortschritt</button>
      </div>`);
    $('[data-x]', o).onclick = closeOverlay;
    $('[data-next]', o).onclick = () => { markDone('progress'); overlay.hidden = true; overlay.innerHTML = ''; TAB = 'fortschritt'; render(); };
    $$('[data-take]', o).forEach(tr => tr.onclick = () => openReview(TAKES.find(t => t.id === tr.dataset.take)));
  }

  // ---------------- Songs ----------------
  function songDef(id) { return C.SONGS.find(s => s.id === id) || IMPORTED.find(s => s.id === id); }
  function bestScore(id) { const v = TAKES.filter(t => t.refId === id && t.metrics && t.metrics.score != null).map(t => t.metrics.score); return v.length ? Math.max(...v) : null; }
  function renderSongs() {
    const lv = ['', 'Leicht', 'Mittel', 'Anspruchsvoll'];
    const item = s => { const b = bestScore(s.id); return `<button class="item" data-song="${esc(s.id)}"><div class="badge ${lvlClass(b)}">${b != null ? b : '–'}</div><div class="grow"><div class="ttl">${esc(s.title)}</div><div class="meta">${esc(s.artist || '')}</div></div></button>`; };
    view.innerHTML = `<h1>Songs</h1><p class="sub">Gemeinfreie Lieder mit Begleitung – automatisch in deine Stimmlage transponiert. Eigene Songs importierst du als <b>.singpack.json</b> (Anleitung in den Einstellungen).</p>
      <label class="btn ghost block filebtn" style="margin:6px 0 4px">＋ Eigenen Song importieren<input type="file" id="imp" accept=".json,.singpack,application/json"></label>
      ${IMPORTED.length ? `<h2>Eigene Songs</h2><div class="list">${IMPORTED.map(item).join('')}</div>` : ''}
      ${[1, 2, 3].map(l => `<h2>${lv[l]}</h2><div class="list">${C.SONGS.filter(s => s.level === l).map(item).join('')}</div>`).join('')}`;
    $$('[data-song]').forEach(b => b.addEventListener('click', () => songDetail(b.dataset.song)));
    $('#imp').addEventListener('change', e => importSong(e.target.files[0]));
  }
  async function importSong(file) {
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (j.format !== 'singpack' || !Array.isArray(j.notes)) throw new Error('Keine .singpack-Datei');
      const num = v => typeof v === 'number' && isFinite(v);
      const notes = j.notes.filter(n => n && num(n.t) && num(n.d) && num(n.m) && n.d > 0 && n.m > 20 && n.m < 110).sort((a, b) => a.t - b.t);
      if (notes.length < 3) throw new Error('Datei enthält keine gültigen Töne');
      if (j.curve && !(num(j.curve.dt) && j.curve.dt > 0 && Array.isArray(j.curve.m))) j.curve = null;
      const b64 = (d, mime) => { const bin = atob(d); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); };
      const rec = {
        id: 'imp_' + Date.now(), imported: true, title: String(j.title || file.name).slice(0, 80), artist: String(j.artist || 'Eigener Song').slice(0, 80), bpm: j.bpm || null, duration: j.duration,
        notes: notes.map(n => ({ t: n.t, d: n.d, m: n.m, lyr: typeof n.lyr === 'string' ? n.lyr.slice(0, 40) : '' })), curve: j.curve ? { t0: num(j.curve.t0) ? j.curve.t0 : 0, dt: j.curve.dt, m: j.curve.m.map(v => num(v) ? v : null) } : null,
        audio: j.audio ? b64(j.audio.data, j.audio.mime) : null, guide: j.guide ? b64(j.guide.data, j.guide.mime) : null, added: Date.now()
      };
      await DB.put('songs', rec); await reload(); render(); toast(`„${rec.title}“ importiert (${rec.notes.length} Töne)`);
    } catch (e) { toast('Import fehlgeschlagen: ' + e.message, 4000); }
  }
  function songDetail(id) {
    const def = songDef(id); if (!def) return;
    const pref = S.songPrefs[id] || {};
    const imported = !!def.imported;
    let tr, tempo = pref.tempo || 1, tol = pref.tol != null ? pref.tol : imported;
    let lo, hi;
    if (imported) { lo = Math.min(...def.notes.map(n => n.m)); hi = Math.max(...def.notes.map(n => n.m)); tr = 0; }
    else { ({ lo, hi } = C.songRange(def)); tr = pref.tr != null ? pref.tr : C.fitTranspose(lo, hi, myRange()); }
    let guide = pref.guide != null ? pref.guide : (imported ? false : S.guide), accomp = pref.accomp != null ? pref.accomp : S.accomp;
    const takes = TAKES.filter(t => t.refId === id).slice().reverse();
    const r = myRange();
    const o = openOverlay(`<div class="ovhead"><button class="iconbtn" data-x>${ICON.back}</button><div class="t">${esc(def.title)}</div></div><div class="ovbody stack" id="sd"></div>`);
    $('[data-x]', o).onclick = closeOverlay;
    const draw = () => {
      const fitLo = lo + tr, fitHi = hi + tr;
      const fits = fitLo >= r.low && fitHi <= r.high;
      $('#sd').innerHTML = `
        <p class="sub">${esc(def.artist || '')}${def.level ? ' · Level ' + def.level : ''}</p>
        ${def.tip ? `<div class="insight"><span class="dot"></span><div>${esc(def.tip)}</div></div>` : ''}
        <div class="card stack">
          <div class="row between"><div><b>Tonumfang</b><div class="sub">${C.midiToName(fitLo)} – ${C.midiToName(fitHi)} · dein Umfang ${C.midiToName(r.low)} – ${C.midiToName(r.high)}</div></div><span class="chip ${fits ? 'good' : 'warn'}">${fits ? 'passt' : 'grenzwertig'}</span></div>
          ${imported ? `<div class="sub">Eigene Songs laufen in Originaltonart. „Oktav-tolerant“ wertet z. B. eine Männerstimme bei einer Sängerin richtig.</div>` :
          `<div class="row between"><b>Transposition</b><div class="stepper"><button class="btn sm ghost" data-tr="-1">−</button><b>${tr > 0 ? '+' : ''}${tr} HT</b><button class="btn sm ghost" data-tr="1">＋</button></div></div>
           <div><b>Tempo</b><div class="seg" style="margin-top:6px">${[0.75, 0.9, 1].map(v => `<button data-tempo="${v}" class="${tempo === v ? 'on' : ''}">${Math.round(v * 100)}%</button>`).join('')}</div></div>`}
          <div class="toggles">
            ${imported ? (def.guide ? `<button class="tog ${guide ? 'on' : ''}" data-t="guide">Originalgesang leise</button>` : '') : `<button class="tog ${guide ? 'on' : ''}" data-t="guide">Melodie mitspielen</button><button class="tog ${accomp ? 'on' : ''}" data-t="accomp">Begleitung</button>`}
            <button class="tog ${tol ? 'on' : ''}" data-t="tol">Oktav-tolerant</button>
          </div>
          ${!S.headphones && (guide || imported) ? '<div class="sub">Ohne Kopfhörer hört das Mikro die Melodie mit – das verfälscht die Bewertung. Kopfhörer oder Melodie aus.</div>' : ''}
        </div>
        <button class="btn primary block" data-go>${ICON.mic} Singen</button>
        <h2>Deine Versuche</h2><div class="list" id="sdt"></div>
        ${imported ? `<button class="btn ghost block" data-del style="margin-top:16px">${ICON.trash} Song löschen</button>` : ''}`;
      takeList($('#sdt'), takes, 'Noch keine Versuche.');
      $$('[data-tr]').forEach(b => b.onclick = () => { tr += +b.dataset.tr; persist(); draw(); });
      $$('[data-tempo]').forEach(b => b.onclick = () => { tempo = +b.dataset.tempo; persist(); draw(); });
      $$('[data-t]').forEach(b => b.onclick = () => { const k = b.dataset.t; if (k === 'guide') guide = !guide; if (k === 'accomp') accomp = !accomp; if (k === 'tol') tol = !tol; persist(); draw(); });
      $('[data-go]').onclick = () => startSong(def, null, { tr, tempo, guide, accomp, tol });
      const dl = $('[data-del]'); if (dl) dl.onclick = async () => { if (!confirm('Song löschen? Deine Aufnahmen bleiben erhalten.')) return; await DB.del('songs', id); await reload(); closeOverlay(); };
    };
    const persist = () => { S.songPrefs[id] = { tr, tempo, guide, accomp, tol }; saveS(); };
    draw();
  }
  async function startSong(def, onSaved, opt) {
    if (!def) return;
    const pref = Object.assign({}, S.songPrefs[def.id] || {}, opt || {});
    let song;
    if (def.imported) {
      song = { id: def.id, title: def.title, kind: 'song', imported: true, notes: def.notes.map(n => Object.assign({ kind: 'sing' }, n)), chords: [], spb: 60 / (def.bpm || 100), bpb: 4, duration: (def.duration || (def.notes[def.notes.length - 1].t + 2)) + 0.3, octaveTolerant: pref.tol != null ? pref.tol : true, curve: def.curve, audioBlob: def.audio, guideBlob: def.guide };
      song.guideOn = !!pref.guide;
    } else {
      const { lo, hi } = C.songRange(def);
      const tr = pref.tr != null ? pref.tr : C.fitTranspose(lo, hi, myRange());
      song = C.buildSong(def, { transpose: tr, tempo: pref.tempo || 1, octaveTolerant: !!pref.tol });
      song.guideOn = pref.guide != null ? pref.guide : S.guide; song.accompOn = pref.accomp != null ? pref.accomp : S.accomp; song.tempo = pref.tempo || 1;
    }
    runTimed(song, { type: 'song', refId: def.id, title: def.title, onSaved });
  }

  // ---------------- Üben ----------------
  function renderPractice() {
    const r = myRange();
    view.innerHTML = `<h1>Üben</h1><p class="sub">Hören & Nachsingen – die Bewertung läuft nur, während du dran bist, deshalb funktioniert das auch ohne Kopfhörer sauber.</p>
      <div class="card row" style="margin-top:8px"><div class="grow"><b>Dein Stimmumfang</b><div class="sub">${C.midiToName(r.low)} – ${C.midiToName(r.high)} (${r.high - r.low} Halbtöne)${S.range ? '' : ' · geschätzt'}</div></div><button class="btn sm primary" data-ex="range">Testen</button></div>
      <h2>Übungen</h2><div class="list">${C.EXERCISES.filter(e => e.id !== 'range').map(e => { const b = bestScore(e.id); return `<button class="item" data-ex="${e.id}"><div class="badge ${lvlClass(b)}">${b != null ? b : e.kind === 'timer' ? '1′' : e.kind === 'free' ? '~' : '–'}</div><div class="grow"><div class="ttl">${esc(e.title)}</div><div class="meta">${esc(e.short)}</div></div></button>`; }).join('')}</div>`;
    $$('[data-ex]').forEach(b => b.addEventListener('click', () => {
      const e = C.EXERCISES.find(x => x.id === b.dataset.ex);
      if (e.kind === 'timer') runTimer(e, () => closeOverlay());
      else if (e.kind === 'free') runFree(e);
      else runPhrase(e.id);
    }));
  }
  function runPhrase(id, onSaved) {
    const ex = C.buildExercise(id, myRange(), Math.floor(Math.random() * 8));
    runTimed(ex, { type: 'exercise', refId: id, title: ex.title, onSaved, howto: C.EXERCISES.find(e => e.id === id).howto });
  }

  // ---------------- Live-Lauf (Songs & Übungen) ----------------
  function liveShell(title, sub) {
    return openOverlay(`<div class="ovhead"><button class="iconbtn" data-x aria-label="Schließen">${ICON.close}</button><div class="t">${esc(title)}</div></div>
      <div class="live">
        <div class="livetop"><div class="bignote" id="bn">–</div><div class="cents"><div class="centsbar"><div class="needle" id="needle"></div></div><div class="centslbl"><span>zu tief</span><span id="cl">0 ct</span><span>zu hoch</span></div></div></div>
        <div class="rollwrap"><canvas id="roll"></canvas><div class="countdown" id="cd" hidden></div></div>
        <div class="lyric" id="ly"></div>
        <div class="livebot"><div class="status" id="stt">${esc(sub || '')}</div><div class="toggles" id="tg"></div><button class="btn primary block" id="go">${ICON.mic} Start</button></div>
      </div>`);
  }
  function wakeLock() { let wl = null; try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => wl = w).catch(() => { }); } catch (e) { } return () => { try { wl && wl.release(); } catch (e) { } }; }
  function pickMime() { const c = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']; if (!window.MediaRecorder) return null; for (const m of c) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { } } return ''; }
  function startRecorder(stream) {
    const mime = pickMime(); if (mime == null) return null;
    let rec; try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); } catch (e) { return null; }
    const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mime || 'audio/mp4' })); });
    rec.start(1000);
    return { rec, done, stop() { try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { } return done; } };
  }
  function setNeedle(o, m, target) {
    const bn = $('#bn', o), nd = $('#needle', o), cl = $('#cl', o);
    if (m == null) { bn.textContent = '–'; bn.style.color = ''; nd.style.opacity = .25; return; }
    const ref = target != null ? target : Math.round(m);
    let c = (m - ref) * 100; if (target != null && Math.abs(c) > 600) c = C.foldCents(c);
    const cc = Math.max(-50, Math.min(50, c));
    bn.textContent = C.midiToName(m); bn.style.color = target != null ? devCol(c) : '';
    nd.style.opacity = 1; nd.style.left = (50 + cc) + '%'; cl.textContent = (c > 0 ? '+' : '') + Math.round(c) + ' ct';
  }

  function runTimed(song, meta) {
    const o = liveShell(meta.title, meta.howto || (song.kind === 'song' ? (S.headphones ? 'Kopfhörer auf, dann Start. Es gibt einen Takt Vorzähler.' : 'Tipp: Mit Kopfhörern wird die Bewertung genauer.') : ''));
    const cv = $('#roll', o);
    const sing = song.notes.filter(n => n.kind === 'sing');
    const allM = song.notes.map(n => n.m);
    let lo = Math.min(...allM) - 3, hi = Math.max(...allM) + 3;
    const frames = []; let running = false, finished = false, t0 = 0, raf = 0, iv = 0, bus = null, rec = null, recStart = 0, backing = null, guideSrc = null, unlock = null, smooth = C.createSmoother();
    const st = { notes: song.notes, frames, lo, hi, lyrics: true, tol: song.octaveTolerant, curve: song.curve || null };
    // Vorschau zeichnen
    const preview = () => { st.tA = -1.5; st.tB = 5; st.cursor = 0; drawRoll(cv, st); };
    requestAnimationFrame(preview);
    // Toggles
    const tg = $('#tg', o);
    if (song.kind === 'song' && !song.imported) {
      tg.innerHTML = `<button class="tog ${song.guideOn ? 'on' : ''}" data-k="guideOn">Melodie</button><button class="tog ${song.accompOn ? 'on' : ''}" data-k="accompOn">Begleitung</button>`;
      $$('[data-k]', tg).forEach(b => b.onclick = () => { if (running) return; song[b.dataset.k] = !song[b.dataset.k]; b.classList.toggle('on', song[b.dataset.k]); });
    }
    const lyricEl = $('#ly', o);
    let ni = 0, liveNote = null, liveFrames = [];
    const loop = () => {
      if (!running) return;
      const now = A.ctx.currentTime - t0;
      st.tA = now - 2.2; st.tB = now + 3.8; st.cursor = now - A.latency();
      // Countdown
      const cd = $('#cd', o);
      if (now < 0) { const beatsLeft = Math.ceil(-now / song.spb); cd.hidden = false; cd.textContent = beatsLeft; } else cd.hidden = true;
      drawRoll(cv, st);
      // Liedtext
      while (ni < sing.length && sing[ni].t + sing[ni].d < now) ni++;
      const cur = sing[ni];
      if (cur && song.kind === 'song') {
        const nxt = sing.slice(ni + 1, ni + 5).map(n => n.lyr).filter(Boolean).join(' ');
        lyricEl.innerHTML = cur.t <= now + 0.15 ? `${esc(cur.lyr)}<span class="next">${esc(nxt)}</span>` : `<span class="next">${esc([cur.lyr, nxt].join(' '))}</span>`;
      } else if (song.kind !== 'song') {
        const anyNow = song.notes.find(n => now >= n.t && now < n.t + n.d);
        lyricEl.innerHTML = anyNow ? (anyNow.kind === 'listen' ? '<span class="next">👂 zuhören</span>' : '🎤 ' + esc(anyNow.lyr || 'singen')) : (now < 0 ? '<span class="next">gleich geht’s los</span>' : '');
      }
      if (now > song.duration) { finish(false); return; }
      raf = requestAnimationFrame(loop);
    };
    const tick = () => {
      if (!running) return;
      const r = A.read();
      const t = A.ctx.currentTime - t0 - A.latency();
      const m = smooth(r.m);
      const f = { t, m, r: r.rms };
      // aktive Note
      const n = sing.find(x => t >= x.t && t < x.t + x.d);
      if (n && m != null) { let c = (m - n.m) * 100; if (song.octaveTolerant) c = C.foldCents(c); f.c = c; f.n = n; } else f.c = null;
      frames.push(f);
      // Live-Bewertung je Note
      if (n !== liveNote) { if (liveNote && liveFrames.length) liveNote.res = liveFrames.filter(c => c != null && Math.abs(c) <= 50).length / liveFrames.length; liveNote = n; liveFrames = []; }
      if (n && t > n.t + Math.min(0.12, n.d * 0.25)) liveFrames.push(f.c);
      setNeedle(o, m, n ? n.m + (song.octaveTolerant && m != null ? Math.round((m - n.m) / 12) * 12 : 0) : null);
    };
    async function start() {
      const go = $('#go', o); go.disabled = true; $('#stt', o).textContent = 'Mikrofon wird gestartet …';
      try { await A.mic(); } catch (e) { go.disabled = false; $('#stt', o).textContent = 'Kein Mikrofonzugriff. In iOS: Einstellungen → Safari → Mikrofon erlauben (bzw. beim Start „Erlauben“ tippen).'; return; }
      const ctx = A.ctx;
      let backingBuf = null, guideBuf = null;
      if (song.imported && song.audioBlob) { $('#stt', o).textContent = 'Song wird geladen …'; try { backingBuf = await A.decode(song.id + ':a', song.audioBlob); } catch (e) { toast('Audio konnte nicht dekodiert werden'); } }
      if (song.imported && song.guideOn && song.guideBlob) { try { guideBuf = await A.decode(song.id + ':g', song.guideBlob); } catch (e) { } }
      bus = A.bus(1); unlock = wakeLock();
      rec = startRecorder(A.stream); recStart = ctx.currentTime;
      const countBeats = song.kind === 'exercise' ? 4 : (song.bpb || 4);
      const spb = song.spb || 0.6;
      t0 = ctx.currentTime + 0.35 + countBeats * spb;
      if (window.__testHook) window.__testHook(t0, song);
      for (let k = 0; k < countBeats; k++) A.click(bus, t0 - (countBeats - k) * spb, k === 0);
      if (song.kind === 'exercise') {
        song.notes.forEach(n => { if (n.kind === 'listen') A.tone(bus, n.m, t0 + n.t, n.d, 0.32); });
      } else if (!song.imported) {
        if (song.guideOn) song.notes.forEach(n => A.tone(bus, n.m, t0 + n.t, n.d, 0.16));
        if (song.accompOn) song.chords.forEach(c => A.chord(bus, c, t0 + c.t, c.d));
      }
      if (backingBuf) { backing = ctx.createBufferSource(); backing.buffer = backingBuf; backing.connect(bus); backing.start(t0); }
      if (guideBuf) { const g = ctx.createGain(); g.gain.value = 0.35; g.connect(bus); guideSrc = ctx.createBufferSource(); guideSrc.buffer = guideBuf; guideSrc.connect(g); guideSrc.start(t0); }
      running = true; ACTIVE = () => finish(false); $('#stt', o).textContent = song.kind === 'song' ? 'Sing mit! Die farbige Linie bist du.' : 'Erst zuhören (grau), dann nachsingen (farbig).';
      go.disabled = false; go.innerHTML = ICON.stop + ' Beenden'; go.classList.remove('primary'); go.onclick = () => finish(false);
      iv = setInterval(tick, 20); raf = requestAnimationFrame(loop);
    }
    function stopAudio() {
      running = false; clearInterval(iv); cancelAnimationFrame(raf);
      try { backing && backing.stop(); } catch (e) { } try { guideSrc && guideSrc.stop(); } catch (e) { }
      try { bus && bus.disconnect(); } catch (e) { }
      if (unlock) unlock();
    }
    async function finish(cancel) {
      if (finished) return; finished = true; ACTIVE = null;
      const tEnd = A.ctx ? A.ctx.currentTime - t0 : 0;
      stopAudio();
      const blobP = rec ? rec.stop() : Promise.resolve(null);
      if (cancel || !frames.length || tEnd < 1) { await blobP; closeOverlay(); return; }
      $('#stt', o).textContent = 'Wird ausgewertet …';
      const used = Object.assign({}, song, { notes: song.notes.filter(n => n.t + Math.min(n.d, 0.5) <= tEnd) });
      const a = C.analyzeTake(frames.filter(f => f.t > -0.5), used);
      const blob = await blobP;
      const take = makeTake(meta, used, frames, a, blob, { audioShift: t0 - recStart + (A.ctx.outputLatency || 0) + S.latencyMs / 1000, duration: Math.max(0, tEnd) });
      await DB.put('takes', take); await reload();
      if (meta.onSaved) meta.onSaved(take);
      overlayCleanup = null;
      openReview(take, { fresh: true, again: () => meta.type === 'song' ? startSong(songDef(meta.refId), meta.onSaved) : runPhrase(meta.refId, meta.onSaved) });
    }
    $('#go', o).onclick = start;
    $('[data-x]', o).onclick = () => finish(true);
    overlayCleanup = () => { if (!finished) { finished = true; stopAudio(); rec && rec.stop(); } };
  }

  function makeTake(meta, song, frames, a, blob, extra) {
    const ft = new Float32Array(frames.length), fm = new Float32Array(frames.length);
    frames.forEach((f, i) => { ft[i] = f.t; fm[i] = f.m == null ? NaN : f.m; });
    const metrics = Object.assign({}, a); delete metrics.perNote;
    return Object.assign({
      id: 'tk_' + Date.now(), ts: Date.now(), type: meta.type, refId: meta.refId, title: meta.title,
      metrics, perNote: a.perNote || [], frames: { t: ft, m: fm },
      notes: song ? song.notes.map(n => ({ t: n.t, d: n.d, m: n.m, lyr: n.lyr, kind: n.kind })) : [],
      tol: !!(song && song.octaveTolerant), transpose: song ? song.transpose || 0 : 0, tempo: song ? song.tempo || 1 : 1,
      imported: !!(song && song.imported), audio: blob || null, mime: blob ? blob.type : null
    }, extra || {});
  }
  const takeFrames = tk => { const out = []; if (!tk.frames) return out; const { t, m } = tk.frames; for (let i = 0; i < t.length; i++) out.push({ t: t[i], m: isNaN(m[i]) ? null : m[i] }); return out; };

  // ---------------- Freier Modus (Sirene, Umfang) ----------------
  function runFree(ex, onSaved, ctxFlag) {
    const o = liveShell(ex.title, ex.howto);
    const cv = $('#roll', o); const r = myRange();
    const frames = []; let running = false, finished = false, t0 = 0, iv = 0, raf = 0, rec = null, recStart = 0, unlock = null; const smooth = C.createSmoother();
    const st = { notes: [], frames, lo: Math.min(r.low, 40) - 3, hi: Math.max(r.high, 72) + 3, lyrics: false };
    requestAnimationFrame(() => { st.tA = -6; st.tB = 0.5; drawRoll(cv, st); });
    const dur = ex.seconds || 30;
    let lowSeen = null, highSeen = null;
    const loop = () => {
      if (!running) return;
      const now = A.ctx.currentTime - t0; st.tA = now - 6; st.tB = now + 0.5; st.cursor = null; drawRoll(cv, st);
      const left = Math.ceil(dur - now);
      $('#ly', o).innerHTML = `<span class="next">${left > 0 ? left + ' s' : ''}${lowSeen != null ? ` · tiefster ${C.midiToName(lowSeen)} · höchster ${C.midiToName(highSeen)}` : ''}</span>`;
      if (now >= dur) { finish(false); return; }
      raf = requestAnimationFrame(loop);
    };
    const tick = () => {
      const res = A.read(); const m = smooth(res.m); const t = A.ctx.currentTime - t0;
      frames.push({ t, m, r: res.rms, c: null }); setNeedle(o, m, null);
      if (m != null) {
        const w = frames.slice(-8); if (w.length === 8 && w.every(f => f.m != null) && Math.max(...w.map(f => f.m)) - Math.min(...w.map(f => f.m)) < 0.6) {
          lowSeen = lowSeen == null ? m : Math.min(lowSeen, m); highSeen = highSeen == null ? m : Math.max(highSeen, m);
          if (m < st.lo + 2) st.lo = Math.floor(m) - 3; if (m > st.hi - 2) st.hi = Math.ceil(m) + 3;
        }
      }
    };
    async function start() {
      const go = $('#go', o); go.disabled = true;
      try { await A.mic(); } catch (e) { go.disabled = false; $('#stt', o).textContent = 'Kein Mikrofonzugriff – bitte erlauben.'; return; }
      unlock = wakeLock(); rec = startRecorder(A.stream); recStart = A.ctx.currentTime; t0 = A.ctx.currentTime + 0.2;
      running = true; ACTIVE = () => finish(false); go.disabled = false; go.innerHTML = ICON.stop + ' Fertig'; go.classList.remove('primary'); go.onclick = () => finish(false);
      $('#stt', o).textContent = ex.id === 'range' ? 'Ganz tief … halten … dann ganz hoch … halten.' : 'Weich gleiten, auf und ab.';
      iv = setInterval(tick, 20); raf = requestAnimationFrame(loop);
    }
    async function finish(cancel) {
      if (finished) return; finished = true; ACTIVE = null; running = false; clearInterval(iv); cancelAnimationFrame(raf); if (unlock) unlock();
      const tEnd = A.ctx ? A.ctx.currentTime - t0 : 0;
      const blob = rec ? await rec.stop() : null;
      if (cancel || tEnd < 2) { closeOverlay(); return; }
      const a = C.analyzeTake(frames, null);
      const take = makeTake({ type: ex.id === 'range' ? 'range' : 'warmup', refId: ex.id, title: ex.title }, null, frames, a, blob, { audioShift: t0 - recStart, duration: tEnd });
      await DB.put('takes', take);
      if (ex.id === 'range' && a.low != null && a.high - a.low >= 7) { S.range = { low: Math.round(a.low), high: Math.round(a.high) }; saveS(); }
      await reload();
      overlayCleanup = null;
      if (onSaved) { onSaved(take); return; }
      openReview(take, { fresh: true, again: () => runFree(ex) });
    }
    $('#go', o).onclick = start;
    $('[data-x]', o).onclick = () => finish(true);
    overlayCleanup = () => { if (!finished) { finished = true; running = false; clearInterval(iv); cancelAnimationFrame(raf); rec && rec.stop(); if (unlock) unlock(); } };
  }

  // ---------------- Timer (Lippenflattern) ----------------
  function runTimer(ex, onDone) {
    const total = (ex.minutes || 1) * 60;
    const o = openOverlay(`<div class="ovhead"><button class="iconbtn" data-x>${ICON.close}</button><div class="t">${esc(ex.title)}</div></div>
      <div class="ovbody"><p class="sub" style="margin-top:8px">${esc(ex.howto)}</p>
      <div class="timer"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="var(--surface-3)" stroke-width="8"/><circle id="arc" cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="276.5" stroke-dashoffset="0"/></svg><div class="tv" id="tv">${total}</div></div>
      <div class="stack"><button class="btn primary block" id="go">Start</button><button class="btn ghost block" id="skip">Überspringen</button></div></div>`);
    let iv = 0, start = 0, done = false;
    const fin = async (skip) => {
      if (done) return; done = true; clearInterval(iv);
      if (!skip) { const take = { id: 'tk_' + Date.now(), ts: Date.now(), type: 'timer', refId: ex.id, title: ex.title, duration: total, metrics: null }; await DB.put('takes', take); await reload(); try { navigator.vibrate && navigator.vibrate(200); } catch (e) { } }
      overlayCleanup = null; onDone && onDone();
    };
    $('#go', o).onclick = () => {
      if (start) return; start = Date.now(); $('#go', o).disabled = true;
      iv = setInterval(() => { const el = (Date.now() - start) / 1000; const left = Math.max(0, total - el); $('#tv', o).textContent = Math.ceil(left); $('#arc', o).setAttribute('stroke-dashoffset', 276.5 * el / total); if (left <= 0) fin(false); }, 200);
    };
    $('#skip', o).onclick = () => fin(true);
    $('[data-x]', o).onclick = () => { done = true; clearInterval(iv); closeOverlay(); };
    overlayCleanup = () => clearInterval(iv);
  }

  // ---------------- Auswertung einer Aufnahme ----------------
  function openReview(tk, opts) {
    if (!tk) return; opts = opts || {};
    const m = tk.metrics || {};
    const frames = takeFrames(tk);
    const notes = tk.notes || [];
    const timed = notes.length > 0;
    const off = m.offset || 0;
    frames.forEach(f => { f.t += off; });
    annotate(frames, notes, tk.tol);
    const per = tk.perNote || [];
    // Ergebnis je Note an Noten hängen (für Farbe)
    let pi = 0; notes.forEach(n => { if (n.kind === 'sing') { const p = per[pi++]; if (p) n.res = p.hit; } });
    const prev = TAKES.filter(t => t.refId === tk.refId && t.ts < tk.ts && t.metrics && t.metrics.score != null);
    const last = prev[prev.length - 1];
    const ring = (v) => { const c = 2 * Math.PI * 44, col = v >= 80 ? 'var(--good)' : v >= 55 ? 'var(--warn)' : 'var(--bad)'; return `<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="var(--surface-3)" stroke-width="9"/><circle cx="50" cy="50" r="44" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}"/></svg><div class="rv"><div><b>${v}%</b><span>Treffsicher</span></div></div></div>`; };
    const kpi = (lbl, val, unit, hint) => `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">${val == null ? '–' : val}${val != null && unit ? `<small>${unit}</small>` : ''}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    let lo, hi;
    const ms = frames.filter(f => f.m != null).map(f => f.m);
    if (timed) { const nm = notes.map(n => n.m); lo = Math.min(...nm) - 3; hi = Math.max(...nm) + 3; }
    else if (ms.length) { lo = Math.floor(Math.min(...ms)) - 2; hi = Math.ceil(Math.max(...ms)) + 2; } else { lo = 45; hi = 70; }
    if (hi - lo < 10) { const c = (hi + lo) / 2; lo = c - 5; hi = c + 5; }
    const imported = tk.imported ? IMPORTED.find(s => s.id === tk.refId) : null;
    const o = openOverlay(`<div class="ovhead"><button class="iconbtn" data-x>${ICON.back}</button><div class="t">${esc(tk.title)}</div><span class="muted small" style="padding-right:8px">${fmtDT(tk.ts)}</span></div>
      <div class="ovbody">
        ${timed ? `<div class="scorewrap">${ring(m.score || 0)}<div class="grow"><div class="sub">Anteil der Sollzeit, in der du höchstens <b>±50 Cent</b> (ein Viertelton) neben dem Zielton lagst.</div>
          ${last ? `<div style="margin-top:6px"><span class="chip ${m.score >= last.metrics.score ? 'good' : 'bad'}">${m.score >= last.metrics.score ? '▲' : '▼'} ${Math.abs(m.score - last.metrics.score)} Pkt.</span> <span class="small muted">vs. letzter Versuch (${last.metrics.score}%)</span></div>` : '<div class="small muted" style="margin-top:6px">Erster Versuch – ab jetzt siehst du die Entwicklung.</div>'}</div></div>
        <div class="kpis">
          ${kpi('Ø Abweichung', m.meanAbsCents, ' ct', 'Durchschnitt, wenn du gesungen hast')}
          ${kpi('Feintreffer', m.within25, '%', 'innerhalb ±25 ct')}
          ${kpi('Stabilität', m.stability != null ? '±' + m.stability : null, ' ct', 'Schwankung auf langen Tönen')}
          ${kpi('Einschwingen', m.attackMs, ' ms', 'bis der Ton sitzt (Median)')}
          ${kpi('Töne getroffen', m.notesTotal ? m.notesHit + '/' + m.notesTotal : null, '', '≥ 50% der Notenzeit im Ziel')}
          ${kpi('Vibrato', m.vibrato ? m.vibrato.rate : null, m.vibrato ? ' Hz' : '', m.vibrato ? `±${m.vibrato.extent} ct` : 'nicht erkannt')}
        </div>` : (m.low != null ? `<div class="kpis" style="margin:8px 0 4px">${kpi('Tiefster Ton', C.midiToName(m.low), '', '')}${kpi('Höchster Ton', C.midiToName(m.high), '', '')}${kpi('Umfang', Math.round(m.high - m.low), ' HT', (Math.round(m.high - m.low) / 12).toFixed(1) + ' Oktaven')}${kpi('Gesungen', Math.round(m.voicedSeconds || 0), ' s', '')}</div>
        ${tk.type === 'range' ? '<div class="insight good"><span class="dot"></span><div>Dein Stimmumfang wurde gespeichert. Songs werden ab jetzt passend transponiert.</div></div>' : ''}` : '<div class="empty">Kein stabiler Ton erkannt.</div>')}
        <h2>Verlauf</h2>
        <div class="reviewroll"><canvas id="rv"></canvas></div>
        <div class="legend">${timed ? '<span><i style="background:var(--accent);opacity:.6"></i>Zielton</span>' + (notes.some(n => n.kind === 'listen') ? '<span><i style="background:var(--listen)"></i>Vorgabe (hören)</span>' : '') : ''}<span><i style="background:var(--good)"></i>≤25 ct</span><span><i style="background:var(--warn)"></i>≤50 ct</span><span><i style="background:var(--bad)"></i>>50 ct</span>${imported && imported.curve ? '<span><i style="background:var(--muted)"></i>Original</span>' : ''}<span class="muted">wischen zum Scrollen</span></div>
        ${tk.audio ? `<div class="player"><button class="btn sm primary" id="pp">${ICON.play}</button><input type="range" id="seek" min="0" max="1000" value="0"><span class="small muted" id="ptime">0:00</span></div>
          ${timed ? `<div class="toggles" style="margin-top:8px;justify-content:flex-start"><button class="tog" id="withref">${imported ? 'Mit Playback' : 'Mit Melodie'} abspielen</button></div>` : ''}` : ''}
        ${per.length ? `<h2>Ton für Ton</h2><div class="desc">Tippe einen Ton, um genau dort hineinzuhören.</div><div class="notechips">${per.map((p, i) => `<button class="nc ${p.cover < 0.3 ? '' : hitClass(p.hit)}" data-i="${i}" title="${C.midiToName(p.m)} ${p.cents != null ? (p.cents > 0 ? '+' : '') + p.cents + ' ct' : 'nicht gesungen'}">${esc(p.lyr || C.midiToName(p.m))}</button>`).join('')}</div>` : ''}
        ${timed ? `<h2>Einschätzung</h2><div class="stack">${C.insights(m).map(i => `<div class="insight ${i.lvl}"><span class="dot"></span><div>${esc(i.txt)}</div></div>`).join('')}</div>` : ''}
        <div class="stack" style="margin-top:18px">
          ${opts.again ? `<button class="btn primary block" id="again">${ICON.redo} Nochmal</button>` : ''}
          ${tk.audio ? `<button class="btn ghost block" id="share">${ICON.share} Aufnahme sichern / teilen</button>` : ''}
          <button class="btn ghost block" id="del">${ICON.trash} Löschen</button>
        </div>
      </div>`);
    const cv = $('#rv', o);
    const total = timed ? Math.max(...notes.map(n => n.t + n.d)) + 0.5 : (frames.length ? frames[frames.length - 1].t : 10);
    const start = timed ? -0.5 : 0;
    let pxs = 70; // Pixel pro Sekunde
    let viewA = start, cursor = null;
    const st = { notes, frames, lo, hi, lyrics: timed && notes.some(n => n.lyr), tol: tk.tol, curve: imported && imported.curve ? imported.curve : null };
    const redraw = () => { const w = cv.getBoundingClientRect().width || 320; const span = w / pxs; st.tA = viewA; st.tB = viewA + span; st.cursor = cursor; drawRoll(cv, st); };
    requestAnimationFrame(redraw);
    // Scrollen per Wischen
    let drag = null;
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, a: viewA }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; const w = cv.getBoundingClientRect().width; viewA = Math.max(start - 1, Math.min(total, drag.a - (e.clientX - drag.x) / pxs)); redraw(); });
    cv.addEventListener('pointerup', () => { drag = null; });
    // Wiedergabe
    let audio = null, url = null, rafP = 0, refBus = null, refSrc = null, withRef = false;
    const shift = (tk.audioShift || 0) - off;
    const fmtT = s => { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
    const stopRef = () => { try { refSrc && refSrc.stop(); } catch (e) { } try { refBus && refBus.disconnect(); } catch (e) { } refBus = null; refSrc = null; };
    const startRef = async () => {
      if (!withRef || !timed) return; await A.ensure(); stopRef(); refBus = A.bus(1);
      const pos = audio.currentTime - shift; const now = A.ctx.currentTime + 0.05;
      if (imported && imported.audio) {
        try { const buf = await A.decode(imported.id + ':a', imported.audio); if (!audio || audio.paused) return; refSrc = A.ctx.createBufferSource(); refSrc.buffer = buf; refSrc.connect(refBus); const p2 = audio.currentTime - shift; if (p2 >= 0) refSrc.start(A.ctx.currentTime, p2); else refSrc.start(A.ctx.currentTime - p2); } catch (e) { }
      } else notes.forEach(n => { if (n.t + n.d > pos) { const st0 = now + (n.t - pos); if (st0 >= now - 0.01) A.tone(refBus, n.m, st0, n.d, n.kind === 'listen' ? 0.25 : 0.14); } });
    };
    if (tk.audio) {
      url = URL.createObjectURL(tk.audio); audio = new Audio(); audio.src = url; audio.preload = 'auto'; audio.playsInline = true;
      const pp = $('#pp', o), seek = $('#seek', o);
      const frameLoop = () => {
        const t = audio.currentTime - shift; cursor = t;
        const w = cv.getBoundingClientRect().width; const span = w / pxs;
        if (t > viewA + span * 0.8 || t < viewA) viewA = t - span * 0.25;
        redraw();
        if (audio.duration && isFinite(audio.duration)) seek.value = Math.round(audio.currentTime / audio.duration * 1000);
        $('#ptime', o).textContent = fmtT(audio.currentTime);
        if (!audio.paused) rafP = requestAnimationFrame(frameLoop);
      };
      pp.onclick = async () => { if (audio.paused) { try { await audio.play(); } catch (e) { toast('Wiedergabe nicht möglich'); return; } pp.innerHTML = ICON.pause; startRef(); frameLoop(); } else { audio.pause(); } };
      audio.onpause = () => { pp.innerHTML = ICON.play; cancelAnimationFrame(rafP); stopRef(); };
      audio.onended = () => { pp.innerHTML = ICON.play; stopRef(); };
      seek.oninput = () => { if (audio.duration && isFinite(audio.duration)) { audio.currentTime = seek.value / 1000 * audio.duration; cursor = audio.currentTime - shift; viewA = cursor - 1; redraw(); if (!audio.paused) startRef(); } };
      const wr = $('#withref', o); if (wr) wr.onclick = () => { withRef = !withRef; wr.classList.toggle('on', withRef); if (!audio.paused) { if (withRef) startRef(); else stopRef(); } };
      $$('.nc', o).forEach(b => b.onclick = async () => {
        const p = per[+b.dataset.i]; viewA = p.t - 1; cursor = p.t; redraw();
        audio.currentTime = Math.max(0, p.t + shift - 0.6);
        try { await audio.play(); pp.innerHTML = ICON.pause; startRef(); frameLoop(); setTimeout(() => { if (audio.currentTime - shift > p.t + p.d + 0.3) audio.pause(); }, (p.d + 1.2) * 1000); } catch (e) { }
      });
      $('#share', o).onclick = () => shareTake(tk);
    } else {
      $$('.nc', o).forEach(b => b.onclick = () => { const p = per[+b.dataset.i]; viewA = p.t - 1; cursor = p.t; redraw(); });
    }
    if (opts.again) $('#again', o).onclick = () => { cleanup(); overlayCleanup = null; opts.again(); };
    $('#del', o).onclick = async () => { if (!confirm('Aufnahme löschen?')) return; await DB.del('takes', tk.id); await reload(); closeOverlay(); };
    const cleanup = () => { if (audio) { audio.pause(); audio.src = ''; } if (url) URL.revokeObjectURL(url); cancelAnimationFrame(rafP); stopRef(); };
    $('[data-x]', o).onclick = closeOverlay;
    overlayCleanup = cleanup;
  }
  async function shareTake(tk) {
    const ext = (tk.mime || '').includes('mp4') ? 'm4a' : (tk.mime || '').includes('ogg') ? 'ogg' : 'webm';
    const name = `${tk.title.replace(/[^\wäöüÄÖÜß -]/g, '')} ${new Date(tk.ts).toISOString().slice(0, 16).replace('T', ' ').replace(':', '-')}.${ext}`;
    const file = new File([tk.audio], name, { type: tk.mime || 'audio/mp4' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: tk.title }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // ---------------- Aufnahmen ----------------
  function takeList(el, takes, emptyTxt) {
    if (!takes.length) { el.innerHTML = `<div class="empty">${esc(emptyTxt)}</div>`; return; }
    el.innerHTML = takes.map(t => {
      const sc = t.metrics && t.metrics.score != null ? t.metrics.score : null;
      const badge = sc != null ? sc : t.type === 'range' || t.type === 'warmup' ? '~' : t.type === 'timer' ? '1′' : '–';
      const meta = [fmtDT(t.ts), t.duration ? Math.round(t.duration) + ' s' : '', t.metrics && t.metrics.low != null && sc == null ? `${C.midiToName(t.metrics.low)}–${C.midiToName(t.metrics.high)}` : '', t.audio ? '🎙' : ''].filter(Boolean).join(' · ');
      return `<button class="item" data-tk="${t.id}"><div class="badge ${lvlClass(sc)}">${badge}</div><div class="grow"><div class="ttl">${esc(t.title)}</div><div class="meta">${meta}</div></div></button>`;
    }).join('');
    $$('[data-tk]', el).forEach(b => b.onclick = () => { const t = TAKES.find(x => x.id === b.dataset.tk); if (t && t.type !== 'timer') openReview(t); });
  }
  async function renderTakes() {
    const withAudio = TAKES.filter(t => t.audio);
    const bytes = withAudio.reduce((s, t) => s + (t.audio.size || 0), 0);
    view.innerHTML = `<h1>Aufnahmen</h1><p class="sub">${TAKES.length} Einträge · ${withAudio.length} mit Audio (${(bytes / 1048576).toFixed(1)} MB auf dem Gerät). Über „Aufnahme sichern / teilen“ legst du sie in der Dateien-App ab.</p><div class="list" id="tl"></div>`;
    takeList($('#tl'), TAKES.slice().reverse(), 'Noch keine Aufnahmen.');
  }

  // ---------------- Fortschritt ----------------
  function renderProgress() {
    const scored = TAKES.filter(t => t.metrics && t.metrics.score != null && (t.type === 'song' || t.type === 'exercise'));
    const days = {}; TAKES.forEach(t => { const k = dayKey(t.ts); days[k] = (days[k] || 0) + (t.duration || 0) / 60; });
    const now = Date.now(), wk = 7 * 86400000;
    const last7 = scored.filter(t => t.ts > now - wk).map(t => t.metrics.score), prev7 = scored.filter(t => t.ts <= now - wk && t.ts > now - 2 * wk).map(t => t.metrics.score);
    const avg7 = last7.length ? Math.round(C.mean(last7)) : null, avgP = prev7.length ? Math.round(C.mean(prev7)) : null;
    const min7 = Math.round(TAKES.filter(t => t.ts > now - wk).reduce((s, t) => s + (t.duration || 0), 0) / 60);
    const st = streak();
    view.innerHTML = `<h1>Fortschritt</h1>
      <div class="kpis four" style="margin-top:10px">
        <div class="kpi"><div class="lbl">Ø Treffsicher 7 T.</div><div class="val">${avg7 != null ? avg7 + '<small>%</small>' : '–'}</div><div class="hint">${avg7 != null && avgP != null ? `${avg7 - avgP >= 0 ? '▲ +' : '▼ '}${avg7 - avgP} vs. Vorwoche` : 'Vorwoche: –'}</div></div>
        <div class="kpi"><div class="lbl">Minuten 7 T.</div><div class="val">${min7}</div><div class="hint">aktives Singen & Übungen</div></div>
        <div class="kpi"><div class="lbl">Serie</div><div class="val">${st}<small>${st === 1 ? 'Tag' : 'Tage'}</small></div><div class="hint">${Object.keys(days).length} Übungstage gesamt</div></div>
        <div class="kpi"><div class="lbl">Umfang</div><div class="val">${S.range ? S.range.high - S.range.low : '–'}<small>${S.range ? 'HT' : ''}</small></div><div class="hint">${S.range ? C.midiToName(S.range.low) + ' – ' + C.midiToName(S.range.high) : 'noch nicht getestet'}</div></div>
      </div>
      <h2>Treffsicherheit</h2><div class="desc">Jeder Punkt eine Aufnahme (Songs & Übungen), Linie = gleitender Schnitt. Anteil der Zeit innerhalb ±50 ct.</div><div id="c1"></div>
      <h2>Stimmumfang</h2><div class="desc">Tiefster bis höchster stabil gehaltener Ton aus Umfang-Test und Sirene.</div><div id="c2"></div>
      <h2>Problem-Töne</h2><div class="desc">Wie genau du jeden Ton triffst – über alle Aufnahmen. Tippe eine Taste für Details.</div><div id="c3"></div>
      <h2>Stabilität langer Töne</h2><div class="desc">Schwankung in Cent (niedriger = ruhiger). Profis liegen meist unter ±10 ct.</div><div id="c4"></div>
      <h2>Übungskalender</h2><div class="desc">Minuten pro Tag, letzte 15 Wochen.</div><div id="c5"></div>
      <h2>Songs</h2><div id="c6"></div>`;
    Charts.line($('#c1'), scored.map(t => ({ x: t.ts, y: t.metrics.score, html: `${esc(t.title)}<br>${fmtDT(t.ts)}: <b>${t.metrics.score}%</b>` })), { yMin: 0, yMax: 100, unit: '%' });
    const rg = TAKES.filter(t => (t.type === 'range' || t.type === 'warmup') && t.metrics && t.metrics.low != null && t.metrics.high - t.metrics.low >= 5);
    Charts.band($('#c2'), rg.map(t => ({ x: t.ts, lo: Math.round(t.metrics.low), hi: Math.round(t.metrics.high) })));
    const stats = {};
    TAKES.forEach(t => (t.perNote || []).forEach(p => { if (p.cents == null || p.cover < 0.5) return; const k = Math.round(p.m); (stats[k] = stats[k] || { s: 0, n: 0 }); stats[k].s += Math.abs(p.cents); stats[k].n++; }));
    Object.values(stats).forEach(v => v.abs = v.s / v.n);
    const r = myRange(); const keys = Object.keys(stats).map(Number);
    const inR = keys.filter(k => k >= r.low - 12 && k <= r.high + 12);
    const klo = Math.min(r.low - 2, ...inR), khi = Math.max(r.high + 2, ...inR);
    Charts.keyboard($('#c3'), stats, klo, khi);
    Charts.line($('#c4'), scored.filter(t => t.metrics.stability != null).map(t => ({ x: t.ts, y: t.metrics.stability, html: `${esc(t.title)}<br>${fmtDT(t.ts)}: <b>±${t.metrics.stability} ct</b>` })), { yMin: 0, unit: '' });
    Charts.calendar($('#c5'), days, 15);
    const rows = [...C.SONGS, ...IMPORTED].map(s => { const ts = TAKES.filter(t => t.refId === s.id && t.metrics && t.metrics.score != null); return { s, n: ts.length, best: ts.length ? Math.max(...ts.map(t => t.metrics.score)) : null, last: ts.length ? ts[ts.length - 1].metrics.score : null }; }).filter(x => x.n);
    $('#c6').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Song</th><th class="num">Versuche</th><th class="num">Bester</th><th class="num">Letzter</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.s.title)}</td><td class="num">${x.n}</td><td class="num"><span class="chip ${lvlClass(x.best)}">${x.best}%</span></td><td class="num">${x.last}%</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Noch keine Songs gesungen.</div>';
  }

  // ---------------- Einstellungen ----------------
  function openSettings() {
    const o = openOverlay(`<div class="ovhead"><button class="iconbtn" data-x>${ICON.back}</button><div class="t">Einstellungen</div></div><div class="ovbody" id="st"></div>`);
    $('[data-x]', o).onclick = closeOverlay;
    const draw = () => {
      const r = myRange();
      $('#st').innerHTML = `
        <div class="field"><label>Stimmlage</label><div class="seg"><button data-v="tief" class="${S.voice !== 'hoch' ? 'on' : ''}">Tief (Männerstimme)</button><button data-v="hoch" class="${S.voice === 'hoch' ? 'on' : ''}">Hoch (Frauenstimme)</button></div><div class="help">Startwert, bis du den Umfang-Test gemacht hast.</div></div>
        <div class="field"><label>Stimmumfang</label>
          <div class="row between"><span>Tiefster Ton</span><div class="stepper"><button class="btn sm ghost" data-r="low:-1">−</button><b>${C.midiToName(r.low)}</b><button class="btn sm ghost" data-r="low:1">＋</button></div></div>
          <div class="row between"><span>Höchster Ton</span><div class="stepper"><button class="btn sm ghost" data-r="high:-1">−</button><b>${C.midiToName(r.high)}</b><button class="btn sm ghost" data-r="high:1">＋</button></div></div>
          <button class="btn sm ghost" id="rt">Umfang-Test starten</button></div>
        <div class="field"><label>Kopfhörer</label><div class="seg"><button data-h="1" class="${S.headphones ? 'on' : ''}">Mit Kopfhörern</button><button data-h="0" class="${!S.headphones ? 'on' : ''}">Lautsprecher</button></div><div class="help">Mit Lautsprecher spielt die Melodie standardmäßig nicht mit, damit das Mikro nur dich hört. Kabel-Kopfhörer sind am besten; AirPods funktionieren, haben aber ~150–250 ms Verzögerung.</div></div>
        <div class="field"><label>Latenz-Ausgleich: ${S.latencyMs} ms</label><input type="range" min="0" max="400" step="10" value="${S.latencyMs}" id="lat"><div class="help">Wenn deine Kurve systematisch hinter den Balken herläuft (typisch bei Bluetooth), hier erhöhen. Die Auswertung gleicht zusätzlich bis ±350 ms automatisch aus.</div></div>
        <div class="field"><label>Kammerton A4: ${S.a4} Hz</label><input type="range" min="430" max="450" step="1" value="${S.a4}" id="a4"></div>
        <div class="field"><label>Mikrofon-Schwelle</label><input type="range" min="0.002" max="0.03" step="0.001" value="${S.gate}" id="gate"><div class="help">Höher = Hintergrundgeräusche werden eher ignoriert. Erkennt die App dich schlecht: niedriger stellen.</div></div>
        <div class="field"><label>Daten</label>
          <div class="row" style="flex-wrap:wrap"><button class="btn sm ghost" id="exp">Backup exportieren</button><label class="btn sm ghost filebtn">Backup importieren<input type="file" id="impb" accept=".json"></label><button class="btn sm ghost" id="wipeAudio">Audio löschen</button><button class="btn sm ghost" id="wipe">Alles löschen</button></div>
          <div class="help">Alles bleibt auf deinem Handy (IndexedDB). Das Backup enthält Messwerte & Einstellungen, keine Audiodateien. Installiere die App auf dem Home-Bildschirm, sonst kann iOS die Daten nach längerer Nichtnutzung löschen.</div></div>
        <div class="field"><label>Eigene Songs</label><div class="help">Mit dem Skript <b>singpack.py</b> (im Paket, Ordner „tools“) machst du aus einer MP3 eine .singpack.json: Gesang und Instrumental werden getrennt, die Melodie des Originals wird als Zielkurve erkannt. Datei per AirDrop/iCloud aufs Handy, dann unter „Songs → Importieren“.</div></div>
        <div class="field"><label>Über</label><div class="help">Stimmlabor ${VERSION} · Tonhöhenerkennung: McLeod-Pitch-Method, ca. 50 Messungen/s. Treffsicherheit = Anteil der Sollzeit innerhalb ±50 Cent.</div></div>`;
      $$('[data-v]').forEach(b => b.onclick = () => { S.voice = b.dataset.v; saveS(); draw(); });
      $$('[data-h]').forEach(b => b.onclick = () => { S.headphones = b.dataset.h === '1'; S.guide = S.headphones; saveS(); draw(); });
      $$('[data-r]').forEach(b => b.onclick = () => { const [k, d] = b.dataset.r.split(':'); const rr = Object.assign({}, myRange()); rr[k] += +d; if (rr.high - rr.low >= 7) { S.range = rr; saveS(); } draw(); });
      $('#rt').onclick = () => runFree(C.EXERCISES.find(e => e.id === 'range'));
      $('#lat').oninput = e => { S.latencyMs = +e.target.value; saveS(); e.target.previousElementSibling.textContent = `Latenz-Ausgleich: ${S.latencyMs} ms`; };
      $('#a4').oninput = e => { S.a4 = +e.target.value; saveS(); e.target.previousElementSibling.textContent = `Kammerton A4: ${S.a4} Hz`; };
      $('#gate').oninput = e => { S.gate = +e.target.value; saveS(); };
      $('#exp').onclick = () => {
        const data = { app: 'stimmlabor', version: VERSION, exported: new Date().toISOString(), settings: S, takes: TAKES.map(t => Object.assign({}, t, { audio: undefined, frames: t.frames ? { t: Array.from(t.frames.t), m: Array.from(t.frames.m).map(v => isNaN(v) ? null : +v.toFixed(3)) } : null })) };
        const file = new File([JSON.stringify(data)], `stimmlabor-backup-${dayKey(Date.now())}.json`, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file] }).catch(() => { });
        else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
      };
      $('#impb').onchange = async e => {
        try {
          const j = JSON.parse(await e.target.files[0].text()); if (j.app !== 'stimmlabor') throw new Error('kein Stimmlabor-Backup');
          for (const t of j.takes) { if (t.frames) t.frames = { t: Float32Array.from(t.frames.t), m: Float32Array.from(t.frames.m.map(v => v == null ? NaN : v)) }; delete t.audio; const ex = await DB.get('takes', t.id); if (!ex) await DB.put('takes', t); }
          S = Object.assign({}, DEF, j.settings); saveS(); await reload(); toast(`${j.takes.length} Einträge importiert`); draw();
        } catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
      };
      $('#wipeAudio').onclick = async () => { if (!confirm('Alle Audiodateien löschen? Messwerte bleiben erhalten.')) return; for (const t of TAKES) if (t.audio) { t.audio = null; await DB.put('takes', t); } await reload(); toast('Audio gelöscht'); };
      $('#wipe').onclick = async () => { if (!confirm('Wirklich ALLES löschen (Aufnahmen, Songs, Einstellungen)?')) return; await DB.clear('takes'); await DB.clear('songs'); localStorage.clear(); S = Object.assign({}, DEF); await reload(); closeOverlay(); };
    };
    draw();
  }

  // ---------------- Einrichtung ----------------
  function openOnboarding() {
    let step = 0, lvlIv = 0;
    const o = openOverlay(`<div class="ovhead"><button class="iconbtn" data-x>${ICON.close}</button><div class="t">Einrichten</div></div><div class="ovbody stack" id="ob"></div>`);
    $('[data-x]', o).onclick = () => { clearInterval(lvlIv); closeOverlay(); };
    overlayCleanup = () => clearInterval(lvlIv);
    const draw = () => {
      const el = $('#ob');
      if (step === 0) {
        el.innerHTML = `<h1>So funktioniert’s</h1>
          <div class="insight"><span class="dot"></span><div><b>Jeden Tag ~15 min:</b> Warm-up → Übung → Song → Auswertung → Fortschritt.</div></div>
          <div class="insight"><span class="dot"></span><div><b>Die App hört zu</b> und misst ~50× pro Sekunde deine Tonhöhe: wie genau (in Cent), wie stabil, wie schnell du den Ton triffst.</div></div>
          <div class="insight"><span class="dot"></span><div><b>Alles bleibt auf deinem Handy.</b> Keine Cloud, kein Konto.</div></div>
          <div class="insight warn"><span class="dot"></span><div>Für Songs mit Melodie: <b>Kopfhörer</b> verwenden, sonst hört das Mikro die Melodie mit.</div></div>
          <h2>Deine Stimmlage</h2><div class="seg"><button data-v="tief" class="${S.voice !== 'hoch' ? 'on' : ''}">Tief (Männerstimme)</button><button data-v="hoch" class="${S.voice === 'hoch' ? 'on' : ''}">Hoch (Frauenstimme)</button></div>
          <h2>Kopfhörer?</h2><div class="seg"><button data-h="1" class="${S.headphones ? 'on' : ''}">Ja</button><button data-h="0" class="${!S.headphones ? 'on' : ''}">Nein, Lautsprecher</button></div>
          <button class="btn primary block" id="nx" style="margin-top:16px">Weiter: Mikrofon testen</button>`;
        if (!S.voice) { S.voice = 'tief'; saveS(); }
        $$('[data-v]', el).forEach(b => b.onclick = () => { S.voice = b.dataset.v; saveS(); draw(); });
        $$('[data-h]', el).forEach(b => b.onclick = () => { S.headphones = b.dataset.h === '1'; S.guide = S.headphones; saveS(); draw(); });
        $('#nx', el).onclick = () => { step = 1; draw(); };
      } else if (step === 1) {
        el.innerHTML = `<h1>Mikrofon-Test</h1><p class="sub">Tippe auf „Mikrofon starten“ und erlaube den Zugriff. Dann summ oder sing einen Ton.</p>
          <div class="card" style="text-align:center"><div class="bignote" id="obn" style="margin:10px auto">–</div><div class="centsbar" style="margin:10px 0"><div class="needle" id="olv" style="left:0%"></div></div><div class="sub" id="ost">Pegel</div></div>
          <button class="btn primary block" id="mic">${ICON.mic} Mikrofon starten</button>
          <button class="btn ghost block" id="nx" disabled>Weiter: Stimmumfang messen</button>`;
        $('#mic', el).onclick = async () => {
          try { await A.mic(); } catch (e) { $('#ost', el).textContent = 'Kein Zugriff. iOS: Einstellungen → Safari → Mikrofon → Erlauben. Dann neu laden.'; return; }
          $('#mic', el).disabled = true; $('#nx', el).disabled = false; const sm = C.createSmoother();
          lvlIv = setInterval(() => { const r = A.read(); const m = sm(r.m); $('#olv', el).style.left = Math.min(100, r.rms * 900) + '%'; $('#obn', el).textContent = m != null ? C.midiToName(m) : '–'; $('#ost', el).textContent = m != null ? `${Core.midiToHz(m, S.a4).toFixed(1)} Hz erkannt – passt!` : 'Sing einen Ton …'; }, 40);
        };
        $('#nx', el).onclick = () => { clearInterval(lvlIv); step = 2; draw(); };
      } else {
        el.innerHTML = `<h1>Stimmumfang messen</h1><p class="sub">25 Sekunden: auf „u“ ganz nach unten gleiten und kurz halten, dann ganz nach oben und kurz halten. Nicht pressen – nur was angenehm geht.</p>
          <button class="btn primary block" id="go">Test starten</button><button class="btn ghost block" id="skip">Später</button>`;
        const done = () => { S.onboarded = true; saveS(); };
        $('#go', el).onclick = () => { done(); runFree(C.EXERCISES.find(e => e.id === 'range')); };
        $('#skip', el).onclick = () => { done(); closeOverlay(); };
      }
    };
    draw();
  }

  // ---------------- Start ----------------
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (ACTIVE) { const f = ACTIVE; ACTIVE = null; f(); }
    else if (overlay.hidden) A.release();
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
  window.__stimmlabor = { S, A, DB, reload, render, openReview, get TAKES() { return TAKES; } };
  reload().then(() => { render(); if (!S.onboarded && !TAKES.length) openOnboarding(); });
})();
