#!/usr/bin/with-contenv bashio
export DATA_DIR=/data
exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8099 --app-dir /app --proxy-headers
