"""Google-Kalender-Sync: Routinen als wöchentliche Serien im Kalender "Sport".

Anmeldung: OAuth-Client vom Typ "Desktop-App" mit Loopback-Redirect (http://127.0.0.1:PORT/) und PKCE.
Das Handy erreicht 127.0.0.1 nicht, deshalb zeigt der Browser nach der Anmeldung eine Fehlerseite.
Die Adresse aus der Adresszeile (enthält ?code=...) fügt man in der App ein, der Server tauscht den Code.

Sync-Regeln:
- Eine Routine mit Tag und Uhrzeit entspricht einer Serie (RRULE wöchentlich). Zuordnung über
  extendedProperties.private.fitness_routine, beim ersten Mal über das Namenspräfix ("Gym A" aus "Gym A: Push").
- In der Beschreibung wird nur die nummerierte Übungsliste ersetzt, eigene Notizen bleiben.
- Der Titel ändert sich nur, wenn die Routine in der App umbenannt wurde.
- Beim ersten Verknüpfen einer vorhandenen Serie gewinnt der Kalender: Tag und Zeit gehen in die Routine.
- Danach gewinnt die App. Neue Zeit oder neuer Tag: alte Serie endet jetzt, neue Serie (mit Ort, Erinnerungen, Notizen) beginnt
  beim nächsten Termin. So bleiben vergangene Termine unverändert.
- Gelöschte Routinen: Serie endet jetzt. Andere Termine (Schwimmen, Laufen) werden nie angefasst.
"""
import base64
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import threading
import time
import urllib.parse
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = os.environ.get("GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token")
REVOKE_URL = os.environ.get("GOOGLE_REVOKE_URL", "https://oauth2.googleapis.com/revoke")
API = os.environ.get("GOOGLE_API_BASE", "https://www.googleapis.com/calendar/v3")
SCOPE = "https://www.googleapis.com/auth/calendar.events"
REDIRECT_URI = "http://127.0.0.1:8765/"
WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
DAY_NAMES = {"MO": "Montag", "TU": "Dienstag", "WE": "Mittwoch", "TH": "Donnerstag", "FR": "Freitag", "SA": "Samstag", "SU": "Sonntag"}
PROP = "fitness_routine"

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent / "_data"))
TRANSPORT = None  # Tests setzen hier einen httpx.MockTransport
_lock = threading.RLock()


def setup(data_dir):
    global DATA_DIR
    DATA_DIR = Path(data_dir)


# ---------- Konfiguration und Zustand ----------
def config():
    opts = {}
    p = DATA_DIR / "options.json"  # im Add-on schreibt der Supervisor die Optionen hierhin
    if p.exists():
        try:
            opts = json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            pass
    return {
        "client_id": os.environ.get("GOOGLE_CLIENT_ID") or opts.get("google_client_id") or "",
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET") or opts.get("google_client_secret") or "",
        "calendar_id": os.environ.get("GOOGLE_CALENDAR_ID") or opts.get("google_calendar_id") or "",
        "tz": os.environ.get("TZ") or "Europe/Berlin",
    }


def _state_path():
    return DATA_DIR / "google.json"


def _load():
    p = _state_path()
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def _save(st):
    p = _state_path()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(p)


def status():
    c, st = config(), _load()
    configured = bool(c["client_id"] and c["client_secret"] and c["calendar_id"])
    connected = bool(st.get("token", {}).get("refresh_token"))
    note = ("" if configured else
            "Client-ID, Client-Secret und Kalender-ID fehlen in der Add-on-Konfiguration.")
    return {"configured": configured, "connected": connected, "calendar_id": c["calendar_id"],
            "last_sync": st.get("last_sync"), "linked": len(st.get("map", {})), "note": note,
            "redirect_uri": REDIRECT_URI}


# ---------- OAuth ----------
def _client():
    return httpx.Client(timeout=20, transport=TRANSPORT)


def auth_url():
    c = config()
    if not (c["client_id"] and c["client_secret"]):
        raise HTTPException(400, "Client-ID und Client-Secret fehlen in der Add-on-Konfiguration")
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    with _lock:
        st = _load()
        st["pending"] = {"state": state, "verifier": verifier, "created": time.time()}
        _save(st)
    q = {"client_id": c["client_id"], "redirect_uri": REDIRECT_URI, "response_type": "code", "scope": SCOPE,
         "access_type": "offline", "prompt": "consent", "state": state,
         "code_challenge": challenge, "code_challenge_method": "S256"}
    return {"url": AUTH_URL + "?" + urllib.parse.urlencode(q), "redirect_uri": REDIRECT_URI}


def exchange(pasted: str):
    """Nimmt die eingefügte Redirect-Adresse (oder nur den Code) und holt die Tokens."""
    pasted = (pasted or "").strip()
    if not pasted:
        raise HTTPException(400, "Bitte die Adresse aus der Adresszeile einfügen")
    # Ganze Adresse, nur der Query-Teil oder nur der Code
    q = urllib.parse.parse_qs(pasted.split("?", 1)[-1]) if ("code=" in pasted or "error=" in pasted) else {}
    if q.get("error"):
        raise HTTPException(400, "Google hat die Anmeldung abgelehnt: " + q["error"][0])
    code = (q.get("code") or [pasted])[0]
    st = _load()
    pend = st.get("pending")
    if not pend or time.time() - pend["created"] > 1800:
        raise HTTPException(400, "Anmeldung abgelaufen. Bitte erneut auf \"Bei Google anmelden\" tippen")
    if q.get("state") and q["state"][0] != pend["state"]:
        raise HTTPException(400, "Die Adresse gehört nicht zu dieser Anmeldung. Bitte erneut anmelden")
    c = config()
    with _client() as h:
        r = h.post(TOKEN_URL, data={"code": code, "client_id": c["client_id"], "client_secret": c["client_secret"],
                                    "redirect_uri": REDIRECT_URI, "grant_type": "authorization_code",
                                    "code_verifier": pend["verifier"]})
    if r.status_code != 200:
        raise HTTPException(400, "Code konnte nicht eingelöst werden: " + _err_text(r))
    tok = r.json()
    if not tok.get("refresh_token"):
        raise HTTPException(400, "Google hat kein Refresh-Token geliefert. Bitte erneut anmelden")
    with _lock:
        st = _load()
        st.pop("pending", None)
        st["token"] = {"refresh_token": tok["refresh_token"], "access_token": tok.get("access_token"),
                       "expires_at": time.time() + int(tok.get("expires_in", 0)) - 60}
        _save(st)
    return status()


def disconnect():
    with _lock:
        st = _load()
        tok = st.pop("token", None)
        st.pop("last_sync", None)  # danach wieder mit Vorschau starten
        _save(st)
    if tok:
        try:
            with _client() as h:
                h.post(REVOKE_URL, data={"token": tok["refresh_token"]})
        except httpx.HTTPError:
            pass
    return status()


def _err_text(r):
    try:
        j = r.json()
        e = j.get("error")
        if isinstance(e, dict):
            return e.get("message") or str(e)
        return j.get("error_description") or str(e or r.status_code)
    except ValueError:
        return str(r.status_code)


def _access_token():
    st = _load()
    tok = st.get("token")
    if not tok:
        raise HTTPException(401, "Nicht mit Google verbunden")
    if tok.get("access_token") and tok.get("expires_at", 0) > time.time():
        return tok["access_token"]
    c = config()
    with _client() as h:
        r = h.post(TOKEN_URL, data={"client_id": c["client_id"], "client_secret": c["client_secret"],
                                    "refresh_token": tok["refresh_token"], "grant_type": "refresh_token"})
    if r.status_code != 200:
        if r.status_code in (400, 401) and "invalid_grant" in r.text:
            with _lock:
                st = _load(); st.pop("token", None); _save(st)
            raise HTTPException(401, "Die Google-Anmeldung ist abgelaufen. Bitte neu verbinden")
        raise HTTPException(502, "Google-Token konnte nicht erneuert werden: " + _err_text(r))
    j = r.json()
    with _lock:
        st = _load()
        st["token"].update(access_token=j["access_token"], expires_at=time.time() + int(j.get("expires_in", 3600)) - 60)
        _save(st)
    return j["access_token"]


class Cal:
    """Kleiner Wrapper um die Calendar-API für einen Kalender."""

    def __init__(self, calendar_id):
        self.base = f"{API}/calendars/{urllib.parse.quote(calendar_id, safe='')}/events"
        self.h = _client()
        self.h.headers["Authorization"] = "Bearer " + _access_token()

    def _do(self, method, url, ok=(200,), **kw):
        r = self.h.request(method, url, **kw)
        if r.status_code not in ok:
            raise HTTPException(502, f"Google-Kalender: {_err_text(r)}")
        return r

    def masters(self, since):
        out, page = [], None
        while True:
            params = {"singleEvents": "false", "timeMin": since, "maxResults": 250, "showDeleted": "false"}
            if page:
                params["pageToken"] = page
            j = self._do("GET", self.base, params=params).json()
            out += [e for e in j.get("items", []) if e.get("recurrence") and e.get("status") != "cancelled"]
            page = j.get("nextPageToken")
            if not page:
                return out

    def get(self, eid):
        r = self.h.get(f"{self.base}/{urllib.parse.quote(eid, safe='')}")
        if r.status_code in (404, 410):
            return None
        if r.status_code != 200:
            raise HTTPException(502, f"Google-Kalender: {_err_text(r)}")
        e = r.json()
        return None if e.get("status") == "cancelled" else e

    def insert(self, body):
        return self._do("POST", self.base, json=body).json()

    def patch(self, eid, body):
        return self._do("PATCH", f"{self.base}/{urllib.parse.quote(eid, safe='')}", json=body).json()

    def delete(self, eid):
        self._do("DELETE", f"{self.base}/{urllib.parse.quote(eid, safe='')}", ok=(200, 204, 404, 410))

    def close(self):
        self.h.close()


# ---------- Hilfen für Termine ----------
def name_key(s):
    return (s or "").split(":")[0].strip().lower()


def exercise_lines(routine, names):
    return [f"{i}. {names.get(it['exercise'], it['exercise'])}: {it['sets']} x {it['reps']}"
            for i, it in enumerate(routine.get("items", []), 1)]


def merge_description(old, lines):
    """Ersetzt den Block nummerierter Zeilen ("1. ...") durch die neue Liste, der Rest bleibt."""
    ls = (old or "").split("\n") if old else []
    idx = [i for i, l in enumerate(ls) if re.match(r"^\s*\d+\.\s", l)]
    if idx:
        new = ls[:idx[0]] + lines + ls[idx[-1] + 1:]
    else:
        new = ls + ([""] if ls else []) + lines
    return "\n".join(new)


def ev_time(part, tz):
    """Zeit eines Termins, auch ohne Offset (dann gilt das timeZone-Feld)."""
    t = dt.datetime.fromisoformat(part["dateTime"].replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=ZoneInfo(part.get("timeZone")) if part.get("timeZone") else tz)


def event_timing(ev, tz):
    s = ev_time(ev["start"], tz).astimezone(tz)
    e = ev_time(ev["end"], tz).astimezone(tz)
    return WEEKDAYS[s.weekday()], s.strftime("%H:%M"), e.strftime("%H:%M")


def next_occurrence(weekday, start, end, tz, after):
    h, m = map(int, start.split(":"))
    eh, em = map(int, end.split(":"))
    day = after.astimezone(tz).date()
    for i in range(8):
        d = day + dt.timedelta(days=i)
        s = dt.datetime(d.year, d.month, d.day, h, m, tzinfo=tz)
        if d.weekday() == WEEKDAYS.index(weekday) and s > after:
            e = dt.datetime(d.year, d.month, d.day, eh, em, tzinfo=tz)
            if e <= s:
                e += dt.timedelta(days=1)
            return s, e
    raise ValueError("kein Termin gefunden")


def _when(s, e, tzname):
    f = "%Y-%m-%dT%H:%M:%S"
    return {"start": {"dateTime": s.strftime(f), "timeZone": tzname}, "end": {"dateTime": e.strftime(f), "timeZone": tzname}}


def _until_recurrence(rec, until_utc):
    """RRULE mit UNTIL abschließen, andere Zeilen (EXDATE) bleiben."""
    u = until_utc.strftime("%Y%m%dT%H%M%SZ")
    out = []
    for line in rec:
        if line.startswith("RRULE:"):
            parts = [p for p in line[6:].split(";") if not p.startswith(("UNTIL=", "COUNT="))]
            line = "RRULE:" + ";".join(parts + ["UNTIL=" + u])
        out.append(line)
    return out


COPY_FIELDS = ("location", "reminders", "colorId", "transparency", "visibility", "description", "summary")


# ---------- Sync ----------
def sync(routines, names, dry=True, now=None):
    c = config()
    if not c["calendar_id"]:
        raise HTTPException(400, "Kalender-ID fehlt in der Add-on-Konfiguration")
    tz, tzname = ZoneInfo(c["tz"]), c["tz"]
    now = now or dt.datetime.now(dt.timezone.utc)
    with _lock:
        st = _load()
        mapping = dict(st.get("map", {}))
        cal = Cal(c["calendar_id"])
        pulled = {}
        try:
            actions = _plan_and_apply(cal, routines, names, mapping, tz, tzname, now, dry, pulled)
        finally:
            cal.close()
        if not dry:
            st = _load()
            st["map"] = mapping
            st["last_sync"] = now.isoformat()
            _save(st)
    return {"dry": dry, "actions": actions, "changes": sum(1 for a in actions if a["kind"] != "ok"),
            "routine_updates": pulled}


def _plan_and_apply(cal, routines, names, mapping, tz, tzname, now, dry, pulled):
    actions = []
    masters = None
    claimed = {m["event_id"] for m in mapping.values()}
    style = None  # Ort, Erinnerungen usw. einer vorhandenen Gym-Serie für neue Serien
    wanted = [r for r in routines if r.get("weekday") in WEEKDAYS and r.get("start") and r.get("end")]

    def act(rid, name, kind, text):
        actions.append({"routine": rid, "name": name, "kind": kind, "text": text})

    for r in wanted:
        rid, sig = r["id"], f"{r['weekday']}|{r['start']}|{r['end']}"
        lines = exercise_lines(r, names)
        m = mapping.get(rid)
        ev = cal.get(m["event_id"]) if m else None
        adopted = False
        if ev is None:
            if masters is None:
                masters = cal.masters((now - dt.timedelta(days=1)).isoformat().replace("+00:00", "Z"))
            cands = [e for e in masters if e["id"] not in claimed and "dateTime" in e.get("start", {})]
            ev = next((e for e in cands if e.get("extendedProperties", {}).get("private", {}).get(PROP) == rid), None)
            ev = ev or next((e for e in cands if name_key(e.get("summary")) == name_key(r["name"])), None)
            if ev:
                adopted = True
                claimed.add(ev["id"])
                act(rid, r["name"], "adopt", f"Vorhandene Serie „{ev.get('summary')}“ wird verknüpft")
        if ev is None:
            s, e = next_occurrence(r["weekday"], r["start"], r["end"], tz, now)
            body = {k: v for k, v in (style or {}).items() if k in ("location", "reminders", "colorId")}
            body.update(summary=r["name"], description=merge_description("", lines),
                        recurrence=[f"RRULE:FREQ=WEEKLY;BYDAY={r['weekday']}"],
                        extendedProperties={"private": {PROP: rid}}, **_when(s, e, tzname))
            act(rid, r["name"], "create", f"Neue Serie {DAY_NAMES[r['weekday']]}s {r['start']} bis {r['end']}, ab {s.strftime('%d.%m.')}")
            if not dry:
                new = cal.insert(body)
                mapping[rid] = {"event_id": new["id"], "sig": sig, "name": r["name"]}
            continue

        style = style or {k: ev[k] for k in ("location", "reminders", "colorId") if k in ev}
        patch = {}
        if ev.get("extendedProperties", {}).get("private", {}).get(PROP) != rid:
            patch["extendedProperties"] = {"private": {PROP: rid}}
        new_desc = merge_description(ev.get("description", ""), lines)
        if new_desc != (ev.get("description") or ""):
            patch["description"] = new_desc
            act(rid, r["name"], "update", "Übungsliste in der Beschreibung wird aktualisiert")
        if m and m.get("name") and m["name"] != r["name"]:
            patch["summary"] = r["name"]
            act(rid, r["name"], "update", f"Titel wird zu „{r['name']}“")
        cur = event_timing(ev, tz)
        new_id = ev["id"]
        if adopted and cur != (r["weekday"], r["start"], r["end"]):
            # Erstes Verknüpfen: der Kalender war bisher maßgeblich, also Tag und Zeit in die Routine übernehmen
            pulled[rid] = {"weekday": cur[0], "start": cur[1], "end": cur[2]}
            sig = "|".join(cur)
            act(rid, r["name"], "pull", f"Tag und Zeit aus dem Kalender übernommen: {DAY_NAMES[cur[0]]} {cur[1]} bis {cur[2]}")
            if patch and not dry:
                cal.patch(ev["id"], patch)
        elif cur != (r["weekday"], r["start"], r["end"]):
            s, e = next_occurrence(r["weekday"], r["start"], r["end"], tz, now)
            old = f"{DAY_NAMES[cur[0]]} {cur[1]} bis {cur[2]}"
            nxt = f"{DAY_NAMES[r['weekday']]} {r['start']} bis {r['end']}"
            started = ev_time(ev["start"], tz) <= now
            rrule = [f"RRULE:FREQ=WEEKLY;BYDAY={r['weekday']}"]
            if not started:
                patch.update(recurrence=rrule, **_when(s, e, tzname))
                act(rid, r["name"], "move", f"Termin wird verschoben: {old} → {nxt}")
                if not dry:
                    cal.patch(ev["id"], patch)
            else:
                act(rid, r["name"], "move", f"Serie {old} endet jetzt, neue Serie {nxt} ab {s.strftime('%d.%m.')}")
                if not dry:
                    cal.patch(ev["id"], {"recurrence": _until_recurrence(ev["recurrence"], now)})
                    body = {k: ev[k] for k in COPY_FIELDS if k in ev}
                    body.update(patch)
                    body.update(recurrence=rrule, extendedProperties={"private": {PROP: rid}}, **_when(s, e, tzname))
                    new_id = cal.insert(body)["id"]
        elif patch and not dry:
            cal.patch(ev["id"], patch)
        if not any(a["routine"] == rid for a in actions):
            act(rid, r["name"], "ok", "Aktuell")
        if not dry:
            mapping[rid] = {"event_id": new_id, "sig": sig, "name": r["name"]}

    # Serien zu gelöschten Routinen oder Routinen ohne festen Tag beenden
    keep = {r["id"] for r in wanted}
    for rid, m in list(mapping.items()):
        if rid in keep:
            continue
        ev = cal.get(m["event_id"])
        if ev:
            act(rid, m.get("name", rid), "end", f"Serie „{ev.get('summary')}“ endet jetzt (Routine gelöscht oder ohne festen Tag)")
            if not dry:
                if ev_time(ev["start"], tz) > now:
                    cal.delete(ev["id"])
                else:
                    cal.patch(ev["id"], {"recurrence": _until_recurrence(ev["recurrence"], now)})
        if not dry:
            mapping.pop(rid)
    return actions
