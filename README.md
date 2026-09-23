# Softnix LineDev / FMM (LINE Flex Management)

คอนโซล Agent สำหรับ LINE Flex · เก็บข้อมูลใน **SQLite** · รันบน Mac Air ด้วย Docker Compose

## สองอินสแตนซ์บน Mac Air (อย่าปนกัน)

| | Path | Container | Host port | URL |
|---|---|---|---|---|
| **Prod** | `~/Documents/code-air/LineDev` | `softnix-linedev` | **3456** | https://line.rujirapong.us |
| **Dev** | `~/Documents/code-air/LineDev-dev` | `softnix-linedev-dev` | **3457** | https://line-dev.rujirapong.us |

แต่ละโฟลเดอร์มี **`./data` แยกกัน** (SQLite คนละไฟล์) · ห้ามชี้ Dev compose ไปที่ data ของ Prod

---

## 1) ติดตั้ง Prod (Docker Compose — แนะนำ)

```bash
cd ~/Documents/code-air/LineDev
cp .env.example .env
# ตั้ง LINEDEV_SESSION_SECRET (สุ่มครั้งเดียว)
# openssl rand -base64 32
# ถ้าบูตครั้งแรกยังไม่มี user ใน DB ให้ตั้ง INITIAL_ADMIN_PASSWORD ด้วย

docker compose up -d --build
```

Smoke:

- http://127.0.0.1:3456/login
- https://line.rujirapong.us/login

- DB / runtime อยู่ที่ **`./data/`** (volume → `/app/data` ใน container)
- ไฟล์หลัก: `data/linedev.db`
- ถ้ามี `data/auth.json` / `data/runtime-config.json` อยู่ก่อน ระบบจะ **migrate เข้า SQLite อัตโนมัติ** ตอนบูตครั้งแรก (เก็บ password hash เดิม) — ดู `MIGRATION.md`

หยุด: `docker compose down` · ดูล็อก: `docker compose logs -f`

---

## 2) ติดตั้ง / สร้าง Dev (อินสแตนซ์ที่สอง)

1. Clone หรือคัดลอก repo ไปที่ `~/Documents/code-air/LineDev-dev` (โฟลเดอร์แยกจาก Prod)
2. แก้ **`docker-compose.yml` เฉพาะเครื่อง** (อย่า commit ค่าเหล่านี้ขึ้น `main`):
   - `container_name: softnix-linedev-dev`
   - `ports: "3457:3456"`
   - `PUBLIC_BASE_URL` default: `https://line-dev.rujirapong.us`
3. มี `.env` ของตัวเอง + `./data` ว่าง/ใหม่ (อย่าใช้ data ของ Prod)
4. รัน:

```bash
cd ~/Documents/code-air/LineDev-dev
docker compose up -d --build
```

5. Cloudflare Tunnel: `line-dev.rujirapong.us` → `http://127.0.0.1:3457`

Smoke:

- http://127.0.0.1:3457/login
- https://line-dev.rujirapong.us/login

---

## 3) ตัวแปรสภาพแวดล้อมสำคัญ

| ตัวแปร | ความหมาย |
|---|---|
| `DATABASE_URL` | SQLite — Docker: `file:/app/data/linedev.db` · local: absolute เช่น `file:/path/to/.../data/linedev.db` (`npm run db:push` ตั้งให้อัตโนมัติ) |
| `LINEDEV_SESSION_SECRET` | HMAC คุกกี้เซสชัน — **ตั้งใน `.env` เสมอใน production** |
| `INITIAL_ADMIN_PASSWORD` | ใช้ครั้งเดียวถ้ายังไม่มี User และไม่มี `auth.json` ให้ migrate |
| `PUBLIC_BASE_URL` | Prod: `https://line.rujirapong.us` · Dev: `https://line-dev.rujirapong.us` |
| `LIFF_ID` | LINE LIFF App ID |
| `LONGDO_API_KEY` | Longdo Map API key (ฝั่งเซิร์ฟเวอร์เท่านั้น) |
| `LONGDO_DEFAULT_TAGS` | CSV สำรอง เช่น `hospital,7-11,condominium,department_store` |
| `POI_SHARED_SECRET` / `CHECKIN_SHARED_SECRET` | optional header `x-poi-secret` |

หมายเหตุ: ใน `docker-compose.yml` ตั้ง `NODE_TLS_REJECT_UNAUTHORIZED=0` เพื่อให้ Node fetch ไป Softnix GenAI บน LAN ที่ใช้ self-signed cert ได้ (ไม่งั้นจะเจอ `fetch failed`)

อย่า commit ไฟล์ `.env` หรือ `data/*.db` / `data/*.json` ที่มี secret

---

## 4) Webhook

Endpoint สาธารณะ (ไม่ต้องล็อกอิน): `POST/GET /api/line/webhook`

| | URL |
|---|---|
| **Prod** | `https://line.rujirapong.us/api/line/webhook` |
| **Dev** | `https://line-dev.rujirapong.us/api/line/webhook` |

- Tunnel ชี้ไป host port ของอินสแตนซ์นั้น (Prod **3456** · Dev **3457**)
- ใน LINE Developers ใส่ Webhook URL เป็น HTTPS แล้ว Verify
- ในคอนโซลหน้า «การเชื่อม LINE» กดยืนยันว่าลงทะเบียน Webhook แล้ว

ค่า Agent / LINE token / Flex templates **บันทึกแล้ว sync เข้า SQLite** (localStorage เป็นแค่ draft ฝั่งเบราว์เซอร์)

---

## 5) LIFF + Longdo nearby POI

Flow: ผู้ใช้ถามสถานที่ใกล้เคียง → Agent ส่ง Flex `checkin_ask` → ผู้ใช้แชร์ GPS ผ่าน LIFF → `POST /api/poi/search` เรียก Longdo ฝั่งเซิร์ฟเวอร์ → ส่ง Flex รายการ POI

| | LIFF Endpoint URL |
|---|---|
| **Prod** | `https://line.rujirapong.us/liff/checkin` |
| **Dev** | ใช้ endpoint บน host `line-dev` (แยก LIFF app หรืออัปเดต Endpoint URL ชั่วคราวตอนเทส Dev) · Size: Full |

Public APIs: `GET /api/liff/config`, `POST /api/poi/search`, `POST /api/checkin` (legacy)

Templates: `checkin_ask` (location CTA), `nearby_results` (ผล Longdo)

LINE Developers → Messaging API → LIFF → Add → Endpoint URL ตามด้านบน → คัดลอก LIFF ID ใส่ `.env` แล้ว rebuild container

---

## 6) Deploy sync (ops สั้น ๆ)

หลัง **commit + push** ไป `origin/main`:

1. **Prod** (`LineDev` / `softnix-linedev` เท่านั้น):

```bash
cd ~/Documents/code-air/LineDev
git pull
docker compose up -d --build --force-recreate
```

2. **Dev** (`LineDev-dev` / `softnix-linedev-dev`): pull แล้ว **เก็บ override ของ compose** (container_name / ports / PUBLIC_BASE_URL) ไว้ · อย่า checkout ทับ `docker-compose.yml` ของ Dev · จากนั้น rebuild เฉพาะ Dev:

```bash
cd ~/Documents/code-air/LineDev-dev
git pull
# ตรวจว่า docker-compose.yml ยังเป็น softnix-linedev-dev / 3457 / line-dev
docker compose up -d --build --force-recreate
```

---

## 7) รันแบบ local (npm) — สำหรับพัฒนา

```bash
cd ~/Documents/code-air/LineDev   # หรือ LineDev-dev
cp .env.example .env
# ตั้ง DATABASE_URL + LINEDEV_SESSION_SECRET
npm install
npm run db:push
npm run dev          # พัฒนา (พอร์ต 3456)
# หรือ production บนเครื่อง:
npm run build && npm start
```

ถ้าจะรัน npm คู่กับ Docker Dev ที่ใช้ 3457 อยู่แล้ว ระวังชนพอร์ต — หยุด container ก่อน หรือเปลี่ยนพอร์ตใน next

---

## 8) Login admin / เปลี่ยนรหัส

- Username เริ่มต้น: **`admin`**
- รหัสผ่าน: จาก `INITIAL_ADMIN_PASSWORD` หรือจาก hash ที่ migrate จาก `auth.json` เดิม
- เปลี่ยนรหัส: เข้าคอนโซล → **โปรไฟล์** → เปลี่ยนรหัสผ่าน

กู้คืนเมื่อลืมรหัส:

1. หยุด container
2. ลบ user ใน DB หรือลบ `data/linedev.db` (จะเสีย config ด้วย) แล้วตั้ง `INITIAL_ADMIN_PASSWORD` ใหม่
3. หรือใช้ Prisma Studio / สคริปต์ hash ใหม่แล้วอัปเดตตาราง `User`

---

## 9) Backup SQLite

```bash
# ขณะ container รันได้ แต่แนะนำหยุดเขียนสั้นๆ ก่อนคัดลอก
cp data/linedev.db "backup/linedev-$(date +%Y%m%d).db"
# หรือทั้งโฟลเดอร์
tar czf linedev-data-backup.tgz data/
```

กู้คืน: วาง `linedev.db` กลับไปที่ `data/` แล้ว `docker compose up -d`

สำรอง **Prod และ Dev แยกกัน** — คนละ `./data`

---

**หมายเหตุความปลอดภัย:** อย่าใส่ API key / รหัสผ่านจริงใน image หรือ git · Webhook คงเป็นสาธารณะ · UI อื่นต้องล็อกอิน · `NODE_TLS_REJECT_UNAUTHORIZED=0` ใช้เฉพาะเพราะ GenAI LAN self-signed — อย่าเปิดกว้างโดยไม่จำเป็น
