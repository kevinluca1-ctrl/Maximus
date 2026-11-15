"""Fitness Coach: Home-Assistant-Add-on (Ingress) mit FastAPI + SQLite.

Daten: Routinen, Trainings mit Sätzen, Körpermaße, eigene Übungen, Einstellungen,
laufendes Training (zum Fortsetzen auf jedem Gerät).
"""
import csv
import io
import json
import os
import sqlite3
import datetime as dt
from pathlib import Path

from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

import gcal

BASE = Path(__file__).parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE / "_data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "fitness.db"

app = FastAPI(title="Fitness Coach")


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init_db():
    with db() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                routine_id TEXT, name TEXT NOT NULL,
                started TEXT NOT NULL, ended TEXT NOT NULL, note TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
                exercise_id TEXT NOT NULL, ex_order INTEGER NOT NULL, set_no INTEGER NOT NULL,
                kind TEXT NOT NULL DEFAULT 'N', weight REAL NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sets_ex ON sets(exercise_id);
            CREATE TABLE IF NOT EXISTS measurements (
                id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
                weight REAL, waist REAL, bodyfat REAL, note TEXT DEFAULT ''
            );
            """
        )


def kv_get(key, default=None):
    with db() as con:
        r = con.execute("SELECT v FROM kv WHERE k=?", (key,)).fetchone()
    return json.loads(r["v"]) if r else default


def kv_set(key, value):
    with db() as con:
        con.execute("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
                    (key, json.dumps(value, ensure_ascii=False)))


def kv_del(key):
    with db() as con:
        con.execute("DELETE FROM kv WHERE k=?", (key,))


def load_json(name):
    return json.loads((BASE / "data" / name).read_text(encoding="utf-8"))


init_db()

DEFAULT_SETTINGS = {"rest_default": 90, "theme": "auto", "unit": "kg", "rest_vibrate": True}


# ---------- Übungen ----------
@app.get("/api/exercises")
def exercises():
    builtin = load_json("exercises.json")["exercises"]
    custom = kv_get("custom_exercises", [])
    return {"exercises": builtin + custom}


@app.post("/api/exercises")
def add_exercise(e: dict = Body(...)):
    if not e.get("name_de"):
        raise HTTPException(400, "Name fehlt")
    custom = kv_get("custom_exercises", [])
    e["id"] = e.get("id") or "custom_" + dt.datetime.now().strftime("%Y%m%d%H%M%S%f")
    e.setdefault("name_en", e["name_de"]); e.setdefault("equipment", "Eigene")
    e.setdefault("muscles", {"primary": [], "secondary": []}); e.setdefault("steps", [])
    e.setdefault("alternatives", []); e["custom"] = True; e["anim"] = None; e["grip"] = e.get("grip", "")
    custom = [c for c in custom if c["id"] != e["id"]] + [e]
    kv_set("custom_exercises", custom)
    return e


@app.delete("/api/exercises/{ex_id}")
def del_exercise(ex_id: str):
    kv_set("custom_exercises", [c for c in kv_get("custom_exercises", []) if c["id"] != ex_id])
    return {"ok": True}


# ---------- Routinen ----------
def get_routines():
    r = kv_get("routines")
    if r is None:
        r = load_json("default_routines.json")["routines"]
        kv_set("routines", r)
    return r


@app.get("/api/routines")
def routines():
    return {"routines": get_routines()}


@app.put("/api/routines")
def put_routines(body: dict = Body(...)):
    r = body.get("routines")
    if not isinstance(r, list):
        raise HTTPException(400, "routines fehlt")
    kv_set("routines", r)
    return {"routines": r}


@app.get("/api/templates")
def templates():
    return load_json("templates.json")


@app.post("/api/routines/reset")
def reset_routines():
    kv_del("routines")
    return {"routines": get_routines()}


# ---------- Trainings ----------
def _workout_rows(con, where="", args=()):
    ws = [dict(r) for r in con.execute(f"SELECT * FROM workouts {where} ORDER BY started DESC", args)]
    if not ws:
        return []
    ids = [w["id"] for w in ws]
    q = f"SELECT * FROM sets WHERE workout_id IN ({','.join('?' * len(ids))}) ORDER BY ex_order, set_no"
    by = {}
    for s in con.execute(q, ids):
        by.setdefault(s["workout_id"], []).append({k: s[k] for k in ("exercise_id", "ex_order", "set_no", "kind", "weight", "reps")})
    for w in ws:
        w["sets"] = by.get(w["id"], [])
    return ws


@app.get("/api/workouts")
def workouts():
    with db() as con:
        return {"workouts": _workout_rows(con)}


@app.get("/api/workouts/{wid}")
def workout(wid: int):
    with db() as con:
        r = _workout_rows(con, "WHERE id=?", (wid,))
    if not r:
        raise HTTPException(404, "Training nicht gefunden")
    return r[0]


@app.post("/api/workouts")
def save_workout(w: dict = Body(...)):
    sets = [s for s in w.get("sets", []) if int(s.get("reps") or 0) > 0]
    if not sets:
        raise HTTPException(400, "Keine abgeschlossenen Sätze")
    with db() as con:
        cur = con.execute("INSERT INTO workouts(routine_id,name,started,ended,note) VALUES(?,?,?,?,?)",
                          (w.get("routine_id"), w.get("name") or "Training", w["started"], w["ended"], w.get("note", "")))
        wid = cur.lastrowid
        for s in sets:
            con.execute("INSERT INTO sets(workout_id,exercise_id,ex_order,set_no,kind,weight,reps) VALUES(?,?,?,?,?,?,?)",
                        (wid, s["exercise_id"], int(s["ex_order"]), int(s["set_no"]), s.get("kind", "N"),
                         float(s.get("weight") or 0), int(s["reps"])))
    kv_del("active")
    return workout(wid)


@app.delete("/api/workouts/{wid}")
def del_workout(wid: int):
    with db() as con:
        con.execute("DELETE FROM workouts WHERE id=?", (wid,))
    return {"ok": True}


# ---------- Laufendes Training ----------
@app.get("/api/active")
def get_active():
    return {"active": kv_get("active")}


@app.put("/api/active")
def put_active(body: dict = Body(...)):
    kv_set("active", body.get("active"))
    return {"ok": True}


@app.delete("/api/active")
def del_active():
    kv_del("active")
    return {"ok": True}


# ---------- Körpermaße ----------
@app.get("/api/measurements")
def measurements():
    with db() as con:
        return {"measurements": [dict(r) for r in con.execute("SELECT * FROM measurements ORDER BY date")]}


@app.post("/api/measurements")
def add_measurement(m: dict = Body(...)):
    vals = {k: (float(m[k]) if m.get(k) not in (None, "") else None) for k in ("weight", "waist", "bodyfat")}
    if all(v is None for v in vals.values()):
        raise HTTPException(400, "Kein Wert angegeben")
    with db() as con:
        con.execute("INSERT INTO measurements(date,weight,waist,bodyfat,note) VALUES(?,?,?,?,?)",
                    (m.get("date") or dt.date.today().isoformat(), vals["weight"], vals["waist"], vals["bodyfat"], m.get("note", "")))
    return measurements()


@app.delete("/api/measurements/{mid}")
def del_measurement(mid: int):
    with db() as con:
        con.execute("DELETE FROM measurements WHERE id=?", (mid,))
    return measurements()


# ---------- Einstellungen ----------
@app.get("/api/settings")
def settings():
    return {**DEFAULT_SETTINGS, **kv_get("settings", {})}


@app.put("/api/settings")
def put_settings(s: dict = Body(...)):
    cur = {**settings(), **{k: v for k, v in s.items() if k in DEFAULT_SETTINGS}}
    kv_set("settings", cur)
    return cur


# ---------- Export ----------
@app.get("/api/export.csv")
def export_csv():
    names = {e["id"]: e["name_de"] for e in exercises()["exercises"]}
    buf = io.StringIO()
    wr = csv.writer(buf, delimiter=";")
    wr.writerow(["Datum", "Training", "Übung", "Satz", "Art", "Gewicht (kg)", "Wiederholungen"])
    with db() as con:
        for w in reversed(_workout_rows(con)):
            for s in w["sets"]:
                wr.writerow([w["started"][:10], w["name"], names.get(s["exercise_id"], s["exercise_id"]),
                             s["set_no"], {"W": "Aufwärmen", "D": "Drop"}.get(s["kind"], "Normal"),
                             str(s["weight"]).replace(".", ","), s["reps"]])
    return Response("﻿" + buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=fitness-export.csv"})


# ---------- Google-Kalender ----------
gcal.setup(DATA_DIR)


@app.get("/api/google/status")
def google_status():
    return gcal.status()


@app.post("/api/google/auth")
def google_auth():
    return gcal.auth_url()


@app.post("/api/google/connect")
def google_connect(body: dict = Body(...)):
    return gcal.exchange(body.get("url", ""))


@app.post("/api/google/disconnect")
def google_disconnect():
    return gcal.disconnect()


@app.post("/api/google/sync")
def google_sync(body: dict = Body(default={})):
    names = {e["id"]: e["name_de"] for e in exercises()["exercises"]}
    dry = bool(body.get("dry", True))
    res = gcal.sync(get_routines(), names, dry=dry)
    if res["routine_updates"] and not dry:
        # Beim ersten Verknüpfen übernommene Kalenderzeiten in die Routinen schreiben
        kv_set("routines", [{**r, **res["routine_updates"].get(r["id"], {})} for r in get_routines()])
    res["routines"] = get_routines()
    return res


# ---------- Frontend ----------
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html", headers={"Cache-Control": "no-cache"})
