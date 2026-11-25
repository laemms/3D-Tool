/* IFC aus den Prüfdaten (…_Gebaeudemodell.json neben der IFC) mit dem aktuellen Programmstand neu erzeugen.
   node tools/regen.js pruefdaten.json ausgabe.ifc [--wie-gespeichert]
   Standard: wie die Seite beim Öffnen (gespeichertes Modell + Abgleich mit der Bestandsaufnahme). --wie-gespeichert: nur das Exportdokument neu exportieren.
   Kundendaten nie ins Repository legen. */
const fs = require('fs'), GM = require('../src/core.js'); globalThis.GM = GM; const { exportIFC } = require('../src/ifc.js');
const [, , src, out, mode] = process.argv, d = JSON.parse(fs.readFileSync(src, 'utf8')), p = d.projekt, MODEL_VERSION = (d.modell && d.modell.version) || 4;
const doc = mode === '--wie-gespeichert' ? d.modell : GM.modelDoc(p, d.gespeichert && d.gespeichert.version >= MODEL_VERSION ? GM.floorsFromSaved(p, d.gespeichert) : GM.floorsFromBA(p), MODEL_VERSION, (() => { const md = (d.gespeichert && d.gespeichert.dach) || (d.modell && d.modell.dach); return md && md.gesetzt ? { ...GM.dachStandard(p), ...md } : GM.dachStandard(p); })());
let B = 'regen'; try { B = 'regen ' + require('child_process').execSync('git log -1 --format=%h', { cwd: __dirname }).toString().trim(); } catch (e) {}
fs.writeFileSync(out, exportIFC(doc, { bearbeiter: '', organisation: 'cL-energiePlan', nord: (p.objekt || {}).nord || 0 }).split('__BUILD__').join(B));
console.log(out, doc.geschosse.map(f => f.name + ': ' + f.waende.length + ' Wände, ' + f.oeffnungen.filter(o => o.wand).length + ' Öffnungen').join(' · '));
