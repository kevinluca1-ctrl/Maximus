"""Tests für den Kalender-Sync gegen einen nachgebauten Google-Kalender.

Aufruf: cd fitness/app && python3 -m pytest ../../tests -q
"""
import copy
import datetime as dt
import json
import sys
import urllib.parse
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "fitness/app"))
import gcal  # noqa: E402

CAL = "sport@group.calendar.google.com"
NOW = dt.datetime(2026, 11, 15, 19, 0, tzinfo=dt.timezone.utc)  # Sonntag
GYM_A_DESC = ("Push: Brust, Schultern, Trizeps\n\nAufwärmen: 5 min Rad.\n\n"
              "1. Brustpresse (Maschine): 4 x 6-10\n2. Alte Übung: 3 x 8-12\n\n"
              "Progression: oberes Ende erreicht, Gewicht erhöhen.\nDanach: Abendessen.")


def master(eid, summary, start, end, desc="", **extra):
    return {"id": eid, "status": "confirmed", "summary": summary, "description": desc,
            "start": {"dateTime": start, "timeZone": "Europe/Berlin"}, "end": {"dateTime": end, "timeZone": "Europe/Berlin"},
            "recurrence": ["RRULE:FREQ=WEEKLY"], "location": "Fitnessstudio",
            "reminders": {"useDefault": False, "overrides": [{"method": "popup", "minutes": 30}]}, **extra}


class FakeGoogle:
    def __init__(self):
        self.events = {e["id"]: e for e in [
            master("gymA", "Gym A: Push (Brust, Schultern, Trizeps)", "2026-11-09T18:15:00+01:00", "2026-11-09T19:40:00+01:00", GYM_A_DESC),
            master("gymB", "Gym B: Beine (nach Tanzkurs)", "2026-11-11T21:00:00+01:00", "2026-11-11T22:00:00+01:00", "Beine\n\n1. Beinpresse: 4 x 6-10"),
            master("gymC", "Gym C: Pull (Rücken, Bizeps)", "2026-11-13T18:15:00+01:00", "2026-11-13T19:40:00+01:00", "1. Latzug am Kabel, breit: 4 x 8-12"),
            master("swim", "Schwimmen: locker / Technik", "2026-11-10T18:30:00+01:00", "2026-11-10T19:30:00+01:00", "Schwimmen"),
            master("run", "Laufen: locker 40-60 min", "2026-11-15T10:00:00+01:00", "2026-11-15T11:00:00+01:00"),
        ]}
        self.log, self.n = [], 0
        self.token_calls = []

    def __call__(self, req: httpx.Request):
        url = str(req.url)
        if url.startswith(gcal.TOKEN_URL):
            form = urllib.parse.parse_qs(req.content.decode())
            self.token_calls.append(form)
            if form["grant_type"] == ["authorization_code"]:
                assert form["code_verifier"][0] and form["redirect_uri"] == [gcal.REDIRECT_URI]
                if form["code"] != ["gutercode"]:
                    return httpx.Response(400, json={"error": "invalid_grant"})
                return httpx.Response(200, json={"access_token": "at1", "refresh_token": "rt1", "expires_in": 3600})
            return httpx.Response(200, json={"access_token": "at2", "expires_in": 3600})
        if url.startswith(gcal.REVOKE_URL):
            return httpx.Response(200)
        assert req.headers["authorization"].startswith("Bearer ")
        path = urllib.parse.unquote(req.url.path)
        assert path.startswith(f"/calendar/v3/calendars/{CAL}/events")
        eid = path.split("/events")[1].strip("/")
        self.log.append((req.method, eid))
        if req.method == "GET" and not eid:
            return httpx.Response(200, json={"items": [copy.deepcopy(e) for e in self.events.values()]})
        if req.method == "GET":
            e = self.events.get(eid)
            return httpx.Response(200, json=copy.deepcopy(e)) if e else httpx.Response(404, json={"error": {"message": "Not Found"}})
        if req.method == "POST":
            self.n += 1
            body = json.loads(req.content)
            body["id"] = f"new{self.n}"
            body["status"] = "confirmed"
            self.events[body["id"]] = body
            return httpx.Response(200, json=body)
        if req.method == "PATCH":
            self.events[eid].update(json.loads(req.content))
            return httpx.Response(200, json=self.events[eid])
        if req.method == "DELETE":
            self.events.pop(eid)
            return httpx.Response(204)
        raise AssertionError(req)


@pytest.fixture
def g(tmp_path, monkeypatch):
    fake = FakeGoogle()
    monkeypatch.setattr(gcal, "TRANSPORT", httpx.MockTransport(fake))
    monkeypatch.setattr(gcal, "API", "https://www.googleapis.com/calendar/v3")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "geheim")
    monkeypatch.setenv("GOOGLE_CALENDAR_ID", CAL)
    monkeypatch.setenv("TZ", "Europe/Berlin")
    gcal.setup(tmp_path)
    return fake


def connect():
    url = gcal.auth_url()["url"]
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert q["redirect_uri"] == [gcal.REDIRECT_URI] and q["code_challenge_method"] == ["S256"]
    assert q["access_type"] == ["offline"]
    return gcal.exchange(f"http://127.0.0.1:8765/?state={q['state'][0]}&code=gutercode&scope=x")


NAMES = {"chest_press": "Brustpresse (Maschine)", "incline_press": "Schrägbank-Brustpresse (Maschine)",
         "leg_press": "Beinpresse", "lat_pulldown_wide": "Latzug am Kabel, breit"}


def routines():
    it = lambda e, s, r: {"exercise": e, "sets": s, "reps": r, "rest": 90}  # noqa: E731
    return [
        {"id": "A", "name": "Gym A: Push (Brust, Schultern, Trizeps)", "weekday": "MO", "start": "18:15", "end": "19:40",
         "items": [it("chest_press", 4, "6-10"), it("incline_press", 3, "8-12")]},
        {"id": "B", "name": "Gym B: Beine", "weekday": "WE", "start": "21:00", "end": "22:00", "items": [it("leg_press", 4, "6-10")]},
        {"id": "C", "name": "Gym C: Pull (Rücken, Bizeps)", "weekday": "FR", "start": "18:15", "end": "19:40",
         "items": [it("lat_pulldown_wide", 4, "8-12")]},
    ]


def test_anmeldung(g):
    assert gcal.status()["configured"] and not gcal.status()["connected"]
    st = connect()
    assert st["connected"]
    stored = json.loads((gcal.DATA_DIR / "google.json").read_text())
    assert stored["token"]["refresh_token"] == "rt1" and "pending" not in stored


def test_anmeldung_falscher_state(g):
    gcal.auth_url()
    with pytest.raises(Exception) as e:
        gcal.exchange("http://127.0.0.1:8765/?state=fremd&code=gutercode")
    assert "gehört nicht" in str(e.value.detail)


def test_erster_sync_uebernimmt_serien(g):
    connect()
    prev = gcal.sync(routines(), NAMES, dry=True, now=NOW)
    assert not [m for m in g.log if m[0] in ("POST", "PATCH", "DELETE")], "Vorschau darf nichts ändern"
    kinds = {(a["routine"], a["kind"]) for a in prev["actions"]}
    assert ("A", "adopt") in kinds and ("B", "adopt") in kinds and ("C", "adopt") in kinds
    assert not any(a["kind"] == "create" for a in prev["actions"])

    gcal.sync(routines(), NAMES, dry=False, now=NOW)
    a = g.events["gymA"]
    # Notizen bleiben, nur die Übungsliste ist neu
    assert "Aufwärmen: 5 min Rad." in a["description"] and "Progression" in a["description"]
    assert "2. Schrägbank-Brustpresse (Maschine): 3 x 8-12" in a["description"] and "Alte Übung" not in a["description"]
    assert a["extendedProperties"]["private"]["fitness_routine"] == "A"
    # Titel beim Übernehmen unverändert (auch "nach Tanzkurs")
    assert g.events["gymB"]["summary"] == "Gym B: Beine (nach Tanzkurs)"
    # Schwimmen und Laufen unberührt
    assert "extendedProperties" not in g.events["swim"] and "extendedProperties" not in g.events["run"]
    assert len(g.events) == 5

    # Zweiter Lauf: alles aktuell
    g.log.clear()
    res = gcal.sync(routines(), NAMES, dry=False, now=NOW)
    assert res["changes"] == 0 and not [m for m in g.log if m[0] != "GET"]


def test_erstes_verknuepfen_uebernimmt_kalenderzeit(g):
    connect()
    rs = routines()
    rs[1]["start"], rs[1]["end"] = "18:15", "19:40"  # App-Standard, Kalender sagt 21:00 bis 22:00
    prev = gcal.sync(rs, NAMES, dry=True, now=NOW)
    assert prev["routine_updates"] == {"B": {"weekday": "WE", "start": "21:00", "end": "22:00"}}
    assert not any(a["kind"] == "move" for a in prev["actions"])
    res = gcal.sync(rs, NAMES, dry=False, now=NOW)
    assert g.events["gymB"]["start"]["dateTime"].startswith("2026-11-11T21:00") and len(g.events) == 5
    assert "1. Beinpresse: 4 x 6-10" in g.events["gymB"]["description"]
    rs[1].update(res["routine_updates"]["B"])
    assert gcal.sync(rs, NAMES, dry=False, now=NOW)["changes"] == 0


def test_zeitaenderung_teilt_serie(g):
    connect()
    gcal.sync(routines(), NAMES, dry=False, now=NOW)
    rs = routines()
    rs[1]["start"], rs[1]["end"] = "18:15", "19:40"
    res = gcal.sync(rs, NAMES, dry=False, now=NOW)
    assert [a["kind"] for a in res["actions"] if a["routine"] == "B"] == ["move"]
    old = g.events["gymB"]
    assert old["recurrence"][0].endswith("UNTIL=20261115T190000Z")
    new = [e for e in g.events.values() if e["id"].startswith("new")]
    assert len(new) == 1
    n = new[0]
    assert n["start"] == {"dateTime": "2026-11-18T18:15:00", "timeZone": "Europe/Berlin"}
    assert n["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=WE"]
    assert n["location"] == "Fitnessstudio" and n["reminders"]["overrides"][0]["minutes"] == 30
    assert n["summary"] == "Gym B: Beine (nach Tanzkurs)"
    # nächster Lauf arbeitet mit der neuen Serie
    res = gcal.sync(rs, NAMES, dry=False, now=NOW)
    assert res["changes"] == 0


def test_umbenennen_neu_und_loeschen(g):
    connect()
    gcal.sync(routines(), NAMES, dry=False, now=NOW)
    rs = routines()
    rs[0]["name"] = "Gym A: Push"
    rs.pop(2)  # Gym C gelöscht
    rs.append({"id": "D", "name": "Gym D: Ganzkörper", "weekday": "SA", "start": "10:00", "end": "11:00",
               "items": [{"exercise": "leg_press", "sets": 3, "reps": "8-12", "rest": 90}]})
    res = gcal.sync(rs, NAMES, dry=False, now=NOW)
    kinds = {(a["routine"], a["kind"]) for a in res["actions"]}
    assert ("A", "update") in kinds and ("D", "create") in kinds and ("C", "end") in kinds
    assert g.events["gymA"]["summary"] == "Gym A: Push"
    assert "UNTIL=" in g.events["gymC"]["recurrence"][0]
    d = next(e for e in g.events.values() if e.get("summary") == "Gym D: Ganzkörper")
    assert d["start"]["dateTime"] == "2026-11-21T10:00:00" and d["location"] == "Fitnessstudio"
    assert d["description"] == "1. Beinpresse: 3 x 8-12"


def test_serie_in_zukunft_wird_verschoben_statt_geteilt(g):
    connect()
    rs = routines()[:1]
    gcal.sync(rs, NAMES, dry=False, now=dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc))
    rs[0]["weekday"] = "TU"
    gcal.sync(rs, NAMES, dry=False, now=dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc))
    a = g.events["gymA"]
    assert a["start"]["dateTime"] == "2026-11-03T18:15:00" and a["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=TU"]
    assert not any(e.startswith("new") for e in g.events)


def test_token_wird_erneuert(g, monkeypatch):
    connect()
    st = json.loads((gcal.DATA_DIR / "google.json").read_text())
    st["token"]["expires_at"] = 0
    (gcal.DATA_DIR / "google.json").write_text(json.dumps(st))
    gcal.sync(routines(), NAMES, dry=True, now=NOW)
    assert g.token_calls[-1]["grant_type"] == ["refresh_token"]


def test_beschreibung_ohne_liste():
    assert gcal.merge_description("Notiz", ["1. X: 3 x 10"]) == "Notiz\n\n1. X: 3 x 10"
    assert gcal.merge_description("", ["1. X: 3 x 10"]) == "1. X: 3 x 10"
