#!/bin/bash
# Softnix FMM: seed checkin_ask/nearby_results + patch agent prompt + deploy hard-route
# Run on Mac Air: machineId 9f096d81-b2fc-4806-b11d-7ca687adeba9
set -euo pipefail
ROOT="${LINEDEV_ROOT:-/Users/rujirapong_air/Documents/code-air/LineDev}"
TGZ="${1:-}"
cd "$ROOT"

if [[ -n "$TGZ" && -f "$TGZ" ]]; then
  echo "[fix] extracting overlay from $TGZ (excluding any components/ — keep Air LineConnectPage LIFF guideline)"
  # Safety: never clobber console UI that พี่ทอม/บุ้ย updated for LIFF guideline
  tar -tzf "$TGZ" | grep -E '^components/|LineConnectPage' && {
    echo "[fix] ERROR: tarball contains components/ or LineConnectPage — abort to protect Air UI"
    exit 1
  } || true
  tar -xzf "$TGZ"
  if [[ -f components/console/LineConnectPage.tsx ]]; then
    echo "[fix] NOTE: LineConnectPage present after extract — this script does not ship it; left as-is on disk"
  fi
fi

# --- Immediate SQLite seed (works on running volume even before rebuild) ---
seed_sqlite() {
  local DB="$1"
  if [[ ! -f "$DB" ]]; then
    echo "[fix] no db at $DB — skip sqlite seed"
    return 0
  fi
  echo "[fix] seeding sqlite: $DB"
  # Use python3 (stdlib sqlite3) — no secrets printed
  python3 - "$DB" <<'PY'
import sqlite3, json, sys, datetime
db_path = sys.argv[1]
con = sqlite3.connect(db_path)
cur = con.cursor()

ask_fields = {
  "altText": "แชร์พิกัดเพื่อค้นหาใกล้เคียง",
  "title": "แชร์พิกัดเพื่อค้นหาใกล้เคียง",
  "body": "กดปุ่มเพื่อแชร์ตำแหน่งปัจจุบัน แล้วค้นหาสถานที่ใกล้เคียง",
  "buttonLabel": "แชร์พิกัดปัจจุบัน",
  "buttonUrl": "https://line.rujirapong.us/liff/checkin",
  "tag": "",
}
result_fields = {
  "altText": "สถานที่ใกล้เคียง",
  "title": "ผลค้นหาใกล้เคียง",
  "body": "รายการจาก Longdo Map",
  "buttonLabel": "เปิดแผนที่",
  "buttonUrl": "https://map.longdo.com",
}

ask = (
  "checkin_ask",
  "แชร์พิกัดค้นหาใกล้เคียง",
  "checkin_ask",
  "เมื่อลูกค้าถามสถานที่ใกล้เคียง / ใกล้ฉัน / แถวนี้มี… / 7-11 / โรงพยาบาล หรือขอแชร์พิกัด — ส่งการ์ด CTA เปิด LIFF (ใส่ tag ใน fields ถ้าทราบ). ห้ามตอบ «ไม่มีข้อมูล» โดยไม่มีพิกัด",
  json.dumps(["แถวนี้มีร้าน 7-11 ที่ไหนบ้าง", "มีโรงพยาบาลใกล้ฉันไหม", "ค้นหาคอนโดใกล้เคียง", "แชร์พิกัด", "เช็คอิน"], ensure_ascii=False),
  "[]",
  "bubble-simple",
  json.dumps(ask_fields, ensure_ascii=False),
  1,
  100,
)
result = (
  "nearby_results",
  "ผลค้นหาใกล้เคียง",
  "nearby_results",
  "การ์ดรายการ POI จาก Longdo หลังได้พิกัด (สร้างจาก /api/poi/search)",
  "[]",
  json.dumps([{"name":"lat","example":"13.7563","required":True},{"name":"lng","example":"100.5018","required":True}], ensure_ascii=False),
  "bubble-simple",
  json.dumps(result_fields, ensure_ascii=False),
  1,
  101,
)

now = datetime.datetime.utcnow().isoformat() + "Z"
for row in (ask, result):
  cur.execute("SELECT id FROM FlexTemplate WHERE id=?", (row[0],))
  exists = cur.fetchone()
  if exists:
    cur.execute(
      """UPDATE FlexTemplate SET displayNameTh=?, conditionKey=?, modelDescription=?,
         triggerExamples=?, variables=?, kind=?, fields=?, enabled=?, sortOrder=?, updatedAt=?
         WHERE id=?""",
      (row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], now, row[0]),
    )
  else:
    cur.execute(
      """INSERT INTO FlexTemplate
         (id, displayNameTh, conditionKey, modelDescription, triggerExamples, variables, kind, fields, enabled, sortOrder, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
      (row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], now, now),
    )

# Patch AgentConfig.prompt
cur.execute("SELECT prompt FROM AgentConfig WHERE id=1")
row = cur.fetchone()
block = (
  "เมื่อลูกค้าถามสถานที่ใกล้เคียง / ใกล้ฉัน / แถวนี้มี… / 7-11 / โรงพยาบาล / คอนโด / ห้าง หรือขอแชร์พิกัด/เช็คอิน "
  "→ ต้องเรียกเงื่อนไข checkin_ask ทันที (ส่ง Flex การ์ดเปิด LIFF ให้แชร์ GPS พร้อม fields.tag ถ้าทราบ เช่น 7-11 "
  "— ห้ามใช้ location picker ของ LINE เป็นหลัก; ผลค้นหา Longdo จะส่งหลังได้พิกัดจาก LIFF)\n\n"
  "สำคัญมาก: ห้ามตอบข้อความธรรมดาว่า «ไม่มีข้อมูล» / «ไม่พบ» / «ไม่มีในระบบ» เมื่อยังไม่ได้พิกัด — ต้องส่ง checkin_ask ก่อนเสมอ"
)
if row is None:
  cur.execute(
    "INSERT INTO AgentConfig (id, name, prompt, baseUrl, model, apiKey, enabled) VALUES (1,?,?,?,?,?,1)",
    ("Softnix Care", block, "https://openrouter.ai/api/v1", "openai/gpt-4o-mini", ""),
  )
  print("agent_created=1")
else:
  prompt = (row[0] or "").strip()
  if "checkin_ask" in prompt and "ไม่มีข้อมูล" in prompt:
    print("agent_prompt_ok=1")
  elif not prompt:
    cur.execute("UPDATE AgentConfig SET prompt=? WHERE id=1", (block,))
    print("agent_prompt_set=1")
  elif "checkin_ask" not in prompt:
    cur.execute("UPDATE AgentConfig SET prompt=? WHERE id=1", (prompt + "\n\n" + block,))
    print("agent_prompt_appended=1")
  else:
    forbid = "\n\nสำคัญมาก: ห้ามตอบข้อความธรรมดาว่า «ไม่มีข้อมูล» / «ไม่พบ» / «ไม่มีในระบบ» เมื่อยังไม่ได้พิกัด — ต้องส่ง checkin_ask ก่อนเสมอ"
    cur.execute("UPDATE AgentConfig SET prompt=? WHERE id=1", (prompt + forbid,))
    print("agent_prompt_forbid_appended=1")

con.commit()
cur.execute("SELECT id, conditionKey, enabled FROM FlexTemplate ORDER BY sortOrder")
rows = cur.fetchall()
print("templates=" + ",".join(f"{r[0]}:{r[1]}:en={r[2]}" for r in rows))
cur.execute("SELECT LENGTH(prompt), instr(prompt,'checkin_ask')>0, instr(prompt,'ไม่มีข้อมูล')>0 FROM AgentConfig WHERE id=1")
print("prompt_meta=" + str(cur.fetchone()))
con.close()
PY
}

seed_sqlite "$ROOT/data/linedev.db"

echo "[fix] docker compose up -d --build (keeping existing Dockerfile)"
docker compose up -d --build
sleep 5
docker compose ps

echo "[fix] post-build re-seed (migrate also runs on boot)"
seed_sqlite "$ROOT/data/linedev.db"

echo "[fix] smoke (no secrets):"
curl -sS -o /dev/null -w 'webhook_get:%{http_code}\n' http://127.0.0.1:3456/api/line/webhook || true
curl -sS -o /dev/null -w 'liff:%{http_code}\n' http://127.0.0.1:3456/liff/checkin || true
curl -sS -o /tmp/poi-val.json -w 'poi_post:%{http_code}\n' \
  -X POST http://127.0.0.1:3456/api/poi/search \
  -H 'Content-Type: application/json' \
  -d '{"lat":13.7563,"lon":100.5018,"tag":"7-11","limit":1}' || true
node -e 'try{const j=require("/tmp/poi-val.json");console.log("poi_ok="+!!j.ok,"count="+(j.count??"-"))}catch(e){console.log("poi_parse_fail")}'

echo "[fix] DONE — พี่ทอม retest: ใน Softfy Sales Agent พิมพ์ «แถวนี้มี ร้าน 7-11 ไหม» ต้องได้ Flex checkin_ask (ปุ่มแชร์พิกัด) ไม่ใช่ข้อความไม่มีข้อมูล"
