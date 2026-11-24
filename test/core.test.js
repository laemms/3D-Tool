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
console.log(ok + ' Tests bestanden');
