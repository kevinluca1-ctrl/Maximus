# Fitness Coach

Trainings-App mit Routinen, Live-Training, Verlauf, Fortschritt und 3D-Übungsviewer. Öffnen über den Eintrag "Fitness" in der Seitenleiste.

## Google-Kalender verbinden

Die Routinen (Tag und Uhrzeit) werden als wöchentliche Serien im Kalender "Sport" abgeglichen.

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen und die **Google Calendar API** aktivieren.
2. **OAuth-Zustimmungsbildschirm**: Typ "Extern", dann auf **"In Produktion"** stellen. Im Testmodus läuft die Anmeldung nach 7 Tagen ab. Eine Prüfung durch Google ist für die eigene Nutzung nicht nötig, beim Anmelden erscheint nur ein Hinweis "Google hat diese App nicht überprüft".
3. **Anmeldedaten**: OAuth-Client-ID vom Typ **"Desktop-App"** anlegen.
4. Client-ID und Client-Secret hier in der **Konfiguration** eintragen, Kalender-ID prüfen, Add-on neu starten.
5. In der App: Profil, Einstellungen, Google-Kalender, **Bei Google anmelden**. Nach der Anmeldung zeigt der Browser eine Fehlerseite unter `127.0.0.1`. Die komplette Adresse aus der Adresszeile kopieren und in der App einfügen.
6. **Vorschau** prüfen und **Änderungen übernehmen**. Danach wird nach jedem Speichern einer Routine automatisch abgeglichen.

Regeln beim Abgleich:
- Vorhandene Serien werden über das Namenspräfix erkannt ("Gym A" in "Gym A: Push ..."). Beim ersten Verknüpfen übernimmt die App Tag und Uhrzeit aus dem Kalender.
- In der Beschreibung wird nur die nummerierte Übungsliste ersetzt, eigene Notizen, Ort und Erinnerungen bleiben.
- Ändert sich Tag oder Uhrzeit, endet die alte Serie und eine neue beginnt beim nächsten Termin. Vergangene Termine bleiben unverändert.
- Andere Termine im Kalender (z. B. Schwimmen, Laufen) werden nie verändert.
