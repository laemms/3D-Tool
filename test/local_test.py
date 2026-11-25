"""Lokaler Betrieb: Seite liegt neben der Bestandsaufnahme im Ordner und liest deren Browser-Daten (ba.v1)."""
import json
from playwright.sync_api import sync_playwright
p = json.load(open('/home/claude/3d-tool/fixtures/beispiel.json'))
q = dict(p, id='mwbogner', name='Wonneberg, Josef Bogner', geaendert=p['geaendert'] + 1000); q.pop('beispiel', None)
seed = "localStorage.setItem('ba.v1', %s); localStorage.setItem('ba.v1.set', JSON.stringify({firma:{bearbeiter:'Christoph Lämmermann', marke:'cL-energiePlan'}}));" % json.dumps(json.dumps({'beispiel': p, 'mwbogner': q}))
with sync_playwright() as pw:
    b = pw.chromium.launch(); ctx = b.new_context(accept_downloads=True); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.route('https://**', lambda r: r.abort())
    pg.goto('file:///home/claude/3d-tool/dist/gebaeudemodell.html'); pg.evaluate(seed); pg.reload(); pg.wait_for_timeout(1200)
    print('Status:', pg.inner_text('#sync')); print('Projekt:', pg.eval_on_selector('#proj', 'e => e.options[e.selectedIndex].text'))
    print(pg.inner_text('#rooms')); pg.wait_for_timeout(1800)
    m = pg.evaluate("JSON.parse(localStorage.getItem('ba.v1.modell')||'{}')"); print('Lokal gespeichert:', list(m.keys()), m.get('mwbogner', {}).get('version'))
    assert 'mwbogner' in m
    pg.evaluate("window.showDirectoryPicker = undefined")
    with pg.expect_download() as dl: pg.click('#ifc')
    d = dl.value; print('Download:', d.suggested_filename, pg.inner_text('#saveinfo'))
    # Fenster in der Bestandsaufnahme nachtragen: muss im gespeicherten Modell erscheinen
    n0 = pg.evaluate("window.__gm.st.floors.reduce((s, f) => s + f.g.oeffnungen.filter(o => o.wand).length, 0)")
    pg.evaluate("""() => { const all = JSON.parse(localStorage.getItem('ba.v1')); const q = all.mwbogner, f = q.geschosse.find(g => g.raeume.length), r = f.raeume[0];
      const s = r.segs.find(x => x.grenzt === 'aussen') || r.segs[0]; s.oeffnungen = (s.oeffnungen || []).concat([{ id: 'neu1', typ: 'fenster', b: 1.0, h: 1.2, bruest: 0.9, anz: 1 }]); q.geaendert++; localStorage.setItem('ba.v1', JSON.stringify(all)); }""")
    pg.reload(); pg.wait_for_timeout(1500)
    n1 = pg.evaluate("window.__gm.st.floors.reduce((s, f) => s + f.g.oeffnungen.filter(o => o.wand).length, 0)"); print('Öffnungen vorher/nachher:', n0, n1); assert n1 == n0 + 1
    print('Fehler:', errs); assert not errs; b.close()
