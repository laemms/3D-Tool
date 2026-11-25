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
contained = {}
for i, (t, a) in E.items():
    if t == 'IFCRELCONTAINEDINSPATIALSTRUCTURE': aa = args(a); contained.setdefault(ref(aa[5]), []).extend(ref(x) for x in aa[4].strip('()').split(','))
    if t == 'IFCRELAGGREGATES':
        aa = args(a); par = ref(aa[4])
        if par in storeys: contained.setdefault(par, []); contained[par] += [ref(x) for x in aa[5].strip('()').split(',')]
fig, axs = plt.subplots(1, len(storeys), figsize=(7 * len(storeys), 7))
for k, (sid, sname) in enumerate(storeys.items()):
    walls, rooms = [], []
    for el in contained.get(sid, []):
        t, a = E[el]; aa = args(a)
        if t == 'IFCWALLSTANDARDCASE': q, h, z0 = body(ref(aa[6])); walls.append((dec(aa[2].strip("'")), Polygon(world(place(ref(aa[5])), q[:-1]))))
        if t == 'IFCSPACE': q, h, z0 = body(ref(aa[6])); P_ = Polygon(world(place(ref(aa[5])), q[:-1])); rooms.append((dec(aa[7].strip("'")) + ('' if P_.is_valid else ' [UNGÜLTIG]'), dec(aa[2].strip("'")), P_ if P_.is_valid else P_.buffer(0), h))
    W = [w for _, w in walls]; uw = unary_union(W) if W else Polygon()
    ov = sum(w.area for w in W) - uw.area
    R = [r[2] for r in rooms]; ur = unary_union(R) if R else Polygon()
    wr = uw.intersection(ur).area
    allu = unary_union(W + R); holes = sum(1 for g in (allu.geoms if hasattr(allu, 'geoms') else [allu]) for h in g.interiors if Polygon(h).area > 0.005)
    print(f'\n{sname}: {len(walls)} Wände, {len(rooms)} Räume, Überschneidung Wände {ov:.3f} m², Wand in Raum {wr:.3f} m², Lücken {holes}, Teile {len(allu.geoms) if hasattr(allu, "geoms") else 1}')
    for long, nr, poly, h in sorted(rooms, key=lambda r: r[1]): print(f'  {nr} {long:42s} {poly.area:7.2f} m²  lichte Höhe {h:.2f} m')
    print(f'  Summe Raumflächen {sum(r[2].area for r in rooms):.2f} m²')
    ax = axs[k] if len(storeys) > 1 else axs
    for _, w in walls: ax.fill(*w.exterior.xy, color='#26332d')
    for long, nr, poly, h in rooms: ax.fill(*poly.exterior.xy, color='#cfe9db'); c = poly.representative_point(); ax.text(c.x, c.y, f'{long.split(" (")[0]}\n{poly.area:.2f}', ha='center', va='center', fontsize=7)
    # Überschneidungen rot markieren
    for i in range(len(W)):
        for j in range(i + 1, len(W)):
            x = W[i].intersection(W[j])
            if x.area > 1e-4:
                for g in (x.geoms if hasattr(x, 'geoms') else [x]):
                    if hasattr(g, 'exterior'): ax.fill(*g.exterior.xy, color='red')
    ax.set_title(sname); ax.set_aspect('equal'); ax.axis('off')
plt.tight_layout(); plt.savefig(sys.argv[2], dpi=110)
# Öffnungen müssen entlang der Wand innerhalb des Wandkörpers liegen (sonst erkennt Raumtool 3D den Raum nicht)
bad = 0
for i, (t, a) in E.items():
    if t != 'IFCRELVOIDSELEMENT': continue
    aa = args(a); wa = args(E[ref(aa[4])][1]); ob = args(E[ref(aa[5])][1])
    wq = body(ref(wa[6]))[0]; oq = body(ref(ob[6]))[0]; wx = [x for x, y in wq]; ox = [x for x, y in oq]
    out = max(0, min(wx) - min(ox)) + max(0, max(ox) - max(wx))
    if out > 0.001: bad += 1; print(f'Öffnung ragt {out:.3f} m aus {dec(wa[2])}')
print(f'Öffnungen außerhalb der Wand: {bad}')
