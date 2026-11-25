# Gebäudemodell (cL-energiePlan)

Internes Werkzeug für cL-energiePlan: wandbasiertes Gebäudemodell (Wände, Räume, 3D, IFC).
Ergänzt das Bestandsaufnahme-Tool und läuft als zweite Seite in dessen Claude-Artefakt
(`gebaeudemodell.html`), mit gemeinsamer Datenbank.

Architekturplan (führend): Claude-Doc „BIM-Energieberater-Plattform – Architekturplan v1.0“.

## Stand

- Phase 0 (Technik-Probe) abgenommen am 24.11.2026: gemeinsame Datenbank, Geometrie-Kern,
  2D/3D, Speichern in `modell/{projektId}`.
- Phase A (in Arbeit): Wandausrichtung ohne Versatzstücke, Wandstöße, Editor
  (Wände zeichnen, Öffnungen, Rückgängig, Speichern), IFC-2x3-Export aus dem Wandgraph.
  Offen: Import-Test der IFC in Raumtool 3D.
- Referenzgebäude: Beispiel-EFH 1978 (`fixtures/beispiel.json`).

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/core.js` | Geometrie-Kern: Wandgraph (mm), Raumerkennung, Innenkontur, Umrechnung raumbasierter Grundrisse |
| `src/ifc.js` | IFC-2x3-Export: Wände mit Achse und Schichtdicke, Wandstöße ohne Lücken/Überschneidung, Öffnungen, Räume, stabile GUIDs |
| `src/page.html` | Seite „Gebäudemodell“ (Editor 2D, 3D mit Three.js r128, Speichern, IFC-Übergabe) |
| `build.js` | baut `dist/gebaeudemodell.html` (Kern wird eingebettet) |
| `test/core.test.js` | Kern-Tests inkl. Flächen-Rundlauf am Referenzgebäude und Bearbeiten |
| `test/ifc.test.js` | IFC: keine Überschneidungen/Lücken der Wandkörper, Datei mit web-ifc lesbar (braucht `polygon-clipping`, `web-ifc` unter `/tmp/nm`) |
| `test/page_test.py` | Browser-Test der Seite mit simulierter Datenbank (Playwright) |
| `fixtures/` | Referenzdaten |

## Regeln

- Das Gebäudemodell schreibt nur in die Sammlung `modell`, nie in `projekte`
  (das Bestandsaufnahme-Tool speichert Projekte als ganzes Dokument).
- Abgeleitete Daten (Raumkontur, Fläche, Begrenzungen) erzeugt nur der Kern.
- Jede Änderung: `node test/core.test.js`, `node test/ifc.test.js`, `node build.js`, `python3 test/page_test.py`.
- Wände: Achse a→b, Dicke `t` (mm), `ts` = Dickenanteil auf der S-Seite (rechts der Laufrichtung im Bildschirm).
- Höhen kommen aus dem Höhenmodell der Bestandsaufnahme (`GM.hoehen`, wie Raumtool 3D): Geschossniveau (OKFF) als
  Elevation, Raumhöhe je Raum als IfcSpace-Höhe, Rohdecke als IfcSlab über jedem Geschoss, Bodenplatte nur wenn erfasst.
  Raumtool 3D übernimmt Niveau und Raumhöhen, die Rohdecke aber nicht aus der IfcSlab (setzt 25 cm; Test 25.11.2026).
- Abgleich beim Laden (`GM.syncFromBA`): Fenster und Türen kommen immer aus der Bestandsaufnahme (Kennung `quelle`),
  im Editor geänderte gelten als Ersatz (`ersetzt`), eigene als `eigen`. Raumdaten werden nachgeführt.
  Geänderte Räume (`GM.geoKey`) zeigen einen Hinweis „Wände neu übernehmen“; Wände werden nie stillschweigend ersetzt.
- Geschosse übereinander (`GM.stapeln`, wie `floorAlign` der Bestandsaufnahme): gleiche Außenmaße (12 cm bzw. 1,5 %)
  werden mittig auf das EG gestellt, abweichende und „Lage frei“ bleiben wie gezeichnet. Der Export meldet das Ergebnis.
- Dach v1 (`GM.dach`): Sattel-, Pult- oder Flachdach über dem Außenumriss des obersten Geschosses als Rechteck,
  Kniestock, Überstände, Dachaufbau; „kalter Dachraum“ mit Giebel- und Kniestockwänden auf der obersten Geschossdecke.
  Einstellungen im Gebäudemodell (gespeichert im Modell), Neigung vorbelegt aus der Bestandsaufnahme. Ansicht „Haus“.
  Raumtool 3D (Test 25.11.2026): Satteldach als ein extrudierter Körper, Giebel/Kniestock als IfcBuildingElementProxy,
  Extrusion immer in +Z – getrennte Dachflächen, negative Extrusion und frei geformte IfcWall übernimmt es nur teilweise.
- Prüfdaten: Der Export legt `…_Gebaeudemodell.json` neben die IFC; `node tools/regen.js <json> <ifc>` baut sie nach.
- Raumzonen (IfcZone) nach Beheizung: „Unbeheizt“, „Beheizt 20 °C“ … Raumtool 3D übernimmt sie als Raum-Zone.
  Die Konditionierung (beheizt/unbeheizt) übernimmt Raumtool aus der IFC nicht (getestet: Zone, ObjectType,
  Pset_SpaceThermalRequirements); U-Werte setzt Chris in der Heizlast (H73), deshalb keine U-Werte im IFC.
- Eigene Testhäuser (`tools/testhaeuser.js`, Test `test/testhaeuser.test.js`, keine Kundendaten): A = KG/EG/ausgebautes DG mit
  Satteldach, B = Erker und 45°-Ecke mit Walmdach, C = Staffelgeschoss mit Pultdach. `node tools/testhaeuser.js <ordner>` schreibt IFC
  und Prüfdaten. Raumtool 3D (25.11.2026): alle drei 0 Fehler, Geschosse aufeinander, Volumen wie Modell (< 0,6 %).
  Erkenntnisse: schräge Ecken überlappen an den rechtwinkligen Wandenden (Raumtool unkritisch, Prüfung nur Info); Erker und schmale
  Vorbauten bekommen beim kalten Dach ein flaches Pultdach auf Deckenhöhe, beim ausgebauten Dach ein Schleppdach (Abseite);
  Geschossteile ohne Geschoss darüber (Staffel, Anbau) haben kein Dach aus dem Modell – Prüfung weist darauf hin.
- Dach v3 – L-, T-, U-Grundrisse (`teileModus: 'auto'`, Standard): `GM.dachTeile` zerlegt den Umriss in Rechtecke (Versätze < 50 cm
  gebündelt, Reste < 1,5 m Breite oder < 4 m² ohne eigenes Dach). Hauptteil = größtes Rechteck; Anbauten mit First senkrecht zur
  gemeinsamen Kante, inneres Ende so weit in den Nachbarn verlängert, bis der Giebel unter dessen Dach verschwindet. Sichtbare Flächen =
  oberste Fläche (konvexe Differenz), dadurch Kehlen. Schmale Streifen: Schleppdach an der Traufseite, Pultdach an der Giebelseite.
  Giebel und Kniestock nur außen. Bei mehreren Teilen kein Halbraum-Schnitt an Wänden; Kehlbalkenlage je Teil.
  Raumtool-Test 25.11.2026 (eigenes Testhaus L 12×8 + 5×5 m, ausgebaut): Walmdach Raum 1/2/3 = 93,67/95,02/43,26 m³ (Modell
  93,84/95,12/43,30), Satteldach 101,88/103,23/46,97 m³ (Modell 102,04/103,40/47,05), Kehlen korrekt, 0 Fehler.
- Dach v2: Walm- und Zeltdach (First immer längs, Überstand Traufe ringsum; Dachflächen als einzelne IfcSlab .ROOF. im IfcRoof
  HIP_ROOF/PAVILION_ROOF). Ausgebautes Dach („Dach sitzt auf dem obersten Geschoss“): Wände, Räume und Kehlbalkenlage des obersten
  Geschosses werden an der Dachunterseite abgeschnitten (IfcBooleanClippingResult .DIFFERENCE. mit IfcHalfSpaceSolid, Darstellung
  'Clipping'); `dachSchnitt: false` schaltet das ab. Dachunterseite = Minimum der Dachebenen (`GM.dachUnten`).
- Raumtool 3D, Test 25.11.2026 (Beispiel-EFH mit Walm-/Satteldach, kalt und ausgebaut):
  - Jede IfcSlab .ROOF. wird ein eigenes Raumtool-Dach; nur solche Dächer begrenzen die Raumvolumen. Das Satteldach geht deshalb
    als zwei Flächen raus (`dachPrisma: true` = alter Einzelkörper, begrenzt keine Räume).
  - Dachflächen-Profil muss eine einfache Schleife sein (Fehler bis 7a39aec: Punkte umsortiert → Fläche lag flach). Test prüft alle Profile.
  - Raumtool übernimmt Dachneigung, Traufe und First exakt. Die Plattendicke wird „Dicke der Eindeckung“, darunter legt Raumtool seine
    „Dicke der Konstruktion“ (Vorgabe 15 cm). Exportiert wird deshalb Gesamtdicke − 15 cm (`rtKonstruktion`), Pset 'Gebaeudemodell'
    nennt beide Werte. Damit rechnet Raumtool die Raumvolumen unter der Schräge wie das Gebäudemodell (Walmdach ausgebaut: Wohnen
    51,52/51,53 m³, Bad 7,47/7,44 m³, Flur 16,45/16,43 m³). Ohne Schräge identisch.
  - IfcBooleanClippingResult wird bei Wänden und Decken ignoriert: Wände kommen voll hoch an, Raumtool schneidet sie im Volumen selbst.
    Die Kehlbalkenlage wird deshalb als beschnittener Grundriss exportiert. Raumtool legt je Geschoss zusätzlich eine eigene
    Decke (25 cm) an; im ausgebauten Dach ragt sie in der 3D-Ansicht durchs Dach.
  - Prüfung meldet Fenster/Türen, die in die Dachschräge reichen (im Raumtool als Dachfenster anlegen).
  - Dachflächenfenster (`dach.fenster`: Fläche, Mitte, Unterkante, Breite, Höhe) gehen IFC-konform als IfcOpeningElement in der
    Dachplatte + IfcWindow raus. Raumtool 3D übernimmt sie nicht als Dachfenster („Fehlgeschlagen mit Ersatz“ → 3D-Objekt), auch
    nicht mit Platzierung relativ zur Dachplatte. Dachfenster und Gauben deshalb in Raumtool von Hand anlegen; kein Editor dafür.
- Prüfung im Gebäudemodell (`GMIFC.pruefen`): Wandüberschneidungen, Öffnungen über der Wand oder übereinander,
  Räume gegen die Bestandsaufnahme, Geschosse mit anderen Außenmaßen. Eintrag antippen wählt das Bauteil.
  Öffnungen werden beim Laden in den Wandkörper gerückt (`GMIFC.einruecken`). Zwei Finger zoomen (2D und 3D).
- Raumtrennung ohne Wand (offener Übergang) geht als 2-cm-Wand „Virtuelle Wand“ ins IFC: Raumtool 3D (K12) trennt
  Räume nur an Wänden, ignoriert `IfcVirtualElement` und Wände unter 2 cm (Test 25.11.2026). Kostet je Raum ~0,04 m².

## Betrieb

- **Lokal (Standard bei Chris):** `gebaeudemodell.html` liegt neben `index.html` des Bestandsaufnahme-Tools im Ordner
  `Desktop\Claude Cowork\Energieberatung\Tool Bestandsaufnahme\Bestandsaufnahme Energieberatung` und wird im Browser
  geöffnet. Die Seite liest die Projekte aus dem Browser-Speicher des Tools (`localStorage` `ba.v1`), speichert das Modell
  unter `ba.v1.modell` und schreibt die IFC in den Übergabeordner, den das Tool gewählt hat (IndexedDB `ba-fotos`, Schlüssel `scdir`).
- **Artefakt:** mit gemeinsamer Datenbank (`projekte`, eigenes `modell`).

## Veröffentlichen

`dist/gebaeudemodell.html` per `publish_files` (mode `patch`) in das Artefakt
„Bestandsaufnahme Energieberatung“ (slug `c6ab9e55-2971-4f07-9747-bd16fe857baa`) laden.
`index.html` des Artefakts nur gezielt ändern.
