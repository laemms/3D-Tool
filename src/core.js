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
        const list = []; for (const op of s.oeffnungen || []) { const k = Math.max(1, Math.round(op.anz || 1)); for (let j = 0; j < k; j++) list.push(op); }
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
      let best = null; for (const w of g.waende) { const a = [N.get(w.a).x, N.get(w.a).y], b = [N.get(w.b).x, N.get(w.b).y], pr = segProj(op.m, a, b); if (pr.t >= 0 && pr.t <= 1 && (!best || pr.d < best.d)) best = { w, d: pr.d, t: pr.t, L: len(sub(b, a)) }; }
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
      let best = null; for (const w of g.waende) { const [a, b] = wallEnds(g, w, N), pr = segProj(m, a, b), d = sub(b, a), L = len(d) || 1; if (pr.t >= 0 && pr.t <= 1 && Math.abs(dot([d[0] / L, d[1] / L], dir)) > 0.95 && (!best || pr.d < best.d)) best = { w, d: pr.d, t: pr.t, L }; }
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
    addOpening: (g, wallId, center, props) => { const h = clone(g), w = h.waende.find(x => x.id === wallId); if (!w) return g; const [a, b] = wallEnds(h, w), L = len(sub(b, a)), breite = Math.min(props.breite, L - 20); if (breite < 200) return g; const id = 'o' + (1 + Math.max(0, ...h.oeffnungen.map(o => +String(o.id).slice(1) || 0))); h.oeffnungen.push({ id, wand: wallId, typ: props.typ, breite, hoehe: props.hoehe, brh: props.brh, abstand: Math.round(Math.max(10, Math.min(L - breite - 10, center - breite / 2))) }); return h; },
    setOpening: (g, id, patch) => { const h = clone(g), o = h.oeffnungen.find(x => x.id === id); if (o) Object.assign(o, patch); return h; },
    deleteOpening: (g, id) => { const h = clone(g); h.oeffnungen = h.oeffnungen.filter(o => o.id !== id); return h; }
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

  const api = { fixOpenings, hoehen, umriss, junctions, isHilf, MIN_RAUM, nodeCaps, hull, toSegs, rebuild, edit, roomsWithMeta, openingPoints, segProj, buildGraph, faces, innerContour, rooms, fromBestandsaufnahme, signedArea, centroid, inPoly, ptsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
