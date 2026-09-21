#!/bin/bash
set -euo pipefail
ROOT="/Users/rujirapong_air/Documents/code-air/LineDev"
TGZ="${1:-}"
cd "$ROOT"
if [[ -n "$TGZ" && -f "$TGZ" ]]; then
  tar -xzf "$TGZ" --strip-components=1
fi
# Merge Longdo fragment into .env without echoing secrets
if [[ -f .longdo.env.fragment ]]; then
  touch .env
  # Remove existing LONGDO_API_KEY lines then append fragment
  if grep -q '^LONGDO_API_KEY=' .env 2>/dev/null; then
    grep -v '^LONGDO_API_KEY=' .env > .env.tmp || true
    mv .env.tmp .env
  fi
  cat .longdo.env.fragment >> .env
  echo "[deploy] merged .longdo.env.fragment into .env (key not printed)"
fi
# Ensure other env keys exist as empty placeholders if missing
for k in LIFF_ID PUBLIC_BASE_URL; do
  if ! grep -q "^${k}=" .env 2>/dev/null; then
    case "$k" in
      PUBLIC_BASE_URL) echo 'PUBLIC_BASE_URL=https://line.rujirapong.us' >> .env ;;
      *) echo "${k}=" >> .env ;;
    esac
  fi
done
docker compose up -d --build
sleep 3
docker compose ps
echo "[deploy] smoke (no secrets):"
curl -sS -o /dev/null -w 'liff:%{http_code}\n' http://127.0.0.1:3456/liff/checkin || true
curl -sS -o /dev/null -w 'poi_get:%{http_code}\n' http://127.0.0.1:3456/api/poi/search || true
curl -sS -o /tmp/poi-val.json -w 'poi_post:%{http_code}\n' \
  -X POST http://127.0.0.1:3456/api/poi/search \
  -H 'Content-Type: application/json' \
  -d '{"lat":13.7563,"lon":100.5018,"tag":"7-11","limit":3}' || true
# Show ok/error fields only
node -e 'try{const j=require("/tmp/poi-val.json");console.log("poi_ok="+!!j.ok,"count="+(j.count??"-"),"err="+(j.error||j.needLongdoKey||"none"))}catch(e){console.log("poi_parse_fail")}'
