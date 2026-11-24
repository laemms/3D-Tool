/* Gebäudemodell – Geometrie-Kern (Phase 0)
   Einheiten im Wandgraph: Millimeter, ganzzahlig. Koordinaten wie im Bestandsaufnahme-Tool:
   x nach rechts, y nach unten (Bildschirm), Richtung 0° = +x, 90° = +y. */
(function (root) {
  'use strict';
  const TOL = 30; // mm Fangradius

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

  /* ---------- Wandgraph aufbauen: fangen, teilen, doppelte zusammenführen ---------- */
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
        if (!old) edges.set(key, { a: n1.id, b: n2.id, t: s.t, ext: !!s.ext, src: [s.src] });
        else { old.t = Math.max(old.t, s.t); old.ext = old.ext && !!s.ext; old.src.push(s.src); }
      }
    }
    const used = new Set(); for (const e of edges.values()) { used.add(e.a); used.add(e.b); }
    const walls = [...edges.values()].map((e, i) => ({ id: 'w' + (i + 1), a: e.a, b: e.b, t: Math.round(e.t), ext: e.ext, src: e.src }));
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
      const nIn = [-dir[1], dir[0]], o = h.w.t / 2; return { p: [a[0] + nIn[0] * o, a[1] + nIn[1] * o], d: dir, a, b, nIn, o }; });
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
    return faces(g).map((f, i) => { const q = innerContour(f, g); return { id: 'f' + (i + 1), achse: f.poly, kontur: q.map(p => [Math.round(p[0]), Math.round(p[1])]), flaeche_m2: Math.abs(signedArea(q)) / 1e6, waende: [...new Set(f.halbkanten.map(h => h.w.id))] }; });
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
    const hits = (o, i) => { const S = outN(o, i), res = []; for (const u of R) { if (u === o) continue; u.r.segs.forEach((x, xi) => { const T = outN(u, xi); if (dot(T.n, S.n) > -0.9) return; const d0 = dot(sub(T.a, S.a), S.n); if (d0 < -0.005 || d0 > 0.8) return; const b0 = dot(sub(u.q[xi], S.a), S.dir), b1 = dot(sub(u.q[xi + 1], S.a), S.dir), von = Math.max(0, Math.min(b0, b1)), bis = Math.min(S.L, Math.max(b0, b1)); if (bis - von > 0.05) res.push({ von, bis, d: Math.max(0, d0), nb: u.r.id }); }); } return res.sort((a, b) => a.von - b.von); };
    const segs = [], openings = [], roomRefs = [];
    for (const o of R) {
      const pieces = [];
      o.r.segs.forEach((s, i) => {
        const S = outN(o, i), H = hits(o, i), parts = []; let c = 0;
        // Abschnitte ohne gegenüberliegenden Raum sind Außenwand (wie wallParts im Bestandsaufnahme-Tool)
        const own = H.length || ext(s) ? { t: extTh(s), ext: true } : { t: s.dicke > 0 ? s.dicke / 100 : iwDef(), ext: false };
        for (const h of H) { if (h.von - c > 0.05) parts.push({ von: c, bis: h.von, ...own }); if (h.bis > c + 0.01) { parts.push({ von: Math.max(c, h.von), bis: h.bis, t: h.d, ext: false, nb: h.nb }); c = h.bis; } }
        if (S.L - c > 0.05) parts.push({ von: c, bis: S.L, ...own });
        else if (parts.length) parts[parts.length - 1].bis = S.L;
        for (const pt of parts) { if (pt.t <= 0.001) continue; const o2 = pt.t / 2, a = [S.a[0] + S.dir[0] * pt.von + S.n[0] * o2, S.a[1] + S.dir[1] * pt.von + S.n[1] * o2], b = [S.a[0] + S.dir[0] * pt.bis + S.n[0] * o2, S.a[1] + S.dir[1] * pt.bis + S.n[1] * o2]; pieces.push({ a, b, d: S.dir, t: pt.t, ext: pt.ext, src: o.r.id + ':' + i }); }
        // Öffnungen: Lage auf der Raumseite → Punkt auf der Wandachse
        const list = []; for (const op of s.oeffnungen || []) { const k = Math.max(1, Math.round(op.anz || 1)); for (let j = 0; j < k; j++) list.push(op); }
        // automatisch platzierte Öffnungen: in den längsten passenden Abschnitt (Innentür → Abschnitt mit Nachbar, sonst Außenabschnitt)
        const grp = new Map(), pos = list.map((op, j) => { let bw = op.b || 0.9; if (S.L > 0.3) bw = Math.min(bw, S.L - 0.1); return { op, bw, cc: (op.abst != null && (op.anz || 1) <= 1) ? op.abst + bw / 2 : S.L * (j + 1) / (list.length + 1) }; });
        if (parts.length > 1) for (const x of pos) { if (x.op.abst != null && (x.op.anz || 1) <= 1) continue; const inn = x.op.typ === 'innentuer', cand = parts.filter(q => inn ? q.nb : !q.nb); if (!cand.length) continue; const q = cand.reduce((u, v) => v.bis - v.von > u.bis - u.von ? v : u); if (!grp.has(q)) grp.set(q, []); grp.get(q).push(x); }
        for (const [q, xs] of grp) xs.forEach((x, k) => { x.bw = Math.min(x.bw, q.bis - q.von - 0.1); x.cc = q.von + (q.bis - q.von) * (k + 1) / (xs.length + 1); });
        pos.forEach(({ op, bw, cc }) => { if (!(bw > 0.2)) return; const part = parts.find(q => cc >= q.von - 1e-6 && cc <= q.bis + 1e-6) || { t: extTh(s) }; const m = [S.a[0] + S.dir[0] * cc + S.n[0] * part.t / 2, S.a[1] + S.dir[1] * cc + S.n[1] * part.t / 2]; openings.push({ m: [m[0] * 1000, m[1] * 1000], typ: op.typ, breite: Math.round(bw * 1000), brh: Math.round((op.bruest || 0) * 1000), hoehe: Math.round((op.h || 1) * 1000), quelle: op.id }); });
      });
      // Stücke zu einer geschlossenen Achsenkontur verbinden
      const n = pieces.length;
      for (let k = 0; k < n; k++) {
        const A = pieces[k], B = pieces[(k + 1) % n];
        if (Math.abs(cross(A.d, B.d)) > 1e-3) { const x = lineX(A.a, A.d, B.a, B.d); if (x) { A.b = x; B.a = x; } }
        else if (len(sub(A.b, B.a)) > 0.005) segs.push({ a: A.b.map(v => v * 1000), b: B.a.map(v => v * 1000), t: Math.max(A.t, B.t) * 1000, ext: A.ext && B.ext, src: 'stoss' });
      }
      pieces.forEach(pc => segs.push({ a: pc.a.map(v => v * 1000), b: pc.b.map(v => v * 1000), t: pc.t * 1000, ext: pc.ext, src: pc.src }));
      const qi = o.q.slice(0, -1); roomRefs.push({ id: o.r.id, name: o.r.name, nutzung: o.r.nutzung, beheizt: o.r.beheizt, temp: o.r.temp, mitte: centroid(qi).map(v => v * 1000), flaeche_m2: Math.abs(o.sa) });
    }
    const g = buildGraph(segs);
    // Öffnungen der nächstgelegenen Wand zuordnen, doppelte entfernen
    const N = new Map(g.knoten.map(nn => [nn.id, nn]));
    for (const op of openings) {
      let best = null; for (const w of g.waende) { const a = [N.get(w.a).x, N.get(w.a).y], b = [N.get(w.b).x, N.get(w.b).y], pr = segProj(op.m, a, b); if (pr.t >= 0 && pr.t <= 1 && (!best || pr.d < best.d)) best = { w, d: pr.d, t: pr.t, L: len(sub(b, a)) }; }
      if (!best || best.d > 200) continue;
      const abstand = Math.round(best.t * best.L - op.breite / 2);
      if (g.oeffnungen.some(x => x.wand === best.w.id && Math.abs(x.abstand - abstand) < 50)) continue;
      g.oeffnungen.push({ id: 'o' + (g.oeffnungen.length + 1), wand: best.w.id, typ: op.typ, abstand, breite: op.breite, brh: op.brh, hoehe: op.hoehe, quelle: op.quelle });
    }
    // Räume des Graphen den Räumen der Bestandsaufnahme zuordnen
    const all = rooms(g).map(fr => { const ref = roomRefs.find(r => inPoly(r.mitte, fr.achse)); return { ...fr, bestandsaufnahme: ref || null }; });
    // kleine Flächen ohne Raum entstehen, wo sich Wände im Altdatensatz überlappen: als Restfläche melden
    const rs = all.filter(r => r.bestandsaufnahme || r.flaeche_m2 >= 0.3), rest = all.filter(r => !r.bestandsaufnahme && r.flaeche_m2 < 0.3);
    return { graph: g, raeume: rs, restflaechen: rest, quellraeume: roomRefs };
  }

  const api = { buildGraph, faces, innerContour, rooms, fromBestandsaufnahme, signedArea, centroid, inPoly, ptsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
