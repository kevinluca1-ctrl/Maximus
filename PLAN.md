# Fitness Coach: Aufgabenplan

Home-Assistant-Add-on (Ingress): FastAPI + SQLite, Frontend ohne Build-Schritt, Three.js lokal eingebunden.

## Phase 1: Grundgerüst
- [x] Add-on-Dateien (config.yaml, Dockerfile, run.sh, repository.yaml)
- [x] Server mit Datenbank (Plan, Gewichts-Logs), Schnittstellen unter `api/`
- [x] Übungsdaten der 24 Planübungen (DE/EN, Muskeln, Griff, Anleitung, Alternativen als Namen)
- [x] Oberfläche: Plan-Ansicht, Übungssuche, Detailseite mit 3D-Viewer, Hell/Dunkel
- [ ] GitHub-Repo anlegen und in HA installieren (GitHub-Anmeldung in dieser Umgebung fehlt)

## Phase 2: Übungsbibliothek
- [ ] Alternativübungen als eigene Einträge mit Anleitung und Muskeln (ca. 40)
- [ ] Filter nach Muskelgruppe und Gerät

## Phase 3: 3D
- [x] Körpermodell (durchgehende Haut, Muskelrelief, Hände mit Griffarten), Generator in `tools/gen_body.mjs`
- [x] Animationen: Brustpresse, Latzug breit
- [ ] Animationen für die übrigen 22 Planübungen, danach Alternativen

## Phase 4: Gewichtstracking
- [x] Server-Schnittstellen (`api/logs`)
- [ ] Eingabe je Satz, Verlauf, Diagramm, Progressionshinweis

## Phase 5: Planeditor
- [ ] Übungen tauschen, Sätze/Wiederholungen ändern
- [ ] Trainingsmodelle (PPL, Ober/Unter, 2x/3x Ganzkörper) mit Empfehlungen

## Phase 6: Kalender
- [ ] Google-Anmeldung im Add-on, Serien im Kalender "Sport" aktualisieren (derzeit Platzhalter in `gcal.py`)

## Phase 7: Abnahme
- [ ] Test auf dem Handy in HA, Installationsanleitung
