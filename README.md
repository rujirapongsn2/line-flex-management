# Softnix LineDev

คอนโซล Agent สำหรับ LINE Flex · พอร์ต **3456** · เก็บข้อมูลใน **SQLite**

## 1) ติดตั้งด้วย Docker Compose (แนะนำ)

```bash
cd LineDev
cp .env.example .env
# แก้ .env — ใส่ LINEDEV_SESSION_SECRET (สุ่มครั้งเดียว)
# openssl rand -base64 32
# ถ้ายังไม่มี user ใน DB และไม่มี data/auth.json ให้ตั้ง INITIAL_ADMIN_PASSWORD ด้วย

docker compose up -d --build
```

เปิด http://localhost:3456 แล้วล็อกอินที่ `/login`

- DB และไฟล์ runtime อยู่ที่ **`./data/`** (volume ผูกกับ `/app/data` ใน container)
- ไฟล์หลัก: `data/linedev.db`
- ถ้ามี `data/auth.json` / `data/runtime-config.json` อยู่ก่อน ระบบจะ **migrate เข้า SQLite อัตโนมัติ** ตอนบูตครั้งแรก (เก็บ password hash เดิม)

หยุด: `docker compose down` · ดูล็อก: `docker compose logs -f`

## 2) รันแบบ local (npm) — สำหรับพัฒนา

```bash
cd LineDev
cp .env.example .env
# ตั้ง DATABASE_URL=file:./data/linedev.db และ LINEDEV_SESSION_SECRET
npm install
npm run db:push
npm run dev          # พัฒนา
# หรือ production บนเครื่อง:
npm run build && npm start
```

## 3) การตั้งค่าสำคัญ

| ตัวแปร | ความหมาย |
|---|---|
| `DATABASE_URL` | SQLite — Docker: `file:/app/data/linedev.db` · local: ใช้ absolute เช่น `file:/path/to/LineDev/data/linedev.db` (สคริปต์ `npm run db:push` ตั้งให้อัตโนมัติ) |
| `LINEDEV_SESSION_SECRET` | HMAC คุกกี้เซสชัน — **ตั้งใน `.env` เสมอใน production** |
| `INITIAL_ADMIN_PASSWORD` | ใช้ครั้งเดียวถ้ายังไม่มี User และไม่มี `auth.json` ให้ migrate |
| พอร์ต | **3456** (`3456:3456` ใน compose) |
| Volume | `./data:/app/data` — สำรองทั้งโฟลเดอร์นี้ |

อย่า commit ไฟล์ `.env` หรือ `data/*.db` / `data/*.json` ที่มี secret

## 4) Login admin / เปลี่ยนรหัส

- Username เริ่มต้น: **`admin`**
- รหัสผ่าน: จากที่ตั้งใน `INITIAL_ADMIN_PASSWORD` หรือจาก hash ที่ migrate จาก `auth.json` เดิม
- เปลี่ยนรหัส: เข้าคอนโซล → **โปรไฟล์** → เปลี่ยนรหัสผ่าน

กู้คืนเมื่อลืมรหัส:

1. หยุด container
2. ลบ user ใน DB หรือลบ `data/linedev.db` (จะเสีย config ด้วย) แล้วตั้ง `INITIAL_ADMIN_PASSWORD` ใหม่
3. หรือใช้ Prisma Studio / สคริปต์ hash ใหม่แล้วอัปเดตตาราง `User`

## 5) Webhook + Cloudflare Tunnel

- Endpoint สาธารณะ (ไม่ต้องล็อกอิน): `POST/GET /api/line/webhook`
- ตัวอย่าง production: `https://line.rujirapong.us/api/line/webhook`
- Tunnel / Funnel ชี้ไปที่ **พอร์ต 3456** บนเครื่องที่รัน container
- ใน LINE Developers ใส่ Webhook URL เป็น HTTPS แล้ว Verify
- ในคอนโซลหน้า «การเชื่อม LINE» กดยืนยันว่าลงทะเบียน Webhook แล้ว

ค่า Agent / LINE token / Flex templates **บันทึกแล้ว sync เข้า SQLite** (localStorage เป็นแค่ draft ฝั่งเบราว์เซอร์)

## 6) Backup SQLite

```bash
# ขณะ container รันได้ แต่แนะนำหยุดเขียนสั้นๆ ก่อนคัดลอก
cp data/linedev.db "backup/linedev-$(date +%Y%m%d).db"
# หรือทั้งโฟลเดอร์
tar czf linedev-data-backup.tgz data/
```

กู้คืน: วาง `linedev.db` กลับไปที่ `data/` แล้ว `docker compose up -d`

---

**หมายเหตุ:** อย่าใส่ API key / รหัสผ่านจริงใน image หรือ git · Webhook คงเป็นสาธารณะ · UI อื่นต้องล็อกอิน

## 7) LIFF + Longdo nearby POI (P1)

Flow: ผู้ใช้ถามสถานที่ใกล้เคียง → Agent ส่ง Flex `checkin_ask` (ปุ่มเปิด LIFF) → ผู้ใช้แชร์ GPS → `POST /api/poi/search` เรียก Longdo ฝั่งเซิร์ฟเวอร์ → ส่ง Flex รายการ POI

| ตัวแปร | ความหมาย |
|---|---|
| `LIFF_ID` | LINE LIFF App ID |
| `PUBLIC_BASE_URL` | ค่าเริ่มต้น `https://line.rujirapong.us` |
| `LONGDO_API_KEY` | Longdo Map API key (ห้ามใส่ใน frontend) |
| `LONGDO_DEFAULT_TAGS` | CSV สำรอง เช่น `hospital,7-11,condominium,department_store` |

- LIFF Endpoint URL: `https://line.rujirapong.us/liff/checkin` (Size: Full)
- Public APIs: `GET /api/liff/config`, `POST /api/poi/search`, `POST /api/checkin` (legacy location store)
- Templates: `checkin_ask` (location CTA), `nearby_results` (ผล Longdo — สร้างจาก API)

LINE Developers: Messaging API channel → LIFF → Add → Endpoint URL ตามด้านบน → คัดลอก LIFF ID ใส่ `.env` แล้ว `docker compose up -d --build`
