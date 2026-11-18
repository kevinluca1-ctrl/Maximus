# Fitness Coach: Aufgabenplan

Home-Assistant-Add-on (Ingress): FastAPI + SQLite, Frontend ohne Build-Schritt, Three.js lokal eingebunden.

## Phase 1: Grundgerüst
- [x] Add-on-Dateien (config.yaml, Dockerfile, run.sh, repository.yaml)
- [x] Server mit Datenbank (Plan, Gewichts-Logs), Schnittstellen unter `api/`
- [x] Übungsdaten der 24 Planübungen (DE/EN, Muskeln, Griff, Anleitung, Alternativen als Namen)
- [x] Oberfläche: Plan-Ansicht, Übungssuche, Detailseite mit 3D-Viewer, Hell/Dunkel
- [ ] GitHub-Repo anlegen (Kevin legt leeres Repo an, dann Push) und in HA installieren

## Phase 2: Übungsbibliothek und Funktionsumfang (Vorbild Lyfta/Hevy)
- [x] 64 Übungen, Alternativen verlinkt, Filter nach Muskelgruppe und Gerät, eigene Übungen
- [x] Routinen anlegen/bearbeiten, Live-Training mit Vorher-Werten, Satzarten, Pausentimer
- [x] Verlauf mit Kalender und Wochen-Serie, Trainingsdetail, neue Rekorde
- [x] Übungsdetail: Info, Verlauf, Fortschritt (Gewicht, 1RM, Volumen, Wdh.), Rekorde
- [x] Profil: Trainings pro Woche, Muskelerholung, Wochen-Körperkarte, Monats-Radar, Körpermaße, Plattenrechner, CSV-Export, Einstellungen
- [x] Platzhalter-Körperkarte statt 3D für Übungen ohne Animation

## Phase 3: 3D
- [x] Körpermodell (durchgehende Haut, Muskelrelief, Hände mit Griffarten), Generator in `tools/gen_body.mjs`
- [x] Animationen: Brustpresse, Latzug breit
- [ ] Animationen für die übrigen 13 Planübungen (Plan seit 18.11.: Legs Mo, Push Mi, Pull Fr), danach Alternativen

## Phase 4: Feinschliff Tracking
- [ ] Progressionshinweis (Gewicht erhöhen, wenn oberes Wdh.-Ende erreicht)
- [ ] Trainingsmodelle (Ober/Unter, Ganzkörper) als Vorlagen mit Empfehlungen

## Phase 5: Planeditor
- [ ] Übungen tauschen, Sätze/Wiederholungen ändern
- [ ] Trainingsmodelle (PPL, Ober/Unter, 2x/3x Ganzkörper) mit Empfehlungen

## Phase 6: Kalender
- [ ] Google-Anmeldung im Add-on, Serien im Kalender "Sport" aktualisieren (derzeit Platzhalter in `gcal.py`)

## Phase 7: Abnahme
- [ ] Test auf dem Handy in HA, Installationsanleitung
