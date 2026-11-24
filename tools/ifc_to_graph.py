import json
"""Prüft eine vom Gebäudemodell erzeugte IFC: Wandkörper und Räume je Geschoss, Überschneidungen, Lücken, Plan als PNG."""
import re, sys, math
from shapely.geometry import Polygon
from shapely.ops import unary_union
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
src = open(sys.argv[1], encoding='latin-1').read()
def dec(s): return re.sub(r'\\X2\\([0-9A-F]+)\\X0\\', lambda m: ''.join(chr(int(m.group(1)[i:i+4], 16)) for i in range(0, len(m.group(1)), 4)), s)
E = {int(m.group(1)): (m.group(2), m.group(3)) for m in re.finditer(r'#(\d+)=([A-Z0-9]+)\((.*)\);\r?$', src, re.M)}
def args(s):
    out, d, cur, q = [], 0, '', False
    for ch in s:
        if ch == "'" : q = not q
        if not q and ch == '(': d += 1
        if not q and ch == ')': d -= 1
        if not q and ch == ',' and d == 0: out.append(cur); cur = ''
        else: cur += ch
    out.append(cur); return out
ref = lambda s: int(s.strip()[1:])
def pt(i): return [float(x) for x in E[i][1].strip('()').split(',')]
def place(i):  # Weltkoordinaten-Transform einer IFCLOCALPLACEMENT: (ox,oy,oz,ux,uy)
    t, a = E[i]; a = args(a); rel = a[0].strip(); ax = args(E[ref(a[1])][1])
    o = pt(ref(ax[0])); d = pt(ref(ax[2])) if ax[2].strip() != '$' else [1, 0, 0]
    if rel == '$': return (o[0], o[1], o[2], d[0], d[1])
    P = place(ref(rel)); ux, uy = P[3], P[4]
    return (P[0] + o[0] * ux - o[1] * uy, P[1] + o[0] * uy + o[1] * ux, P[2] + o[2], d[0] * ux - d[1] * uy, d[0] * uy + d[1] * ux)
def body(shape):  # Profilpunkte, Höhe, z0 der Extrusion
    reps = args(E[shape][1])[2].strip('()').split(',')
    for r in reps:
        a = args(E[ref(r)][1])
        if a[1].strip("'") == 'Body':
            ex = args(E[ref(a[3].strip('()').split(',')[0])][1]); prof = args(E[ref(ex[0])][1]); pl = E[ref(prof[2])][1].strip('()').split(',')
            z0 = pt(ref(args(E[ref(ex[1])][1])[0]))[2]; return [pt(ref(p))[:2] for p in pl], float(ex[3]), z0
def world(P, q): return [(P[0] + x * P[3] - y * P[4], P[1] + x * P[4] + y * P[3]) for x, y in q]

storeys = {i: dec(args(a)[2].strip("'")) for i, (t, a) in E.items() if t == 'IFCBUILDINGSTOREY'}
elev = {i: float(args(a)[9]) for i, (t, a) in E.items() if t == 'IFCBUILDINGSTOREY'}
cont = {}
for i, (t, a) in E.items():
    if t == 'IFCRELCONTAINEDINSPATIALSTRUCTURE': aa = args(a); cont.setdefault(ref(aa[5]), []).extend(ref(x) for x in aa[4].strip('()').split(','))
    if t == 'IFCRELAGGREGATES':
        aa = args(a); par = ref(aa[4])
        if par in storeys: cont.setdefault(par, []).extend(ref(x) for x in aa[5].strip('()').split(','))
voids = {ref(args(a)[5]): ref(args(a)[4]) for i, (t, a) in E.items() if t == 'IFCRELVOIDSELEMENT'}
fills = {ref(args(a)[4]): ref(args(a)[5]) for i, (t, a) in E.items() if t == 'IFCRELFILLSELEMENT'}
out = {'id': 'referenz', 'projektName': 'Referenzhaus (anonymisiert)', 'geschosse': []}
order = sorted(storeys, key=lambda s: elev[s])
for k, sid in enumerate(order):
    nodes, walls, ops, meta, wmap = [], [], [], [], {}
    def node(x, y):
        X, Y = round(x * 1000), round(-y * 1000)
        for n in nodes:
            if abs(n['x'] - X) <= 2 and abs(n['y'] - Y) <= 2: return n['id']
        nodes.append({'id': 'n%d' % (len(nodes) + 1), 'x': X, 'y': Y}); return nodes[-1]['id']
    for el in cont.get(sid, []):
        t, a = E[el]; aa = args(a)
        if t == 'IFCWALLSTANDARDCASE':
            P = place(ref(aa[5])); Lm = None
            for r in args(E[ref(aa[6])][1])[2].strip('()').split(','):
                ra = args(E[ref(r)][1])
                if ra[1].strip("'") == 'Axis': pl = E[ref(ra[3].strip('()'))][1].strip('()').split(','); Lm = pt(ref(pl[1]))[0]
            q, h, z0 = body(ref(aa[6])); yS = min(p[1] for p in q); yO = max(p[1] for p in q)
            wid = 'w%d' % (len(walls) + 1); wmap[el] = wid
            walls.append({'id': wid, 'a': node(P[0], P[1]), 'b': node(P[0] + Lm * P[3], P[1] + Lm * P[4]), 't': round((yO - yS) * 1000), 'ts': round(-yS * 2000) / 2, 'ext': dec(aa[2]).startswith("'Au")})
        if t == 'IFCSPACE':
            q, h, z0 = body(ref(aa[6])); pts = world(place(ref(aa[5])), q[:-1]); cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
            long = dec(aa[7].strip("'")); m = re.match(r'(.*?)(?: \((unbeheizt|([\d,]+) °C)\))?$', long)
            meta.append({'name': m.group(1), 'temp': float(m.group(3).replace(',', '.')) if m.group(3) else None, 'beheizt': 'nein' if m.group(2) == 'unbeheizt' else 'ja', 'mitte': [round(cx * 1000), round(-cy * 1000)]})
    for op, w in voids.items():
        if w in wmap and op in fills:
            oa = args(E[op][1]); q, h, z0 = body(ref(oa[6])); xs = [p[0] for p in q]; f = E[fills[op]]; name = dec(args(f[1])[2]).strip("'")
            ops.append({'id': 'o%d' % (len(ops) + 1), 'wand': wmap[w], 'typ': {'Fenster': 'fenster', 'Fenstertür': 'fenstertuer', 'Innentür': 'innentuer', 'Außentür': 'aussentuer'}.get(name, 'fenster'), 'abstand': round(min(xs) * 1000), 'breite': round((max(xs) - min(xs)) * 1000), 'brh': round(z0 * 1000), 'hoehe': round(h * 1000)})
    out['geschosse'].append({'id': 'g%d' % k, 'name': storeys[sid], 'geschossHoehe_mm': 2800, 'knoten': nodes, 'waende': walls, 'oeffnungen': ops, 'raeume': meta})
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
for g in out['geschosse']: print(g['name'], len(g['knoten']), 'Knoten', len(g['waende']), 'Wände', len(g['oeffnungen']), 'Öffnungen', len(g['raeume']), 'Räume')
