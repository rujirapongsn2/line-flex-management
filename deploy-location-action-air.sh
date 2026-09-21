#!/bin/bash
set -euo pipefail
ROOT="/Users/rujirapong_air/Documents/code-air/LineDev"
TGZ="${1:-}"
cd "$ROOT"
if [[ -n "$TGZ" && -f "$TGZ" ]]; then
  tar -xzf "$TGZ" --strip-components=1
  echo "[deploy] extracted tarball"
elif [[ -n "$TGZ" ]]; then
  echo "[deploy] tarball not found: $TGZ" >&2
  exit 1
fi

# Ensure placeholders exist (do not print secrets)
touch .env
for k in LIFF_ID PUBLIC_BASE_URL LONGDO_API_KEY; do
  if ! grep -q "^${k}=" .env 2>/dev/null; then
    case "$k" in
      PUBLIC_BASE_URL) echo 'PUBLIC_BASE_URL=https://line.rujirapong.us' >> .env ;;
      *) echo "${k}=" >> .env ;;
    esac
  fi
done

echo "[deploy] docker compose up -d --build (alpine)..."
docker compose up -d --build
sleep 5
docker compose ps

echo "[deploy] smoke (no secrets printed):"
BASE="${SMOKE_BASE:-http://127.0.0.1:3456}"
curl -sS -o /dev/null -w 'liff:%{http_code}\n' "$BASE/liff/checkin" || true
curl -sS -o /dev/null -w 'liff_cfg:%{http_code}\n' "$BASE/api/liff/config" || true
curl -sS -o /tmp/liff-cfg.json -w 'liff_cfg_body:%{http_code}\n' "$BASE/api/liff/config" || true
# Assert no secrets in liff config
node -e '
const j=require("/tmp/liff-cfg.json");
const s=JSON.stringify(j);
const bad=["longdoApiKey","channelAccessToken","channelSecret","apiKey","Authorization"];
for (const k of bad){ if (k in j) { console.log("LEAK_KEY="+k); process.exit(2);} }
if (/sk-|Bearer [A-Za-z0-9]{20}/.test(s)) { console.log("LEAK_PATTERN"); process.exit(2);} 
console.log("liff_cfg_ok secrets=none actionReady="+j.actionReady+" mode="+(j.locationActionMode||"-"));
'

curl -sS -o /dev/null -w 'loc_get:%{http_code}\n' "$BASE/api/location/action" || true
curl -sS -o /tmp/loc-post.json -w 'loc_post:%{http_code}\n' \
  -X POST "$BASE/api/location/action" \
  -H 'Content-Type: application/json' \
  -d '{"lat":13.7563,"lon":100.5018,"tag":"7-11","limit":3,"pushReply":false}' || true
node -e '
try{
  const j=require("/tmp/loc-post.json");
  console.log("loc_ok="+!!j.ok,"mode="+(j.mode||"-"),"count="+(j.count??"-"),"actionReady="+!!j.actionReady,"err="+(j.error||"none"));
}catch(e){console.log("loc_parse_fail")}
'

# SSRF rejection
curl -sS -o /tmp/ssrf.json -w 'ssrf:%{http_code}\n' \
  -X POST "$BASE/api/location/action" \
  -H 'Content-Type: application/json' \
  -d '{"lat":13.7,"lon":100.5,"pushReply":false}' || true
# Note: SSRF is tested when mode=http; default longdo_poi won't hit SSRF.
# Unit-tested on box; optional: temporarily set mode via DB for full e2e.

curl -sS -o /dev/null -w 'poi_compat:%{http_code}\n' "$BASE/api/poi/search" || true
echo "[deploy] done — LIFF endpoint unchanged: /liff/checkin"
