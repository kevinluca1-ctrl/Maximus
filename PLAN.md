# Fitness Coach: Aufgabenplan

Home-Assistant-Add-on (Ingress): FastAPI + SQLite, Frontend ohne Build-Schritt, Three.js lokal eingebunden.

## Phase 1: Grundgerüst
- [x] Add-on-Dateien (config.yaml, Dockerfile, run.sh, repository.yaml)
- [x] Server mit Datenbank (Plan, Gewichts-Logs), Schnittstellen unter `api/`
- [x] Übungsdaten der 24 Planübungen (DE/EN, Muskeln, Griff, Anleitung, Alternativen als Namen)
- [x] Oberfläche: Plan-Ansicht, Übungssuche, Detailseite mit 3D-Viewer, Hell/Dunkel
- [x] Docker-Image lokal gebaut und getestet (amd64, Ingress-Präfix, `/data`); Abhängigkeiten so gepinnt, dass es für aarch64 und armv7 fertige Wheels gibt
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
- [ ] Animationen für die übrigen 22 Planübungen, danach Alternativen

## Phase 4: Feinschliff Tracking
- [x] Progressionshinweis (Gewicht erhöhen, wenn oberes Wdh.-Ende erreicht): Vorschlag aus der letzten Einheit mit "Übernehmen", Live-Hinweis und Liste auf dem Abschlussbildschirm
- [x] Trainingsmodelle (Ober/Unter, Ganzkörper) als Vorlagen mit Empfehlungen

## Phase 5: Planeditor
- [x] Übungen tauschen (Alternativen zuerst), Sätze/Wiederholungen ändern
- [x] Trainingsmodelle (PPL, Ober/Unter, 2x/3x Ganzkörper) mit Empfehlungen: Ansicht `#vorlagen`, "Aus Vorlage füllen" im Routinen-Editor, Wochenvolumen je Muskelgruppe gegen Richtwerte (`tools/build_templates.py`)

## Phase 6: Kalender
- [ ] Google-Anmeldung im Add-on, Serien im Kalender "Sport" aktualisieren (derzeit Platzhalter in `gcal.py`)

## Phase 7: Abnahme
- [ ] Test auf dem Handy in HA, Installationsanleitung
