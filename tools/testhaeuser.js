/* Eigene Testhäuser (keine Kundendaten): node tools/testhaeuser.js <ausgabeordner>
   Schreibt je Haus <name>.ifc und <name>.json (Modell, Prüfung, Sollvolumen nach Gebäudemodell). */
global.GM = require('../src/core.js'); const GMIFC = require('../src/ifc.js'); const fs = require('fs'), path = require('path');
const AW = { t: 365, ts: 0, ext: true }, IW = { t: 115, ts: 57, ext: false };
function geschoss(id, name, umriss, innen, opts) { let g = { knoten: [], waende: [], oeffnungen: [] };
  umriss.forEach((p, i) => { g = GM.edit.addWall(g, p, umriss[(i + 1) % umriss.length], AW); }); (innen || []).forEach(([a, b]) => { g = GM.edit.addWall(g, a, b, IW); });
  return { id, name, ...g, raeume: [], ...opts }; }
// Öffnung in die Wand legen, die den Punkt p (mm) enthält; abstand ab Wandanfang wird aus p berechnet (Mitte der Öffnung)
function oeffnung(f, p, typ, breite, hoehe, brh) { const N = new Map(f.knoten.map(k => [k.id, k]));
  for (const w of f.waende) { const a = N.get(w.a), b = N.get(w.b), L = Math.hypot(b.x - a.x, b.y - a.y), u = [(b.x - a.x) / L, (b.y - a.y) / L], s = (p[0] - a.x) * u[0] + (p[1] - a.y) * u[1], d = Math.abs((p[0] - a.x) * u[1] - (p[1] - a.y) * u[0]);
    if (d < 20 && s > 0 && s < L) { f.oeffnungen.push({ id: 'o' + (f.oeffnungen.length + 1), wand: w.id, typ, abstand: Math.round(s - breite / 2), breite, hoehe, brh }); return; } }
  throw new Error('keine Wand bei ' + p); }
const raum = (f, name, mitte, nutzung, extra) => f.raeume.push({ name, mitte, nutzung: nutzung || '', ...extra });

const haeuser = {
  // KG + EG + ausgebautes DG unter Satteldach 45°, Kniestock 1 m; Fenster im Giebel und eines in der Schräge
  Testhaus_A_Mehrgeschoss: () => { const R = [[0, 0], [10000, 0], [10000, 8000], [0, 8000]];
    const kg = geschoss('kg', 'KG', R, [[[5000, 0], [5000, 8000]]], { niveau_mm: -2650, geschossHoehe_mm: 2650, rohdecke_mm: 250, lichteHoehe_mm: 2300 });
    const eg = geschoss('eg', 'EG', R, [[[5000, 0], [5000, 8000]], [[5000, 4000], [10000, 4000]]], { niveau_mm: 0, geschossHoehe_mm: 2750, rohdecke_mm: 220, lichteHoehe_mm: 2500 });
    const dg = geschoss('dg', 'DG', R, [[[5000, 0], [5000, 8000]]], { niveau_mm: 2750, geschossHoehe_mm: 2600, rohdecke_mm: 200, lichteHoehe_mm: 2400 });
    raum(kg, 'Keller', [2500, 4000], 'Keller', { temp: null }); raum(kg, 'Heizraum', [7500, 4000], 'Heizraum');
    raum(eg, 'Wohnen', [2500, 4000], 'Wohnen'); raum(eg, 'Küche', [7500, 2000], 'Küche'); raum(eg, 'Bad', [7500, 6000], 'Bad');
    raum(dg, 'Schlafen', [2500, 4000], 'Schlafen'); raum(dg, 'Kind', [7500, 4000], 'Kind');
    oeffnung(eg, [2500, 0], 'fenster', 1500, 1300, 900); oeffnung(eg, [7500, 0], 'fenster', 1000, 1300, 900); oeffnung(eg, [2500, 8000], 'fenstertuer', 2000, 2100, 0); oeffnung(eg, [7500, 8000], 'fenster', 800, 1000, 1100);
    oeffnung(eg, [10000, 2000], 'aussentuer', 1000, 2100, 0); oeffnung(eg, [5000, 6000], 'innentuer', 885, 2010, 0); oeffnung(eg, [5000, 2000], 'innentuer', 885, 2010, 0);
    oeffnung(dg, [0, 4000], 'fenster', 1200, 1200, 900); oeffnung(dg, [10000, 4000], 'fenster', 1000, 1200, 900); oeffnung(dg, [2500, 0], 'fenster', 800, 1000, 900); oeffnung(dg, [5000, 4000], 'innentuer', 885, 2010, 0);
    oeffnung(kg, [2500, 0], 'fenster', 800, 500, 1500);
    return { id: 'testA', name: 'Testhaus A Mehrgeschoss', geschosse: [kg, eg, dg], dach: { form: 'sattel', neigung: 45, first: 'lang', kniestock: 1000, ueberTraufe: 500, ueberOrtgang: 300, dicke: 300, bezug: 'boden' } }; },
  // EG mit abgeschrägter Ecke (45°) und Erker, Walmdach auf kalter Decke
  Testhaus_B_Erker_Schraeg: () => { const U = [[0, 0], [9000, 0], [11000, 2000], [11000, 9000], [6500, 9000], [6500, 10000], [4000, 10000], [4000, 9000], [0, 9000]];
    const eg = geschoss('eg', 'EG', U, [[[3000, 0], [3000, 9000]]], { niveau_mm: 0, geschossHoehe_mm: 2800, rohdecke_mm: 250, lichteHoehe_mm: 2500 });
    raum(eg, 'Arbeiten', [1500, 4500], 'Büro'); raum(eg, 'Wohnen', [7000, 4500], 'Wohnen');
    oeffnung(eg, [10000, 1000], 'fenster', 1200, 1300, 900); oeffnung(eg, [5250, 10000], 'fenster', 1800, 1300, 900); oeffnung(eg, [0, 4500], 'fenster', 1200, 1300, 900); oeffnung(eg, [3000, 3000], 'innentuer', 885, 2010, 0);
    return { id: 'testB', name: 'Testhaus B Erker und Schräge', geschosse: [eg], dach: { form: 'walm', neigung: 30, kniestock: 0, ueberTraufe: 600, ueberOrtgang: 600, dicke: 250, bezug: 'decke' } }; },
  // EG 12×9, OG kleiner und versetzt (Staffelgeschoss) mit Pultdach
  Testhaus_C_Staffel: () => { const eg = geschoss('eg', 'EG', [[0, 0], [12000, 0], [12000, 9000], [0, 9000]], [[[6000, 0], [6000, 9000]]], { niveau_mm: 0, geschossHoehe_mm: 2900, rohdecke_mm: 250, lichteHoehe_mm: 2600 });
    const og = geschoss('og', 'OG', [[0, 0], [8000, 0], [8000, 9000], [0, 9000]], [], { niveau_mm: 2900, geschossHoehe_mm: 2700, rohdecke_mm: 250, lichteHoehe_mm: 2450, lageFrei: true });
    raum(eg, 'Büro', [3000, 4500], 'Büro'); raum(eg, 'Lager', [9000, 4500], 'Lager'); raum(og, 'Studio', [4000, 4500], 'Wohnen');
    oeffnung(og, [4000, 0], 'fenster', 2400, 1500, 600);
    return { id: 'testC', name: 'Testhaus C Staffelgeschoss', geschosse: [eg, og], dach: { form: 'pult', neigung: 8, first: 'lang', kniestock: 0, ueberTraufe: 400, ueberOrtgang: 400, dicke: 300, bezug: 'decke' } }; },
};

function sollVolumen(doc) { const DA = GM.dach(doc, doc.dach), out = [];
  for (const f of doc.geschosse) { const rs = GM.roomsWithMeta(f, f.raeume), st = GM.stapeln(doc.geschosse.map(x => ({ id: x.id, name: x.name, lageFrei: x.lageFrei, g: x })))[f.id] || { dx: 0, dy: 0 };
    for (const r of rs) { const k = r.kontur, xs = k.map(q => q[0]), ys = k.map(q => q[1]), h0 = f.lichteHoehe_mm || 2500, s = 50; let v = 0, A = 0;
      for (let x = Math.min(...xs); x < Math.max(...xs); x += s) for (let y = Math.min(...ys); y < Math.max(...ys); y += s) { if (!GM.inPoly([x + s / 2, y + s / 2], k)) continue; A += s * s;
        v += Math.max(0, Math.min(h0, (DA && DA.geschoss === f.id ? GM.dachUnten(DA, x + s / 2 + st.dx, y + s / 2 + st.dy) : Infinity) - (f.niveau_mm || 0))) * s * s; }
      out.push({ geschoss: f.name, raum: r.name, flaeche_m2: +(A / 1e6).toFixed(2), volumen_m3: +(v / 1e9).toFixed(2) }); } }
  return out; }

if (require.main === module) { const dir = process.argv[2] || '.'; fs.mkdirSync(dir, { recursive: true });
  for (const [name, mk] of Object.entries(haeuser)) { const doc = mk(), ifc = GMIFC.exportIFC(doc, { organisation: 'cL-energiePlan Test' });
    fs.writeFileSync(path.join(dir, name + '.ifc'), ifc); const pr = GMIFC.pruefen(doc), vol = sollVolumen(doc);
    fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify({ doc, pruefung: pr, soll: vol }, null, 1));
    console.log('\n' + name); pr.forEach(x => console.log('  ' + x.lv + ' ' + (x.gname || '') + ': ' + x.text)); vol.forEach(v => console.log('  ' + v.geschoss + ' ' + v.raum + ' ' + v.flaeche_m2 + ' m² ' + v.volumen_m3 + ' m³')); } }
module.exports = { haeuser, sollVolumen };
