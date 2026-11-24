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
  check({ name: 'Testhaus', ...g }, true);
}
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
  api.CloseModel(id); console.log('IFC geprüft');
})().catch(e => { console.error(e); process.exit(1); });
