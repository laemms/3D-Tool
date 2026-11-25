/* IFC-Export prüfen: Wandkörper ohne Überschneidung und ohne Lücken, Datei mit web-ifc lesbar */
const assert = require('assert');
const path = '/tmp/nm/node_modules/';
const GM = require('../src/core.js'); globalThis.GM = GM;
const { exportIFC, wallEnds } = require('../src/ifc.js');
const pc = require(path + 'polygon-clipping');
const p = require('../fixtures/beispiel.json');
const model = { id: p.id, projektName: p.name, geschosse: p.geschosse.map(f => { const r = GM.fromBestandsaufnahme(p, f); return { id: f.id, name: f.name, geschossHoehe_mm: 2800, knoten: r.graph.knoten, waende: r.graph.waende, oeffnungen: r.graph.oeffnungen, raeume: r.raeume.map(x => ({ name: x.bestandsaufnahme.name, temp: x.bestandsaufnahme.temp, beheizt: x.bestandsaufnahme.beheizt, bestandsaufnahmeId: x.bestandsaufnahme.id, mitte: GM.centroid(x.kontur) })) }; }) };

// Wandkörper wie im Export (mit Verlängerungen) als Grundrissflächen
function bodies(f) { const N = new Map(f.knoten.map(n => [n.id, n])), E = wallEnds(f); return f.waende.map(w => { const a = N.get(w.a), b = N.get(w.b), d = [b.x - a.x, b.y - a.y], L = Math.hypot(...d), u = [d[0] / L, d[1] / L], S = [-u[1], u[0]], ts = w.ts == null ? w.t / 2 : w.ts, e = E.get(w.id), A = [a.x - u[0] * e.a, a.y - u[1] * e.a], B = [b.x + u[0] * e.b, b.y + u[1] * e.b]; return [[[A[0] + S[0] * ts, A[1] + S[1] * ts], [B[0] + S[0] * ts, B[1] + S[1] * ts], [B[0] - S[0] * (w.t - ts), B[1] - S[1] * (w.t - ts)], [A[0] - S[0] * (w.t - ts), A[1] - S[1] * (w.t - ts)]]]; }); }
const area = mp => mp.reduce((s, poly) => s + poly.reduce((t, ring, i) => t + (i ? -1 : 1) * Math.abs(GM.signedArea(ring.slice(0, -1))), 0), 0);
function check(f, strict) {
  const bs = bodies(f), sum = bs.reduce((s, b) => s + Math.abs(GM.signedArea(b[0])), 0), uni = pc.union(...bs), overlap = (sum - area(uni)) / 1e6;
  const rooms = GM.rooms(f).map(r => [r.kontur]), all = pc.union(...bs, ...rooms), holes = all.reduce((s, poly) => s + poly.length - 1, 0);
  const inRoom = (area(uni) + rooms.reduce((s, r) => s + Math.abs(GM.signedArea(r[0])), 0) - area(all)) / 1e6;
  console.log(`${f.name}: Wände ${bs.length}, Räume ${rooms.length}, Überschneidung Wände ${overlap.toFixed(4)} m², Wand in Raum ${inRoom.toFixed(4)} m², Löcher ${holes}`);
  if (strict) { assert.ok(Math.abs(overlap) < 0.001, 'Wände überschneiden sich: ' + overlap); assert.ok(Math.abs(inRoom) < 0.001, 'Wände ragen in Räume: ' + inRoom); }
  assert.strictEqual(holes, 0, 'Lücken in den Wänden');
}
// sauber gezeichnetes Haus: Außenkontur 10 × 8 m (Maße innen, Achse innen), Innenwände mit T-Stößen
{
  let g = { knoten: [], waende: [], oeffnungen: [] }; const A = { t: 365, ts: 0, ext: true };
  g = GM.edit.addWall(g, [0, 0], [10000, 0], A); g = GM.edit.addWall(g, [10000, 0], [10000, 8000], A); g = GM.edit.addWall(g, [10000, 8000], [0, 8000], A); g = GM.edit.addWall(g, [0, 8000], [0, 0], A);
  g = GM.edit.addWall(g, [4000, 0], [4000, 8000], { t: 115 }); g = GM.edit.addWall(g, [4000, 5000], [10000, 5000], { t: 175 });
  g = GM.edit.addWall(g, [0, 3000], [7000, 3000], { t: 115 }); g = GM.edit.addWall(g, [7000, 0], [7000, 5000], { t: 240 }); // Kreuzungen
  check({ name: 'Testhaus', ...g }, true);
}
{ const o = require('./core.test.js').offen, f = x => exportIFC({ id: 't', geschosse: [o] }, x), n = (t, re) => (t.match(re) || []).length;
  assert.strictEqual(n(f(), /'Raumtrennung Essen \/ Wohnen',\$,'Virtuelle Wand'/g), 1, 'Trennwand für offenen Übergang fehlt');
  assert.strictEqual(n(f({ trennung: 'virtuell' }), /IFCVIRTUALELEMENT/g), 1); assert.strictEqual(n(f({ trennung: 'aus' }), /Raumtrennung/g), 0);
  console.log('ok  Offener Übergang: Trennwand 2 cm im IFC');
  const t2 = exportIFC({ id: 't', bodenplatte_mm: 250, geschosse: [{ ...o, niveau_mm: -20, rohdecke_mm: 300, geschossHoehe_mm: 2800, lichteHoehe_mm: 2500, raeume: o.raeume.map((r, i) => ({ ...r, hoehe_mm: i ? null : 2590 })) }] });
  assert.strictEqual(n(t2, /IFCSLAB\(/g), 2, 'Decke und Bodenplatte'); assert.ok(/\.ELEMENT\.,-0\.02\)/.test(t2), 'Niveau aus Höhenmodell');
  assert.ok(/'LichteHoehe',\$,IFCLENGTHMEASURE\(2\.59\)/.test(t2) && /'LichteHoehe',\$,IFCLENGTHMEASURE\(2\.5\)/.test(t2), 'Raumhöhe je Raum');
  console.log('ok  Höhen: Niveau, Raumhöhe, Decke und Bodenplatte');
  const w0 = o.waende.find(w => w.ext && !GM.isHilf(w)), t3 = exportIFC({ id: 't', geschosse: [{ ...o, oeffnungen: [{ id: 'f1', wand: w0.id, typ: 'fenstertuer', abstand: 100, breite: 1000, hoehe: 2100, brh: 0 }, { id: 'f2', wand: w0.id, typ: 'aussentuer', abstand: 1300, breite: 900, hoehe: 2000, brh: 0 }] }] });
  assert.strictEqual(n(t3, /IFCWINDOW\(/g), 1, 'Fenstertür als Fenster'); assert.strictEqual(n(t3, /IFCDOOR\(/g), 1);
  console.log('ok  Fenstertür als IfcWindow');
  const t4 = exportIFC({ id: 't', geschosse: [{ ...o, oeffnungen: [{ id: 'd', wand: w0.id, typ: 'innentuer', abstand: -1000, breite: 885, hoehe: 2010, brh: 0 }] }] });
  assert.ok(!/IFCCARTESIANPOINT\(\(-1\.,/.test(t4) && /IFCOPENINGELEMENT/.test(t4), 'Öffnung beginnt vor der Wand');
  console.log('ok  Öffnung bleibt im Wandkörper');
  const t5 = exportIFC({ id: 't', geschosse: [{ ...o, niveau_mm: 0, geschossHoehe_mm: 2800 }], dach: { form: 'sattel', neigung: 35, first: 'lang', kniestock: 800, ueberTraufe: 400, ueberOrtgang: 300, dicke: 250, bezug: 'decke' } });
  assert.strictEqual(n(t5, /IFCROOF\(/g), 1); assert.strictEqual(n(t5, /\.ROOF\.\)/g), 2); assert.strictEqual(n(t5, /IFCBUILDINGELEMENTPROXY\(/g), 4);
  assert.strictEqual(n(exportIFC({ id: 't', geschosse: [{ ...o, niveau_mm: 0, geschossHoehe_mm: 2800 }], dach: { form: 'pult', neigung: 10, kniestock: 300, dicke: 250, bezug: 'decke' } }), /\.ROOF\.\)/g), 1);
  console.log('ok  Dach: IfcRoof mit zwei Dachflächen, Giebel und Kniestock');
  const t6 = exportIFC({ id: 't', geschosse: [{ ...o, raeume: o.raeume.map((r, i) => ({ ...r, beheizt: i ? 'ja' : 'nein', temp: i ? 20 : null })) }] });
  assert.ok(/IFCZONE\('[^']*',#\d+,'Unbeheizt'/.test(t6) && /IFCZONE\('[^']*',#\d+,'Beheizt 20 \\X2\\00B0\\X0\\C'/.test(t6), 'Zonen nach Beheizung'); assert.strictEqual(n(t6, /IFCRELASSIGNSTOGROUP/g), 2);
  console.log('ok  Raumzonen nach Beheizung (Raumtool: Raum-Zone)');
  const { pruefen, einruecken } = require('../src/ifc.js'), w1 = o.waende.find(w => w.ext && !GM.isHilf(w));
  assert.strictEqual(pruefen({ geschosse: [o] }).filter(x => x.lv === 'warn').length, 0, 'sauberes Geschoss ohne Hinweise');
  const o2 = { ...o, oeffnungen: [{ id: 'x', wand: w1.id, typ: 'fenster', abstand: -300, breite: 1000, hoehe: 1200, brh: 900 }, { id: 'y', wand: w1.id, typ: 'fenster', abstand: 500, breite: 1000, hoehe: 1200, brh: 900 }] };
  const pr = pruefen({ geschosse: [o2] }).map(x => x.text).join(' | '); assert.ok(/ragt/.test(pr) && /überlappen/.test(pr), pr);
  assert.ok(einruecken(o2).oeffnungen[0].abstand > -300, 'einrücken'); assert.ok(!pruefen({ geschosse: [einruecken(o2)] }).some(x => /ragt/.test(x.text)), 'nach dem Einrücken nichts mehr über der Wand');
  let g = { knoten: [], waende: [], oeffnungen: [] }; g = GM.edit.addWall(g, [0, 0], [5000, 0], { t: 300, ts: 150 }); g = GM.edit.addWall(g, [0, 100], [5000, 100], { t: 300, ts: 150 });
  assert.ok(pruefen({ geschosse: [{ id: 'x', name: 'X', ...g }] }).some(x => /überschneiden/.test(x.text)), 'Überschneidung erkannt');
  console.log('ok  Prüfung: Überschneidung, Öffnung über Wand, Überlappung'); }
{ const q = require('./core.test.js').querwand; check({ ...q, name: 'Querwände (OG-Typ)' }, true); }
console.log('Beispiel-EFH 1978 (Altdaten: Bad und Wohnen überlappen diagonal):');
for (const f of model.geschosse) check(f, f.name === 'KG');
const txt = exportIFC(model, { zeit: Date.UTC(2026, 10, 25), bearbeiter: 'Test' });
require('fs').writeFileSync('/tmp/beispiel.ifc', txt);
assert.strictEqual(exportIFC(model, { zeit: Date.UTC(2026, 10, 25), bearbeiter: 'Test' }), txt, 'Export ist nicht stabil');
(async () => {
  const WebIFC = require(path + 'web-ifc/web-ifc-api-node.js'), api = new WebIFC.IfcAPI(); await api.Init();
  const id = api.OpenModel(new Uint8Array(Buffer.from(txt)));
  const cnt = t => api.GetLineIDsWithType(id, t).size();
  const c = { Geschosse: cnt(WebIFC.IFCBUILDINGSTOREY), Wände: cnt(WebIFC.IFCWALLSTANDARDCASE), Öffnungen: cnt(WebIFC.IFCOPENINGELEMENT), Fenster: cnt(WebIFC.IFCWINDOW), Türen: cnt(WebIFC.IFCDOOR), Räume: cnt(WebIFC.IFCSPACE) };
  let meshes = 0; api.StreamAllMeshes(id, () => { meshes++; });
  console.log('web-ifc:', JSON.stringify(c), 'Körper mit Geometrie:', meshes, 'Bytes', txt.length);
  assert.deepStrictEqual([c.Geschosse, c.Wände, c.Räume], [2, 22, 5]); assert.strictEqual(c.Öffnungen, c.Fenster + c.Türen);
  assert.ok(meshes >= c.Wände + c.Fenster + c.Türen, 'nicht alle Körper erzeugen Geometrie'); // web-ifc streamt Räume und Öffnungen nicht
  api.CloseModel(id);
  // Satteldach steht in beiden Firstrichtungen aufrecht (Oberkante über der Traufe)
  const o = require('./core.test.js').offen;
  for (const first of ['lang', 'quer']) for (const dachPrisma of [true, false]) {
    const t = exportIFC({ id: 't', geschosse: [{ ...o, niveau_mm: 0, geschossHoehe_mm: 2800 }], dach: { form: 'sattel', neigung: 35, first, kniestock: 0, ueberTraufe: 400, ueberOrtgang: 300, dicke: 250, bezug: 'decke' } }, { dachPrisma });
    const m = api.OpenModel(new Uint8Array(Buffer.from(t))); let lo = 1e9, hi = -1e9;
    api.StreamAllMeshes(m, ms => { const ln = api.GetLine(m, ms.expressID); if (ln.type !== WebIFC.IFCSLAB || !/Satteldach|Dachfl/.test(ln.Name && ln.Name.value)) return;
      for (let i = 0; i < ms.geometries.size(); i++) { const pg = ms.geometries.get(i), g = api.GetGeometry(m, pg.geometryExpressID), v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()), T = pg.flatTransformation;
        for (let k = 0; k < v.length; k += 6) { const y = T[1] * v[k] + T[5] * v[k + 1] + T[9] * v[k + 2] + T[13]; lo = Math.min(lo, y); hi = Math.max(hi, y); } } });
    api.CloseModel(m); assert.ok(lo > 2.0 && hi > 4.5, 'Satteldach (First ' + first + (dachPrisma ? ', Prisma' : ', Flächen') + ') steht falsch: ' + lo.toFixed(2) + '…' + hi.toFixed(2));
  }
  console.log('ok  Satteldach in beiden Firstrichtungen aufrecht');
  // ausgebautes Dach: Wände des Dachgeschosses enden an der Dachunterseite (web-ifc rechnet den Schnitt)
  const n = (t, re) => (t.match(re) || []).length;
  for (const form of ['sattel', 'walm']) {
    const doc = { id: 't', geschosse: [{ ...o, niveau_mm: 0, geschossHoehe_mm: 2800 }], dach: { form, neigung: 45, first: 'lang', kniestock: 1000, ueberTraufe: 400, ueberOrtgang: 300, dicke: 250, bezug: 'boden' } };
    const t = exportIFC(doc), DA = GM.dach(doc, doc.dach); assert.ok(n(t, /IFCBOOLEANCLIPPINGRESULT/g) > 0 && /'Body','Clipping'/.test(t), 'kein Schnitt am Dach (' + form + ')');
    if (form === 'walm') assert.ok(/\.HIP_ROOF\./.test(t) && n(t, /\.ROOF\.\)/g) === 4, 'Walmdach: vier Dachflächen');
    const m = api.OpenModel(new Uint8Array(Buffer.from(t))); let over = 0, lo = 1e9, walls = 0;
    api.StreamAllMeshes(m, ms => { const ln = api.GetLine(m, ms.expressID); if (ln.type !== WebIFC.IFCWALLSTANDARDCASE) return; walls++; let hi = -1e9;
      for (let i = 0; i < ms.geometries.size(); i++) { const pg = ms.geometries.get(i), g = api.GetGeometry(m, pg.geometryExpressID), v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()), T = pg.flatTransformation;
        for (let k = 0; k < v.length; k += 6) { const P = [0, 1, 2].map(j => T[j] * v[k] + T[4 + j] * v[k + 1] + T[8 + j] * v[k + 2] + T[12 + j]), z = P[1] * 1000; hi = Math.max(hi, z);
          over = Math.max(over, z - GM.dachUnten(DA, P[0] * 1000, P[2] * 1000)); } } lo = Math.min(lo, hi); });
    api.CloseModel(m); assert.ok(walls > 0 && over < 15, form + ': Wand ragt ' + Math.round(over) + ' mm über die Dachunterseite'); assert.ok(lo < 1500, form + ': Traufwand nicht gekürzt (' + Math.round(lo) + ')');
  }
  console.log('ok  Ausgebautes Dach: Wände enden an der Dachunterseite (Satteldach, Walmdach)');
  // Profile ohne Selbstüberschneidung (Fehler 25.11.2026: Dachfläche als Schleife, Raumtool 3D legte die Fläche flach)
  { const crossing = pts => { const n = pts.length, cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      for (let i = 0; i < n; i++) for (let k = i + 2; k < n; k++) { if (i === 0 && k === n - 1) continue; const [a, b, c, d] = [pts[i], pts[(i + 1) % n], pts[k], pts[(k + 1) % n]];
        if (cr(a, b, c) * cr(a, b, d) < -1e-12 && cr(c, d, a) * cr(c, d, b) < -1e-12) return true; } return false; };
    for (const form of ['sattel', 'walm', 'zelt', 'pult']) for (const fl of [true, false]) {
      const doc = { id: 't', geschosse: [{ ...o, niveau_mm: 0, geschossHoehe_mm: 2800 }], dach: { form, neigung: 40, first: 'lang', kniestock: 500, ueberTraufe: 400, ueberOrtgang: 300, dicke: 250, bezug: 'decke' } };
      const t = exportIFC(doc, { dachPrisma: !fl }), L = {}; t.split(/\r?\n/).forEach(l => { const m = /^#(\d+)=(.*);$/.exec(l); if (m) L[m[1]] = m[2]; });
      for (const id in L) { const m = /^IFCARBITRARYCLOSEDPROFILEDEF\(\.AREA\.,\$,#(\d+)\)/.exec(L[id]); if (!m) continue;
        const pts = L[m[1]].match(/#\d+/g).slice(0, -1).map(r => L[r.slice(1)].match(/-?[\d.]+(E-?\d+)?/g).map(Number));
        assert.ok(!crossing(pts), form + ': Profil #' + m[1] + ' überschneidet sich selbst'); } }
    // L-Grundriss: mehrteiliges Dach, jede sichtbare Fläche eine Dachplatte, Profile einfach
    { let g = { knoten: [], waende: [], oeffnungen: [] }; const L = [[0, 0], [12000, 0], [12000, 8000], [9000, 8000], [9000, 13000], [4000, 13000], [4000, 8000], [0, 8000]];
      L.forEach((p, i) => { g = GM.edit.addWall(g, p, L[(i + 1) % L.length], { t: 365, ts: 0, ext: true }); });
      for (const [form, bezug] of [['sattel', 'decke'], ['walm', 'boden']]) { const doc = { id: 'L', geschosse: [{ id: 'eg', name: 'EG', ...g, niveau_mm: 0, geschossHoehe_mm: 2800, rohdecke_mm: 250 }], dach: { form, neigung: 40, kniestock: 500, ueberTraufe: 500, ueberOrtgang: 400, dicke: 300, bezug } };
        const t = exportIFC(doc), DA = GM.dach(doc, doc.dach), Lx = {}; assert.strictEqual(n(t, /\.ROOF\.\)/g), DA.flaechen.length, 'L: Dachplatten');
        t.split(/\r?\n/).forEach(l => { const m = /^#(\d+)=(.*);$/.exec(l); if (m) Lx[m[1]] = m[2]; });
        for (const id in Lx) { const m = /^IFCARBITRARYCLOSEDPROFILEDEF\(\.AREA\.,\$,#(\d+)\)/.exec(Lx[id]); if (!m) continue; const pts = Lx[m[1]].match(/#\d+/g).slice(0, -1).map(r => Lx[r.slice(1)].match(/-?[\d.]+(E-?\d+)?/g).map(Number)); assert.ok(!crossing(pts), 'L ' + form + ': Profil überschneidet sich'); }
        if (bezug === 'boden') assert.ok(n(t, /'Oberste Geschossdecke/g) >= 1 && !/IFCBOOLEANCLIPPINGRESULT/.test(t), 'L ausgebaut: Kehlbalkenlage je Teil, kein Halbraum-Schnitt'); } }
    console.log('ok  Profile ohne Selbstüberschneidung (alle Dachformen, L-Grundriss)'); }
  { const { pruefen } = require('../src/ifc.js'), w1 = o.waende.find(w => w.ext && !GM.isHilf(w)), fen = { id: 'f', wand: w1.id, typ: 'fenster', abstand: 1000, breite: 1000, hoehe: 1200, brh: 900 };
    const mk = bezug => ({ id: 't', geschosse: [{ ...o, oeffnungen: [fen], niveau_mm: 0, geschossHoehe_mm: 2800, rohdecke_mm: 250 }], dach: { form: 'walm', neigung: 45, kniestock: 1000, ueberTraufe: 400, dicke: 250, bezug } });
    assert.ok(pruefen(mk('boden')).some(x => /Dachschräge/.test(x.text)), 'Fenster in der Dachschräge nicht gemeldet'); assert.ok(!pruefen(mk('decke')).some(x => /Dachschräge/.test(x.text)));
    // Kehlbalkenlage nur dort, wo das Dach höher liegt
    const t = exportIFC(mk('boden')), sl = /IFCSLAB\('[^']*',#\d+,'Oberste Geschossdecke/.test(t), tw = exportIFC({ ...mk('boden'), dach: { ...mk('boden').dach, neigung: 15 } });
    assert.ok(sl && !/'Oberste Geschossdecke/.test(tw), 'Kehlbalkenlage: flaches Dach darf keine Decke haben');
    console.log('ok  Ausgebautes Dach: Fenster in der Schräge gemeldet, Kehlbalkenlage beschnitten');
    // Dachflächenfenster: Öffnung in der Dachplatte, Fenster liegt in der Dachfläche
    const dd = mk('boden'); dd.dach.fenster = [{ flaeche: 0, unterkante: 1000, breite: 780, hoehe: 1180 }]; const DA = GM.dach(dd, dd.dach), w = DA.fenster[0];
    assert.ok(w && Math.abs(Math.hypot(...[0, 1, 2].map(i => w.ecken[3][i] - w.ecken[0][i])) - 1180) < 1 && Math.abs(w.ecken[0][2] - (1000 + DA.ebenen[0].dz)) < 1, 'Dachfenster-Geometrie');
    const td = exportIFC(dd); assert.ok(/IFCWINDOW\('[^']*',#\d+,'Dachfenster'/.test(td) && /IFCOPENINGELEMENT\('[^']*',#\d+,'\\X2\\00D6\\X0\\ffnung Dachfenster'/.test(td), 'Dachfenster im IFC');
    console.log('ok  Dachflächenfenster: Öffnung in der Dachplatte'); } console.log('IFC geprüft');
})().catch(e => { console.error(e); process.exit(1); });
