/* Stimmlabor – Kernlogik: Notennamen, Songs, Übungen, Tonhöhenerkennung, Auswertung.
   Läuft im Browser und in Node (für Tests). */
(function (root) {
  'use strict';

  // ---------- Noten ----------
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];
  function nameToMidi(n) {
    const m = /^([A-H])([#b]?)(-?\d)$/.exec(n);
    if (!m) throw new Error('Notenname? ' + n);
    let v = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 12 * (parseInt(m[3], 10) + 1) + v;
  }
  function midiToName(m) {
    const r = Math.round(m);
    return NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
  }
  function hzToMidi(f, a4) { return 69 + 12 * Math.log2(f / (a4 || 440)); }
  function midiToHz(m, a4) { return (a4 || 440) * Math.pow(2, (m - 69) / 12); }

  // ---------- Gemeinfreie Lieder ----------
  // Format: "Note/Dauer(in Schlägen)/Silbe", "-" = Silbe wird weitergesungen (Melisma), "R" = Pause.
  const SONGS = [
    {
      id: 'entchen', title: 'Alle meine Entchen', artist: 'Kinderlied (trad.)', level: 1, bpm: 96, bpb: 4, upbeat: 0, key: 0,
      tip: 'Ideal zum Einsingen: Tonleiter aufwärts, dann Tonwiederholungen. Achte darauf, dass die wiederholten Töne nicht absacken.',
      notes: 'C4/1/Al D4/1/le E4/1/mei F4/1/ne G4/2/Ent G4/2/chen A4/1/schwim A4/1/men A4/1/auf A4/1/dem G4/4/See A4/1/schwim A4/1/men A4/1/auf A4/1/dem G4/4/See F4/1/Köpf F4/1/chen F4/1/in F4/1/das E4/2/Was E4/2/ser D4/1/Schwänz D4/1/chen D4/1/in D4/1/die C4/4/Höh'
    },
    {
      id: 'jakob', title: 'Bruder Jakob', artist: 'Volkslied (trad.)', level: 1, bpm: 100, bpb: 4, upbeat: 0, key: 0,
      tip: 'Die Achtel bei „Hörst du nicht die Glocken“ sauber und leicht singen, der Sprung nach unten bei „Ding dang dong“ ist eine Quarte.',
      notes: 'C4/1/Bru D4/1/der E4/1/Ja C4/1/kob C4/1/Bru D4/1/der E4/1/Ja C4/1/kob E4/1/schläfst F4/1/du G4/2/noch E4/1/schläfst F4/1/du G4/2/noch G4/0.5/Hörst A4/0.5/du G4/0.5/nicht F4/0.5/die E4/1/Glo C4/1/cken G4/0.5/hörst A4/0.5/du G4/0.5/nicht F4/0.5/die E4/1/Glo C4/1/cken C4/1/Ding G3/1/dang C4/2/dong C4/1/ding G3/1/dang C4/2/dong'
    },
    {
      id: 'haenschen', title: 'Hänschen klein', artist: 'Volkslied (trad.)', level: 1, bpm: 104, bpb: 4, upbeat: 0, key: 0,
      tip: 'Absteigende Terzen (G–E, F–D) – der zweite Ton rutscht gern zu tief.',
      notes: 'G4/1/Häns E4/1/chen E4/2/klein F4/1/ging D4/1/al D4/2/lein C4/1/in D4/1/die E4/1/wei F4/1/te G4/1/Welt G4/1/hin G4/2/ein G4/1/Stock E4/1/und E4/2/Hut F4/1/steht D4/1/ihm D4/2/gut C4/1/ist E4/1/gar G4/1/wohl G4/1/ge C4/4/mut'
    },
    {
      id: 'birthday', title: 'Happy Birthday', artist: 'M. & P. Hill (gemeinfrei)', level: 2, bpm: 104, bpb: 3, upbeat: 1, key: 7,
      tip: 'Der Oktavsprung bei „birth-day dear“ ist die Schlüsselstelle: vorher Luft holen und den hohen Ton von oben „anpeilen“.',
      notes: 'G4/0.75/Hap G4/0.25/py A4/1/birth G4/1/day C5/1/to B4/2/you G4/0.75/Hap G4/0.25/py A4/1/birth G4/1/day D5/1/to C5/2/you G4/0.75/Hap G4/0.25/py G5/1/birth E5/1/day C5/1/dear B4/1/Ced A4/1/ric F5/0.75/Hap F5/0.25/py E5/1/birth C5/1/day D5/1/to C5/3/you'
    },
    {
      id: 'ode', title: 'Ode an die Freude', artist: 'L. v. Beethoven / F. Schiller', level: 2, bpm: 100, bpb: 4, upbeat: 0, key: 0,
      tip: 'Fast nur Sekundschritte – perfekt, um saubere Intonation zu trainieren. Im Mittelteil kommt der Sprung nach unten auf „ge-teilt“.',
      notes: 'E4/1/Freu E4/1/de F4/1/schö G4/1/ner G4/1/Göt F4/1/ter E4/1/fun D4/1/ken C4/1/Toch C4/1/ter D4/1/aus E4/1/E E4/1.5/ly D4/0.5/si D4/2/um ' +
        'E4/1/wir E4/1/be F4/1/tre G4/1/ten G4/1/feu F4/1/er E4/1/trun D4/1/ken C4/1/Himm C4/1/li D4/1/sche E4/1/dein D4/1.5/Hei C4/0.5/lig C4/2/tum ' +
        'D4/1/Dei D4/1/ne E4/1/Zau C4/1/ber D4/1/bin E4/0.5/den F4/0.5/- E4/1/wie C4/1/der D4/1/was E4/0.5/die F4/0.5/- E4/1/Mo D4/1/de C4/1/streng D4/1/ge G3/2/teilt ' +
        'E4/1/al E4/1/le F4/1/Men G4/1/schen G4/1/wer F4/1/den E4/1/Brü D4/1/der C4/1/wo C4/1/dein D4/1/sanf E4/1/ter D4/1.5/Flü C4/0.5/gel C4/2/weilt'
    },
    {
      id: 'saints', title: 'When the Saints Go Marching In', artist: 'Spiritual (trad.)', level: 2, bpm: 112, bpb: 4, upbeat: 3, key: 0,
      tip: 'Lange Töne auf „saints“ und „in“: Ton halten, ohne dass er wackelt oder absackt. Rhythmisch locker bleiben.',
      notes: 'C4/1/Oh E4/1/when F4/1/the G4/4/saints R/1 C4/1/go E4/1/mar F4/1/ching G4/4/in R/1 C4/1/Oh E4/1/when F4/1/the G4/2/saints E4/2/go C4/2/mar E4/2/ching D4/4/in R/1 ' +
        'E4/1/Oh E4/1/Lord D4/1/I C4/3/want C4/1/to E4/2/be G4/1/in G4/1/that F4/3/num F4/1/ber E4/1/when F4/1/the G4/2/saints E4/2/go C4/2/mar D4/2/ching C4/4/in'
    },
    {
      id: 'auld', title: 'Auld Lang Syne', artist: 'Schottisches Volkslied (trad.)', level: 3, bpm: 84, bpb: 4, upbeat: 1, key: 5,
      tip: 'Punktierte Rhythmen und ein Aufschwung bis zur Sexte („to mind“). Für die hohe Stelle Luft einplanen.',
      notes: 'C4/1/Should F4/1.5/auld F4/0.5/ac F4/1/quain A4/1/tance G4/1.5/be F4/0.5/for G4/1/got A4/1/and F4/1.5/nev F4/0.5/er A4/1/brought C5/1/to D5/3/mind ' +
        'D5/1/Should C5/1.5/auld A4/0.5/ac A4/1/quain F4/1/tance G4/1.5/be F4/0.5/for G4/1/got A4/1/and F4/1.5/days D4/0.5/of D4/1/auld C4/1/lang F4/3/syne'
    },
    {
      id: 'stillenacht', title: 'Stille Nacht', artist: 'F. X. Gruber / J. Mohr', level: 3, bpm: 150, bpb: 6, upbeat: 0, key: 0, beatName: 'Achtel',
      tip: 'Großer Umfang (Undezime). Die hohe Stelle „schlaf in himm-li-scher“ ruhig und ohne Druck singen, die Schlusstöne lange halten.',
      notes: 'G4/3/Stil A4/1/le G4/2/Nacht E4/6/- G4/3/hei A4/1/li G4/2/ge E4/6/Nacht D5/4/Al D5/2/les B4/6/schläft C5/4/ein C5/2/sam G4/6/wacht ' +
        'A4/4/nur A4/2/das C5/3/trau B4/1/te A4/2/hoch G4/3/hei A4/1/li G4/2/ge E4/6/Paar A4/4/Hol A4/2/der C5/3/Kna B4/1/be A4/2/im G4/3/lo A4/1/cki G4/2/gen E4/6/Haar ' +
        'D5/4/schlaf D5/2/in F5/3/himm D5/1/li B4/2/scher C5/6/Ruh E5/6/- C5/3/schlaf G4/1/in E4/2/himm G4/3/li F4/1/scher D4/2/Ruh C4/6/-'
    }
  ];

  // Wandelt Notenstring in getimte Noten (Sekunden) um.
  function parseNotes(str, bpm) {
    const spb = 60 / bpm;
    const out = []; let beat = 0;
    for (const tok of str.trim().split(/\s+/)) {
      const [n, d, lyr] = tok.split('/');
      const dur = parseFloat(d);
      if (n !== 'R') out.push({ t: beat * spb, d: dur * spb, m: nameToMidi(n), lyr: lyr === '-' ? '' : (lyr || ''), beat, beats: dur, kind: 'sing' });
      beat += dur;
    }
    return { notes: out, totalBeats: beat };
  }

  // Einfache automatische Begleitung (I, IV, V, vi, ii) je Takt.
  function harmonize(song, notes, totalBeats) {
    const chords = [
      { deg: 0, pcs: [0, 4, 7], pref: 3 }, { deg: 7, pcs: [7, 11, 2], pref: 2 }, { deg: 5, pcs: [5, 9, 0], pref: 2 },
      { deg: 9, pcs: [9, 0, 4], pref: 1 }, { deg: 2, pcs: [2, 5, 9], pref: 0.5 }
    ];
    const key = song.key || 0, bpb = song.bpb, up = song.upbeat || 0;
    const res = [];
    for (let b0 = -up; b0 < totalBeats; b0 += bpb) {
      const w = new Array(12).fill(0);
      for (const n of notes) {
        const s = Math.max(n.beat, b0), e = Math.min(n.beat + n.beats, b0 + bpb);
        if (e > s) w[((n.m - key) % 12 + 12) % 12] += (e - s) * (n.beat >= b0 && n.beat < b0 + 0.01 ? 1.3 : 1);
      }
      let best = null, bs = -1;
      for (const c of chords) {
        let s = c.pcs.reduce((a, p) => a + w[p], 0) * 10 + c.pref;
        if (s > bs) { bs = s; best = c; }
      }
      if (b0 + bpb <= 0) continue;
      res.push({ beat: Math.max(0, b0), beats: Math.min(bpb, b0 + bpb) - Math.max(0, b0), root: key + best.deg, pcs: best.pcs.map(p => (p + key) % 12) });
    }
    // Schluss immer Tonika
    if (res.length) { const l = res[res.length - 1]; l.root = key; l.pcs = [0, 4, 7].map(p => (p + key) % 12); }
    return res;
  }

  // Song für Wiedergabe vorbereiten (Transposition, Zeiten).
  function buildSong(def, opts) {
    opts = opts || {};
    const tempo = opts.tempo || 1;
    const bpm = def.bpm * tempo;
    const { notes, totalBeats } = parseNotes(def.notes, bpm);
    const tr = opts.transpose || 0;
    notes.forEach(n => { n.m += tr; });
    const chords = harmonize({ key: (def.key + tr + 120) % 12, bpb: def.bpb, upbeat: def.upbeat }, notes, totalBeats);
    const spb = 60 / bpm;
    chords.forEach(c => { c.t = c.beat * spb; c.d = c.beats * spb; });
    const last = notes[notes.length - 1];
    return {
      id: def.id, title: def.title, kind: 'song', bpm, bpb: def.bpb, spb, upbeat: def.upbeat || 0,
      notes, chords, duration: last.t + last.d + 0.6, transpose: tr, octaveTolerant: !!opts.octaveTolerant
    };
  }

  function songRange(def) {
    const { notes } = parseNotes(def.notes, def.bpm);
    let lo = 1e9, hi = -1e9; notes.forEach(n => { lo = Math.min(lo, n.m); hi = Math.max(hi, n.m); });
    return { lo, hi };
  }

  // Passende Transposition für den Stimmumfang (Halbtöne).
  function fitTranspose(lo, hi, range) {
    if (!range) return 0;
    const songMid = (lo + hi) / 2;
    const comfortLo = range.low + 2, comfortHi = range.high - 2;
    const target = (comfortLo + comfortHi) / 2;
    let t = Math.round(target - songMid);
    // so wenig wie nötig, bevorzugt in Oktaven, wenn das passt
    const oct = Math.round((target - songMid) / 12) * 12;
    if (lo + oct >= comfortLo - 1 && hi + oct <= comfortHi + 1) t = oct;
    return Math.max(-24, Math.min(24, t));
  }

  // ---------- Übungen (Hören & Nachsingen) ----------
  function exerciseBase(range) {
    const r = range || { low: 48, high: 67 };
    return Math.round(r.low + (r.high - r.low) * 0.3);
  }
  function mkPhrase(spec) {
    // spec: { bpm, items: [{m, beats, kind, lyr}] }
    const spb = 60 / spec.bpm; let beat = 0; const notes = [];
    for (const it of spec.items) {
      if (it.m != null) notes.push({ t: beat * spb, d: it.beats * spb, m: it.m, lyr: it.lyr || '', kind: it.kind, beat, beats: it.beats });
      beat += it.beats;
    }
    const last = notes[notes.length - 1];
    return { notes, chords: [], bpm: spec.bpm, spb, bpb: 4, upbeat: 0, duration: last.t + last.d + 0.5 };
  }
  const EXERCISES = [
    { id: 'lips', title: 'Lippenflattern & Strohhalm', short: 'Warm-up ohne Mikrofon', kind: 'timer', focus: 'warmup', minutes: 1,
      howto: 'Lippen locker flattern lassen (wie ein Motorboot) oder durch einen Strohhalm summen. Dabei langsam von tief nach hoch gleiten. Das entlastet die Stimmlippen und bringt Atem und Ton zusammen.' },
    { id: 'siren', title: 'Sirene', short: 'Gleiten durch den ganzen Umfang', kind: 'free', seconds: 30, focus: 'warmup',
      howto: 'Auf „u“ oder „ng“ ganz weich von unten nach oben und zurück gleiten. Keine Kraft, keine Brüche erzwingen – die Kurve zeigt dir, wo die Stimme kippt.' },
    { id: 'hold', title: 'Ton halten', short: 'Stabilität & Einschwingen', kind: 'phrase', focus: 'stability',
      howto: 'Hör den Ton, dann sing ihn auf „a“ ruhig und gerade, bis der Balken endet. Ziel: sofort treffen, nicht anschleifen, nicht wackeln.' },
    { id: 'scale', title: 'Fünfton-Leiter', short: 'Sekundschritte sauber singen', kind: 'phrase', focus: 'intonation',
      howto: 'Erst hören, dann nachsingen: do-re-mi-fa-so-fa-mi-re-do. Danach geht es einen Halbton höher.' },
    { id: 'intervals', title: 'Intervalle', short: 'Gehörbildung: Sprünge treffen', kind: 'phrase', focus: 'ear',
      howto: 'Zwei Töne hören, dann beide nachsingen. Stell dir den Zielton vor, bevor du ihn singst.' },
    { id: 'arpeggio', title: 'Dreiklang', short: '1-3-5-8 Sprünge', kind: 'phrase', focus: 'intonation',
      howto: 'Hören, dann nachsingen: Grundton, Terz, Quinte, Oktave und zurück. Den hohen Ton leicht nehmen.' },
    { id: 'range', title: 'Stimmumfang-Test', short: 'Tiefster & höchster Ton', kind: 'free', seconds: 25, focus: 'range',
      howto: 'Gleite auf „u“ langsam ganz nach unten, halte den tiefsten angenehmen Ton kurz, dann ganz nach oben und halte den höchsten Ton kurz. Nicht pressen.' }
  ];

  function buildExercise(id, range, seed) {
    const b = exerciseBase(range);
    const L = (m, beats) => ({ m, beats, kind: 'listen' });
    const S = (m, beats, lyr) => ({ m, beats, kind: 'sing', lyr });
    const P = beats => ({ m: null, beats });
    let items = [], bpm = 80;
    if (id === 'hold') {
      bpm = 60;
      [0, 2, 4, 5, 7].forEach(o => { items.push(L(b + o, 1.5), P(0.5), S(b + o, 4, 'a'), P(1)); });
    } else if (id === 'scale') {
      bpm = 96; const pat = [0, 2, 4, 5, 7, 5, 4, 2, 0], syl = ['do', 're', 'mi', 'fa', 'so', 'fa', 'mi', 're', 'do'];
      for (let k = 0; k < 3; k++) {
        pat.forEach((o, i) => items.push(L(b + k + o, i === pat.length - 1 ? 2 : 1)));
        items.push(P(1));
        pat.forEach((o, i) => items.push(S(b + k + o, i === pat.length - 1 ? 2 : 1, syl[i])));
        items.push(P(2));
      }
    } else if (id === 'intervals') {
      bpm = 72; const ivs = [4, 7, 3, 5, 9, 12, 2, 8];
      let s = (seed || 1) % 8;
      for (let k = 0; k < 6; k++) {
        const iv = ivs[(s + k * 3) % ivs.length]; const root = b + ((k * 2) % 5) - 2;
        const up = root + iv <= (range ? range.high - 1 : 80);
        const a = root, c = up ? root + iv : root - iv;
        items.push(L(a, 1), L(c, 1), P(1), S(a, 1.5, 'la'), S(c, 1.5, 'la'), P(1.5));
      }
    } else if (id === 'arpeggio') {
      bpm = 88; const pat = [0, 4, 7, 12, 7, 4, 0];
      for (let k = 0; k < 3; k++) {
        pat.forEach((o, i) => items.push(L(b - 2 + k * 2 + o, i === 6 ? 2 : 1)));
        items.push(P(1));
        pat.forEach((o, i) => items.push(S(b - 2 + k * 2 + o, i === 6 ? 2 : 1, 'a')));
        items.push(P(2));
      }
    } else return null;
    const ph = mkPhrase({ bpm, items });
    const ex = EXERCISES.find(e => e.id === id);
    return Object.assign(ph, { id, title: ex.title, kind: 'exercise' });
  }

  // ---------- Tonhöhenerkennung (McLeod Pitch Method) ----------
  function createDetector(sampleRate, size) {
    const nsdf = new Float32Array(size);
    const minF = 60, maxF = 1300;
    const maxTau = Math.min(size - 1, Math.floor(sampleRate / minF));
    const minTau = Math.max(2, Math.floor(sampleRate / maxF));
    return function detect(buf) {
      const n = buf.length;
      let rms = 0; for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / n);
      if (rms < 0.004) return { f: 0, clarity: 0, rms };
      // NSDF
      for (let tau = 0; tau <= maxTau; tau++) {
        let acf = 0, m = 0;
        for (let i = 0, e = n - tau; i < e; i++) { const a = buf[i], b = buf[i + tau]; acf += a * b; m += a * a + b * b; }
        nsdf[tau] = m > 0 ? 2 * acf / m : 0;
      }
      // Schlüsselmaxima in positiven Bereichen
      const peaks = [];
      let tau = 1;
      while (tau < maxTau && nsdf[tau] > 0) tau++;           // erstes Nulldurchgang abwarten
      let curMax = -1, curIdx = -1;
      for (; tau < maxTau; tau++) {
        if (nsdf[tau] > 0) {
          if (nsdf[tau] > curMax && tau >= minTau) { curMax = nsdf[tau]; curIdx = tau; }
        } else if (curIdx > 0) { peaks.push(curIdx); curMax = -1; curIdx = -1; }
      }
      if (curIdx > 0) peaks.push(curIdx);
      if (!peaks.length) return { f: 0, clarity: 0, rms };
      let gmax = 0; for (const p of peaks) gmax = Math.max(gmax, nsdf[p]);
      const thr = 0.9 * gmax;
      let pi = peaks.find(p => nsdf[p] >= thr);
      // parabolische Interpolation
      const a = nsdf[pi - 1], b = nsdf[pi], c = nsdf[pi + 1] || 0;
      const den = a - 2 * b + c; const shift = den !== 0 ? 0.5 * (a - c) / den : 0;
      const T = pi + shift;
      return { f: sampleRate / T, clarity: b, rms };
    };
  }

  // Glättung: Median über 3 Frames, Oktavsprung-Schutz
  function createSmoother() {
    const hist = [];
    return function (midi) {
      if (midi == null) { hist.length = 0; return null; }
      hist.push(midi); if (hist.length > 3) hist.shift();
      const s = hist.slice().sort((x, y) => x - y);
      return s[Math.floor(s.length / 2)];
    };
  }

  // ---------- Auswertung ----------
  function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; }
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  function sd(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); }
  function foldCents(c) { return ((c + 600) % 1200 + 1200) % 1200 - 600; }

  // frames: [{t, m (midi|null), r (rms)}]; Zeit relativ zum Song-Start
  function scoreOffset(frames, notes, off, tol) {
    let good = 0, tot = 0, fi = 0;
    for (const n of notes) {
      if (n.kind !== 'sing') continue;
      const s = n.t + Math.min(0.12, n.d * 0.25), e = n.t + n.d;
      while (fi < frames.length && frames[fi].t + off < s) fi++;
      for (let j = fi; j < frames.length && frames[j].t + off < e; j++) {
        tot++;
        const f = frames[j];
        if (f.m != null) { let c = (f.m - n.m) * 100; if (tol) c = foldCents(c); if (Math.abs(c) <= 50) good++; }
      }
    }
    return tot ? good / tot : 0;
  }

  function analyzeTake(frames, song, opts) {
    opts = opts || {};
    const tol = !!(song && song.octaveTolerant);
    const notes = song ? song.notes.filter(n => n.kind === 'sing') : [];
    const voiced = frames.filter(f => f.m != null);
    const res = { voicedSeconds: 0, frames: frames.length };
    if (frames.length > 1) {
      const dt = (frames[frames.length - 1].t - frames[0].t) / (frames.length - 1);
      res.voicedSeconds = voiced.length * dt;
    }
    // Umfang (robust: stabile Frames, 3./97. Perzentil)
    const stable = [];
    for (let i = 3; i < frames.length - 3; i++) {
      const w = frames.slice(i - 3, i + 4);
      if (w.every(f => f.m != null)) { const ms = w.map(f => f.m); if (Math.max(...ms) - Math.min(...ms) < 0.6) stable.push(frames[i].m); }
    }
    if (stable.length > 5) {
      const s = stable.slice().sort((a, b) => a - b);
      res.low = s[Math.floor(s.length * 0.03)]; res.high = s[Math.ceil(s.length * 0.97) - 1];
    }
    if (!notes.length) return res;

    // beste Zeitverschiebung (Latenz) suchen: -350..+350 ms
    let bestOff = 0;
    const base = opts.fixedOffset != null ? [opts.fixedOffset] : null;
    const cands = base || Array.from({ length: 29 }, (_, i) => (i - 14) * 0.025);
    const scs = cands.map(off => scoreOffset(frames, notes, off, tol));
    const mx = Math.max(...scs);
    const plateau = cands.filter((o, i) => scs[i] >= mx - 0.01);
    bestOff = Math.round(mean(plateau) / 0.025) * 0.025;
    res.offset = bestOff;
    const fr = frames.map(f => ({ t: f.t + bestOff, m: f.m }));

    const per = []; let inTune25 = 0, inTune50 = 0, tot = 0; const signedAll = [];
    const stabs = [], attacks = [], vibR = [], vibE = [];
    let fi = 0;
    for (const n of notes) {
      const s = n.t + Math.min(0.12, n.d * 0.25), e = n.t + n.d;
      while (fi < fr.length && fr[fi].t < n.t - 0.05) fi++;
      const win = [], winAll = [], early = [];
      for (let j = fi; j < fr.length && fr[j].t < e; j++) {
        const f = fr[j];
        let c = f.m == null ? null : (f.m - n.m) * 100;
        if (c != null && tol) c = foldCents(c);
        if (f.t >= n.t) early.push({ t: f.t - n.t, c });
        if (f.t >= s) { winAll.push(c); if (c != null) win.push({ t: f.t, c }); }
      }
      tot += winAll.length;
      for (const c of winAll) if (c != null) { if (Math.abs(c) <= 25) inTune25++; if (Math.abs(c) <= 50) inTune50++; signedAll.push(c); }
      const cs = win.map(w => w.c);
      const med = median(cs);
      const cover = winAll.length ? win.length / winAll.length : 0;
      const hitFrac = winAll.length ? cs.filter(c => Math.abs(c) <= 50).length / winAll.length : 0;
      const pn = { t: n.t, d: n.d, m: n.m, lyr: n.lyr, cents: med == null ? null : Math.round(med), cover: +cover.toFixed(2), hit: +hitFrac.toFixed(2) };
      // Einschwingzeit
      if (n.d >= 0.4) {
        let at = null;
        for (let k = 0; k + 2 < early.length; k++) {
          if ([0, 1, 2].every(q => early[k + q].c != null && Math.abs(early[k + q].c) <= 50)) { at = early[k].t; break; }
        }
        if (at != null) { attacks.push(at * 1000); pn.attack = Math.round(at * 1000); }
      }
      // Stabilität & Vibrato bei längeren Tönen
      if (n.d >= 0.8 && win.length >= 15) {
        const steady = win.filter(w => w.t >= n.t + Math.max(0.25, n.d * 0.25));
        if (steady.length >= 10) {
          // linear entzerren
          const ts = steady.map(w => w.t), ys = steady.map(w => w.c);
          const mt = mean(ts), my = mean(ys);
          let num = 0, den = 0; for (let k = 0; k < ts.length; k++) { num += (ts[k] - mt) * (ys[k] - my); den += (ts[k] - mt) ** 2; }
          const sl = den ? num / den : 0;
          const resid = ys.map((y, k) => y - (my + sl * (ts[k] - mt)));
          const sdev = sd(resid);
          // Vibrato: Nulldurchgänge des Residuums
          let zc = 0; for (let k = 1; k < resid.length; k++) if ((resid[k - 1] < 0) !== (resid[k] < 0)) zc++;
          const dur = ts[ts.length - 1] - ts[0];
          const rate = dur > 0 ? zc / 2 / dur : 0;
          const ext = sdev * Math.SQRT2;
          if (rate >= 4 && rate <= 8 && ext >= 12) { vibR.push(rate); vibE.push(ext); pn.vibrato = { rate: +rate.toFixed(1), extent: Math.round(ext) }; }
          else { stabs.push(sdev); pn.stab = Math.round(sdev); }
        }
      }
      per.push(pn);
    }
    res.score = tot ? Math.round(100 * inTune50 / tot) : 0;      // Anteil Sollzeit innerhalb ±50 ct
    res.within25 = tot ? Math.round(100 * inTune25 / tot) : 0;
    res.coverage = tot ? Math.round(100 * signedAll.length / tot) : 0;
    const abs = signedAll.map(Math.abs);
    res.meanAbsCents = abs.length ? Math.round(mean(abs)) : null;
    res.bias = signedAll.length ? Math.round(median(signedAll)) : null;
    res.stability = stabs.length ? Math.round(mean(stabs)) : null;
    res.attackMs = attacks.length ? Math.round(median(attacks)) : null;
    res.vibrato = vibR.length ? { rate: +mean(vibR).toFixed(1), extent: Math.round(mean(vibE)), notes: vibR.length } : null;
    res.notesHit = per.filter(p => p.hit >= 0.5).length;
    res.notesTotal = per.length;
    res.perNote = per;
    return res;
  }

  function insights(a) {
    const out = [];
    if (a.score == null) return out;
    if (a.coverage != null && a.coverage < 60) out.push({ lvl: 'warn', txt: `Nur ${a.coverage}% der Sollzeit wurde ein Ton erkannt – sing etwas lauter, halte Töne bis zum Balkenende oder geh näher ans Mikro.` });
    if (a.bias != null && Math.abs(a.bias) >= 15) out.push({ lvl: 'warn', txt: `Tendenz: du singst im Schnitt ${Math.abs(a.bias)} Cent zu ${a.bias < 0 ? 'tief' : 'hoch'}. ${a.bias < 0 ? 'Denk den Ton „von oben“ an und halte die Atemstütze bis zum Phrasenende.' : 'Etwas weniger Druck, Kehle locker lassen.'}` });
    else if (a.bias != null) out.push({ lvl: 'good', txt: `Keine systematische Abweichung (Median ${a.bias > 0 ? '+' : ''}${a.bias} ct) – du liegst im Mittel richtig.` });
    if (a.attackMs != null && a.attackMs > 250) out.push({ lvl: 'warn', txt: `Du brauchst im Median ${a.attackMs} ms, bis der Ton sitzt („Anschleifen“). Übung „Ton halten“ hilft: Ton innerlich hören, dann direkt einsetzen.` });
    if (a.stability != null) out.push({ lvl: a.stability <= 15 ? 'good' : 'warn', txt: a.stability <= 15 ? `Lange Töne sind stabil (±${a.stability} ct).` : `Lange Töne schwanken um ±${a.stability} ct. Gleichmäßiger Atemfluss ist hier der Hebel.` });
    if (a.vibrato) out.push({ lvl: 'info', txt: `Vibrato erkannt: ${a.vibrato.rate} Hz, ±${a.vibrato.extent} ct auf ${a.vibrato.notes} Ton/Tönen.` });
    if (a.perNote && a.perNote.length) {
      const worst = a.perNote.filter(p => p.cents != null && Math.abs(p.cents) > 50).sort((x, y) => Math.abs(y.cents) - Math.abs(x.cents)).slice(0, 2);
      if (worst.length) out.push({ lvl: 'warn', txt: 'Größte Abweichungen: ' + worst.map(p => `„${p.lyr || midiToName(p.m)}“ (${midiToName(p.m)}, ${p.cents > 0 ? '+' : ''}${p.cents} ct)`).join(', ') + '.' });
    }
    return out;
  }

  const api = { nameToMidi, midiToName, hzToMidi, midiToHz, SONGS, EXERCISES, parseNotes, harmonize, buildSong, songRange, fitTranspose, buildExercise, exerciseBase, createDetector, createSmoother, analyzeTake, insights, median, mean, foldCents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof self !== 'undefined' ? self : this);
