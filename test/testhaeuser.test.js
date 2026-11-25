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
console.log('Testhäuser geprüft');
