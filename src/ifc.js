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
    const S = t => "'" + String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, c => '\\X2\\' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + '\\X0\\') + "'";
    const pid = model.id || 'projekt', G = k => guid(pid + '|' + k);
    const P2 = (x, y) => E(`IFCCARTESIANPOINT((${R(x)},${R(y)}))`), P3 = (x, y, z) => E(`IFCCARTESIANPOINT((${R(x)},${R(y)},${R(z)}))`), D3 = (x, y, z) => E(`IFCDIRECTION((${R(x)},${R(y)},${R(z)}))`);
    const org = E(`IFCORGANIZATION($,${S(opts.organisation || 'cL-energiePlan')},$,$,$)`), per = E(`IFCPERSON($,${S(opts.bearbeiter || '')},$,$,$,$,$,$)`), po = E(`IFCPERSONANDORGANIZATION(${per},${org},$)`);
    const app = E(`IFCAPPLICATION(${org},'A','Gebaeudemodell','GM')`), oh = E(`IFCOWNERHISTORY(${po},${app},$,.ADDED.,$,$,$,${Math.floor((opts.zeit || Date.now()) / 1000)})`);
    const un = E(`IFCUNITASSIGNMENT((${[['LENGTHUNIT', 'METRE'], ['AREAUNIT', 'SQUARE_METRE'], ['VOLUMEUNIT', 'CUBIC_METRE'], ['PLANEANGLEUNIT', 'RADIAN'], ['THERMODYNAMICTEMPERATUREUNIT', 'DEGREE_CELSIUS']].map(u => E(`IFCSIUNIT(*,.${u[0]}.,$,.${u[1]}.)`)).join(',')}))`);
    const zd = D3(0, 0, 1), xd = D3(1, 0, 0), na = (Number(opts.nord) || 0) * Math.PI / 180;
    const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${E(`IFCAXIS2PLACEMENT3D(${P3(0, 0, 0)},${zd},${xd})`)},${E(`IFCDIRECTION((${R(Math.sin(na))},${R(Math.cos(na))}))`)})`);
    const LP = (rel, x, y, z, dx, dy) => E(`IFCLOCALPLACEMENT(${rel || '$'},${E(`IFCAXIS2PLACEMENT3D(${P3(x, y, z)},${zd},${dx == null ? xd : D3(dx, dy, 0)})`)})`);
    const poly2 = q => { const pl = q.map(c => P2(c[0], c[1])); pl.push(pl[0]); return E(`IFCPOLYLINE((${pl.join(',')}))`); };
    const EX = (q, h, z0) => E(`IFCEXTRUDEDAREASOLID(${E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly2(q)})`)},${E(`IFCAXIS2PLACEMENT3D(${P3(0, 0, z0 || 0)},${zd},${xd})`)},${zd},${R(h)})`);
    const SH = (body, axis) => E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${(axis ? axis + ',' : '') + E(`IFCSHAPEREPRESENTATION(${ctx},'Body','SweptSolid',(${body}))`)}))`);
    const PS = (obj, name, props, key) => { const ps = props.filter(x => x[2] != null).map(x => E(`IFCPROPERTYSINGLEVALUE(${S(x[0])},$,${x[1]}(${x[2]}),$)`)); if (ps.length) E(`IFCRELDEFINESBYPROPERTIES(${G('rd|' + key)},${oh},$,$,(${obj}),${E(`IFCPROPERTYSET(${G('ps|' + key)},${oh},${S(name)},$,(${ps.join(',')}))`)})`); };
    const B = v => (v ? '.T.' : '.F.'), AG = (par, ch, key) => { if (ch.length) E(`IFCRELAGGREGATES(${G('ag|' + key)},${oh},$,$,${par},(${ch.join(',')}))`); };
    const ccw = q => (GM.signedArea(q) < 0 ? q.slice().reverse() : q), W = c => [c[0] / 1000, -c[1] / 1000];

    const proj = E(`IFCPROJECT(${G('projekt')},${oh},${S(model.projektName || pid)},$,$,$,$,(${ctx}),${un})`), lp0 = LP(null, 0, 0, 0);
    const site = E(`IFCSITE(${G('site')},${oh},${S('Grundstück')},$,$,${lp0},$,$,.ELEMENT.,$,$,$,$,$)`), lpB = LP(lp0, 0, 0, 0), bld = E(`IFCBUILDING(${G('building')},${oh},${S(model.projektName || pid)},$,$,${lpB},$,$,.ELEMENT.,$,$,$)`);
    AG(proj, [site], 'p'); AG(site, [bld], 's');

    // Geschosshöhen: Bezug Erdgeschoss = 0, darunter negativ
    const fs = model.geschosse || [], iEG = Math.max(0, fs.findIndex(f => /^(eg|erd)/i.test(f.name || ''))), elev = []; let z = 0;
    for (let i = iEG; i < fs.length; i++) { elev[i] = z; z += fs[i].geschossHoehe_mm || 2800; }
    z = 0; for (let i = iEG - 1; i >= 0; i--) { z -= fs[i].geschossHoehe_mm || 2800; elev[i] = z; }
    fs.forEach((f, i) => { if (f.niveau_mm != null) elev[i] = f.niveau_mm; }); // Höhenmodell der Bestandsaufnahme (OKFF)
    const storeys = [], mat = {}, matOf = (t, sense, off) => { const k = t + '|' + sense + '|' + off; if (!mat[k]) mat[k] = E(`IFCMATERIALLAYERSETUSAGE(${E(`IFCMATERIALLAYERSET((${E(`IFCMATERIALLAYER(${E(`IFCMATERIAL(${S('Wand ' + R(t / 10) + ' cm')})`)},${M(t)},$)`)}),${S('Wand ' + R(t / 10) + ' cm')})`)},.AXIS2.,.${sense}.,${M(off)})`); return mat[k]; }, matRel = new Map();
    let raumNr = 0;
    fs.forEach((f, fi) => {
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
        const wall = E(`IFCWALLSTANDARDCASE(${G('w|' + f.id + '|' + w.id)},${oh},${S((w.ext ? 'Außenwand ' : 'Innenwand ') + R(w.t / 10) + ' cm')},$,$,${lp},${SH(EX([[x0, yS], [x1, yS], [x1, yO], [x0, yO]], H / 1000, 0), axis)},$)`);
        els.push(wall);
        const mu = matOf(w.t, 'POSITIVE', -ts); if (!matRel.has(mu)) matRel.set(mu, []); matRel.get(mu).push(wall);
        PS(wall, 'Pset_WallCommon', [['IsExternal', 'IFCBOOLEAN', B(w.ext)], ['LoadBearing', 'IFCBOOLEAN', B(w.ext)]], 'wc|' + f.id + '|' + w.id);
        for (const o of g.oeffnungen.filter(x => x.wand === w.id)) {
          const tuer = /tuer/.test(o.typ || ''), xa = o.abstand / 1000, wb = o.breite / 1000, zb = (o.brh || 0) / 1000, hh = o.hoehe / 1000, key = f.id + '|' + o.id;
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
          const d = (opts.trennDicke || 20) / 1000, u = (opts.trennUeberstand == null ? 60 : opts.trennUeberstand) / 1000, el = E(`IFCWALLSTANDARDCASE(${G('vt|' + f.id + '|' + w.id)},${oh},${nm},$,${S('Virtuelle Wand')},${lp},${SH(EX([[-u, -d / 2], [Lm + u, -d / 2], [Lm + u, d / 2], [-u, d / 2]], H / 1000, 0), axis)},$)`);
          els.push(el); const mu = matOf(Math.round(d * 1000), 'POSITIVE', -d * 500); if (!matRel.has(mu)) matRel.set(mu, []); matRel.get(mu).push(el);
          PS(el, 'Pset_WallCommon', [['IsExternal', 'IFCBOOLEAN', B(false)], ['LoadBearing', 'IFCBOOLEAN', B(false)]], 'vc|' + f.id + '|' + w.id);
        } else {
          els.push(E(`IFCVIRTUALELEMENT(${G('vt|' + f.id + '|' + w.id)},${oh},${nm},$,$,${lp},${E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${axis}))`)},$)`));
        }
      }
      for (const r of rms) {
        raumNr++; const q = ccw(r.kontur.map(W)), key = f.id + '|' + raumNr;
        const s = E(`IFCSPACE(${G('sp|' + f.id + '|' + (r.bestandsaufnahmeId || r.mitte.join(',')))},${oh},${S(String(raumNr).padStart(2, '0'))},${S(r.nutzung || '')},$,${LP(lpS, 0, 0, 0)},${SH(EX(q, (r.hoehe_mm || lichte) / 1000, 0))},${S(r.name + (r.beheizt === 'nein' ? ' (unbeheizt)' : r.temp != null ? ' (' + String(r.temp).replace('.', ',') + ' °C)' : ''))},.ELEMENT.,.INTERNAL.,$)`);
        sp.push(s);
        PS(s, 'Pset_SpaceThermalDesign', [['HeatingDryBulb', 'IFCTHERMODYNAMICTEMPERATUREMEASURE', r.beheizt === 'nein' || r.temp == null ? null : R(r.temp)]], 'td|' + key);
        PS(s, 'Gebaeudemodell', [['Raumnummer', 'IFCINTEGER', raumNr], ['Flaeche', 'IFCAREAMEASURE', R(Math.round(r.flaeche_m2 * 100) / 100)], ['LichteHoehe', 'IFCLENGTHMEASURE', M(r.hoehe_mm || lichte)], ['Beheizt', 'IFCBOOLEAN', B(r.beheizt !== 'nein')]], 'gm|' + key);
      }
      // Rohdecke über dem Geschoss (bzw. oberste Geschossdecke) und Bodenplatte unter dem untersten Geschoss
      const um = f.umriss || GM.umriss(g), rd = f.rohdecke_mm;
      if (um.length >= 3 && rd > 0) {
        const q = ccw(um.map(W)), sl = E(`IFCSLAB(${G('sl|' + f.id)},${oh},${S((fi === fs.length - 1 ? 'Oberste Geschossdecke ' : 'Decke über ' + (f.name || 'Geschoss') + ' ') + R(rd / 10) + ' cm')},$,$,${LP(lpS, 0, 0, 0)},${SH(EX(q, rd / 1000, (H - rd) / 1000))},$,.FLOOR.)`);
        els.push(sl); PS(sl, 'Pset_SlabCommon', [['IsExternal', 'IFCBOOLEAN', B(fi === fs.length - 1)], ['LoadBearing', 'IFCBOOLEAN', B(true)]], 'slc|' + f.id);
      }
      if (fi === 0 && um.length >= 3 && model.bodenplatte_mm > 0) {
        const q = ccw(um.map(W)), bp = model.bodenplatte_mm, fb = f.fussboden_mm || 0, sl = E(`IFCSLAB(${G('bp|' + f.id)},${oh},${S('Bodenplatte ' + R(bp / 10) + ' cm')},$,$,${LP(lpS, 0, 0, 0)},${SH(EX(q, bp / 1000, -(fb + bp) / 1000))},$,.BASESLAB.)`);
        els.push(sl); PS(sl, 'Pset_SlabCommon', [['IsExternal', 'IFCBOOLEAN', B(true)], ['LoadBearing', 'IFCBOOLEAN', B(true)]], 'bpc|' + f.id);
      }
      AG(st, sp, 'sp|' + f.id);
      if (els.length) E(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${G('cs|' + f.id)},${oh},$,$,(${els.join(',')}),${st})`);
    });
    AG(bld, storeys, 'b');
    let mi = 0; for (const [mu, ws] of matRel) E(`IFCRELASSOCIATESMATERIAL(${G('am|' + (++mi))},${oh},$,$,(${ws.join(',')}),${mu})`);
    const now = new Date(opts.zeit || Date.now()).toISOString().slice(0, 19);
    return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');", `FILE_NAME(${S((model.projektName || pid) + '.ifc')},'${now}',(${S(opts.bearbeiter || '')}),(${S(opts.organisation || 'cL-energiePlan')}),'Gebaeudemodell','Gebaeudemodell','');`, "FILE_SCHEMA(('IFC2X3'));", 'ENDSEC;', 'DATA;', ...L, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\r\n');
  }

  const api = { exportIFC, wallEnds, guid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GMIFC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
