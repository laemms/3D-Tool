/* Gebäudemodell – IFC-2x3-Export aus dem Wandgraph (Phase A)
   Koordinaten: Wandgraph in mm mit y nach unten → IFC in Metern mit y nach oben (y wird gespiegelt).
   Wandstöße: an L-Ecken läuft eine Wand durch (Außenwand bzw. längere), die andere stößt stumpf an deren Fläche;
   an T-Stößen läuft die gerade Wand durch, die abzweigende endet an deren naher Fläche. So gibt es weder Lücken
   noch Überschneidungen, und Raumtool 3D bekommt geschlossene Wandflächen. */
(function (root) {
  'use strict';
  const GM = root.GM || (typeof require !== 'undefined' ? require('./core.js') : null);

  /* stabile IFC-GUIDs (22 Zeichen) aus Projekt-, Geschoss- und Element-Kennung */
  const GC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  function guid(key) {
    let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
    for (let i = 0; i < key.length; i++) { const c = key.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 + c, 2654435761); h3 = Math.imul(h3 ^ (c << 3), 2246822507); h4 = Math.imul(h4 + (c * 31), 3266489909); }
    const bits = [h1, h2, h3, h4].map(x => (x >>> 0).toString(2).padStart(32, '0')).join('').slice(0, 128);
    let s = GC[parseInt(bits.slice(0, 2), 2)]; for (let i = 2; i < 128; i += 6) s += GC[parseInt(bits.slice(i, i + 6), 2)];
    return "'" + s + "'";
  }

  /* Verlängerung (+) bzw. Kürzung (−) jedes Wandendes in mm */
  function wallEnds(g) {
    const N = new Map(g.knoten.map(n => [n.id, n])), ext = new Map();
    const P = id => { const n = N.get(id); return [n.x, n.y]; };
    const dirFrom = (w, id) => { const n = N.get(id), o = N.get(w.a === id ? w.b : w.a), d = [o.x - n.x, o.y - n.y], L = Math.hypot(d[0], d[1]) || 1; return [d[0] / L, d[1] / L]; };
    // Eckpunkte des Wandkörpers am eigenen Knoten, absolut
    const corners = (w, id) => { const c = P(id), u = dirFrom(w, id), S = [-u[1], u[0]], ts0 = w.ts == null ? w.t / 2 : w.ts, ts = w.a === id ? ts0 : w.t - ts0; return [[c[0] + S[0] * ts, c[1] + S[1] * ts], [c[0] - S[0] * (w.t - ts), c[1] - S[1] * (w.t - ts)]]; };
    // Lage der Körperecken einer anderen Wand jenseits des Wandendes (positiv = über das Ende hinaus)
    const proj = (j, k) => { const u = dirFrom(j.w, j.at), out = [-u[0], -u[1]], c = P(j.at); return corners(k.w, k.at).map(q => (q[0] - c[0]) * out[0] + (q[1] - c[1]) * out[1]); };
    const set = (j, v) => { ext.get(j.w.id)[j.w.a === j.at ? 'a' : 'b'] = v; };
    const col = (p, q) => { const a = dirFrom(p.w, p.at), b = dirFrom(q.w, q.at); return a[0] * b[0] + a[1] * b[1] < -0.999; };
    const len_ = j => Math.hypot(...['x', 'y'].map(k => N.get(j.w.a)[k] - N.get(j.w.b)[k]));
    const run = links => { g.waende.forEach(w => ext.set(w.id, { a: 0, b: 0 })); for (const js of GM.junctions(g, links)) {
      if (js.length < 2) continue;
      if (js.length === 2) {
        const [p, q] = js; if (col(p, q)) continue;
        const run = (p.w.ext !== q.w.ext ? (p.w.ext ? p : q) : (len_(p) >= len_(q) ? p : q)), stop = run === p ? q : p;
        set(run, Math.max(0, ...proj(run, stop))); set(stop, Math.min(0, ...proj(stop, run)));
        continue;
      }
      // drei und mehr: das dickste durchlaufende Paar läuft durch; alle anderen Wände (auch ein zweites Paar bei
      // Kreuzungen) enden an dessen naher Fläche
      const pairs = []; js.forEach((p, i) => js.forEach((q, k) => { if (k > i && col(p, q)) pairs.push([p, q]); }));
      if (!pairs.length) continue;
      // seitlicher Versatz zweier Achsen (bei Hilfskanten-Stößen) – ein Paar ohne Versatz geht vor
      const offs = pr => { const a = P(pr[0].at), u = dirFrom(pr[0].w, pr[0].at), b = P(pr[1].at); return Math.abs((b[0] - a[0]) * -u[1] + (b[1] - a[1]) * u[0]); };
      const score = pr => Math.max(pr[0].w.t, pr[1].w.t) * 1e6 - offs(pr) * 1e3 + len_(pr[0]) + len_(pr[1]);
      const mainPair = pairs.reduce((a, b) => (score(b) > score(a) ? b : a)), main = mainPair[0].w.t >= mainPair[1].w.t ? mainPair[0] : mainPair[1];
      js.filter(j => !mainPair.includes(j)).forEach(j => set(j, Math.min(0, ...proj(j, main))));
    } };
    // Wandstücke, die nach dem Kürzen keine Länge behalten, liegen ganz in anderen Wänden: als Verbindung behandeln und neu rechnen
    const links = new Set();
    for (let k = 0; k < 4; k++) { run(links); const more = g.waende.filter(w => !GM.isHilf(w) && !links.has(w.id) && len_({ w }) + ext.get(w.id).a + ext.get(w.id).b < -5); if (!more.length) break; more.forEach(w => links.add(w.id)); }
    ext.links = links;
    return ext;
  }

  function exportIFC(model, opts = {}) {
    const L = []; let n = 0; const E = s => { L.push('#' + (++n) + '=' + s + ';'); return '#' + n; };
    const R = v => { const x = Math.round((v || 0) * 1e6) / 1e6, s = String(x); return /[.e]/.test(s) ? s : s + '.'; };
    const M = v => R(v / 1000); // mm → m
    const CM = mm => String(Math.round(mm) / 10).replace('.', ','); // Beschriftung in cm, z. B. 36,5
    const S = t => "'" + String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, c => '\\X2\\' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + '\\X0\\') + "'";
    const pid = model.id || 'projekt', G = k => guid(pid + '|' + k);
    const P2 = (x, y) => E(`IFCCARTESIANPOINT((${R(x)},${R(y)}))`), P3 = (x, y, z) => E(`IFCCARTESIANPOINT((${R(x)},${R(y)},${R(z)}))`), D3 = (x, y, z) => E(`IFCDIRECTION((${R(x)},${R(y)},${R(z)}))`);
    const org = E(`IFCORGANIZATION($,${S(opts.organisation || 'cL-energiePlan')},$,$,$)`), per = E(`IFCPERSON($,${S(opts.bearbeiter || '')},$,$,$,$,$,$)`), po = E(`IFCPERSONANDORGANIZATION(${per},${org},$)`);
    const app = E(`IFCAPPLICATION(${org},'__BUILD__','Gebaeudemodell','GM')`), oh = E(`IFCOWNERHISTORY(${po},${app},$,.ADDED.,$,$,$,${Math.floor((opts.zeit || Date.now()) / 1000)})`);
    const un = E(`IFCUNITASSIGNMENT((${[['LENGTHUNIT', 'METRE'], ['AREAUNIT', 'SQUARE_METRE'], ['VOLUMEUNIT', 'CUBIC_METRE'], ['PLANEANGLEUNIT', 'RADIAN'], ['THERMODYNAMICTEMPERATUREUNIT', 'DEGREE_CELSIUS']].map(u => E(`IFCSIUNIT(*,.${u[0]}.,$,.${u[1]}.)`)).join(',')}))`);
    const zd = D3(0, 0, 1), xd = D3(1, 0, 0), na = (Number(opts.nord) || 0) * Math.PI / 180;
    const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${E(`IFCAXIS2PLACEMENT3D(${P3(0, 0, 0)},${zd},${xd})`)},${E(`IFCDIRECTION((${R(Math.sin(na))},${R(Math.cos(na))}))`)})`);
    const LP = (rel, x, y, z, dx, dy) => E(`IFCLOCALPLACEMENT(${rel || '$'},${E(`IFCAXIS2PLACEMENT3D(${P3(x, y, z)},${zd},${dx == null ? xd : D3(dx, dy, 0)})`)})`);
    const poly2 = q => { const pl = q.map(c => P2(c[0], c[1])); pl.push(pl[0]); return E(`IFCPOLYLINE((${pl.join(',')}))`); };
    const EX = (q, h, z0) => E(`IFCEXTRUDEDAREASOLID(${E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly2(q)})`)},${E(`IFCAXIS2PLACEMENT3D(${P3(0, 0, z0 || 0)},${zd},${xd})`)},${zd},${R(h)})`);
    const SH = (body, axis, typ) => E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${(axis ? axis + ',' : '') + E(`IFCSHAPEREPRESENTATION(${ctx},'Body',${S(typ || 'SweptSolid')},(${body}))`)}))`);
    const PS = (obj, name, props, key) => { const ps = props.filter(x => x[2] != null).map(x => E(`IFCPROPERTYSINGLEVALUE(${S(x[0])},$,${x[1]}(${x[2]}),$)`)); if (ps.length) E(`IFCRELDEFINESBYPROPERTIES(${G('rd|' + key)},${oh},$,$,(${obj}),${E(`IFCPROPERTYSET(${G('ps|' + key)},${oh},${S(name)},$,(${ps.join(',')}))`)})`); };
    const B = v => (v ? '.T.' : '.F.'), AG = (par, ch, key) => { if (ch.length) E(`IFCRELAGGREGATES(${G('ag|' + key)},${oh},$,$,${par},(${ch.join(',')}))`); };
    let OFF = [0, 0]; const ccw = q => (GM.signedArea(q) < 0 ? q.slice().reverse() : q), W = c => [(c[0] + OFF[0]) / 1000, -(c[1] + OFF[1]) / 1000];

    const proj = E(`IFCPROJECT(${G('projekt')},${oh},${S(model.projektName || pid)},$,$,$,$,(${ctx}),${un})`), lp0 = LP(null, 0, 0, 0);
    const site = E(`IFCSITE(${G('site')},${oh},${S('Grundstück')},$,$,${lp0},$,$,.ELEMENT.,$,$,$,$,$)`), lpB = LP(lp0, 0, 0, 0), bld = E(`IFCBUILDING(${G('building')},${oh},${S(model.projektName || pid)},$,$,${lpB},$,$,.ELEMENT.,$,$,$)`);
    AG(proj, [site], 'p'); AG(site, [bld], 's');

    // Geschosshöhen: Bezug Erdgeschoss = 0, darunter negativ
    const fs = model.geschosse || [], iEG = Math.max(0, fs.findIndex(f => /^(eg|erd)/i.test(f.name || ''))), elev = []; let z = 0;
    for (let i = iEG; i < fs.length; i++) { elev[i] = z; z += fs[i].geschossHoehe_mm || 2800; }
    z = 0; for (let i = iEG - 1; i >= 0; i--) { z -= fs[i].geschossHoehe_mm || 2800; elev[i] = z; }
    fs.forEach((f, i) => { if (f.niveau_mm != null) elev[i] = f.niveau_mm; }); // Höhenmodell der Bestandsaufnahme (OKFF)
    const storeys = [], mat = {}, matOf = (t, sense, off) => { const k = t + '|' + sense + '|' + off; if (!mat[k]) mat[k] = E(`IFCMATERIALLAYERSETUSAGE(${E(`IFCMATERIALLAYERSET((${E(`IFCMATERIALLAYER(${E(`IFCMATERIAL(${S('Wand ' + CM(t) + ' cm')})`)},${M(t)},$)`)}),${S('Wand ' + CM(t) + ' cm')})`)},.AXIS2.,.${sense}.,${M(off)})`); return mat[k]; }, matRel = new Map();
    let raumNr = 0; const ZON = {};
    // Geschosse übereinander stellen (wie die Bestandsaufnahme beim IFC- und DXF-Export)
    const stp = opts.stapeln === false ? {} : GM.stapeln(fs.map(f => ({ id: f.id, name: f.name, lageFrei: f.lageFrei, g: { knoten: f.knoten || [], waende: f.waende || [] } })));
    const DA = model.dach ? GM.dach(model, model.dach) : null;
    // ebener Körper aus einem 3D-Polygon (IFC-Koordinaten, m): Profil in der Ebene (X, Y = Z × X), extrudiert entlang −Z um depth
    const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
    // ebener Körper: Profil in der Ebene (X, Y = Z × X), immer in +Z extrudiert (Raumtool 3D verwirft negative Extrusionsrichtungen teilweise);
    // back = true: Körper liegt hinter der Ebene (Profil um depth zurückversetzt), z. B. Dachfläche unter ihrer Oberseite
    const PLATE = (rel, q, X, Z, depth, back) => { const O0 = q[0], O = back ? sub3(O0, Z.map(v => v * depth)) : O0, Y = crs(Z, X), pr = q.map(c => { const d = sub3(c, O0); return [dot3(d, X), dot3(d, Y)]; });
      const pl = E(`IFCLOCALPLACEMENT(${rel},${E(`IFCAXIS2PLACEMENT3D(${P3(O[0], O[1], O[2])},${D3(...Z)},${D3(...X)})`)})`);
      const body = E(`IFCEXTRUDEDAREASOLID(${E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly2(ccw(pr))})`)},${E(`IFCAXIS2PLACEMENT3D(${P3(0, 0, 0)},${zd},${xd})`)},${zd},${R(depth)})`);
      return [pl, SH(body), { O, X, Y, Z }]; };
    /* Ausgebautes Dach: Wände und Räume des obersten Geschosses an der Dachunterseite abschneiden (IfcBooleanClippingResult mit
       IfcHalfSpaceSolid, wie Revit und ArchiCAD). body im lokalen System (Ursprung o, Richtung u, IFC-Geschosskoordinaten in m),
       pts = Grundrisspunkte (mm, Modell, schon verschoben), ztop = Oberkante über ±0 (mm). Ergebnis: [Körper, Darstellungstyp] */
    const CLIP = (body, fi, o, u, pts, ztop) => {
      if (!DA || DA.bezug !== 'boden' || opts.dachSchnitt === false || DA.geschoss !== fs[fi].id || (DA.teile && DA.teile.length > 1)) return [body]; /* mehrteiliges Dach (Kehlen) ist nicht konvex: kein Halbraum-Schnitt */
      const use = DA.ebenen.filter(e => pts.some(([x, y]) => e.a * x + e.b * y + e.c - e.dz < ztop - 5)); if (!use.length) return [body];
      const X = [u[0], u[1], 0], Y = [-u[1], u[0], 0], loc = v => [dot3(v, X), dot3(v, Y), v[2]]; let r = body;
      for (const e of use) { const [x, y] = pts[0], q = [x / 1000 - o[0], -y / 1000 - o[1], (e.a * x + e.b * y + e.c - e.dz - elev[fi]) / 1000], nn = nrm([-e.a, e.b, 1]);
        const pl = E(`IFCPLANE(${E(`IFCAXIS2PLACEMENT3D(${P3(...loc(q))},${D3(...loc(nn))},$)`)})`);
        r = E(`IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,${r},${E(`IFCHALFSPACESOLID(${pl},.F.)`)})`); }
      return [r, 'Clipping']; };
    fs.forEach((f, fi) => {
      OFF = stp[f.id] ? [stp[f.id].dx, stp[f.id].dy] : [0, 0];
      const g = { knoten: f.knoten || [], waende: f.waende || [], oeffnungen: f.oeffnungen || [] }, N = new Map(g.knoten.map(k => [k.id, k])), H = f.geschossHoehe_mm || 2800, lichte = f.lichteHoehe_mm || H - 300;
      const lpS = LP(lpB, 0, 0, elev[fi] / 1000), st = E(`IFCBUILDINGSTOREY(${G('st|' + f.id)},${oh},${S(f.name || 'Geschoss')},$,$,${lpS},$,$,.ELEMENT.,${M(elev[fi])})`); storeys.push(st);
      const els = [], sp = [], ends = wallEnds(g);
      for (const w of g.waende) {
        const a = N.get(w.a), b = N.get(w.b); if (!a || !b || GM.isHilf(w)) continue; // Hilfskanten haben keinen Wandkörper
        const ea = ends.get(w.id).a, eb = ends.get(w.id).b, A = W([a.x, a.y]), Bp = W([b.x, b.y]), dx = Bp[0] - A[0], dy = Bp[1] - A[1], Lm = Math.hypot(dx, dy); if (Lm < 0.01) continue;
        const ux = dx / Lm, uy = dy / Lm, ts = (w.ts == null ? w.t / 2 : w.ts), x0 = -ea / 1000, x1 = Lm + eb / 1000;
        if (x1 - x0 < 0.005 || ends.links.has(w.id)) continue; // kurzes Stück zwischen zwei Stößen liegt ganz in den durchlaufenden Wänden
        // im Bildschirm liegt die S-Seite rechts der Laufrichtung; nach dem Spiegeln von y ist das lokal −Y
        const yS = -ts / 1000, yO = (w.t - ts) / 1000, lp = LP(lpS, A[0], A[1], 0, ux, uy);
        const axis = E(`IFCSHAPEREPRESENTATION(${ctx},'Axis','Curve2D',(${E(`IFCPOLYLINE((${P2(0, 0)},${P2(Lm, 0)}))`)}))`);
        const ab = [a, b].flatMap(k => [-1, 1].map(sg => [k.x + OFF[0] - uy * sg * w.t, k.y + OFF[1] - ux * sg * w.t])), [wb0, wt] = CLIP(EX([[x0, yS], [x1, yS], [x1, yO], [x0, yO]], H / 1000, 0), fi, A, [ux, uy], ab, elev[fi] + H);
        const wall = E(`IFCWALLSTANDARDCASE(${G('w|' + f.id + '|' + w.id)},${oh},${S((w.ext ? 'Außenwand ' : 'Innenwand ') + CM(w.t) + ' cm')},$,$,${lp},${SH(wb0, axis, wt)},$)`);
        els.push(wall);
        const mu = matOf(w.t, 'POSITIVE', -ts); if (!matRel.has(mu)) matRel.set(mu, []); matRel.get(mu).push(wall);
        PS(wall, 'Pset_WallCommon', [['IsExternal', 'IFCBOOLEAN', B(w.ext)], ['LoadBearing', 'IFCBOOLEAN', B(w.ext)]], 'wc|' + f.id + '|' + w.id);
        for (const o of g.oeffnungen.filter(x => x.wand === w.id)) {
          const tuer = o.typ === 'innentuer' || o.typ === 'aussentuer' /* Fenstertür als Fenster: Raumtool 3D führt sie dann als Fenster */, wb = Math.min(o.breite / 1000, Math.max(0.2, x1 - x0 - 0.02)), xa = Math.max(x0 + 0.01, Math.min(x1 - wb - 0.01, o.abstand / 1000)) /* im Wandkörper halten: Wandenden sind an Stößen gekürzt */, zb = (o.brh || 0) / 1000, hh = o.hoehe / 1000, key = f.id + '|' + o.id;
          const op = E(`IFCOPENINGELEMENT(${G('op|' + key)},${oh},${S('Öffnung')},$,$,${LP(lp, 0, 0, 0)},${SH(EX([[xa, yS - 0.01], [xa + wb, yS - 0.01], [xa + wb, yO + 0.01], [xa, yO + 0.01]], hh, zb))},$)`);
          E(`IFCRELVOIDSELEMENT(${G('rv|' + key)},${oh},$,$,${wall},${op})`);
          const name = { fenster: 'Fenster', fenstertuer: 'Fenstertür', innentuer: 'Innentür', aussentuer: 'Außentür' }[o.typ] || 'Öffnung';
          const fp = LP(lp, xa, yS + (w.t / 2000), zb), fill = tuer
            ? E(`IFCDOOR(${G('fi|' + key)},${oh},${S(name)},$,$,${fp},${SH(EX([[0, -0.03], [wb, -0.03], [wb, 0.03], [0, 0.03]], hh, 0))},$,${R(hh)},${R(wb)})`)
            : E(`IFCWINDOW(${G('fi|' + key)},${oh},${S(name)},$,$,${fp},${SH(EX([[0, -0.03], [wb, -0.03], [wb, 0.03], [0, 0.03]], hh, 0))},$,${R(hh)},${R(wb)})`);
          E(`IFCRELFILLSELEMENT(${G('rf|' + key)},${oh},$,$,${op},${fill})`); els.push(fill);
          PS(fill, tuer ? 'Pset_DoorCommon' : 'Pset_WindowCommon', [['IsExternal', 'IFCBOOLEAN', B(o.typ !== 'innentuer')]], 'fc|' + key);
        }
      }
      const mt = f.raeume || [], rms = GM.roomsWithMeta(g, mt).map(r => { const m = mt.find(x => x.bestandsaufnahmeId && x.bestandsaufnahmeId === r.bestandsaufnahmeId) || mt.find(x => x.name === r.name) || {}; return { ...r, hoehe_mm: m.hoehe_mm || null }; });
      // Raumtrennung ohne Wand (offener Übergang): Raumtool 3D trennt Räume nur an Wänden (IfcVirtualElement wird ignoriert,
      // Wände < 2 cm ebenso). Standard daher: 2-cm-Trennwand, 6 cm in die Nachbarwände verlängert (kostet je Raum ~0,04 m²).
      if (opts.trennung !== 'aus') for (const w of g.waende) {
        const a = N.get(w.a), b = N.get(w.b); if (!a || !b || !GM.isHilf(w)) continue;
        const L0 = Math.hypot(b.x - a.x, b.y - a.y); if (L0 < 300) continue;
        const nx = -(b.y - a.y) / L0, ny = (b.x - a.x) / L0, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const side = s => rms.findIndex(r => GM.inPoly([mx + nx * s, my + ny * s], r.kontur));
        const r1 = side(40), r2 = side(-40); if (r1 < 0 || r2 < 0 || r1 === r2) continue;
        const A = W([a.x, a.y]), Bp = W([b.x, b.y]), Lm = L0 / 1000, ux = (Bp[0] - A[0]) / Lm, uy = (Bp[1] - A[1]) / Lm, lp = LP(lpS, A[0], A[1], 0, ux, uy);
        const axis = E(`IFCSHAPEREPRESENTATION(${ctx},'Axis','Curve2D',(${E(`IFCPOLYLINE((${P2(0, 0)},${P2(Lm, 0)}))`)}))`);
        const nm = S('Raumtrennung ' + rms[r1].name + ' / ' + rms[r2].name);
        if (opts.trennung !== 'virtuell') {
          const d = (opts.trennDicke || 20) / 1000, u = (opts.trennUeberstand == null ? 60 : opts.trennUeberstand) / 1000, ex = [a, b].map((k, i) => [k.x + OFF[0] + (i ? 1 : -1) * (b.x - a.x) / L0 * 100, k.y + OFF[1] + (i ? 1 : -1) * (b.y - a.y) / L0 * 100]);
          const [tb, tt] = CLIP(EX([[-u, -d / 2], [Lm + u, -d / 2], [Lm + u, d / 2], [-u, d / 2]], H / 1000, 0), fi, A, [ux, uy], ex, elev[fi] + H), el = E(`IFCWALLSTANDARDCASE(${G('vt|' + f.id + '|' + w.id)},${oh},${nm},$,${S('Virtuelle Wand')},${lp},${SH(tb, axis, tt)},$)`);
          els.push(el); const mu = matOf(Math.round(d * 1000), 'POSITIVE', -d * 500); if (!matRel.has(mu)) matRel.set(mu, []); matRel.get(mu).push(el);
          PS(el, 'Pset_WallCommon', [['IsExternal', 'IFCBOOLEAN', B(false)], ['LoadBearing', 'IFCBOOLEAN', B(false)]], 'vc|' + f.id + '|' + w.id);
        } else {
          els.push(E(`IFCVIRTUALELEMENT(${G('vt|' + f.id + '|' + w.id)},${oh},${nm},$,$,${lp},${E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${axis}))`)},$)`));
        }
      }
      for (const r of rms) {
        raumNr++; const q = ccw(r.kontur.map(W)), key = f.id + '|' + raumNr, [rb, rt] = CLIP(EX(q, (r.hoehe_mm || lichte) / 1000, 0), fi, [0, 0], [1, 0], r.kontur.map(c => [c[0] + OFF[0], c[1] + OFF[1]]), elev[fi] + (r.hoehe_mm || lichte));
        const s = E(`IFCSPACE(${G('sp|' + f.id + '|' + (r.bestandsaufnahmeId || r.mitte.join(',')))},${oh},${S(String(raumNr).padStart(2, '0'))},${S(r.nutzung || '')},$,${LP(lpS, 0, 0, 0)},${SH(rb, null, rt)},${S(r.name + (r.beheizt === 'nein' ? ' (unbeheizt)' : r.temp != null ? ' (' + String(r.temp).replace('.', ',') + ' °C)' : ''))},.ELEMENT.,.INTERNAL.,$)`);
        sp.push(s); (ZON[r.beheizt === 'nein' ? 'Unbeheizt' : r.temp != null ? 'Beheizt ' + String(r.temp).replace('.', ',') + ' °C' : 'Beheizt'] ||= []).push(s);
        PS(s, 'Pset_SpaceThermalDesign', [['HeatingDryBulb', 'IFCTHERMODYNAMICTEMPERATUREMEASURE', r.beheizt === 'nein' || r.temp == null ? null : R(r.temp)]], 'td|' + key);
        PS(s, 'Gebaeudemodell', [['Raumnummer', 'IFCINTEGER', raumNr], ['Flaeche', 'IFCAREAMEASURE', R(Math.round(r.flaeche_m2 * 100) / 100)], ['LichteHoehe', 'IFCLENGTHMEASURE', M(r.hoehe_mm || lichte)], ['Beheizt', 'IFCBOOLEAN', B(r.beheizt !== 'nein')]], 'gm|' + key);
      }
      // Rohdecke über dem Geschoss (bzw. oberste Geschossdecke) und Bodenplatte unter dem untersten Geschoss
      const um = f.umriss || GM.umriss(g), rd = f.rohdecke_mm;
      if (um.length >= 3 && rd > 0) {
        /* Kehlbalkenlage im ausgebauten Dach: nur der Teil, über dem die Dachunterseite höher als die Decke liegt (Grundriss mit den
           Dachebenen beschnitten – Raumtool 3D übernimmt IfcBooleanClippingResult bei Decken nicht, Test 25.11.2026) */
        const cut = (poly, a, b, c) => { const out = []; poly.forEach((p0, i) => { const p1 = poly[(i + 1) % poly.length], v0 = a * p0[0] + b * p0[1] + c, v1 = a * p1[0] + b * p1[1] + c; if (v0 >= 0) out.push(p0); if ((v0 >= 0) !== (v1 >= 0)) { const t = v0 / (v0 - v1); out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); } }); return out; };
        let polys = [um];
        if (DA && DA.bezug === 'boden' && DA.geschoss === f.id && opts.dachSchnitt !== false) {
          const mehr = DA.teile && DA.teile.length > 1, gruppen = mehr ? DA.teile.map(T => ({ r: T.rect, eb: T.ebenen })) : [{ r: null, eb: DA.ebenen }];
          polys = gruppen.map(({ r, eb }) => { let q = um;
            if (r) [[1, 0, -(r[0] - OFF[0])], [-1, 0, r[2] - OFF[0]], [0, 1, -(r[1] - OFF[1])], [0, -1, r[3] - OFF[1]]].forEach(h => { if (q.length >= 3) q = cut(q, ...h); });
            for (const e of eb) if (q.length >= 3) q = cut(q, e.a, e.b, e.a * OFF[0] + e.b * OFF[1] + e.c - e.dz - elev[fi] - H);
            return q; }); }
        polys.forEach((umK, pi) => {
        const kA = umK.length >= 3 ? Math.abs(umK.reduce((s2, c, i) => { const d = umK[(i + 1) % umK.length]; return s2 + c[0] * d[1] - d[0] * c[1]; }, 0)) / 2e6 : 0;
        if (kA <= 0.5) return; const sk = pi ? '|' + pi : '';
        const q = ccw(umK.map(W)), db = EX(q, rd / 1000, (H - rd) / 1000), dt = null;
        const sl = E(`IFCSLAB(${G('sl|' + f.id + sk)},${oh},${S((fi === fs.length - 1 ? 'Oberste Geschossdecke ' : 'Decke über ' + (f.name || 'Geschoss') + ' ') + CM(rd) + ' cm')},$,$,${LP(lpS, 0, 0, 0)},${SH(db, null, dt)},$,.FLOOR.)`);
        els.push(sl); PS(sl, 'Pset_SlabCommon', [['IsExternal', 'IFCBOOLEAN', B(fi === fs.length - 1)], ['LoadBearing', 'IFCBOOLEAN', B(true)]], 'slc|' + f.id + sk);
        });
      }
      if (fi === 0 && um.length >= 3 && model.bodenplatte_mm > 0) {
        const q = ccw(um.map(W)), bp = model.bodenplatte_mm, fb = f.fussboden_mm || 0, sl = E(`IFCSLAB(${G('bp|' + f.id)},${oh},${S('Bodenplatte ' + CM(bp) + ' cm')},$,$,${LP(lpS, 0, 0, 0)},${SH(EX(q, bp / 1000, -(fb + bp) / 1000))},$,.BASESLAB.)`);
        els.push(sl); PS(sl, 'Pset_SlabCommon', [['IsExternal', 'IFCBOOLEAN', B(true)], ['LoadBearing', 'IFCBOOLEAN', B(true)]], 'bpc|' + f.id);
      }
      // Dach mit Giebel- und Kniestockwänden auf dem obersten Geschoss
      if (DA && DA.geschoss === f.id) {
        const toI = c => [c[0] / 1000, -c[1] / 1000, (c[2] - elev[fi]) / 1000], parts = [];
        const prism = DA.form === 'sattel' && DA.flaechen.length === 2 && opts.dachPrisma === true; /* Standard: Einzelflächen – nur die übernimmt Raumtool 3D als Dach, das die Räume begrenzt (Test 25.11.2026) */
        /* Raumtool 3D liest die Plattendicke als „Dicke der Eindeckung“ und legt seine „Dicke der Konstruktion“ (Vorgabe 15 cm) darunter
           (Test 25.11.2026): exportiert wird die Gesamtdicke minus 15 cm, damit die Dachunterseite und die Raumvolumen stimmen */
        const dEx = Math.max(20, DA.dicke - (opts.rtKonstruktion == null ? 150 : opts.rtKonstruktion));
        if (!prism) DA.flaechen.forEach((q0, k) => { const q = q0.map(toI), e = nrm(sub3(q[1], q[0])); let Z = nrm(crs(e, sub3(q[q.length - 1], q[0]))); if (Z[2] < 0) Z = Z.map(v => -v);
          // Profil immer von der Traufe zum First (lokal +Y = bergauf), Ursprung an der linken Traufecke: so liest Raumtool 3D beide Dachseiten gleich
          const up = nrm(sub3([0, 0, 1], Z.map(v => v * Z[2]))), X = crs(up, Z), o = q.reduce((m, c) => { const d = sub3(c, q[0]); return Math.min(m, dot3(d, X)); }, 0), lo = q.reduce((m, c) => Math.min(m, c[2]), 1e9);
          const O = q.filter(c => Math.abs(c[2] - lo) < 1e-6).reduce((b, c) => (dot3(sub3(c, q[0]), X) < dot3(sub3(b, q[0]), X) ? c : b));
          const [pl, sh, fr] = PLATE(lpS, [...q.slice(q.indexOf(O)), ...q.slice(0, q.indexOf(O))] /* Reihenfolge rotieren, nicht umsortieren: sonst Schleife im Profil */, X, Z, dEx / 1000, true), sl = E(`IFCSLAB(${G('df|' + f.id + '|' + k)},${oh},${S('Dachfläche ' + (k + 1))},$,$,${pl},${sh},$,.ROOF.)`); parts.push(sl);
          PS(sl, 'Pset_SlabCommon', [['IsExternal', 'IFCBOOLEAN', B(true)], ['PitchAngle', 'IFCPLANEANGLEMEASURE', R(Math.acos(Math.min(1, Z[2])))]], 'dfc|' + f.id + '|' + k);
          PS(sl, 'Gebaeudemodell', [['Dachdicke gesamt (mm)', 'IFCREAL', R(DA.dicke)], ['Davon exportiert (mm)', 'IFCREAL', R(dEx)]], 'dfg|' + f.id + '|' + k);
          // Dachflächenfenster: Öffnung durch die Dachplatte (senkrecht zur Fläche), Fenster in der Plattenmitte
          (DA.fenster || []).filter(w => w.flaeche === k).forEach(w => { const key = f.id + '|' + w.id, c0 = toI(w.ecken[0]), eI = nrm([w.e[0], -w.e[1], 0]), nI = nrm([w.n[0], -w.n[1], w.n[2]]), uI = nrm([w.u[0], -w.u[1], w.u[2]]);
            const Zd = nI.map(v => -v), Yl = crs(Zd, eI), sg = dot3(Yl, uI) >= 0 ? 1 : -1, b = w.breite / 1000, h = w.hoehe / 1000, rect = [[0, 0], [b, 0], [b, sg * h], [0, sg * h]], th = dEx / 1000;
            /* Platzierung relativ zur Dachplatte (wie Öffnungen in Wänden) */
            const loc = v => [dot3(v, fr.X), dot3(v, fr.Y), dot3(v, fr.Z)], place = off => E(`IFCLOCALPLACEMENT(${pl},${E(`IFCAXIS2PLACEMENT3D(${P3(...loc(sub3(add3(c0, nI.map(v => v * off)), fr.O)))},${D3(...loc(Zd))},${D3(...loc(eI))})`)})`);
            const body = (pr, d) => SH(E(`IFCEXTRUDEDAREASOLID(${E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly2(ccw(pr))})`)},${E(`IFCAXIS2PLACEMENT3D(${P3(0, 0, 0)},${zd},${xd})`)},${zd},${R(d)})`));
            const op = E(`IFCOPENINGELEMENT(${G('dop|' + key)},${oh},${S('Öffnung Dachfenster')},$,$,${place(0.05)},${body(rect, th + 0.1)},$)`); E(`IFCRELVOIDSELEMENT(${G('drv|' + key)},${oh},$,$,${sl},${op})`);
            const win = E(`IFCWINDOW(${G('dfi|' + key)},${oh},${S('Dachfenster')},$,$,${place(-th / 2 + 0.03)},${body(rect, 0.06)},$,${R(h)},${R(b)})`);
            E(`IFCRELFILLSELEMENT(${G('drf|' + key)},${oh},$,$,${op},${win})`); els.push(win); PS(win, 'Pset_WindowCommon', [['IsExternal', 'IFCBOOLEAN', B(true)]], 'dfc|' + key); }); });
        // Satteldach als ein Körper: Querschnitt (Giebelebene) entlang des Firsts extrudiert – Raumtool 3D übernimmt getrennte Dachflächen nur teilweise
        if (prism) {
          const [f1, f2] = DA.flaechen.map(q => q.map(toI)), dz = DA.dicke / 1000 / Math.cos(Math.atan2(f1[2][2] - f1[0][2], Math.hypot(f1[2][0] - f1[1][0], f1[2][1] - f1[1][1])));
          const a0 = f1[0], a1 = f1[1], ridge0 = f1[3], e2 = f2[0], L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]), Xr = nrm(sub3(a1, a0)), up = [0, 0, 1], Yh = nrm(sub3(e2, a0)), Zx = crs(Xr, up);
          // Profil in der Ebene durch a0 senkrecht zum First: lokale Achsen X = quer (Yh), Y = oben, extrudiert entlang des Firsts
          // lokale Achsen: Z = First (Extrusion), X = quer, Y = Z × X muss nach oben zeigen – sonst X umdrehen (Dach stünde kopf)
          const Xq = dot3(crs(Xr, Yh), up) >= 0 ? Yh : Yh.map(v => -v);
          const loc = c => { const d = sub3(c, a0); return [dot3(d, Xq), d[2]]; }, pe1 = loc(a0), pr = loc(ridge0), pe2 = loc(e2);
          const prof = [pe1, pr, pe2, [pe2[0], pe2[1] - dz], [pr[0], pr[1] - dz], [pe1[0], pe1[1] - dz]];
          const pl = E(`IFCLOCALPLACEMENT(${lpS},${E(`IFCAXIS2PLACEMENT3D(${P3(...a0)},${D3(...Xr)},${D3(...Xq)})`)})`);
          const body = E(`IFCEXTRUDEDAREASOLID(${E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly2(ccw(prof))})`)},${E(`IFCAXIS2PLACEMENT3D(${P3(0, 0, 0)},${zd},${xd})`)},${zd},${R(L)})`);
          const sl = E(`IFCSLAB(${G('df|' + f.id + '|s')},${oh},${S('Satteldach')},$,$,${pl},${SH(body)},$,.ROOF.)`); parts.push(sl);
          PS(sl, 'Pset_SlabCommon', [['IsExternal', 'IFCBOOLEAN', B(true)]], 'dfc|' + f.id + '|s');
        }
        const RT = { sattel: 'GABLE_ROOF', pult: 'SHED_ROOF', flach: 'FLAT_ROOF', walm: 'HIP_ROOF', zelt: 'PAVILION_ROOF' }[DA.form] || 'NOTDEFINED';
        if (opts.dachJeFlaeche) parts.forEach((sl, k) => { const r = E(`IFCROOF(${G('roof|' + f.id + '|' + k)},${oh},${S('Dach ' + (k + 1))},$,$,${LP(lpS, 0, 0, 0)},$,$,.${RT}.)`); AG(r, [sl], 'roof|' + f.id + '|' + k); els.push(r); });
        else { const roof = E(`IFCROOF(${G('roof|' + f.id)},${oh},${S('Dach')},$,$,${LP(lpS, 0, 0, 0)},$,$,.${RT}.)`); AG(roof, parts, 'roof|' + f.id); els.push(roof); }
        const allp = DA.waende.flatMap(w => w.pts), mid = allp.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]).map(v => v / Math.max(1, allp.length));
        DA.waende.forEach((dw, k) => { const q = dw.pts.map(toI), up = [0, 0, 1], e = nrm(sub3(q[1], q[0])), c = toI([mid[0], mid[1], 0]); let n = nrm([-e[1], e[0], 0]); if (dot3(n, sub3(c, q[0])) < 0) n = n.map(v => -v);
          const X = crs(up, n), [pl, sh] = PLATE(lpS, q, X, n, DA.wanddicke / 1000); // Profil in der Außenfläche, Dicke nach innen (+Z = innen)
          // als IfcBuildingElementProxy: Raumtool 3D übernimmt frei geformte IfcWall nur teilweise, Proxys vollständig (Test 25.11.2026)
          const wl = E(`IFCBUILDINGELEMENTPROXY(${G('dw|' + f.id + '|' + k)},${oh},${S(dw.name)},$,${S('Wand')},${pl},${sh},$,$)`); els.push(wl);
          PS(wl, 'Gebaeudemodell', [['IsExternal', 'IFCBOOLEAN', B(true)], ['Bauteil', 'IFCLABEL', S(dw.name)]], 'dwc|' + f.id + '|' + k); });
      }
      AG(st, sp, 'sp|' + f.id);
      if (els.length) E(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${G('cs|' + f.id)},${oh},$,$,(${els.join(',')}),${st})`);
    });
    AG(bld, storeys, 'b');
    // Raumgruppen nach Beheizung (IfcZone): für Programme, die Zonen übernehmen
    if (opts.zonen !== false) Object.entries(ZON).forEach(([nm, ss]) => { const z = E(`IFCZONE(${G('zone|' + nm)},${oh},${S(nm)},$,$)`); E(`IFCRELASSIGNSTOGROUP(${G('zg|' + nm)},${oh},$,$,(${ss.join(',')}),$,${z})`); });
    let mi = 0; for (const [mu, ws] of matRel) E(`IFCRELASSOCIATESMATERIAL(${G('am|' + (++mi))},${oh},$,$,(${ws.join(',')}),${mu})`);
    const now = new Date(opts.zeit || Date.now()).toISOString().slice(0, 19);
    return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');", `FILE_NAME(${S((model.projektName || pid) + '.ifc')},'${now}',(${S(opts.bearbeiter || '')}),(${S(opts.organisation || 'cL-energiePlan')}),'Gebaeudemodell','Gebaeudemodell','');`, "FILE_SCHEMA(('IFC2X3'));", 'ENDSEC;', 'DATA;', ...L, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\r\n');
  }

  /* ---- Prüfung des Modells vor dem Export (gleiche Regeln wie tools/ifc_check.py) ----
     doc wie für exportIFC; Ergebnis: [{ lv: 'warn' | 'info', geschoss, text, sel: { kind, id } }] */
  function pruefen(doc) {
    const out = [], fs = doc.geschosse || [], cm = v => String(Math.round(v / 10)).replace('.', ',');
    // konvexes Polygon a mit konvexem Polygon b schneiden (Sutherland–Hodgman), Fläche in mm²
    const clip = (a, b) => { let o = a; for (let i = 0; i < b.length && o.length; i++) { const p = b[i], q = b[(i + 1) % b.length], inside = c => (q[0] - p[0]) * (c[1] - p[1]) - (q[1] - p[1]) * (c[0] - p[0]) >= 0, inp = o; o = [];
        for (let k = 0; k < inp.length; k++) { const c = inp[k], d = inp[(k + 1) % inp.length], ci = inside(c), di = inside(d);
          if (ci) o.push(c); if (ci !== di) { const t = ((p[0] - c[0]) * (q[1] - p[1]) - (p[1] - c[1]) * (q[0] - p[0])) / ((d[0] - c[0]) * (q[1] - p[1]) - (d[1] - c[1]) * (q[0] - p[0])); o.push([c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t]); } } }
      return Math.abs(GM.signedArea(o)); };
    const ccwq = q => (GM.signedArea(q) < 0 ? q.slice().reverse() : q);
    const stp0 = GM.stapeln(fs.map(f => ({ id: f.id, name: f.name, lageFrei: f.lageFrei, g: f }))), DA = doc.dach ? GM.dach(doc, doc.dach) : null;
    for (const f of fs) {
      const g = { knoten: f.knoten || [], waende: f.waende || [], oeffnungen: f.oeffnungen || [] }, N = new Map(g.knoten.map(n => [n.id, n])), E = wallEnds(g), add = (lv, text, sel) => out.push({ lv, geschoss: f.id, gname: f.name, text, sel });
      const body = {}, len = {};
      for (const w of g.waende) { if (GM.isHilf(w) || E.links.has(w.id)) continue; const a = N.get(w.a), b = N.get(w.b), L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1) continue;
        const u = [(b.x - a.x) / L, (b.y - a.y) / L], S = [-u[1], u[0]], ts = w.ts == null ? w.t / 2 : w.ts, e = E.get(w.id), A = [a.x - u[0] * e.a, a.y - u[1] * e.a], Bp = [b.x + u[0] * e.b, b.y + u[1] * e.b];
        body[w.id] = ccwq([[A[0] + S[0] * ts, A[1] + S[1] * ts], [Bp[0] + S[0] * ts, Bp[1] + S[1] * ts], [Bp[0] - S[0] * (w.t - ts), Bp[1] - S[1] * (w.t - ts)], [A[0] - S[0] * (w.t - ts), A[1] - S[1] * (w.t - ts)]]); len[w.id] = [-e.a, L + e.b]; }
      // Wandkörper überschneiden sich
      const ids = Object.keys(body);
      // schräge Ecke zweier Wände (kein rechter Winkel): rechtwinklig abgeschnittene Wandenden überlappen zwangsläufig ein wenig
      const schraeg = (w1, w2) => { const k = [w1.a, w1.b].find(x => x === w2.a || x === w2.b); if (!k) return false; const d = w => { const p = N.get(w.a === k ? w.a : w.b), q = N.get(w.a === k ? w.b : w.a), L = Math.hypot(q.x - p.x, q.y - p.y); return [(q.x - p.x) / L, (q.y - p.y) / L]; };
        const c = Math.abs(d(w1)[0] * d(w2)[0] + d(w1)[1] * d(w2)[1]); return c > 0.05 && c < 0.995 && g.waende.filter(w => !GM.isHilf(w) && (w.a === k || w.b === k)).length === 2; };
      const W = new Map(g.waende.map(w => [w.id, w]));
      for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) { const A = clip(body[ids[i]], body[ids[k]]); if (A <= 20000) continue;
        if (schraeg(W.get(ids[i]), W.get(ids[k])) && A < 0.5 * Math.max(W.get(ids[i]).t, W.get(ids[k]).t) ** 2) add('info', 'Schräge Ecke: Wandenden überlappen ' + (A / 1e6).toFixed(2).replace('.', ',') + ' m² (rechtwinklige Wandenden, für Raumtool unkritisch)', { kind: 'wall', id: ids[i] });
        else add('warn', 'Wände überschneiden sich (' + (A / 1e6).toFixed(2).replace('.', ',') + ' m²)', { kind: 'wall', id: ids[i] }); }
      // Öffnungen außerhalb der Wand oder übereinander
      const byW = {};
      for (const o of g.oeffnungen) { if (!o.wand) continue; const r = len[o.wand]; if (!r) { if (!g.waende.some(w => w.id === o.wand && !GM.isHilf(w))) continue; add('warn', 'Öffnung liegt in einem Wandstück ohne Körper', { kind: 'open', id: o.id }); continue; }
        if (o.abstand < r[0] - 1 || o.abstand + o.breite > r[1] + 1) add('warn', 'Öffnung ragt ' + cm(Math.max(r[0] - o.abstand, o.abstand + o.breite - r[1])) + ' cm über die Wand (wird beim Export eingerückt)', { kind: 'open', id: o.id });
        (byW[o.wand] ||= []).push(o); }
      // ausgebautes Dach: Fenster und Türen, die über die Dachunterseite reichen
      if (DA && DA.bezug === 'boden' && DA.geschoss === f.id) { const off = stp0[f.id] || { dx: 0, dy: 0 };
        for (const o of g.oeffnungen) { const w = o.wand && g.waende.find(x => x.id === o.wand); if (!w || !body[w.id]) continue; const a = N.get(w.a), b = N.get(w.b), L = Math.hypot(b.x - a.x, b.y - a.y), u = [(b.x - a.x) / L, (b.y - a.y) / L], S = [-u[1], u[0]];
          const zTop = (f.niveau_mm || 0) + (o.brh || 0) + (o.hoehe || 0), lo = Math.min(...[o.abstand, o.abstand + o.breite].flatMap(t => [-w.t, w.t].map(sv => GM.dachUnten(DA, a.x + u[0] * t + S[0] * sv + off.dx, a.y + u[1] * t + S[1] * sv + off.dy))));
          if (zTop > lo + 20) { const tuer = /tuer/.test(o.typ || ''); add('warn', (tuer ? 'Tür' : 'Fenster') + ' reicht ' + cm(zTop - lo) + ' cm in die Dachschräge' + (tuer ? ' (Kniestock und Dach prüfen)' : ' (im Raumtool als Dachfenster anlegen)'), { kind: 'open', id: o.id }); } } }
      for (const os of Object.values(byW)) { os.sort((a, b) => a.abstand - b.abstand); for (let i = 1; i < os.length; i++) if (os[i - 1].abstand + os[i - 1].breite > os[i].abstand + 1) add('warn', 'Öffnungen überlappen sich', { kind: 'open', id: os[i].id }); }
      // Räume gegen die Bestandsaufnahme
      const rs = GM.roomsWithMeta(g, f.raeume || []);
      for (const m of (f.raeume || [])) { if (!m.bestandsaufnahmeId) continue; const r = rs.find(x => x.bestandsaufnahmeId === m.bestandsaufnahmeId); const soll = m.soll ?? m.flaeche_m2;
        if (!r) { add('warn', 'Raum „' + m.name + '“ aus der Bestandsaufnahme fehlt im Modell', null); continue; }
        if (m.soll != null && Math.abs(r.flaeche_m2 - m.soll) > Math.max(0.1, 0.01 * m.soll)) add('warn', '„' + m.name + '“: ' + r.flaeche_m2.toFixed(2).replace('.', ',') + ' m² statt ' + Number(soll).toFixed(2).replace('.', ',') + ' m²', { kind: 'room', mitte: r.mitte }); }
      for (const r of rs) if (!r.bestandsaufnahmeId) add('info', 'Raum „' + r.name + '“ ist nur im Modell (' + r.flaeche_m2.toFixed(2).replace('.', ',') + ' m²)', { kind: 'room', mitte: r.mitte });
    }
    const stp = GM.stapeln(fs.map(f => ({ id: f.id, name: f.name, lageFrei: f.lageFrei, g: f })));
    for (const f of fs) if (stp[f.id] && stp[f.id].st === 'abw') out.push({ lv: 'info', geschoss: f.id, gname: f.name, text: 'Andere Außenmaße als das Bezugsgeschoss: bleibt wie gezeichnet stehen', sel: null });
    // Teile eines Geschosses ohne Geschoss darüber (Staffelgeschoss, eingeschossiger Anbau): dort liegt kein Dach aus dem Modell
    const mit = fs.filter(f => (f.waende || []).some(w => !GM.isHilf(w)));
    mit.slice(0, -1).forEach((f, i) => { const o = mit[i + 1], so = stp[o.id] || { dx: 0, dy: 0 }, sf = stp[f.id] || { dx: 0, dy: 0 }, uf = GM.umriss(f).map(q => [q[0] + sf.dx, q[1] + sf.dy]), uo = GM.umriss(o).map(q => [q[0] + so.dx, q[1] + so.dy]);
      if (uf.length < 3 || uo.length < 3) return; const xs = uf.map(q => q[0]), ys = uf.map(q => q[1]), s = 200; let frei = 0;
      for (let x = Math.min(...xs) + s / 2; x < Math.max(...xs); x += s) for (let y = Math.min(...ys) + s / 2; y < Math.max(...ys); y += s) if (GM.inPoly([x, y], uf) && !GM.inPoly([x, y], uo)) frei += s * s;
      if (frei > 2e6) out.push({ lv: 'info', geschoss: f.id, gname: f.name, text: 'Rund ' + Math.round(frei / 1e6) + ' m² ohne ' + (o.name || 'Geschoss') + ' darüber: dort grenzt die Decke an Außenluft (Flachdach oder Terrasse in Raumtool anlegen)', sel: null }); });
    return out;
  }

  /* Öffnungen in den tatsächlichen Wandkörper rücken (Wandenden sind an Stößen gekürzt) */
  function einruecken(g) {
    const E = wallEnds(g), N = new Map(g.knoten.map(n => [n.id, n])); let ch = false;
    const os = (g.oeffnungen || []).map(o => { const w = o.wand && g.waende.find(x => x.id === o.wand); if (!w || GM.isHilf(w) || E.links.has(w.id)) return o; const a = N.get(w.a), b = N.get(w.b), L = Math.hypot(b.x - a.x, b.y - a.y), e = E.get(w.id), x0 = -e.a, x1 = L + e.b;
      const br = Math.min(o.breite, Math.max(200, x1 - x0 - 20)), ab = Math.round(Math.max(x0 + 10, Math.min(x1 - br - 10, o.abstand)));
      if (br === o.breite && ab === o.abstand) return o; ch = true; return { ...o, breite: br, abstand: ab }; });
    return ch ? { ...g, oeffnungen: os } : g;
  }

  /* Was nach dem IFC-Import in Raumtool 3D noch von Hand zu tun ist (Raumtool übernimmt diese Angaben nicht aus der IFC,
     Tests vom 25.11.2026). Liefert Abschnitte [{ titel, punkte: [text] }]; leere Abschnitte fallen weg. */
  function nacharbeit(doc, opts = {}) {
    const fs = (doc.geschosse || []).filter(f => (f.waende || []).some(w => !GM.isHilf(w))), out = [], m = v => String(Math.round(v) / 1000).replace('.', ','), cm = v => String(Math.round(v / 10 * 10) / 10).replace('.', ',');
    const DA = doc.dach ? GM.dach(doc, doc.dach) : null;
    out.push({ titel: 'Geschosse: Rohdecke eintragen', punkte: fs.map((f, i) => { const rd = f.rohdecke_mm, nx = fs[i + 1];
      return (f.name || f.id) + ': Niveau ' + m(f.niveau_mm || 0) + ' m, Geschosshöhe ' + m(nx && nx.niveau_mm != null && f.niveau_mm != null ? nx.niveau_mm - f.niveau_mm : f.geschossHoehe_mm || 2800) + ' m, Rohdecke ' + (rd ? cm(rd) + ' cm' : 'nicht erfasst') + (rd && Math.abs(rd - 250) < 5 ? ' (wie Raumtool-Vorgabe)' : ''); }) });
    const rp = []; fs.forEach(f => { const rs = GM.roomsWithMeta(f, f.raeume || []); rs.forEach(r => { if (r.beheizt === 'nein') rp.push((f.name || '') + ' ' + r.name + ': unbeheizt'); else if (r.temp != null && Number(r.temp) !== 20) rp.push((f.name || '') + ' ' + r.name + ': ' + String(r.temp).replace('.', ',') + ' °C'); }); });
    if (rp.length) out.push({ titel: 'Räume: Konditionierung prüfen (Raum-Zonen sind angelegt)', punkte: rp });
    if (DA) { const dp = []; if (DA.bezug === 'boden') dp.push('Ausgebautes Dach: „Dicke der Konstruktion“ bei 15 cm lassen, sonst stimmen Dachunterseite und Raumvolumen nicht.');
      const liste = GM.dachFlaechenListe(DA, opts.nord); (DA.fenster || []).forEach((w, i) => { const fl = liste.find(x => x.k === w.flaeche); dp.push('Dachfenster ' + (i + 1) + ': ' + cm(w.breite) + ' × ' + cm(w.hoehe) + ' cm, Unterkante ' + cm(w.unterkante == null ? 1000 : w.unterkante) + ' cm über Rohfußboden, ' + (fl ? 'Dachfläche ' + fl.nr + ' (fällt nach ' + fl.richtung + ', ' + fl.neigung + '°)' : 'Dachfläche ' + (w.flaeche + 1))); });
      if (dp.length) out.push({ titel: 'Dach', punkte: dp }); }
    const pr = pruefen(doc).filter(x => x.lv === 'warn' || /ohne .* darüber/.test(x.text)); if (pr.length) out.push({ titel: 'Aus der Prüfung', punkte: pr.map(x => (x.gname ? x.gname + ': ' : '') + x.text) });
    return out; }
  function nacharbeitText(doc, opts = {}) { return ['Nacharbeit in Raumtool 3D – ' + (opts.titel || doc.name || doc.id || 'Projekt'), ''].concat(...nacharbeit(doc, opts).map(a => [a.titel, ...a.punkte.map(p => '  – ' + p), ''])).join('\r\n'); }
  const api = { einruecken, pruefen, nacharbeit, nacharbeitText, exportIFC, wallEnds, guid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GMIFC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
