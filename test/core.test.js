const assert = require('assert');
const GM = require('../src/core.js');
const p = require('../fixtures/beispiel.json');
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('ok  ' + name); };

t('Rechteck aus 4 Wänden ergibt einen Raum mit Innenfläche', () => {
  // Achsmaß 5,00 × 4,00 m, Wanddicke 0,24 m → Innenmaß 4,76 × 3,76 m
  const s = (a, b) => ({ a, b, t: 240, ext: true });
  const g = GM.buildGraph([s([0, 0], [5000, 0]), s([5000, 0], [5000, 4000]), s([5000, 4000], [0, 4000]), s([0, 4000], [0, 0])]);
  const r = GM.rooms(g);
  assert.strictEqual(r.length, 1);
  assert.ok(Math.abs(r[0].flaeche_m2 - 4.76 * 3.76) < 1e-6, r[0].flaeche_m2);
});

t('Innenwand teilt das Rechteck in zwei Räume (T-Stöße werden geteilt)', () => {
  const s = (a, b, t) => ({ a, b, t, ext: true });
  const g = GM.buildGraph([s([0, 0], [6000, 0], 300), s([6000, 0], [6000, 4000], 300), s([6000, 4000], [0, 4000], 300), s([0, 4000], [0, 0], 300), s([2500, 0], [2500, 4000], 115)]);
  const r = GM.rooms(g).sort((a, b) => a.flaeche_m2 - b.flaeche_m2);
  assert.strictEqual(r.length, 2);
  const a1 = (2.5 - 0.15 - 0.0575) * 3.7, a2 = (3.5 - 0.15 - 0.0575) * 3.7;
  assert.ok(Math.abs(r[0].flaeche_m2 - a1) < 1e-6 && Math.abs(r[1].flaeche_m2 - a2) < 1e-6, JSON.stringify(r.map(x => x.flaeche_m2)));
});

t('Fangen: Endpunkte 20 mm daneben werden ein Knoten', () => {
  const s = (a, b) => ({ a, b, t: 240 });
  const g = GM.buildGraph([s([0, 0], [4000, 0]), s([4015, 12], [4000, 3000]), s([4000, 3000], [0, 3000]), s([0, 3000], [-10, 8])]);
  assert.strictEqual(g.knoten.length, 4); assert.strictEqual(GM.rooms(g).length, 1);
});

for (const f of p.geschosse) t('Beispiel-EFH 1978, ' + f.name + ': Rundlauf Räume → Wandgraph → Räume', () => {
  const res = GM.fromBestandsaufnahme(p, f);
  console.log('    Knoten ' + res.graph.knoten.length + ', Wände ' + res.graph.waende.length + ', Öffnungen ' + res.graph.oeffnungen.length);
  for (const q of res.quellraeume) {
    const m = res.raeume.find(r => r.bestandsaufnahme && r.bestandsaufnahme.id === q.id);
    console.log('    ' + q.name.padEnd(16) + ' Soll ' + q.flaeche_m2.toFixed(2) + ' m²  Ist ' + (m ? m.flaeche_m2.toFixed(2) : '—') + ' m²');
    assert.ok(m, 'Raum nicht erkannt: ' + q.name);
    assert.ok(Math.abs(m.flaeche_m2 - q.flaeche_m2) < 0.05, q.name + ': ' + m.flaeche_m2 + ' statt ' + q.flaeche_m2);
  }
});

t('Ausrichtung: Achse auf der Innenseite ergibt dieselbe Innenfläche', () => {
  // Achsen auf den Innenflächen eines 4,00 × 3,00 m Raums, Wände 0,36 m nach außen (ts auf der Außenseite)
  const s = (a, b) => ({ a, b, t: 360, ts: 0 });
  const g = GM.buildGraph([s([0, 0], [4000, 0]), s([4000, 0], [4000, 3000]), s([4000, 3000], [0, 3000]), s([0, 3000], [0, 0])]);
  const r = GM.rooms(g);
  assert.strictEqual(r.length, 1); assert.ok(Math.abs(r[0].flaeche_m2 - 12) < 1e-6, r[0].flaeche_m2);
});

t('Beispiel-EFH 1978, EG: keine Wandstücke unter 150 mm (Hilfskanten ausgenommen)', () => {
  const res = GM.fromBestandsaufnahme(p, p.geschosse[1]), N = new Map(res.graph.knoten.map(n => [n.id, n]));
  const kurz = res.graph.waende.filter(w => !GM.isHilf(w)).map(w => Math.hypot(N.get(w.b).x - N.get(w.a).x, N.get(w.b).y - N.get(w.a).y)).filter(l => l < 150);
  console.log('    Wände ' + res.graph.waende.length + ', kurze ' + kurz.length + ' (' + kurz.map(Math.round).join(', ') + ' mm), Restflächen ' + res.restflaechen.length);
  assert.ok(kurz.length === 0, 'kurze Wände: ' + kurz.length);
});
console.log(ok + ' Tests bestanden');

// ---- Bearbeiten ----
{
  let g = GM.buildGraph([]); g.oeffnungen = [];
  const A = { t: 365, ts: 0, ext: true };
  g = GM.edit.addWall(g, [0, 0], [8000, 0], A); g = GM.edit.addWall(g, [8000, 0], [8000, 6000], A); g = GM.edit.addWall(g, [8000, 6000], [0, 6000], A); g = GM.edit.addWall(g, [0, 6000], [10, 15], A);
  t('Editor: geschlossene Kontur aus 4 gezeichneten Wänden ist ein Raum', () => { const r = GM.rooms(g); assert.strictEqual(g.knoten.length, 4); assert.strictEqual(r.length, 1); });
  const w0 = g.waende.find(w => Math.abs(g.knoten.find(n => n.id === w.a).y) < 100 && Math.abs(g.knoten.find(n => n.id === w.b).y) < 100);
  g = GM.edit.addOpening(g, w0.id, 4000, { typ: 'fenster', breite: 1200, hoehe: 1400, brh: 900 });
  g = GM.edit.addWall(g, [3000, 0], [3000, 6000], { t: 115 });
  t('Editor: Innenwand teilt den Raum, Fenster bleibt an seiner Stelle', () => {
    assert.strictEqual(GM.rooms(g).length, 2); assert.strictEqual(g.oeffnungen.length, 1);
    const p0 = GM.openingPoints(g)[0].m; assert.ok(Math.abs(p0[0] - 4000) < 10 && Math.abs(p0[1]) < 10, JSON.stringify(p0));
  });
  t('Editor: Knoten verschieben und Wand löschen', () => {
    const n = g.knoten.find(k => Math.abs(k.x - 3000) < 10 && Math.abs(k.y - 6000) < 10); const g2 = GM.edit.moveNode(g, n.id, 3500, 6000);
    assert.strictEqual(GM.rooms(g2).length, 2);
    const iw = g2.waende.find(w => w.t === 115); const g3 = GM.edit.deleteWall(g2, iw.id);
    assert.strictEqual(GM.rooms(g3).length, 1); assert.strictEqual(g3.oeffnungen.length, 1);
  });
  t('Editor: Raumnamen bleiben nach Änderungen erhalten', () => {
    const r1 = GM.roomsWithMeta(g, []); r1[0].name = 'Wohnen'; const g2 = GM.edit.addOpening(g, g.waende[0].id, 500, { typ: 'innentuer', breite: 885, hoehe: 2010, brh: 0 });
    const r2 = GM.roomsWithMeta(g2, r1); assert.ok(r2.some(r => r.name === 'Wohnen'));
  });
}

// ---- Raumtrennung ohne Wand (Räume liegen direkt aneinander) ----
{
  const R = (id, x, y, w, h) => ({ id, name: id, x, y, beheizt: 'ja', temp: 20, segs: [0, 90, 180, 270].map((d, i) => ({ dir: d, len: i % 2 ? h : w, grenzt: 'aussen', nachbarId: '', oeffnungen: [] })) });
  const eg = { id: 'eg', name: 'EG', raeume: [R('Essen', 0, 0, 3.5, 3.4), R('Wohnen', 0, 3.4, 6.6, 3.9), R('Flur', 3.74, 0, 2.86, 3.16)] };
  const res = GM.fromBestandsaufnahme({ bauteile: [], geschosse: [eg] }, eg);
  t('Offener Übergang: Räume getrennt, ohne Wand, Flächen gleich', () => {
    for (const q of res.quellraeume) { const m = res.raeume.find(r => r.bestandsaufnahme && r.bestandsaufnahme.id === q.id); assert.ok(m && Math.abs(m.flaeche_m2 - q.flaeche_m2) < 0.02, q.name + ' ' + (m && m.flaeche_m2) + ' statt ' + q.flaeche_m2); }
    assert.strictEqual(res.raeume.length, 3);
  });
  module.exports.offen = { id: 'eg', name: 'EG', knoten: res.graph.knoten, waende: res.graph.waende, oeffnungen: res.graph.oeffnungen, raeume: res.raeume.map(r => ({ name: r.bestandsaufnahme.name, mitte: GM.centroid(r.kontur) })) };
}
t('Höhenmodell wie Bestandsaufnahme: KG fixiert, EG/OG aus Geschosshöhen', () => {
  const h = GM.hoehen({ geschosse: [{ name: 'KG', hoehe: 2.5, okff: -2.7, nivFix: true, deckeD: 18 }, { name: 'EG', hoehe: 2.5, geschossHoehe: 2.8 }, { name: 'OG', hoehe: 2.5, geschossHoehe: 2.8 }] });
  assert.deepStrictEqual(h.map(x => Math.round(x.niv * 100)), [-270, -2, 278]); assert.deepStrictEqual(h.map(x => Math.round(x.rde * 100)), [18, 30, 30]);
});
t('Außenumriss: Rechteck mit Außenwand außen', () => { let g = { knoten: [], waende: [], oeffnungen: [] }; const A = { t: 365, ts: 0, ext: true };
  g = GM.edit.addWall(g, [0, 0], [10000, 0], A); g = GM.edit.addWall(g, [10000, 0], [10000, 8000], A); g = GM.edit.addWall(g, [10000, 8000], [0, 8000], A); g = GM.edit.addWall(g, [0, 8000], [0, 0], A);
  const u = GM.umriss(g); assert.strictEqual(Math.abs(GM.signedArea(u)), 10730 * 8730); assert.strictEqual(GM.rooms(g)[0].flaeche_m2, 80);
});
t('Mehrere Fenster (anz 2) auf kurzer Wand überlappen nicht', () => {
  const R = { id: 'r', name: 'Wohnen', x: 0, y: 0, beheizt: 'ja', temp: 20, segs: [0, 90, 180, 270].map((d, i) => ({ dir: d, len: i % 2 ? 4 : 3.3, grenzt: 'aussen', nachbarId: '', oeffnungen: i === 0 ? [{ id: 'f', typ: 'fenster', b: 1.2, h: 1.4, bruest: 0.9, anz: 2 }] : [] })) };
  const f = { id: 'eg', name: 'EG', raeume: [R] }, g = GM.fromBestandsaufnahme({ bauteile: [], geschosse: [f] }, f).graph, os = g.oeffnungen.slice().sort((a, b) => a.abstand - b.abstand);
  assert.strictEqual(os.length, 2); assert.ok(os[0].abstand + os[0].breite <= os[1].abstand, JSON.stringify(os));
});
t('Gespeicherte Modelle: überlappende Öffnungen werden verteilt', () => { let g = { knoten: [], waende: [], oeffnungen: [] }; g = GM.edit.addWall(g, [0, 0], [3300, 0], { t: 365, ts: 0, ext: true });
  const id = g.waende[0].id; g.oeffnungen = [{ id: 'o1', wand: id, abstand: 620, breite: 1200 }, { id: 'o2', wand: id, abstand: 1720, breite: 1200 }];
  assert.deepStrictEqual(GM.fixOpenings(g).oeffnungen.map(o => o.abstand), [300, 1800]); const h = { ...g, oeffnungen: [g.oeffnungen[0]] }; assert.strictEqual(GM.fixOpenings(h), h);
  const k = { ...g, oeffnungen: [{ id: 'd', wand: id, abstand: -65, breite: 885 }] }; assert.strictEqual(GM.fixOpenings(k).oeffnungen[0].abstand, 10, 'Tür ragte über das Wandende');
});
t('Abgleich: neue Fenster aus der Bestandsaufnahme erscheinen im gespeicherten Modell, Editor-Änderungen bleiben', () => {
  const mk = ops => ({ id: 'r', name: 'Wohnen', x: 0, y: 0, beheizt: 'ja', temp: 20, segs: [0, 90, 180, 270].map((d, i) => ({ dir: d, len: i % 2 ? 4 : 5, grenzt: 'aussen', nachbarId: '', oeffnungen: i === 0 ? ops : [] })) });
  const f0 = { id: 'eg', name: 'EG', raeume: [mk([])] }, p0 = { bauteile: [], geschosse: [f0] }, g0 = GM.fromBestandsaufnahme(p0, f0).graph, meta = [{ name: 'Wohnen', bestandsaufnahmeId: 'r', temp: 20, mitte: [2500, 2000] }];
  const f1 = { id: 'eg', name: 'EG', raeume: [{ ...mk([{ id: 'fe', typ: 'fenster', b: 1.2, h: 1.3, bruest: 0.9, anz: 2 }]), temp: 22 }] }, p1 = { bauteile: [], geschosse: [f1] };
  const r = GM.syncFromBA(p1, f1, g0, meta); assert.strictEqual(r.g.oeffnungen.length, 2); assert.strictEqual(r.meta[0].temp, 22);
  assert.notStrictEqual(GM.geoKey(f0), GM.geoKey({ ...f0, raeume: [{ ...mk([]), x: 1 }] })); assert.strictEqual(GM.geoKey(f0), GM.geoKey(f1));
  const o = r.g.oeffnungen[0], g2 = GM.edit.setOpening(r.g, o.id, { abstand: 300 }), r2 = GM.syncFromBA(p1, f1, g2, r.meta);
  assert.strictEqual(r2.g.oeffnungen.length, 2); assert.ok(r2.g.oeffnungen.some(x => x.ersetzt && x.abstand === 300));
  const g3 = GM.edit.deleteOpening(r2.g, r2.g.oeffnungen.find(x => x.quelle).id), r3 = GM.syncFromBA(p1, f1, g3, r.meta);
  assert.strictEqual(r3.g.oeffnungen.filter(x => x.wand).length, 1, 'gelöschtes Fenster bleibt weg');
  const f2 = { ...f1, raeume: [mk([])] }; assert.strictEqual(GM.syncFromBA({ bauteile: [], geschosse: [f2] }, f2, r3.g, r.meta).g.oeffnungen.filter(x => x.wand).length, 1, 'ersetztes Fenster bleibt, auch wenn es in der Bestandsaufnahme fehlt');
});
t('Geschosse übereinander: gleiche Außenmaße mittig auf das EG, abweichende bleiben', () => {
  const box = (x, y, w, h) => { let g = { knoten: [], waende: [], oeffnungen: [] }; const A = { t: 365, ts: 0, ext: true };
    g = GM.edit.addWall(g, [x, y], [x + w, y], A); g = GM.edit.addWall(g, [x + w, y], [x + w, y + h], A); g = GM.edit.addWall(g, [x + w, y + h], [x, y + h], A); g = GM.edit.addWall(g, [x, y + h], [x, y], A); return g; };
  const s = GM.stapeln([{ id: 'kg', name: 'KG', g: box(1000, 3000, 6500, 10200) }, { id: 'eg', name: 'EG', g: box(2000, 6000, 6500, 10200) }, { id: 'og', name: 'OG', g: box(0, 0, 6550, 10250) }, { id: 'dg', name: 'DG', g: box(0, 0, 4000, 6000) }, { id: 'x', name: 'Anbau', g: box(0, 0, 6500, 10200), lageFrei: 'ja' }]);
  assert.deepStrictEqual([s.kg.dx, s.kg.dy, s.kg.st], [1000, 3000, 'gleich']); assert.strictEqual(s.eg.st, 'bezug'); assert.deepStrictEqual([s.og.dx, s.og.dy], [1975, 5975]);
  assert.deepStrictEqual([s.dg.dx, s.dg.st], [0, 'abw']); assert.strictEqual(s.x.st, 'frei');
});
console.log('Bearbeiten geprüft');

// ---- Querwände und Kreuzungen wie im Obergeschoss einer Doppelhaushälfte (synthetisch) ----
{
  const R = (id, x, y, w, h) => ({ id, name: id, x, y, beheizt: 'ja', temp: 20, segs: [0, 90, 180, 270].map((d, i) => ({ dir: d, len: i % 2 ? h : w, grenzt: 'aussen', nachbarId: '', oeffnungen: [] })) });
  const og = { id: 'og', name: 'OG', raeume: [R('Kind1', 0, 0, 4, 3.5), R('Eltern', 0, 3.615, 4, 5.385), R('Bad', 4.24, 0, 2.76, 3), R('Flur', 4.24, 3.24, 2.76, 2.26), R('Kind2', 4.24, 5.74, 2.76, 3.26)] };
  const pr = { bauteile: [{ id: 'aw', kat: 'AW', dicke: 36.5 }], geschosse: [og] };
  const res = GM.fromBestandsaufnahme(pr, og), g = res.graph, N = new Map(g.knoten.map(n => [n.id, n]));
  t('Querwände: keine Wandstücke, Flächen gleich', () => {
    const kurz = g.waende.filter(w => !GM.isHilf(w)).filter(w => Math.hypot(N.get(w.b).x - N.get(w.a).x, N.get(w.b).y - N.get(w.a).y) < 300);
    for (const q of res.quellraeume) { const m = res.raeume.find(r => r.bestandsaufnahme && r.bestandsaufnahme.id === q.id); assert.ok(m && Math.abs(m.flaeche_m2 - q.flaeche_m2) < 0.02, q.name + ' ' + (m && m.flaeche_m2) + ' statt ' + q.flaeche_m2); }
    assert.strictEqual(res.raeume.length, 5); assert.strictEqual(kurz.length, 0, 'kurze Wände: ' + kurz.map(w => w.t).join(','));
  });
  module.exports.querwand = { name: 'OG', ...g };
}
