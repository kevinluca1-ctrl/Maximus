# Maximus (Fitness Coach)

Persönliche Trainings-App als **Home-Assistant-Add-on** (Ingress). Funktionsumfang nach Vorbild Lyfta/Hevy.
Sprache der Oberfläche und Kommentare: Deutsch. Keine Gedankenstriche (—) in Texten.

## Aufbau
- `repository.yaml`: HA-Add-on-Repository. Add-on liegt in `fitness/` (`config.yaml`, `build.yaml`, `Dockerfile`, `run.sh`).
- `fitness/app/main.py`: FastAPI + SQLite (`$DATA_DIR/fitness.db`, im Add-on `/data`). API unter `api/`.
- `fitness/app/gcal.py`: Google-Kalender-Sync, noch Platzhalter (Phase 6).
- `fitness/app/data/`: `exercises.json` (67 Übungen, DE/EN, Muskeln, Anleitung, Alternativen), `default_routines.json` (Gym A/B/C).
- `fitness/app/static/`: Frontend ohne Build-Schritt (ES-Module). `app.js` Ansichten und Router (Hash), `core.js` Zustand und Berechnungen (1RM, Rekorde, Erholung), `bodymap.js` SVG-Körperkarte (Platzhalter), `charts.js` SVG-Diagramme.
- 3D: `viewer.js` (Three.js, vendored in `static/vendor/`), `rig.js` (Kinematik, Muskeldefinitionen), `anims.js` (Übungsanimationen), `body.bin`/`body.json` (Körpermodell), `body-data.js` (Base64-Fallback). `proto.html` = 3D-Testseite.
- `tools/gen_body.mjs`: erzeugt das Körpermodell (SDF + Surface Nets + Skinning). Nach Änderungen an `rig.js` oder dem Generator neu erzeugen:
  `node tools/gen_body.mjs 0.0072` und danach `body-data.js` neu aus `body.bin` bauen.
- `tools/build_library.py`: einmalige Erweiterung der Übungsbibliothek (bereits angewendet).
- `PLAN.md`: Phasenplan mit offenen Aufgaben.

## Lokal starten
```
pip install fastapi uvicorn httpx
cd fitness/app && DATA_DIR=/tmp/fcdata python3 -m uvicorn main:app --port 8099
```
Dann http://localhost:8099 öffnen. Alle Pfade im Frontend sind relativ (`api/...`, `static/...`), damit HA-Ingress funktioniert.

## Konventionen
- Mobile first (Testgröße 392 px Breite), Hell/Dunkel über CSS-Variablen.
- Nur Kabel/Maschinen und Kurzhanteln, keine Langhanteln (Wunsch des Nutzers).
- Google-Kalender "Sport" ist das Ziel des Kalender-Syncs (ID in `fitness/config.yaml`).
