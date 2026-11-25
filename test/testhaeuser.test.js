/* Eigene Testhäuser: Prüfung ohne unerwartete Warnungen, Sollvolumen wie in Raumtool 3D gemessen (Test 25.11.2026) */
const assert = require('assert'); global.GM = require('../src/core.js'); const GMIFC = require('../src/ifc.js'), { haeuser, sollVolumen } = require('../tools/testhaeuser.js');
const raumtool = { // Raumtool 3D, Volumen in m³ (Raumtool rechnet mit der Raumfläche aus dem IFC, das Modell hier mit 5-cm-Raster)
  Testhaus_A_Mehrgeschoss: { 'EG Küche': 48.71, 'EG Bad': 48.71, 'DG Schlafen': 84.37, 'DG Kind': 84.37 },
  Testhaus_B_Erker_Schraeg: { 'EG Arbeiten': 66.21, 'EG Wohnen': 179.89 } };
const erlaubt = { Testhaus_A_Mehrgeschoss: [/Dachschräge/], Testhaus_B_Erker_Schraeg: [], Testhaus_C_Staffel: [] };
for (const [name, mk] of Object.entries(haeuser)) { const doc = mk(), pr = GMIFC.pruefen(doc), ifc = GMIFC.exportIFC(doc);
  pr.filter(x => x.lv === 'warn').forEach(x => assert.ok(erlaubt[name].some(re => re.test(x.text)), name + ': unerwartet „' + x.text + '“'));
  assert.ok(/IFCROOF\(/.test(ifc), name + ': kein Dach');
  const vol = sollVolumen(doc); for (const [k, v] of Object.entries(raumtool[name] || {})) { const r = vol.find(x => x.geschoss + ' ' + x.raum === k); assert.ok(r, name + ': ' + k + ' fehlt');
    assert.ok(Math.abs(r.volumen_m3 - v) / v < 0.006, name + ' ' + k + ': Modell ' + r.volumen_m3 + ' m³, Raumtool ' + v + ' m³'); }
  console.log('ok  ' + name); }
assert.ok(GMIFC.pruefen(haeuser.Testhaus_C_Staffel()).some(x => /ohne OG darüber/.test(x.text)), 'Staffelgeschoss: Hinweis auf freie Decke');
// Nacharbeit in Raumtool: Rohdecke je Geschoss, Dachfenster mit Richtung, Hinweise aus der Prüfung
{ const d = haeuser.Testhaus_A_Mehrgeschoss(), l = GM.dachFlaechenListe(GM.dach(d, d.dach), 0);
  assert.deepStrictEqual(l.map(x => x.richtung), ['Nord', 'Süd'], 'Himmelsrichtungen der Dachflächen'); assert.deepStrictEqual(GM.dachFlaechenListe(GM.dach(d, d.dach), 90).map(x => x.richtung), ['Ost', 'West'], 'Nordpfeil gedreht');
  d.dach.fenster = [{ flaeche: l[1].k, breite: 780, hoehe: 1180, unterkante: 1000 }]; const t = GMIFC.nacharbeitText(d);
  ['KG: Niveau -2,65 m, Geschosshöhe 2,65 m, Rohdecke 25 cm', 'EG: Niveau 0 m, Geschosshöhe 2,75 m, Rohdecke 22 cm', 'Dachfenster 1: 78 × 118 cm', 'fällt nach Süd', 'Dicke der Konstruktion', 'Dachschräge'].forEach(x => assert.ok(t.includes(x), 'Nacharbeit fehlt: ' + x));
  const L = GM.dachFlaechenListe(GM.dach(haeuser.Testhaus_B_Erker_Schraeg(), haeuser.Testhaus_B_Erker_Schraeg().dach), 0); assert.ok(L.length >= 4 && new Set(L.map(x => x.nr)).size === L.length, 'Walmdach mit Anbauten: Flächen zusammengefasst und nummeriert');
  console.log('ok  Nacharbeit-Liste für Raumtool'); }
console.log('Testhäuser geprüft');
