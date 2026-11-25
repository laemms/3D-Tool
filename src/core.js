/* Gebäudemodell – Geometrie-Kern (Phase 0)
   Einheiten im Wandgraph: Millimeter, ganzzahlig. Koordinaten wie im Bestandsaufnahme-Tool:
   x nach rechts, y nach unten (Bildschirm), Richtung 0° = +x, 90° = +y. */
(function (root) {
  'use strict';
  const TOL = 30; // mm Fangradius
  const HILF = 1; // mm: Hilfskante, schließt nur die Topologie (Achsversatz), hat keinen Wandkörper
  const MIN_RAUM = 0.3; // m²: kleinere Flächen ohne Raumzuordnung sind Reste aus Achsversätzen
  const isHilf = w => w.t < 20;

  /* ---------- kleine Geometrie ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = a => Math.hypot(a[0], a[1]);
  const signedArea = q => { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const centroid = q => { let A = 0, cx = 0, cy = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length], c = a[0] * b[1] - b[0] * a[1]; A += c; cx += (a[0] + b[0]) * c; cy += (a[1] + b[1]) * c; } A /= 2; return Math.abs(A) < 1e-9 ? q[0] : [cx / (6 * A), cy / (6 * A)]; };
  const inPoly = (p, q) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const a = q[i], b = q[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  /* Schnittpunkt zweier Geraden (Punkt + Richtung); null bei parallel */
  const lineX = (p, d, q, e) => { const den = cross(d, e); if (Math.abs(den) < 1e-9) return null; const t = cross(sub(q, p), e) / den; return [p[0] + d[0] * t, p[1] + d[1] * t]; };
  /* Abstand Punkt–Strecke und Parameter t */
  const segProj = (p, a, b) => { const d = sub(b, a), L2 = dot(d, d) || 1, t = dot(sub(p, a), d) / L2, c = [a[0] + d[0] * t, a[1] + d[1] * t]; return { t, d: len(sub(p, c)) }; };

  /* ---------- Wandgraph aufbauen: fangen, teilen, doppelte zusammenführen ----------
     Eine Wand ist eine Achse a→b mit Dicke t. ts ist der Teil der Dicke auf der S-Seite der Achse,
     S = [-d.y, d.x] für d = b - a (im Bildschirm rechts der Laufrichtung). ts = t/2: Achse in Wandmitte;
     ts = 0 oder t: Achse auf einer Wandfläche (so liegen Außenwände mit der Achse auf der Rauminnenseite). */
  function buildGraph(segs, tol = TOL) {
    // 1. Endpunkte fangen
    const pts = [];
    const snap = p => { for (const q of pts) if (len(sub(p, q.p)) <= tol) { q.n++; q.p = [q.p[0] + (p[0] - q.p[0]) / q.n, q.p[1] + (p[1] - q.p[1]) / q.n]; return q; } const q = { p: p.slice(), n: 1 }; pts.push(q); return q; };
    let S = segs.filter(s => len(sub(s.b, s.a)) > tol).map(s => ({ ...s, A: snap(s.a), B: snap(s.b) }));
    S.forEach(s => { s.a = s.A.p; s.b = s.B.p; });
    // Endpunkte endgültig setzen (Mittelwert des Clusters)
    S = S.map(s => ({ ...s, a: s.A.p, b: s.B.p })).filter(s => s.A !== s.B);
    // 2. echte Kreuzungen als zusätzliche Knoten
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const s = S[i], u = S[j], d = sub(s.b, s.a), e = sub(u.b, u.a), den = cross(d, e);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross(sub(u.a, s.a), e) / den, w = cross(sub(u.a, s.a), d) / den;
      const ls = len(d), lu = len(e);
      if (t * ls > tol && (1 - t) * ls > tol && w * lu > tol && (1 - w) * lu > tol) snap([s.a[0] + d[0] * t, s.a[1] + d[1] * t]);
    }
    // 3. an allen Knoten auf einer Strecke teilen
    const nodes = pts.map((q, i) => ({ id: 'n' + (i + 1), x: Math.round(q.p[0]), y: Math.round(q.p[1]) }));
    const P = n => [n.x, n.y];
    const nodeOf = q => nodes[pts.indexOf(q)];
    const edges = new Map();
    for (const s of S) {
      const a = P(nodeOf(s.A)), b = P(nodeOf(s.B)), on = [{ n: nodeOf(s.A), t: 0 }, { n: nodeOf(s.B), t: 1 }];
      for (const n of nodes) { if (n === on[0].n || n === on[1].n) continue; const pr = segProj(P(n), a, b), L = len(sub(b, a)); if (pr.d <= tol && pr.t * L > tol && (1 - pr.t) * L > tol) on.push({ n, t: pr.t }); }
      on.sort((x, y) => x.t - y.t);
      for (let k = 0; k + 1 < on.length; k++) {
        const n1 = on[k].n, n2 = on[k + 1].n; if (n1 === n2) continue;
        const key = n1.id < n2.id ? n1.id + '|' + n2.id : n2.id + '|' + n1.id;
        const old = edges.get(key);
        const ts = s.ts == null ? s.t / 2 : s.ts;
        if (!old) edges.set(key, { a: n1.id, b: n2.id, t: s.t, ts, ext: !!s.ext, src: [s.src] });
        else { if (s.t > old.t + 1) { old.t = s.t; old.ts = old.a === n1.id ? ts : s.t - ts; } old.ext = old.ext && !!s.ext; old.src.push(s.src); }
      }
    }
    const used = new Set(); for (const e of edges.values()) { used.add(e.a); used.add(e.b); }
    const walls = [...edges.values()].map((e, i) => ({ id: 'w' + (i + 1), a: e.a, b: e.b, t: Math.round(e.t), ts: Math.round(e.ts * 2) / 2, ext: e.ext, src: e.src }));
    return { knoten: nodes.filter(n => used.has(n.id)), waende: walls, oeffnungen: [] };
  }

  /* ---------- Räume = Flächen des planaren Graphen ---------- */
  function faces(g, all) {
    const N = new Map(g.knoten.map(n => [n.id, n]));
    // lose Enden entfernen
    let W = g.waende.slice(), changed = true;
    while (changed) { changed = false; const deg = new Map(); W.forEach(w => { deg.set(w.a, (deg.get(w.a) || 0) + 1); deg.set(w.b, (deg.get(w.b) || 0) + 1); }); const k = W.filter(w => deg.get(w.a) > 1 && deg.get(w.b) > 1); if (k.length !== W.length) { W = k; changed = true; } }
    const out = new Map(); // Knoten -> ausgehende Halbkanten, nach Winkel sortiert
    const HE = [];
    for (const w of W) for (const [u, v] of [[w.a, w.b], [w.b, w.a]]) { const h = { u, v, w, ang: Math.atan2(N.get(v).y - N.get(u).y, N.get(v).x - N.get(u).x), seen: false }; HE.push(h); if (!out.has(u)) out.set(u, []); out.get(u).push(h); }
    out.forEach(l => l.sort((a, b) => a.ang - b.ang));
    const next = h => { const l = out.get(h.v), i = l.findIndex(x => x.v === h.u); return l[(i - 1 + l.length) % l.length]; };
    const res = [];
    for (const h0 of HE) {
      if (h0.seen) continue; const loop = []; let h = h0, guard = 0;
      while (!h.seen && guard++ < 10000) { h.seen = true; loop.push(h); h = next(h); }
      const poly = loop.map(x => [N.get(x.u).x, N.get(x.u).y]);
      res.push({ halbkanten: loop, poly, A: signedArea(poly) });
    }
    // Innenflächen haben bei dieser Nachfolgeregel positive Fläche (y nach unten); Außenränder negativ
    if (all) return res;
    return res.filter(f => f.A > 1e3);
  }

  /* Innenkontur eines Raums: jede Wandachse um halbe Wanddicke nach innen versetzen */
  function innerContour(face, g) {
    const N = new Map(g.knoten.map(n => [n.id, n]));
    const L = face.halbkanten.map(h => { const a = [N.get(h.u).x, N.get(h.u).y], b = [N.get(h.v).x, N.get(h.v).y], d = sub(b, a), l = len(d) || 1, dir = [d[0] / l, d[1] / l];
      // Innenseite: bei positiver Fläche (y unten) liegt der Raum rechts der Halbkante im Bildschirm
      const nIn = [-dir[1], dir[0]], ts = h.w.ts == null ? h.w.t / 2 : h.w.ts, o = h.u === h.w.a ? ts : h.w.t - ts; return { p: [a[0] + nIn[0] * o, a[1] + nIn[1] * o], d: dir, a, b, nIn, o }; });
    const q = [];
    for (let i = 0; i < L.length; i++) {
      const A = L[(i - 1 + L.length) % L.length], B = L[i];
      const x = lineX(A.p, A.d, B.p, B.d);
      if (x && Math.abs(cross(A.d, B.d)) > 1e-3) q.push(x);
      else if (Math.abs(A.o - B.o) > 1) { q.push([B.a[0] + A.nIn[0] * A.o, B.a[1] + A.nIn[1] * A.o]); q.push([B.a[0] + B.nIn[0] * B.o, B.a[1] + B.nIn[1] * B.o]); }
    }
    return q;
  }

  function rooms(g) {
    return faces(g).map((f, i) => { const q = innerContour(f, g); return { id: 'f' + (i + 1), achse: f.poly, kontur: q.map(p => [Math.round(p[0] * 2) / 2, Math.round(p[1] * 2) / 2]), flaeche_m2: Math.abs(signedArea(q)) / 1e6, waende: [...new Set(f.halbkanten.map(h => h.w.id))] }; });
  }

  /* ---------- Umrechnung: raumbasierter Grundriss (Bestandsaufnahme-Tool) → Wandgraph ---------- */
  const ptsOf = r => { let x = r.x || 0, y = r.y || 0; const o = [[x, y]]; for (const s of r.segs) { const a = (s.dir || 0) * Math.PI / 180; x += Math.cos(a) * (s.len || 0); y += Math.sin(a) * (s.len || 0); o.push([x, y]); } return o; };
  const dickeB = b => b ? (b.dicke || (b.schichten || []).reduce((s, x) => s + (x.d || 0), 0) || null) : null;

  function fromBestandsaufnahme(p, f) {
    const ext = s => s.grenzt === 'aussen' || s.grenzt === 'erdreich';
    const bt = id => (p.bauteile || []).find(b => b.id === id);
    const extTh = s => (s.dicke > 0 ? s.dicke : (dickeB(bt(s.bauteilId)) || dickeB((p.bauteile || []).find(b => b.kat === 'AW')) || 24)) / 100;
    const iwDef = () => (f.wd > 0 ? f.wd : (dickeB((p.bauteile || []).find(b => b.kat === 'IW')) || 11.5)) / 100;
    const R = f.raeume.map(r => { const q = ptsOf(r), sa = signedArea(q.slice(0, -1)); return { r, q, sa }; });
    // nach außen zeigende Normale je Segment
    const outN = (o, i) => { const a = o.q[i], b = o.q[i + 1], d = sub(b, a), l = len(d) || 1; const n = o.sa > 0 ? [d[1] / l, -d[0] / l] : [-d[1] / l, d[0] / l]; return { n, dir: [d[0] / l, d[1] / l], L: l, a }; };
    // gegenüberliegende Nachbarwände (wie wallHits im Bestandsaufnahme-Tool)
    const hits = (o, i) => { const S = outN(o, i), res = []; for (const u of R) { if (u === o) continue; u.r.segs.forEach((x, xi) => { const T = outN(u, xi); if (dot(T.n, S.n) > -0.9) return; const d0 = dot(sub(T.a, S.a), S.n); if (d0 < -0.005 || d0 > 0.8) return; const b0 = dot(sub(u.q[xi], S.a), S.dir), b1 = dot(sub(u.q[xi + 1], S.a), S.dir), von = Math.max(0, Math.min(b0, b1)), bis = Math.min(S.L, Math.max(b0, b1)); if (bis - von > 0.05) res.push({ von, bis, d: Math.max(0, d0), nb: u.r.id, xi }); }); } return res.sort((a, b) => a.von - b.von); };
    const segs = [], openings = [], roomRefs = [];
    // 1. Durchgang: Abschnitte je Raumseite (ohne gegenüberliegenden Raum = Außenwand, wie wallParts im Bestandsaufnahme-Tool)
    const PARTS = new Map();
    for (const o of R) o.r.segs.forEach((s, i) => {
      const S = outN(o, i), H = hits(o, i), parts = []; let c = 0;
      const own = H.length || ext(s) ? { t: extTh(s), ext: true } : { t: s.dicke > 0 ? s.dicke / 100 : iwDef(), ext: false };
      // wie wallParts: kleine Lücken zwischen zwei Nachbarräumen (Kreuzung einer Querwand) gehören zur Innenwand
      for (const h of H) { const gp = h.von - c, pv = parts[parts.length - 1];
        if (gp > 0.05) { if (pv && pv.nb && gp <= 0.6) { c = pv.bis = c + gp / 2; } else if (!pv && gp <= 0.3) { /* Anfang: Nachbarabschnitt beginnt am Wandanfang */ } else { parts.push({ von: c, bis: h.von, ...own }); c = h.von; } }
        if (h.bis > c + 0.01) { parts.push({ von: c, bis: h.bis, t: h.d, ext: false, nb: h.nb, xi: h.xi }); c = h.bis; } }
      if (S.L - c > 0.3 || !parts.length) parts.push({ von: c, bis: S.L, ...own });
      else parts[parts.length - 1].bis = S.L;
      PARTS.set(o.r.id + ':' + i, parts);
    });
    // Achslage: Außenwand mit der Achse auf der Rauminnenseite (Dicke nach außen); Innenwand in der Mitte des Spalts.
    // Die Mitte ist von beiden Seiten gleich, so wird eine Innenwand nie doppelt erzeugt. Wo eine Raumseite von
    // Außen- auf Innenwand wechselt, verbindet eine Hilfskante ohne Wandkörper die beiden Achsen.
    const axOf = (o, i, pt) => (pt.nb ? pt.t / 2 : 0);
    // 2. Durchgang: Achsstücke
    for (const o of R) {
      const pieces = [];
      o.r.segs.forEach((s, i) => {
        const S = outN(o, i), parts = PARTS.get(o.r.id + ':' + i), sv = [-S.dir[1], S.dir[0]], roomOnS = dot(sv, S.n) < 0;
        // Raumtrennung ohne Wand (Räume liegen direkt aneinander, z. B. offener Übergang): Hilfskante auf der Raumseite
        for (const pt0 of parts) { const pt = pt0.t <= 0.001 ? Object.assign(pt0, { t: HILF / 1000, offen: true }) : pt0; const ax = pt.offen ? 0 : axOf(o, i, pt); pt.ax = ax; const a = [S.a[0] + S.dir[0] * pt.von + S.n[0] * ax, S.a[1] + S.dir[1] * pt.von + S.n[1] * ax], b = [S.a[0] + S.dir[0] * pt.bis + S.n[0] * ax, S.a[1] + S.dir[1] * pt.bis + S.n[1] * ax]; pieces.push({ a, b, d: S.dir, t: pt.t, ts: roomOnS ? ax : pt.t - ax, ax, ext: pt.ext, src: o.r.id + ':' + i }); }
        // Öffnungen: Lage auf der Raumseite → Punkt auf der Wandachse
        const list = []; for (const op of s.oeffnungen || []) { const k = Math.max(1, Math.round(op.anz || 1)); for (let j = 0; j < k; j++) list.push(k > 1 ? { ...op, id: op.id + '#' + (j + 1) } : op); }
        // automatisch platzierte Öffnungen: in den längsten passenden Abschnitt (Innentür → Abschnitt mit Nachbar, sonst Außenabschnitt)
        // gleichmäßig mit gleichen Abständen verteilen (die Bestandsaufnahme setzt nur die Mitten auf L·k/(n+1), dabei überlappen breite Fenster)
        const spread = (von, bis, xs) => { const tot = xs.reduce((a, x) => a + x.bw, 0), gap = Math.max(0, (bis - von - tot) / (xs.length + 1)); let c = von; xs.forEach(x => { c += gap; x.cc = c + x.bw / 2; c += x.bw; }); };
        const grp = new Map(), pos = list.map(op => { let bw = op.b || 0.9; if (S.L > 0.3) bw = Math.min(bw, S.L - 0.1); return { op, bw, cc: (op.abst != null && (op.anz || 1) <= 1) ? op.abst + bw / 2 : null }; });
        spread(0, S.L, pos.filter(x => x.cc == null));
        if (parts.length > 1) for (const x of pos) { if (x.op.abst != null && (x.op.anz || 1) <= 1) continue; const inn = x.op.typ === 'innentuer', cand = parts.filter(q => inn ? q.nb : !q.nb); if (!cand.length) continue; const q = cand.reduce((u, v) => v.bis - v.von > u.bis - u.von ? v : u); if (!grp.has(q)) grp.set(q, []); grp.get(q).push(x); }
        for (const [q, xs] of grp) { xs.forEach(x => { x.bw = Math.min(x.bw, q.bis - q.von - 0.1); }); spread(q.von, q.bis, xs); }
        pos.forEach(({ op, bw, cc }) => { if (!(bw > 0.2)) return; const part = parts.find(q => cc >= q.von - 1e-6 && cc <= q.bis + 1e-6) || { ax: 0, t: extTh(s) }; const ax = part.ax || 0, m = [S.a[0] + S.dir[0] * cc + S.n[0] * ax, S.a[1] + S.dir[1] * cc + S.n[1] * ax]; openings.push({ m: [m[0] * 1000, m[1] * 1000], typ: op.typ, breite: Math.round(bw * 1000), brh: Math.round((op.bruest || 0) * 1000), hoehe: Math.round((op.h || 1) * 1000), quelle: op.id }); });
      });
      // Stücke zu einer geschlossenen Achsenkontur verbinden
      const n = pieces.length;
      for (let k = 0; k < n; k++) {
        const A = pieces[k], B = pieces[(k + 1) % n];
        if (Math.abs(cross(A.d, B.d)) > 1e-3) { const x = lineX(A.a, A.d, B.a, B.d); if (x) { A.b = x; B.a = x; } }
        else if (len(sub(A.b, B.a)) > 0.005) segs.push({ a: A.b.map(v => v * 1000), b: B.a.map(v => v * 1000), t: HILF, ts: HILF / 2, ext: false, src: 'stoss' }); // Achsversatz ohne Wandkörper: beide Wandstücke stoßen dort bündig aneinander
      }
      pieces.forEach(pc => segs.push({ a: pc.a.map(v => v * 1000), b: pc.b.map(v => v * 1000), t: pc.t * 1000, ts: pc.ts * 1000, ext: pc.ext, src: pc.src }));
      const qi = o.q.slice(0, -1); roomRefs.push({ id: o.r.id, name: o.r.name, nutzung: o.r.nutzung, beheizt: o.r.beheizt, temp: o.r.temp, mitte: centroid(qi).map(v => v * 1000), flaeche_m2: Math.abs(o.sa) });
    }
    const g = buildGraph(segs);
    // Öffnungen der nächstgelegenen Wand zuordnen, doppelte entfernen
    const N = new Map(g.knoten.map(nn => [nn.id, nn]));
    for (const op of openings) {
      let best = null; for (const w of g.waende) { if (isHilf(w)) continue; const a = [N.get(w.a).x, N.get(w.a).y], b = [N.get(w.b).x, N.get(w.b).y], pr = segProj(op.m, a, b); if (pr.t >= 0 && pr.t <= 1 && (!best || pr.d < best.d)) best = { w, d: pr.d, t: pr.t, L: len(sub(b, a)) }; }
      if (!best || best.d > 200) continue;
      // innerhalb der Wand halten (Abschnitte der Bestandsaufnahme können über einen Wandstoß hinausreichen)
      const breite = Math.min(op.breite, Math.max(200, best.L - 20)), abstand = Math.round(Math.max(10, Math.min(best.L - breite - 10, best.t * best.L - breite / 2)));
      if (g.oeffnungen.some(x => x.wand === best.w.id && Math.abs(x.abstand - abstand) < 50)) continue;
      g.oeffnungen.push({ id: 'o' + (g.oeffnungen.length + 1), wand: best.w.id, typ: op.typ, abstand, breite, brh: op.brh, hoehe: op.hoehe, quelle: op.quelle });
    }
    // Räume des Graphen den Räumen der Bestandsaufnahme zuordnen
    const all = rooms(g).map(fr => { const ref = roomRefs.find(r => inPoly(r.mitte, fr.achse)); return { ...fr, bestandsaufnahme: ref || null }; });
    // kleine Flächen ohne Raum entstehen, wo sich Wände im Altdatensatz überlappen: als Restfläche melden
    const rs = all.filter(r => r.bestandsaufnahme || r.flaeche_m2 >= MIN_RAUM), rest = all.filter(r => !r.bestandsaufnahme && r.flaeche_m2 < MIN_RAUM);
    return { graph: g, raeume: rs, restflaechen: rest, quellraeume: roomRefs };
  }


  /* ---------- Bearbeiten: jede Änderung baut den Graphen neu auf (fangen, teilen, zusammenführen) ---------- */
  const clone = g => JSON.parse(JSON.stringify(g));
  const nodeMap = g => new Map(g.knoten.map(n => [n.id, n]));
  const wallEnds = (g, w, N = nodeMap(g)) => { const a = N.get(w.a), b = N.get(w.b); return [[a.x, a.y], [b.x, b.y]]; };
  function toSegs(g) { const N = nodeMap(g); return g.waende.map(w => { const [a, b] = wallEnds(g, w, N); return { a, b, t: w.t, ts: w.ts == null ? w.t / 2 : w.ts, ext: !!w.ext, src: w.id }; }); }
  // Öffnungen als absolute Punkte (Mitte auf der Achse) sichern und nach dem Neuaufbau wieder an Wände hängen
  function openingPoints(g) { const N = nodeMap(g); return (g.oeffnungen || []).map(o => { const w = g.waende.find(x => x.id === o.wand); if (!w) return null; const [a, b] = wallEnds(g, w, N), d = sub(b, a), L = len(d) || 1, c = o.abstand + o.breite / 2; return { o, m: [a[0] + d[0] / L * c, a[1] + d[1] / L * c], dir: [d[0] / L, d[1] / L] }; }).filter(Boolean); }
  function attachOpenings(g, pts) {
    const N = nodeMap(g); g.oeffnungen = [];
    for (const { o, m, dir } of pts) {
      let best = null; for (const w of g.waende) { if (isHilf(w)) continue; const [a, b] = wallEnds(g, w, N), pr = segProj(m, a, b), d = sub(b, a), L = len(d) || 1; if (pr.t >= 0 && pr.t <= 1 && Math.abs(dot([d[0] / L, d[1] / L], dir)) > 0.95 && (!best || pr.d < best.d)) best = { w, d: pr.d, t: pr.t, L }; }
      if (!best || best.d > 200) continue;
      const breite = Math.min(o.breite, best.L - 20); if (breite < 200) continue;
      g.oeffnungen.push({ ...o, wand: best.w.id, breite, abstand: Math.round(Math.max(10, Math.min(best.L - breite - 10, best.t * best.L - breite / 2))) });
    }
    return g;
  }
  function rebuild(g, segs, pts) { const g2 = buildGraph(segs.map(s => ({ ...s }))); g2.waende.forEach(w => delete w.src); return attachOpenings(g2, pts || openingPoints(g)); }
  const edit = {
    addWall: (g, a, b, props) => rebuild(g, [...toSegs(g), { a, b, t: props.t, ts: props.ts == null ? props.t / 2 : props.ts, ext: !!props.ext }]),
    deleteWall: (g, id) => rebuild(g, toSegs(g).filter(s => s.src !== id), openingPoints({ ...g, oeffnungen: (g.oeffnungen || []).filter(o => o.wand !== id) })),
    moveNode: (g, id, x, y) => { const h = clone(g), pts = openingPoints(g), n = h.knoten.find(k => k.id === id); if (!n) return g; n.x = Math.round(x); n.y = Math.round(y); return rebuild(h, toSegs(h), pts); },
    setWall: (g, id, patch) => { const h = clone(g), w = h.waende.find(x => x.id === id); if (!w) return g; const t0 = w.t, side = (w.ts == null ? t0 / 2 : w.ts) / (t0 || 1); Object.assign(w, patch); if (patch.t != null && patch.ts == null) w.ts = Math.round(patch.t * side * 2) / 2; return h; },
    flipWall: (g, id) => { const h = clone(g), w = h.waende.find(x => x.id === id); if (w) w.ts = w.t - (w.ts == null ? w.t / 2 : w.ts); return h; },
    addOpening: (g, wallId, center, props) => { const h = clone(g), w = h.waende.find(x => x.id === wallId); if (!w) return g; const [a, b] = wallEnds(h, w), L = len(sub(b, a)), breite = Math.min(props.breite, L - 20); if (breite < 200) return g; const id = 'o' + (1 + Math.max(0, ...h.oeffnungen.map(o => +String(o.id).slice(1) || 0))); h.oeffnungen.push({ id, eigen: true, wand: wallId, typ: props.typ, breite, hoehe: props.hoehe, brh: props.brh, abstand: Math.round(Math.max(10, Math.min(L - breite - 10, center - breite / 2))) }); return h; },
    // Öffnungen aus der Bestandsaufnahme (quelle) bleiben dort führend; eine Änderung im Editor ersetzt sie dauerhaft, Löschen blendet sie aus
    setOpening: (g, id, patch) => { const h = clone(g), o = h.oeffnungen.find(x => x.id === id); if (o) { Object.assign(o, patch); if (o.quelle) { o.ersetzt = o.quelle; delete o.quelle; } } return h; },
    deleteOpening: (g, id) => { const h = clone(g), o = h.oeffnungen.find(x => x.id === id); h.oeffnungen = h.oeffnungen.filter(x => x.id !== id); if (o && (o.quelle || o.ersetzt)) h.oeffnungen.push({ id: o.id, ersetzt: o.quelle || o.ersetzt, geloescht: true, wand: null }); return h; }
  };
  // Räume mit Namen: neue Flächen erben Name und Nutzung des alten Raums, dessen Mittelpunkt in ihnen liegt
  function roomsWithMeta(g, meta) {
    const used = new Set(), names = new Set((meta || []).map(x => x.name)); let k = 0;
    const fresh = () => { do k++; while (names.has('Raum ' + k)); names.add('Raum ' + k); return 'Raum ' + k; };
    return rooms(g).map(r => { const m = (meta || []).find(x => !used.has(x) && x.mitte && inPoly(x.mitte, r.achse)); if (!m && r.flaeche_m2 < MIN_RAUM) return null; if (m) used.add(m); const c = centroid(r.kontur); return { ...r, name: m ? m.name : fresh(), nutzung: m ? m.nutzung || '' : '', temp: m ? m.temp : null, beheizt: m ? m.beheizt : null, bestandsaufnahmeId: m ? m.bestandsaufnahmeId || null : null, mitte: [Math.round(c[0]), Math.round(c[1])] }; }).filter(Boolean);
  }



  /* Stoßstellen: über Hilfskanten verbundene Knoten bilden eine gemeinsame Stoßstelle (Achsversatz) */
  function junctions(g, links) {
    const par = new Map(g.knoten.map(n => [n.id, n.id])), find = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    const isLink = w => isHilf(w) || (links && links.has(w.id)); // Hilfskanten und ganz verdeckte Wandstücke verbinden Knoten
    g.waende.filter(isLink).forEach(w => { const a = find(w.a), b = find(w.b); if (a !== b) par.set(a, b); });
    const J = new Map(); g.waende.filter(w => !isLink(w)).forEach(w => { for (const id of [w.a, w.b]) { const r = find(id); if (!J.has(r)) J.set(r, []); J.get(r).push({ w, at: id }); } });
    return [...J.values()];
  }

  /* Wandstöße: an jedem Knoten die Fläche zwischen den Wandkanten schließen (konvexe Hülle der Kantenschnitte) */
  function hull(P) { const q = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of q) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of q.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1)); }
  function nodeCaps(g) {
    const N = nodeMap(g), caps = [];
    for (const js of junctions(g)) { if (js.length < 2) continue; const lines = [], pts = [], tmax = Math.max(...js.map(j => j.w.t)); let cx = 0, cy = 0;
      for (const { w, at } of js) { const n = N.get(at), c = [n.x, n.y], o = N.get(w.a === at ? w.b : w.a), d = sub([o.x, o.y], c), L = len(d) || 1, u = [d[0] / L, d[1] / L], S0 = [-u[1], u[0]], ts0 = w.ts == null ? w.t / 2 : w.ts, ts = w.a === at ? ts0 : w.t - ts0; cx += c[0] / js.length; cy += c[1] / js.length;
        const A = [c[0] + S0[0] * ts, c[1] + S0[1] * ts], B = [c[0] - S0[0] * (w.t - ts), c[1] - S0[1] * (w.t - ts)]; pts.push(A, B); lines.push({ p: A, d: u, w }, { p: B, d: u, w }); }
      for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) { if (lines[i].w === lines[j].w) continue; const x = lineX(lines[i].p, lines[i].d, lines[j].p, lines[j].d); if (x && len(sub(x, [cx, cy])) <= tmax * 1.5) pts.push(x); }
      const h = hull(pts); if (h.length >= 3) caps.push({ knoten: js[0].at, poly: h.map(p => [Math.round(p[0]), Math.round(p[1])]), ext: js.some(j => j.w.ext) }); }
    return caps;
  }

  /* Außenumriss eines Geschosses: äußerer Rand des Wandgraphen, um die Außenwanddicke nach außen versetzt (mm) */
  function umriss(g) {
    const out = faces(g, true).filter(f => f.A < -1e3).sort((a, b) => a.A - b.A);
    return out.length ? innerContour(out[0], g).map(p => [Math.round(p[0]), Math.round(p[1])]) : [];
  }

  /* Höhenmodell wie Bestandsaufnahme und Raumtool 3D (Werte in m):
     Geschosshöhe = Fußboden + lichte Höhe + Abhängung + Rohdecke; Niveau = OKFF bezogen auf ±0,00 (EG) */
  function hoehen(p) {
    const fs = p.geschosse || [], n = fs.length, eg = f => /^(eg|erd)/i.test(f.name || '');
    const L = fs.map(f => { const fb = (f.fb || 0) / 100, abh = (f.abh || 0) / 100, lh = f.hoehe || 2.5, rd = f.deckeD > 0 ? f.deckeD / 100 : (f.geschossHoehe > 0 ? Math.max(0, f.geschossHoehe - lh - fb - abh) : 0.2); return { id: f.id, fb, abh, lh, rd, G: fb + lh + abh + rd }; });
    if (!n) return L;
    let a = fs.findIndex(f => f.nivFix && f.okff != null); if (a < 0) { a = fs.findIndex(eg); if (a < 0) a = 0; }
    L[a].niv = (fs[a].nivFix || eg(fs[a])) && fs[a].okff != null ? fs[a].okff : (eg(fs[a]) ? 0 : fs[a].okff ?? 0);
    for (let i = a + 1; i < n; i++) L[i].niv = fs[i].nivFix && fs[i].okff != null ? fs[i].okff : L[i - 1].niv + L[i - 1].G;
    for (let i = a - 1; i >= 0; i--) L[i].niv = fs[i].nivFix && fs[i].okff != null ? fs[i].okff : L[i + 1].niv - L[i].G;
    L.forEach((x, i) => { x.Ge = i < n - 1 ? L[i + 1].niv - x.niv : x.G; x.rde = x.Ge - x.fb - x.lh - x.abh; });
    return L;
  }

  /* Öffnungen in ihre Wand legen und überlappende gleichmäßig verteilen (Reihenfolge bleibt), z. B. aus älteren Modellen */
  function fixOpenings(g) {
    const N = nodeMap(g); let changed = false; const os = (g.oeffnungen || []).map(o => ({ ...o }));
    for (const w of g.waende) {
      const xs = os.filter(o => o.wand === w.id).sort((a, b) => a.abstand - b.abstand); if (!xs.length) continue;
      const [a, b] = wallEnds(g, w, N), L = len(sub(b, a));
      for (const o of xs) { const br = Math.min(o.breite, Math.max(200, L - 20)), ab = Math.round(Math.max(10, Math.min(L - br - 10, o.abstand))); if (br !== o.breite || ab !== o.abstand) { o.breite = br; o.abstand = ab; changed = true; } }
      if (!xs.some((o, i) => i && xs[i - 1].abstand + xs[i - 1].breite > o.abstand)) continue;
      const tot = xs.reduce((s, o) => s + o.breite, 0), gap = Math.max(0, (L - tot) / (xs.length + 1)); let c = 0;
      xs.forEach(o => { c += gap; o.abstand = Math.round(c); c += o.breite; }); changed = true;
    }
    return changed ? { ...g, oeffnungen: os } : g;
  }

  /* Abgleich mit der Bestandsaufnahme beim Laden eines gespeicherten Modells:
     Öffnungen kommen immer aus der Bestandsaufnahme (neu, geändert, gelöscht), eigene und im Editor ersetzte bleiben.
     Raumdaten (Name, Nutzung, Temperatur, beheizt, Sollfläche) werden nachgeführt. Wände bleiben, wie sie gespeichert sind. */
  function syncFromBA(p, f, g, meta) {
    const fresh = fromBestandsaufnahme(p, f), own = (g.oeffnungen || []).filter(o => o.eigen || o.ersetzt), ersetzt = new Set(own.map(o => o.ersetzt).filter(Boolean));
    const pts = openingPoints(fresh.graph).filter(x => !ersetzt.has(x.o.quelle));
    const h = attachOpenings({ ...g, oeffnungen: [] }, pts); let k = 0; const used = new Set(own.map(o => o.id));
    h.oeffnungen.forEach(o => { do k++; while (used.has('b' + k)); o.id = 'b' + k; used.add(o.id); });
    h.oeffnungen = [...own, ...h.oeffnungen];
    const byId = new Map(fresh.raeume.filter(r => r.bestandsaufnahme).map(r => [r.bestandsaufnahme.id, r.bestandsaufnahme]));
    const src = new Map((f.raeume || []).map(r => [r.id, r]));
    const m2 = (meta || []).map(m => { const q = m.bestandsaufnahmeId && src.get(m.bestandsaufnahmeId); if (!q) return m; const b = byId.get(q.id);
      return { ...m, name: q.name || m.name, nutzung: q.nutzung || '', temp: q.temp ?? null, beheizt: q.beheizt ?? null, soll: b ? b.flaeche_m2 : m.soll }; });
    return { g: h, meta: m2 };
  }
  /* Kennung der Geometrie einer Etage in der Bestandsaufnahme (Lage, Wandlängen, -richtungen, -dicken, Nachbarn), ohne Öffnungen */
  function geoKey(f) {
    const s = JSON.stringify((f.raeume || []).map(r => [r.id, r.x, r.y, (r.segs || []).map(q => [q.dir, q.len, q.dicke, q.grenzt, q.nachbarId, q.bauteilId])]).concat([f.wd]));
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36);
  }

  /* Geschosse übereinander stellen wie die Bestandsaufnahme (floorAlign): Geschosse mit gleichen Außenmaßen
     (Toleranz 12 cm bzw. 1,5 %) werden mittig auf das Bezugsgeschoss (EG) geschoben; abweichende und „Lage frei“ bleiben.
     Eingabe: [{ id, name, g, lageFrei }], Ergebnis: { id: { dx, dy, st } } in mm. */
  function stapeln(fs) {
    const env = new Map(fs.map(f => { const u = umriss(f.g || { knoten: [], waende: [] }); if (u.length < 3) return [f.id, null]; const xs = u.map(p => p[0]), ys = u.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); return [f.id, { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }]; }));
    const out = {}; fs.forEach(f => { out[f.id] = { dx: 0, dy: 0, st: env.get(f.id) ? '' : 'leer' }; });
    const ref = fs.find(f => /^(eg|erd)/i.test(f.name || '') && env.get(f.id)) || fs.find(f => env.get(f.id)); if (!ref) return out;
    const R = env.get(ref.id), tol = (a, b) => Math.abs(a - b) <= Math.max(120, 0.015 * Math.max(a, b)); out[ref.id].st = 'bezug';
    for (const f of fs) { if (f === ref) continue; const e = env.get(f.id); if (!e) continue; if (f.lageFrei === 'ja') { out[f.id].st = 'frei'; continue; }
      out[f.id] = tol(e.w, R.w) && tol(e.h, R.h) ? { dx: Math.round(R.cx - e.cx), dy: Math.round(R.cy - e.cy), st: 'gleich' } : { dx: 0, dy: 0, st: 'abw' }; }
    return out;
  }

  /* ---- Modell aus Bestandsaufnahme und gespeichertem Stand (gemeinsam für Seite und Werkzeuge) ---- */
  function floorsFromBA(p) {
    return p.geschosse.map(f => { const r = fromBestandsaufnahme(p, f), g = r.graph; g.waende.forEach(w => delete w.src);
      const meta = r.raeume.map(x => { const q = x.bestandsaufnahme; return { name: q ? q.name : 'Raum', nutzung: q ? q.nutzung || '' : '', temp: q ? q.temp : null, beheizt: q ? q.beheizt : null, bestandsaufnahmeId: q ? q.id : null, mitte: centroid(x.kontur).map(Math.round), soll: q ? q.flaeche_m2 : null }; });
      return { id: f.id, name: f.name || 'Geschoss', h: Math.round((f.geschossHoehe || 2.8) * 1000), g, meta }; });
  }
  function floorsFromSaved(p, m) {
    return p.geschosse.map(f => { const x = (m.geschosse || []).find(y => y.id === f.id) || { knoten: [], waende: [], oeffnungen: [], raeume: [] };
      const r = syncFromBA(p, f, { knoten: x.knoten || [], waende: x.waende || [], oeffnungen: x.oeffnungen || [] }, x.raeume || []);
      return { id: f.id, name: f.name || 'Geschoss', h: x.geschossHoehe_mm || Math.round((f.geschossHoehe || 2.8) * 1000), g: fixOpenings(r.g), meta: r.meta, geoAlt: !!(x.baGeo && x.baGeo !== geoKey(f)) }; });
  }
  const metaOf = (r, meta) => ({ name: r.name, nutzung: r.nutzung, temp: r.temp, beheizt: r.beheizt, bestandsaufnahmeId: r.bestandsaufnahmeId, mitte: r.mitte, soll: ((meta || []).find(m => m.bestandsaufnahmeId && m.bestandsaufnahmeId === r.bestandsaufnahmeId) || {}).soll ?? null });
  /* Exportdokument: Höhen immer aus der Bestandsaufnahme (Höhenmodell wie Raumtool 3D), Raumhöhe je Raum, sonst lichte Höhe des Geschosses */
  function modelDoc(p, floors, version, dachP) {
    const hz = hoehen(p), mm = v => (v == null ? null : Math.round(v * 1000)), f0 = p.geschosse[0] || {};
    return { id: p.id, projektName: p.name || '', version, quelle: 'Gebäudemodell', geaendert: Date.now(), bodenplatte_mm: f0.bodenD > 0 ? Math.round(f0.bodenD * 10) : null, dach: dachP || null,
      geschosse: floors.map(f => { const rs = roomsWithMeta(f.g, f.meta), bf = p.geschosse.find(x => x.id === f.id) || {}, h = hz.find(x => x.id === f.id);
        return { id: f.id, name: f.name, lageFrei: bf.lageFrei || null, baGeo: geoKey(bf), geschossHoehe_mm: h ? mm(h.Ge) : f.h, lichteHoehe_mm: h ? mm(h.lh) : bf.hoehe ? mm(bf.hoehe) : null, niveau_mm: h ? mm(h.niv) : null, rohdecke_mm: h ? mm(h.rde) : null, fussboden_mm: h ? mm(h.fb) : null, abhaengung_mm: h ? mm(h.abh) : null,
          knoten: f.g.knoten, waende: f.g.waende, oeffnungen: f.g.oeffnungen,
          raeume: rs.map(r => { const q = (bf.raeume || []).find(x => x.id === r.bestandsaufnahmeId); return { ...metaOf(r, f.meta), hoehe_mm: q && q.hoehe > 0 ? mm(q.hoehe) : null, flaeche_m2: Math.round(r.flaeche_m2 * 100) / 100, kontur: r.kontur }; }) }; }) };
  }

  /* ---- Dach (v1): rechteckiger Grundriss = Außenumriss des obersten Geschosses (nach dem Übereinanderstellen) ----
     Parameter: form sattel|pult|flach, neigung (Grad), first lang|quer, kniestock, ueberTraufe, ueberOrtgang, dicke (mm),
     bezug decke (kalter Dachraum über der obersten Geschossdecke) | boden (ausgebautes Dachgeschoss ab OKFF).
     Ergebnis in mm, Modellkoordinaten (x rechts, y unten im Plan, z nach oben ab ±0): Dachflächen (Oberseite) und Giebel-/Kniestockwände. */
  function dachStandard(p) { const top = (p.geschosse || []).slice().reverse().find(f => (f.raeume || []).length) || {};
    const dg = (top.raeume || []).some(r => r.decke && r.decke.grenzt === 'aussen') || /^(dg|dach)/i.test(top.name || '');
    // über allen Räumen liegt laut Bestandsaufnahme ein beheizter Raum (z. B. Wohnung im Mehrfamilienhaus): kein Dach im Modell
    const oben = (top.raeume || []).length && (top.raeume || []).every(r => r.decke && r.decke.grenzt === 'raum');
    return { form: oben ? 'kein' : 'sattel', neigung: Number((p.objekt || {}).dachneigung) || 35, first: 'lang', kniestock: 0, ueberTraufe: 400, ueberOrtgang: 300, dicke: 250, bezug: dg ? 'boden' : 'decke' }; }
  /* Grundriss in Rechtecke zerlegen (für Dächer auf L-, T- oder U-Grundrissen): Koordinaten mit kleinen Versätzen (< tol) bündeln,
     Rasterzellen im Umriss sammeln, dann wiederholt das größte freie Rechteck nehmen. Kleine Reste (Erker, Nischen) bleiben ohne Dachteil. */
  function dachTeile(u, tol = 500) {
    if (!u || u.length < 3) return [];
    const bund = vs => { const s = [...new Set(vs.map(v => Math.round(v)))].sort((p, q) => p - q), g = [[s[0]]]; s.slice(1).forEach(v => (v - g[g.length - 1][g[g.length - 1].length - 1] <= tol ? g[g.length - 1].push(v) : g.push([v])));
      return g.map((x, i) => (i === 0 ? x[0] : i === g.length - 1 ? x[x.length - 1] : (x[0] + x[x.length - 1]) / 2)); };
    const X = bund(u.map(q => q[0])), Y = bund(u.map(q => q[1])), nx = X.length - 1, ny = Y.length - 1;
    const inPoly = (x, y) => { let c = false; for (let i = 0, j = u.length - 1; i < u.length; j = i++) { const [a, b] = u[i], [e, f] = u[j]; if ((b > y) !== (f > y) && x < (e - a) * (y - b) / (f - b) + a) c = !c; } return c; };
    const cell = []; for (let i = 0; i < nx; i++) { cell.push([]); for (let j = 0; j < ny; j++) cell[i].push(inPoly((X[i] + X[i + 1]) / 2, (Y[j] + Y[j + 1]) / 2) ? 1 : 0); }
    const teile = [];
    for (let n = 0; n < 6; n++) { let best = null;
      for (let i0 = 0; i0 < nx; i0++) for (let j0 = 0; j0 < ny; j0++) for (let i1 = i0; i1 < nx; i1++) { if (!cell[i1][j0]) break; for (let j1 = j0; j1 < ny; j1++) {
        let ok = true; for (let i = i0; i <= i1 && ok; i++) if (cell[i][j1] !== 1) ok = false; if (!ok) break;
        let full = true; for (let i = i0; i <= i1 && full; i++) for (let j = j0; j <= j1; j++) if (cell[i][j] !== 1) { full = false; break; } if (!full) break;
        const w = X[i1 + 1] - X[i0], h = Y[j1 + 1] - Y[j0]; if (!best || w * h > best.A) best = { A: w * h, i0, i1, j0, j1, w, h }; } }
      // Hauptteil und Anbauten ab 1,5 m Breite und 4 m²; danach auch kleine Vorbauten/Erker (ab 0,5 m, 1 m²) – die bekommen Pult- oder Schleppdach
      if (!best || (teile.length === 0 ? Math.min(best.w, best.h) < 1500 || best.A < 4e6 : Math.min(best.w, best.h) < 500 || best.A < 1e6)) break;
      for (let i = best.i0; i <= best.i1; i++) for (let j = best.j0; j <= best.j1; j++) cell[i][j] = 2;
      teile.push({ x0: X[best.i0], y0: Y[best.j0], x1: X[best.i1 + 1], y1: Y[best.j1 + 1] }); }
    return teile;
  }

  // konvexes Polygon (2D-Punkte [x,y,...]) an der Halbebene a·x + b·y + c ≥ 0 abschneiden; z wird linear mitgeführt
  function halbebene(poly, a, b, c) { const out = []; poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], vp = a * p[0] + b * p[1] + c, vq = a * q[0] + b * q[1] + c;
    if (vp >= 0) out.push(p); if ((vp >= 0) !== (vq >= 0)) { const t = vp / (vp - vq); out.push(p.map((v, k) => v + (q[k] - v) * t)); } }); return out; }
  const flaecheXY = q => Math.abs(q.reduce((s, p, i) => { const r = q[(i + 1) % q.length]; return s + p[0] * r[1] - r[0] * p[1]; }, 0)) / 2;
  const sauber = q => { let r = q.filter((p, i) => Math.hypot(p[0] - q[(i + 1) % q.length][0], p[1] - q[(i + 1) % q.length][1], p[2] - q[(i + 1) % q.length][2]) > 2);
    r = r.filter((p, i) => { const a = r[(i + r.length - 1) % r.length], b = r[(i + 1) % r.length], cx = (p[1] - a[1]) * (b[2] - a[2]) - (p[2] - a[2]) * (b[1] - a[1]), cy = (p[2] - a[2]) * (b[0] - a[0]) - (p[0] - a[0]) * (b[2] - a[2]), cz = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
      return Math.hypot(cx, cy, cz) > 1e3 * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) * 1e-3 * 2; }); return r; };
  const ebeneVon = (f, dk) => { const [p0, p1] = f, p2 = f.find((q, i) => i > 1 && Math.abs((p1[0] - p0[0]) * (q[1] - p0[1]) - (p1[1] - p0[1]) * (q[0] - p0[0])) > 1) || f[2];
    const det = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]), a = ((p1[2] - p0[2]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[2] - p0[2])) / det, b = ((p1[0] - p0[0]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[0] - p0[0])) / det;
    return { a, b, c: p0[2] - a * p0[0] - b * p0[1], dz: dk * Math.hypot(1, a, b) }; };

  function dach(doc, d) {
    if (!d || d.form === 'kein') return null;
    const fs = (doc.geschosse || []).filter(f => (f.waende || []).some(w => !isHilf(w))); if (!fs.length) return null;
    const top = fs[fs.length - 1], stp = stapeln((doc.geschosse || []).map(f => ({ id: f.id, name: f.name, lageFrei: f.lageFrei, g: f })))[top.id] || { dx: 0, dy: 0 };
    const u = umriss(top); if (u.length < 3) return null;
    const us = u.map(q => [q[0] + stp.dx, q[1] + stp.dy]), xs = us.map(q => q[0]), ys = us.map(q => q[1]);
    const H = top.geschossHoehe_mm || 2800, niv = top.niveau_mm || 0, zb = d.bezug === 'boden' ? niv : niv + H, ze = zb + (Number(d.kniestock) || 0);
    const t = Math.tan(Math.max(0, Math.min(75, Number(d.neigung) || 0)) * Math.PI / 180), ut = Number(d.ueberTraufe) || 0, uo = Number(d.ueberOrtgang) || 0;
    const tw = Math.max(...top.waende.filter(w => w.ext && !isHilf(w)).map(w => w.t), 240), dk = Number(d.dicke) || 250;
    const walm = d.form === 'walm' || d.form === 'zelt';
    // Dachteile: ein Rechteck über alles (wie bisher) oder Zerlegung des Umrisses (L-, T-, U-Grundriss)
    let rects = d.teileModus === 'rechteck' ? [] : dachTeile(us);
    if (rects.length < 2 || d.form === 'flach') rects = [{ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }];
    const teile = [], E = 50;
    rects.forEach((r, i) => { const lx = r.x1 - r.x0, ly = r.y1 - r.y0; let alongX, innen = null, nb = null;
      if (i === 0) alongX = walm ? lx >= ly : (d.first === 'quer') !== (lx >= ly);
      else { // Anbau: First senkrecht zur längsten gemeinsamen Kante mit einem schon gesetzten Teil
        let bestL = 0; teile.forEach(q => { const R = q.r, ox = Math.min(r.x1, R.x1) - Math.max(r.x0, R.x0), oy = Math.min(r.y1, R.y1) - Math.max(r.y0, R.y0);
          if (oy > bestL && Math.abs(r.x0 - R.x1) < E) { bestL = oy; innen = 'x0'; nb = q; } if (oy > bestL && Math.abs(r.x1 - R.x0) < E) { bestL = oy; innen = 'x1'; nb = q; }
          if (ox > bestL && Math.abs(r.y0 - R.y1) < E) { bestL = ox; innen = 'y0'; nb = q; } if (ox > bestL && Math.abs(r.y1 - R.y0) < E) { bestL = ox; innen = 'y1'; nb = q; } });
        alongX = innen ? innen[0] === 'x' : lx >= ly;
        // schmaler Streifen am Nachbarn (Vorbau, Abseite): Schleppdach an der Traufseite des Nachbarn, Pultdach an dessen Giebelseite
        if (innen && d.form !== 'flach') { const proj = innen[0] === 'x' ? lx : ly, along = innen[0] === 'x' ? ly : lx;
          if (proj < 2500 || proj < 0.4 * along) {
            // Schleppdach, wenn der Nachbar an der Kontaktkante eine zu ihm hin ansteigende Fläche hat (Traufe oder Walm), sonst Pultdach (Giebel)
            const R = nb.r, inw = { x0: [-1, 0], x1: [1, 0], y0: [0, -1], y1: [0, 1] }[innen], mx = innen[0] === 'x' ? [innen === 'x0' ? r.x0 - 100 : r.x1 + 100, (Math.max(r.y0, R.y0) + Math.min(r.y1, R.y1)) / 2] : [(Math.max(r.x0, R.x0) + Math.min(r.x1, R.x1)) / 2, innen === 'y0' ? r.y0 - 100 : r.y1 + 100];
            teile.push({ r, alongX: innen[0] === 'y', kontakt: innen, nb, typ: 'streifen', hoch: innen[1] === '0' ? 'b0' : 'b1', ext: 0, mx, inw }); return; } } }
      teile.push({ r, alongX, innen, nb, ext: 0 }); });
    // Fläche(n) eines Teils; das innere Ende (am Nachbarn) läuft um ext in den Nachbarn hinein, ohne Überstand, ohne Walm, ohne Giebelwand
    const bauen = T => { const { r, alongX } = T, P = (a, b, z) => (alongX ? [a, b, z] : [b, a, z]);
      const A0 = alongX ? r.x0 : r.y0, A1 = alongX ? r.x1 : r.y1, B0 = alongX ? r.y0 : r.x0, B1 = alongX ? r.y1 : r.x1, bm = (B0 + B1) / 2;
      const in0 = T.innen === (alongX ? 'x0' : 'y0'), in1 = T.innen === (alongX ? 'x1' : 'y1'), a0e = in0 ? A0 - T.ext : A0, a1e = in1 ? A1 + T.ext : A1;
      const o0 = in0 ? 0 : walm ? ut : uo, o1 = in1 ? 0 : walm ? ut : uo, fl = [], wa = [], fp = alongX ? [a0e - o0, B0 - ut, a1e + o1, B1 + ut] : [B0 - ut, a0e - o0, B1 + ut, a1e + o1];
      const kn = (p0, q0, p1, q1, side) => wa.push(['Kniestock', [P(p0, q0, zb), P(p1, q1, zb), P(p1, q1, ze), P(p0, q0, ze)], side]);
      if (T.typ === 'streifen') { const pl = T.nb.eb.reduce((m, e) => (e.a * T.mx[0] + e.b * T.mx[1] + e.c < m.a * T.mx[0] + m.b * T.mx[1] + m.c ? e : m));
        /* kalter Dachraum: Erker/Vorbau bekommt ein Pultdach, Traufe auf Höhe der Geschossdecke, Neigung höchstens bis an das Nachbardach
           (ein Schleppdach würde unter die Decke reichen). Ausgebautes Dach: Schleppdach (Abseite) an Traufe oder Walm, Pultdach am Giebel. */
        const proj = T.alongX ? T.r.y1 - T.r.y0 : T.r.x1 - T.r.x0, zN = pl.a * T.mx[0] + pl.b * T.mx[1] + pl.c;
        if (d.bezug !== 'boden') { T.typ = 'pult'; T.sp = Math.max(0.03, Math.min(t, (zN - ze) / Math.max(proj, 1))); }
        else T.typ = pl.a * T.inw[0] + pl.b * T.inw[1] > 0.05 ? 'schlepp' : 'pult'; }
      if (T.typ) { // Streifen: Pult- oder Schleppdach, hohe Seite am Nachbarn, kein Überstand zum Nachbarn hin
        const hb0 = T.hoch === 'b0', bLo = hb0 ? B1 + ut : B0 - ut, bHi = hb0 ? B0 : B1; let zAt;
        if (T.typ === 'schlepp') { const N = T.nb, mx = T.mx, pick = N.eb.reduce((m, e) => (e.a * mx[0] + e.b * mx[1] + e.c < m.a * mx[0] + m.b * mx[1] + m.c ? e : m));
          zAt = (a, b) => { const [x, y] = alongX ? [a, b] : [b, a]; return pick.a * x + pick.b * y + pick.c; }; }
        else zAt = (a, b) => ze + (hb0 ? B1 - b : b - B0) * (T.sp == null ? t : T.sp);
        const q = [[A0 - uo, bLo], [A1 + uo, bLo], [A1 + uo, bHi], [A0 - uo, bHi]];
        fl.push(q.map(([a, b]) => P(a, b, zAt(a, b))));
        if (d.bezug !== 'boden' && T.typ === 'pult' && ze > zb + 10) kn(A0, hb0 ? B1 : B0, A1, hb0 ? B1 : B0, hb0 ? 'b1' : 'b0');
        T.fl = fl; T.wa = wa; T.fp = alongX ? [A0 - uo, Math.min(bLo, bHi), A1 + uo, Math.max(bLo, bHi)] : [Math.min(bLo, bHi), A0 - uo, Math.max(bLo, bHi), A1 + uo]; T.eb = fl.map(f => ebeneVon(f, dk)); T.A = [A0, A1, B0, B1]; return; }
      if (d.form === 'flach') {
        fl.push([P(A0 - uo, B0 - ut, ze), P(A1 + uo, B0 - ut, ze), P(A1 + uo, B1 + ut, ze), P(A0 - uo, B1 + ut, ze)]);
        if (d.bezug !== 'boden' && ze > zb + 10) [[A0, B0, A1, B0], [A1, B0, A1, B1], [A1, B1, A0, B1], [A0, B1, A0, B0]].forEach(([p0, q0, p1, q1]) => kn(p0, q0, p1, q1));
      } else if (d.form === 'pult') {
        const zAt = b => ze + (b - B0) * t;
        fl.push([P(a0e - o0, B0 - ut, zAt(B0 - ut)), P(a1e + o1, B0 - ut, zAt(B0 - ut)), P(a1e + o1, B1 + ut, zAt(B1 + ut)), P(a0e - o0, B1 + ut, zAt(B1 + ut))]);
        if (d.bezug !== 'boden') {
          if (ze > zb + 10) kn(A0, B0, A1, B0, 'b0');
          wa.push(['Außenwand Hochseite', [P(A1, B1, zb), P(A0, B1, zb), P(A0, B1, zAt(B1)), P(A1, B1, zAt(B1))], 'b1']);
          if (!in0) wa.push(['Giebelwand', [P(A0, B1, zb), P(A0, B0, zb), P(A0, B0, ze), P(A0, B1, zAt(B1))]]);
          if (!in1) wa.push(['Giebelwand', [P(A1, B0, zb), P(A1, B1, zb), P(A1, B1, zAt(B1)), P(A1, B0, ze)]]);
        }
      } else if (walm) { /* Walm- und Zeltdach: Traufe ringsum gleich hoch, Überstand Traufe auf allen Seiten; am inneren Ende kein Walm */
        const a0 = in0 ? a0e : A0 - ut, a1 = in1 ? a1e : A1 + ut, b0 = B0 - ut, b1 = B1 + ut, zt = ze - ut * t, hb = (b1 - b0) / 2, zr = zt + hb * t;
        let r0 = in0 ? a0 : a0 + hb, r1 = in1 ? a1 : a1 - hb; if (!in0 && !in1 && (d.form === 'zelt' || r1 - r0 < 10)) r0 = r1 = (a0 + a1) / 2; if (r1 < r0) r0 = r1 = in0 ? Math.max(a0, r1) : Math.min(a1, r0);
        const zp = r1 - r0 < 10 && !in0 && !in1 ? zt + Math.min(hb, (a1 - a0) / 2) * t : zr;
        const L1 = [P(a0, b0, zt), P(a1, b0, zt), P(r1, bm, zp)], L2 = [P(a1, b1, zt), P(a0, b1, zt), P(r0, bm, zp)];
        if (r1 > r0 + 1) { L1.push(P(r0, bm, zp)); L2.push(P(r1, bm, zp)); }
        fl.push(L1, L2); if (!in0) fl.push([P(a0, b1, zt), P(a0, b0, zt), P(r0, bm, zp)]); if (!in1) fl.push([P(a1, b0, zt), P(a1, b1, zt), P(r1, bm, zp)]);
        if (d.bezug !== 'boden' && ze > zb + 10) { kn(A0, B0, A1, B0, 'b0'); kn(A1, B1, A0, B1, 'b1'); if (!in1) kn(A1, B0, A1, B1, 'a1'); if (!in0) kn(A0, B1, A0, B0, 'a0'); }
      } else { // Satteldach
        const zr = ze + (bm - B0) * t, zt = ze - ut * t;
        fl.push([P(a0e - o0, B0 - ut, zt), P(a1e + o1, B0 - ut, zt), P(a1e + o1, bm, zr), P(a0e - o0, bm, zr)]);
        fl.push([P(a0e - o0, B1 + ut, zt), P(a1e + o1, B1 + ut, zt), P(a1e + o1, bm, zr), P(a0e - o0, bm, zr)]);
        if (d.bezug !== 'boden') {
          if (ze > zb + 10) { kn(A0, B0, A1, B0, 'b0'); kn(A1, B1, A0, B1, 'b1'); }
          if (!in0) wa.push(['Giebelwand', [P(A0, B1, zb), P(A0, B0, zb), P(A0, B0, ze), P(A0, bm, zr), P(A0, B1, ze)]]);
          if (!in1) wa.push(['Giebelwand', [P(A1, B0, zb), P(A1, B1, zb), P(A1, B1, ze), P(A1, bm, zr), P(A1, B0, ze)]]);
        }
      }
      T.fl = fl; T.wa = wa; T.fp = fp; T.eb = fl.map(f => ebeneVon(f, dk)); T.A = [A0, A1, B0, B1]; };
    // Oberfläche eines Teils (Minimum seiner Ebenen) innerhalb seines Fußabdrucks, sonst -Infinity
    const zTeil = (T, x, y) => (x >= T.fp[0] - 1 && x <= T.fp[2] + 1 && y >= T.fp[1] - 1 && y <= T.fp[3] + 1 ? Math.min(...T.eb.map(e => e.a * x + e.b * y + e.c)) : -Infinity);
    teile.forEach((T, i) => { bauen(T); if (!T.innen || !T.nb) return;
      // inneres Ende so weit in den Nachbarn verlängern, bis der Giebel ganz unter dessen Dach verschwindet
      const N = T.nb.r, depth = T.innen === 'x0' ? N.x1 - N.x0 : T.innen === 'x1' ? N.x1 - N.x0 : N.y1 - N.y0;
      for (let ext = 0; ext <= depth; ext += 100) { T.ext = ext; bauen(T);
        const [A0, A1, B0, B1] = T.A, a = T.innen === (T.alongX ? 'x0' : 'y0') ? A0 - ext : A1 + ext, pts = [];
        for (let k = 0; k <= 20; k++) { const b = B0 + (B1 - B0) * k / 20; pts.push(T.alongX ? [a, b] : [b, a]); }
        if (pts.every(([x, y]) => { const zo = Math.max(...teile.slice(0, i).map(Q => zTeil(Q, x, y))); return zTeil(T, x, y) <= zo + 1; })) break; } });
    // sichtbare Teile der Flächen: was unter dem Dach eines anderen Teils liegt, fällt weg (konvexe Differenz)
    const flaechen = [], ebenen = [];
    teile.forEach((T, i) => T.fl.forEach((f, k) => { const e = T.eb[k]; let stuecke = [f];
      if (T.innen && T.nb) { // Verlängerung im Nachbarn: seitlich auf dessen Fußabdruck begrenzen (sonst Streifen neben dessen Ortgang)
        const r = T.r, fp = T.nb.fp, g = { x0: [1, 0, -r.x0], x1: [-1, 0, r.x1], y0: [0, 1, -r.y0], y1: [0, -1, r.y1] }[T.innen], aussen = halbebene(f, ...g), innen0 = halbebene(f, -g[0], -g[1], -g[2]);
        let innen = innen0; [[1, 0, -fp[0]], [-1, 0, fp[2]], [0, 1, -fp[1]], [0, -1, fp[3]]].forEach(h => { if (innen.length >= 3) innen = halbebene(innen, ...h); });
        stuecke = [aussen, innen].filter(q => q.length >= 3 && flaecheXY(q) > 1e4); }
      teile.forEach((Q, j) => { if (j === i) return; const eps = j < i ? 1 : -1, hs = [[1, 0, -Q.fp[0]], [-1, 0, Q.fp[2]], [0, 1, -Q.fp[1]], [0, -1, Q.fp[3]], ...Q.eb.map(g => [g.a - e.a, g.b - e.b, g.c - e.c + eps])];
        const neu = []; stuecke.forEach(p => { let rest = p; for (const [a, b, c] of hs) { const aus = halbebene(rest, -a, -b, -c); if (aus.length >= 3 && flaecheXY(aus) > 1e4) neu.push(aus); rest = halbebene(rest, a, b, c); if (rest.length < 3) break; } });
        stuecke = neu; });
      stuecke.map(sauber).filter(q => q.length >= 3 && flaecheXY(q) > 5e4).forEach(q => { flaechen.push(q); ebenen.push(e); }); }));
    // Wände: Kniestock nur außen (Spannen anderer Teile abziehen), Giebel nur an äußeren Enden; Oberkante an der Dachunterseite
    const dz = d.form === 'flach' ? dk : dk / Math.cos(Math.atan(t)), waende = [];
    teile.forEach((T, i) => T.wa.forEach(([name, f]) => {
      if (name !== 'Kniestock' || teile.length < 2) { waende.push([name, f]); return; }
      const ax = Math.abs(f[0][1] - f[1][1]) < 1 ? 0 : 1, c = f[0][1 - ax], lo = Math.min(f[0][ax], f[1][ax]), hi = Math.max(f[0][ax], f[1][ax]); let iv = [[lo, hi]];
      teile.forEach((Q, j) => { if (j === i) return; const R = Q.r, [q0, q1, c0, c1] = ax === 0 ? [R.x0, R.x1, R.y0, R.y1] : [R.y0, R.y1, R.x0, R.x1]; if (c < c0 - E || c > c1 + E) return;
        iv = iv.flatMap(([s, e2]) => [[s, Math.min(e2, q0)], [Math.max(s, q1), e2]].filter(([p, q]) => q - p > 100)); });
      iv.forEach(([s, e2]) => { const pt = (v, z) => (ax === 0 ? [v, c, z] : [c, v, z]); waende.push([name, [pt(s, zb), pt(e2, zb), pt(e2, ze), pt(s, ze)]]); }); }));
    const R = q => q.map(v => Math.round(v));
    const wl = waende.map(([name, f]) => { const g = f.map(q => (q[2] > zb + 1 ? [q[0], q[1], Math.max(zb, q[2] - dz)] : q)).filter((q, i, a) => { const r = a[(i + 1) % a.length]; return Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]) > 1; }); return { name, pts: g }; }).filter(w => w.pts.length >= 3 && w.pts.some(q => q[2] > zb + 1));
    /* Dachflächenfenster: auf Fläche k, Mitte längs der Traufe (ab erster Traufecke), Unterkante über Rohfußboden des obersten
       Geschosses (an der Dachunterseite gemessen), Breite × Höhe (Höhe entlang der Schräge) */
    const fenster = d.form === 'flach' ? [] : (d.fenster || []).map((w, i) => { const k = w.flaeche | 0, q = flaechen[k], Eb = ebenen[k]; if (!q || !Eb) return null;
      const p0 = q[0], p1 = q[1], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (L < 1) return null;
      const e = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L, 0]; let hd = [-e[1], e[0]]; if (Eb.a * hd[0] + Eb.b * hd[1] < 0) hd = [-hd[0], -hd[1]];
      const sl = Eb.a * hd[0] + Eb.b * hd[1]; if (sl < 0.02) return null; const ca = 1 / Math.hypot(1, sl), uu = [hd[0] * ca, hd[1] * ca, sl * ca];
      const B = Number(w.breite) || 780, Hh = Number(w.hoehe) || 1180, zTop = niv + (w.unterkante == null ? 1000 : Number(w.unterkante)) + Eb.dz, t0 = (zTop - p0[2]) / uu[2], m = w.mitte == null ? L / 2 : Number(w.mitte);
      const at = (sx, tx) => [p0[0] + e[0] * sx + uu[0] * tx, p0[1] + e[1] * sx + uu[1] * tx, p0[2] + uu[2] * tx];
      let n = [e[1] * uu[2] - e[2] * uu[1], e[2] * uu[0] - e[0] * uu[2], e[0] * uu[1] - e[1] * uu[0]]; if (n[2] < 0) n = n.map(v => -v);
      return { id: w.id || 'df' + (i + 1), flaeche: k, breite: B, hoehe: Hh, e, u: uu, n, ecken: [at(m - B / 2, t0), at(m + B / 2, t0), at(m + B / 2, t0 + Hh), at(m - B / 2, t0 + Hh)], laenge: L }; }).filter(Boolean);
    return { form: d.form, bezug: d.bezug === 'boden' ? 'boden' : 'decke', ebenen, fenster, geschoss: top.id, dicke: dk, wanddicke: tw, flaechen: flaechen.map(f => f.map(R)), waende: wl.map(w => ({ name: w.name, pts: w.pts.map(R) })),
      teile: teile.map(T => ({ rect: [T.r.x0, T.r.y0, T.r.x1, T.r.y1].map(Math.round), fp: T.fp.map(Math.round), first: T.alongX ? 'x' : 'y', innen: T.innen, ebenen: T.eb })),
      firsthoehe: Math.round(Math.max(...flaechen.flat().map(q => q[2]))), traufhoehe: Math.round(ze) };
  }

  /* Höhe der Dachunterseite über ±0 an einem Punkt (mm, Modellkoordinaten); Infinity ohne Dach */
  function dachUnten(DA, x, y) {
    if (!DA || !DA.ebenen || !DA.ebenen.length) return Infinity;
    if (!DA.teile || DA.teile.length < 2) return Math.min(...DA.ebenen.map(e => e.a * x + e.b * y + e.c - e.dz));
    // mehrere Dachteile: höchste Unterseite der Teile, die den Punkt überdecken (Kehlen = Maximum)
    const z = DA.teile.filter(T => x >= T.fp[0] - 1 && x <= T.fp[2] + 1 && y >= T.fp[1] - 1 && y <= T.fp[3] + 1).map(T => Math.min(...T.ebenen.map(e => e.a * x + e.b * y + e.c - e.dz)));
    return z.length ? Math.max(...z) : Infinity; }
  const api = { dachTeile, dachUnten, dachStandard, dach, floorsFromBA, floorsFromSaved, modelDoc, metaOf, stapeln, syncFromBA, geoKey, fixOpenings, hoehen, umriss, junctions, isHilf, MIN_RAUM, nodeCaps, hull, toSegs, rebuild, edit, roomsWithMeta, openingPoints, segProj, buildGraph, faces, innerContour, rooms, fromBestandsaufnahme, signedArea, centroid, inPoly, ptsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
