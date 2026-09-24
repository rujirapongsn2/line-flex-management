# Softnix LineDev / FMM (LINE Flex Management)

คอนโซล Agent สำหรับ LINE Flex · เก็บข้อมูลใน **SQLite** · แนะนำรันด้วย **Docker Compose**

พอร์ตเริ่มต้นใน `docker-compose.yml` คือ **3456** (แก้ได้ตามเครื่องที่ติดตั้ง) · URL สาธารณะตั้งผ่าน `PUBLIC_BASE_URL` ใน `.env`

---

## 1) ติดตั้งด้วย Docker Compose (แนะนำ)

```bash
cd <โฟลเดอร์โปรเจกต์>
cp .env.example .env
# ตั้ง LINEDEV_SESSION_SECRET (สุ่มครั้งเดียว)
# openssl rand -base64 32
# ถ้าบูตครั้งแรกยังไม่มี user ใน DB ให้ตั้ง INITIAL_ADMIN_PASSWORD ด้วย
# ตั้ง PUBLIC_BASE_URL เป็นโดเมน HTTPS ที่ชี้มาที่พอร์ตของเครื่องนี้

docker compose up -d --build
```

เปิด `http://127.0.0.1:<พอร์ต>/login` (ค่าเริ่มต้นพอร์ต **3456**)

- DB / runtime อยู่ที่ **`./data/`** (volume → `/app/data` ใน container)
- ไฟล์หลัก: `data/linedev.db`
- ถ้ามี `data/auth.json` / `data/runtime-config.json` อยู่ก่อน ระบบจะ **migrate เข้า SQLite อัตโนมัติ** ตอนบูตครั้งแรก (เก็บ password hash เดิม) — ดู `MIGRATION.md`

หยุด: `docker compose down` · ดูล็อก: `docker compose logs -f`

ถ้าต้องการรันหลายอินสแตนซ์บนเครื่องเดียวกัน ให้แยกโฟลเดอร์ + `./data` + `.env` คนละชุด และปรับ `container_name` / `ports` / `PUBLIC_BASE_URL` ใน compose หรือ `.env` ของแต่ละชุดเอง

---

## 2) ตัวแปรสภาพแวดล้อมสำคัญ

| ตัวแปร | ความหมาย |
|---|---|
| `DATABASE_URL` | SQLite — Docker: `file:/app/data/linedev.db` · local: absolute เช่น `file:/path/to/.../data/linedev.db` (`npm run db:push` ตั้งให้อัตโนมัติ) |
| `LINEDEV_SESSION_SECRET` | HMAC คุกกี้เซสชัน — **ตั้งใน `.env` เสมอเมื่อใช้งานจริง** |
| `INITIAL_ADMIN_PASSWORD` | ใช้ครั้งเดียวถ้ายังไม่มี User และไม่มี `auth.json` ให้ migrate |
| `PUBLIC_BASE_URL` | ฐาน URL สาธารณะ (HTTPS) สำหรับลิงก์ Flex / LIFF / webhook — ตั้งตามโดเมนที่ติดตั้ง |
| `LIFF_ID` | LINE LIFF App ID |
| `LONGDO_API_KEY` | Longdo Map API key (ฝั่งเซิร์ฟเวอร์เท่านั้น) |
| `LONGDO_DEFAULT_TAGS` | CSV สำรอง เช่น `hospital,7-11,condominium,department_store` |
| `POI_SHARED_SECRET` / `CHECKIN_SHARED_SECRET` | optional header `x-poi-secret` |

หมายเหตุ: ใน `docker-compose.yml` อาจตั้ง `NODE_TLS_REJECT_UNAUTHORIZED=0` เพื่อให้ Node fetch ไป endpoint ที่ใช้ self-signed cert ได้ (เช่น GenAI บน LAN) — เปิดเท่าที่จำเป็น

อย่า commit ไฟล์ `.env` หรือ `data/*.db` / `data/*.json` ที่มี secret

---

## 3) Webhook + tunnel

Endpoint สาธารณะ (ไม่ต้องล็อกอิน): `POST/GET /api/line/webhook`

- URL เต็ม: `{PUBLIC_BASE_URL}/api/line/webhook`
- Tunnel / reverse proxy ชี้โดเมน HTTPS ไปที่พอร์ตที่ container ฟังบนเครื่อง
- ใน LINE Developers ใส่ Webhook URL เป็น HTTPS แล้ว Verify
- ในคอนโซลหน้า «การเชื่อม LINE» กดยืนยันว่าลงทะเบียน Webhook แล้ว

ค่า Agent / LINE token / Flex templates **บันทึกแล้ว sync เข้า SQLite** (localStorage เป็นแค่ draft ฝั่งเบราว์เซอร์)

---

## 4) LIFF + Longdo nearby POI

Flow: ผู้ใช้ถามสถานที่ใกล้เคียง → Agent ส่ง Flex `checkin_ask` → ผู้ใช้แชร์ GPS ผ่าน LIFF → `POST /api/poi/search` เรียก Longdo ฝั่งเซิร์ฟเวอร์ → ส่ง Flex รายการ POI

- LIFF Endpoint URL: `{PUBLIC_BASE_URL}/liff/checkin` (Size: Full)
- Public APIs: `GET /api/liff/config`, `POST /api/poi/search`, `POST /api/checkin` (legacy)
- Templates: `checkin_ask` (location CTA), `nearby_results` (ผล Longdo)

LINE Developers → Messaging API → LIFF → Add → Endpoint URL ตามด้านบน → คัดลอก LIFF ID ใส่ `.env` แล้ว rebuild container

---

## 5) รันแบบ local (npm) — สำหรับพัฒนา

```bash
cd <โฟลเดอร์โปรเจกต์>
cp .env.example .env
# ตั้ง DATABASE_URL + LINEDEV_SESSION_SECRET
npm install
npm run db:push
npm run dev          # พัฒนา (พอร์ต 3456 ตามค่าเริ่มต้นของแอป)
# หรือ production บนเครื่อง:
npm run build && npm start
```

ถ้า Docker ใช้พอร์ตเดียวกันอยู่แล้ว ให้หยุด container ก่อน หรือเปลี่ยนพอร์ตฝั่งใดฝั่งหนึ่ง

---

## 6) Login admin / เปลี่ยนรหัส

- Username เริ่มต้น: **`admin`**
- รหัสผ่าน: จาก `INITIAL_ADMIN_PASSWORD` หรือจาก hash ที่ migrate จาก `auth.json` เดิม
- เปลี่ยนรหัส: เข้าคอนโซล → **โปรไฟล์** → เปลี่ยนรหัสผ่าน

กู้คืนเมื่อลืมรหัส:

1. หยุด container
2. ลบ user ใน DB หรือลบ `data/linedev.db` (จะเสีย config ด้วย) แล้วตั้ง `INITIAL_ADMIN_PASSWORD` ใหม่
3. หรือใช้ Prisma Studio / สคริปต์ hash ใหม่แล้วอัปเดตตาราง `User`

---

## 7) Backup SQLite

```bash
# ขณะ container รันได้ แต่แนะนำหยุดเขียนสั้นๆ ก่อนคัดลอก
cp data/linedev.db "backup/linedev-$(date +%Y%m%d).db"
# หรือทั้งโฟลเดอร์
tar czf linedev-data-backup.tgz data/
```

กู้คืน: วาง `linedev.db` กลับไปที่ `data/` แล้ว `docker compose up -d`

ถ้ามีหลายอินสแตนซ์ ให้สำรอง **`./data` ของแต่ละโฟลเดอร์แยกกัน**

---

**ความปลอดภัย:** อย่าใส่ API key / รหัสผ่านจริงใน image หรือ git · Webhook คงเป็นสาธารณะ · UI อื่นต้องล็อกอิน


---

## 8) Prod machine 2 / multi-host install checklist

สำหรับติดตั้งเครื่องที่สอง (เช่น `lb1` · พอร์ต 3456 ·โดเมน `https://hookai.softnix.co.th`):

1. คัดลอกโปรเจกต์ + `cp .env.example .env`
2. ตั้งอย่างน้อย:
   - `PUBLIC_BASE_URL=https://hookai.softnix.co.th` (ไม่มี `/` ท้าย)
   - `LINEDEV_SESSION_SECRET` (สุ่มครั้งเดียว)
   - `INITIAL_ADMIN_PASSWORD` (บูตครั้งแรก)
   - `REQUIRE_LINE_SIGNATURE=1` และ**อย่า**ตั้ง `ALLOW_UNSIGNED_WEBHOOK=1`
   - `LINE_CHANNEL_SECRET` / Channel Access Token ของ **channel ของเครื่องนั้น** (ห้ามคัดลอกจาก Prod อื่นหรือ Dev)
   - `LIFF_ID` ของ LIFF App ที่ Endpoint = `{PUBLIC_BASE_URL}/liff/checkin`
3. พอร์ต: compose เริ่มต้น map `3456:3456` (Dev บน Air ใช้ `3457:3456` คนละโฟลเดอร์)
4. Docker หรือ Podman: `docker compose up -d --build` (หรือ `podman compose`)
5. Nginx / TLS ชี้ HTTPS โดเมน → `127.0.0.1:3456` · ตรวจ CAA / cert
6. ในคอนโซลหน้า «เชื่อม LINE» ตรวจว่า Webhook URL ขึ้นต้นด้วย `PUBLIC_BASE_URL` ไม่ใช่ IP ภายใน
7. Flex ใน DB ที่เคยเก็บ URL เต็มของโฮสต์เก่า (`line.rujirapong.us`) จะถูก rewrite ตอน render เป็น `PUBLIC_BASE_URL` อัตโนมัติ — ไม่ต้อง migrate ข้อมูลก็ใช้งานได้

อย่า hardcode โดเมนส่วนตัวในโค้ด · ตั้งผ่าน env เท่านั้น

