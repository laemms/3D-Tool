import json, sys
from playwright.sync_api import sync_playwright
fx = open('/home/claude/gm/fixtures/beispiel.json').read()
mock = """
window.__saved=[];
const FX=%s;
window.claude={use:async n=>{ if(n!=='db') return null; return {
  collection:c=>({get:async()=>({docs:c==='projekte'?[{data:()=>FX},{data:()=>({id:'leer',name:'Neues Projekt',geschosse:[{id:'g1',name:'EG',raeume:[]}]})}]:[]})}),
  doc:p=>({set:async d=>{window.__saved.push([p,d]);}, get:async()=>({exists:false})})
};}};
""" % fx
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for theme in ['light','dark']:
        pg = b.new_page(viewport={'width':1280,'height':900}, color_scheme=theme)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type=='error' and errs.append(m.text))
        pg.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', lambda r: r.fulfill(path='/tmp/nm/node_modules/three/build/three.min.js', content_type='application/javascript'))
        pg.route('https://fonts.googleapis.com/**', lambda r: r.abort()); pg.route('https://fonts.gstatic.com/**', lambda r: r.abort())
        pg.add_init_script(mock)
        pg.goto('file:///home/claude/gm/dist/gebaeudemodell.html'); pg.wait_for_timeout(800)
        pg.screenshot(path=f'/home/claude/gm/test/shot_2d_{theme}.png')
        if theme=='light':
            print('Tabelle:', pg.inner_text('#cmp')); print('Checks:', pg.inner_text('#chk'))
            pg.click('#v3d'); pg.wait_for_timeout(1200); pg.screenshot(path='/home/claude/gm/test/shot_3d.png')
            pg.click('#save'); pg.wait_for_timeout(500)
            saved = pg.evaluate('window.__saved'); print('Gespeichert:', [s[0] for s in saved], 'Geschosse', [ (g['name'], len(g['waende'])) for g in saved[0][1]['geschosse']], 'Bytes', len(json.dumps(saved[0][1])))
            print('Checks:', pg.inner_text('#chk').replace('\n',' | '))
            pg.click('#v2d'); pg.click('button[data-f="mwdsh1tb46rqy"]'); pg.wait_for_timeout(300); print('KG:', pg.inner_text('#cmp').split('\n')[1:3])
        pg.set_viewport_size({'width':390,'height':844}) if theme=='dark' else None
        if theme=='dark': pg.wait_for_timeout(400); pg.screenshot(path='/home/claude/gm/test/shot_phone_dark.png', full_page=True)
        print(theme, 'Fehler:', errs)
    b.close()
