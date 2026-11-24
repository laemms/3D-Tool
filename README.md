# Gebäudemodell (cL-energiePlan)

Internes Werkzeug für cL-energiePlan: wandbasiertes Gebäudemodell (Wände, Räume, 3D, IFC).
Ergänzt das Bestandsaufnahme-Tool und läuft als zweite Seite in dessen Claude-Artefakt
(`gebaeudemodell.html`), mit gemeinsamer Datenbank.

Architekturplan (führend): Claude-Doc „BIM-Energieberater-Plattform – Architekturplan v1.0“.

## Stand

- Phase 0 (Technik-Probe) abgenommen am 24.11.2026: gemeinsame Datenbank, Geometrie-Kern,
  2D/3D, Speichern in `modell/{projektId}`.
- Referenzgebäude: Beispiel-EFH 1978 (`fixtures/beispiel.json`).

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/core.js` | Geometrie-Kern: Wandgraph (mm), Raumerkennung, Innenkontur, Umrechnung raumbasierter Grundrisse |
| `src/page.html` | Seite „Gebäudemodell“ (2D-Plan, 3D mit Three.js r128, Speichern) |
| `build.js` | baut `dist/gebaeudemodell.html` (Kern wird eingebettet) |
| `test/core.test.js` | Kern-Tests inkl. Flächen-Rundlauf am Referenzgebäude |
| `test/page_test.py` | Browser-Test der Seite mit simulierter Datenbank (Playwright) |
| `fixtures/` | Referenzdaten |

## Regeln

- Das Gebäudemodell schreibt nur in die Sammlung `modell`, nie in `projekte`
  (das Bestandsaufnahme-Tool speichert Projekte als ganzes Dokument).
- Abgeleitete Daten (Raumkontur, Fläche, Begrenzungen) erzeugt nur der Kern.
- Jede Änderung: `node test/core.test.js`, `node build.js`, `python3 test/page_test.py`.

## Veröffentlichen

`dist/gebaeudemodell.html` per `publish_files` (mode `patch`) in das Artefakt
„Bestandsaufnahme Energieberatung“ (slug `c6ab9e55-2971-4f07-9747-bd16fe857baa`) laden.
`index.html` des Artefakts nur gezielt ändern.
