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
    print('Fehler:', errs); b.close()
