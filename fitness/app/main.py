"""Fitness Coach: Home-Assistant-Add-on (Ingress) mit FastAPI + SQLite."""
import json
import os
import sqlite3
import datetime as dt
from pathlib import Path

from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
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
    return con


def init_db():
    with db() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exercise_id TEXT NOT NULL,
                date TEXT NOT NULL,
                set_no INTEGER NOT NULL,
                weight REAL NOT NULL,
                reps INTEGER NOT NULL,
                note TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_logs_ex ON logs(exercise_id, date);
            CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
            """
        )


def kv_get(key, default=None):
    with db() as con:
        r = con.execute("SELECT v FROM kv WHERE k=?", (key,)).fetchone()
    return json.loads(r["v"]) if r else default


def kv_set(key, value):
    with db() as con:
        con.execute(
            "INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
            (key, json.dumps(value, ensure_ascii=False)),
        )


def load_json(name):
    return json.loads((BASE / "data" / name).read_text(encoding="utf-8"))


init_db()


# ---------- Übungen & Vorlagen ----------
@app.get("/api/exercises")
def exercises():
    return load_json("exercises.json")


@app.get("/api/templates")
def templates():
    return load_json("templates.json")


# ---------- Plan ----------
@app.get("/api/plan")
def get_plan():
    plan = kv_get("plan")
    if plan is None:
        plan = load_json("default_plan.json")
    return plan


@app.put("/api/plan")
def put_plan(plan: dict = Body(...)):
    if "sessions" not in plan:
        raise HTTPException(400, "Plan ohne sessions")
    plan["updated"] = dt.datetime.now().isoformat(timespec="seconds")
    kv_set("plan", plan)
    return plan


@app.post("/api/plan/reset")
def reset_plan():
    plan = load_json("default_plan.json")
    kv_set("plan", plan)
    return plan


# ---------- Gewichtstracking ----------
@app.get("/api/logs/{exercise_id}")
def get_logs(exercise_id: str):
    with db() as con:
        rows = con.execute(
            "SELECT id,date,set_no,weight,reps,note FROM logs WHERE exercise_id=? ORDER BY date,set_no",
            (exercise_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/logs/{exercise_id}")
def add_log(exercise_id: str, entry: dict = Body(...)):
    date = entry.get("date") or dt.date.today().isoformat()
    sets = entry.get("sets") or []
    if not sets:
        raise HTTPException(400, "Keine Sätze")
    with db() as con:
        con.execute("DELETE FROM logs WHERE exercise_id=? AND date=?", (exercise_id, date))
        for i, s in enumerate(sets, 1):
            con.execute(
                "INSERT INTO logs(exercise_id,date,set_no,weight,reps,note) VALUES(?,?,?,?,?,?)",
                (exercise_id, date, i, float(s["weight"]), int(s["reps"]), entry.get("note", "")),
            )
    return get_logs(exercise_id)


@app.delete("/api/logs/{exercise_id}/{date}")
def del_log(exercise_id: str, date: str):
    with db() as con:
        con.execute("DELETE FROM logs WHERE exercise_id=? AND date=?", (exercise_id, date))
    return get_logs(exercise_id)


@app.get("/api/logs")
def last_logs():
    """Letzter Eintrag je Übung (für Übersicht)."""
    with db() as con:
        rows = con.execute(
            """SELECT exercise_id, MAX(date) AS last, MAX(weight) AS top
               FROM logs GROUP BY exercise_id"""
        ).fetchall()
    return {r["exercise_id"]: {"last": r["last"], "top": r["top"]} for r in rows}


# ---------- Google-Kalender ----------
@app.get("/api/google/status")
def google_status():
    return gcal.status()


@app.get("/api/google/auth_url")
def google_auth_url():
    return {"url": gcal.auth_url()}


@app.post("/api/google/exchange")
def google_exchange(body: dict = Body(...)):
    return gcal.exchange(body.get("redirected_url", ""))


@app.post("/api/google/sync")
def google_sync(body: dict = Body(default={})):
    plan = get_plan()
    ex = {e["id"]: e for e in load_json("exercises.json")["exercises"]}
    return gcal.sync_plan(plan, ex, dry_run=bool(body.get("dry_run")))


@app.post("/api/google/today")
def google_today(body: dict = Body(...)):
    """Einzelnen Termin (z. B. heute) auf eine andere Einheit umstellen."""
    plan = get_plan()
    ex = {e["id"]: e for e in load_json("exercises.json")["exercises"]}
    return gcal.override_day(plan, ex, body["date"], body["session_id"])


# ---------- Frontend ----------
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")
