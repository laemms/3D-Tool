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
  module.exports = { querwand: { name: 'OG', ...g } };
}
