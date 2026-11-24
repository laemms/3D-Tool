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
