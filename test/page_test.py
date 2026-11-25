"""Browser-Test der Seite Gebäudemodell mit simulierter Datenbank (Playwright)."""
import json, re
from playwright.sync_api import sync_playwright
fx = open('/home/claude/3d-tool/fixtures/beispiel.json').read()
mock = r"""
window.__saved=[];
const FX=%s;
window.__files=[];
window.claude={use:async n=>{ if(n==='mcp') return {callTool:async(srv,tool,args)=>{ if(tool==='list_allowed_directories') return {content:[{type:'text',text:'Allowed directories:\nC:\\Users\\Chris\\Documents\\Bestandsaufnahme-Export'}]}; window.__files.push([srv,tool,args.path,args.content.length,args.content.slice(0,40)]); return {}; }};
  if(n!=='db') return null; return {
  collection:c=>({get:async()=>({docs:c==='projekte'?[{data:()=>FX}]:[]})}),
  doc:p=>({set:async d=>{window.__saved.push([p,JSON.parse(JSON.stringify(d))]);}, get:async()=>({exists:false})})
};}};
""" % fx
def rooms(pg): return pg.inner_text('#rooms')
with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    pg = b.new_page(viewport={'width':1280,'height':900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', lambda r: r.fulfill(path='/tmp/nm/node_modules/three/build/three.min.js', content_type='application/javascript'))
    pg.route('https://fonts.**', lambda r: r.abort())
    pg.add_init_script(mock)
    pg.goto('file:///home/claude/3d-tool/dist/gebaeudemodell.html'); pg.wait_for_timeout(2200)
    print('EG geladen:\n' + rooms(pg))
    assert 'Wohnen / Essen' in rooms(pg) and '25,06' in rooms(pg)
    print('Autosave nach Übernahme:', [s[0] for s in pg.evaluate('window.__saved')])
    pg.screenshot(path='/tmp/gm_eg.png')
    # KG: neuen Raum 3,00 x 2,00 m (Maße innen) zeichnen
    pg.click('button[data-f="mwdsh1tb46rqy"]'); pg.wait_for_timeout(200)
    for _ in range(3): pg.click('#z-out')
    pg.click('#t-wall'); box = pg.locator('#plan').bounding_box(); sx, sy = box['x'] + 80, box['y'] + 200
    pg.mouse.click(sx, sy)
    for L, d in [('3', '0'), ('2', '90'), ('3', '180')]:
        pg.fill('#w-len', L); pg.click(f'#wallbar [data-dir="{d}"]'); pg.wait_for_timeout(100)
    pg.mouse.click(sx + 2, sy + 1); pg.wait_for_timeout(300)
    r = rooms(pg); print('KG nach Zeichnen:\n' + r)
    pg.screenshot(path='/tmp/gm_kg.png')
    assert '6,00' in r, 'neuer Raum 6,00 m² fehlt'
    pg.screenshot(path='/tmp/gm_kg.png')
    # Auswahl: Wand antippen, Dicke ändern, löschen, rückgängig
    pg.click('#t-sel'); n_before = len(re.findall(r'\n', r))
    pg.mouse.click(sx + 30, sy - 1); pg.wait_for_timeout(150); print('Auswahl:', pg.inner_text('#props').split('\n')[0])
    assert pg.inner_text('#props').startswith('Außenwand')
    pg.click('#p-del'); pg.wait_for_timeout(150); assert '6,00' not in rooms(pg); pg.click('#undo'); pg.wait_for_timeout(150); assert '6,00' in rooms(pg); print('Löschen + Rückgängig ok')
    # Öffnung setzen
    pg.click('#t-open'); pg.mouse.click(sx + 30, sy - 1); pg.wait_for_timeout(150); print('Öffnung:', pg.inner_text('#props').split('\n')[0])
    assert pg.inner_text('#props').startswith('Öffnung')
    # Raum umbenennen
    pg.click('#t-sel'); k = pg.evaluate('__gm.st.vw.k'); pg.mouse.click(sx + 1500 * k, sy + 1000 * k); pg.wait_for_timeout(150); pg.fill('#p-n', 'Lager'); pg.press('#p-n', 'Enter'); pg.wait_for_timeout(150)
    assert 'Lager' in rooms(pg); print('Umbenennen ok')
    pg.wait_for_timeout(1800); saved = pg.evaluate('window.__saved'); last = saved[-1][1]
    kg = [g for g in last['geschosse'] if g['name'] == 'KG'][0]
    print('Gespeichert:', saved[-1][0], 'Version', last['version'], 'KG Räume', [(x['name'], x['flaeche_m2']) for x in kg['raeume']], 'Öffnungen', len(kg['oeffnungen']))
    pg.click('#ifc'); pg.wait_for_timeout(500); print('IFC:', pg.inner_text('#saveinfo'), pg.evaluate('window.__files'))
    assert pg.evaluate('window.__files.length') == 2 and pg.evaluate('window.__files[1][2]').endswith('_Gebaeudemodell.json')
    pg.click('#v3d'); pg.wait_for_timeout(1000); pg.screenshot(path='/tmp/gm_3d.png')
    pg.set_viewport_size({'width':390,'height':844}); pg.click('#v2d'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/gm_phone.png', full_page=True)
    print('Fehler:', errs); b.close()
