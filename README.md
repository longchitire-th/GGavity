# 🍜 วุ่นวายโภชนา V2.0 (WanWanWan Pochana V2.0)
### ระบบบัญชีรายรับ-รายจ่าย & วิเคราะห์ธุรกิจร้านอาหาร (ใช้งานง่าย • ไม่ล็อกอิน • ฟรีตลอดชีพ)

ระบบบันทึกรายรับ-รายจ่ายประจำวัน และวิเคราะห์สถิติธุรกิจสำหรับร้านอาหาร พัฒนาต่อยอดจาก [longchitire-th/wanwanwan-app](https://github.com/longchitire-th/wanwanwan-app) พร้อมเชื่อมต่อฐานข้อมูล Google Sheets และ Google Drive ([วุ่นวายโภชนา V2.0](https://drive.google.com/drive/folders/1ZcJAGvFH53J0oRDY-Cw3ba-hN4_mIW1i?usp=sharing))

---

## ✨ จุดเด่นและการปรับปรุงใหม่ในเวอร์ชัน 2.0

1. **เข้าถึงได้ทันที ไม่ต้องล็อกอิน (Accessible & Frictionless):**
   - ถอดระบบล็อกอินที่ยุ่งยากออก 100% ลูกค้าเปิดลิงก์แล้วบันทึกหรือดูข้อมูลได้ทันที
   - รองรับทั้งการเปิดบนคอมพิวเตอร์และโทรศัพท์มือถือ (หน้าจอปุ่มสัมผัส Bottom Navigation สะดวกสบาย)

2. **เก็บบน Google Cloud ที่ใช้อยู่ (Google Sheets & Google Drive):**
   - บันทึกและดึงข้อมูลจาก Google Sheets (ชีต `ข้อมูลดิบ` ID: `1Jdw2KQM18-dLCYWxu9hw0xzxXjzX2Qx2N3Wpa8qvWdc`)
   - บรรจุข้อมูลตัวอย่างหลังบ้านจริง **269 รายการ** ครบถ้วน (รายรับ 21,122 ฿ / รายจ่าย 23,601.50 ฿ / ยอดตรงตาม Excel 100%)
   - มีระบบ Offline Cache เปิดดูและบันทึกได้ทันทีแม้อยู่ในที่เน็ตช้า

3. **บันทึกรายการด่วนใน 3 วินาที (Quick Add Chips):**
   - มีปุ่มลัดสำหรับรายการยอดนิยม เช่น `🍜 ส่งก๋วยเตี๋ยว`, `🍲 ค่ากับข้าว`, `🥩 หมู`, `🥬 ผัก`, `🥢 เส้นก๋วยเตี๋ยว`, `🛵 ค่ารถ`, `📦 กล่อง/ถุง`
   - ระบบเดาหมวดหมู่อัตโนมัติ (Smart Category Guessing) เมื่อพิมพ์ชื่อรายการ

4. **แดชบอร์ดเจาะลึกค่าใช้จ่าย (Interactive Drill-down Dashboard):**
   - สรุปยอดขายวันนี้, จ่ายวันนี้, กำไรสุทธิ, กล่องที่ขายได้, วันที่มีรายรับ, และยอดขายเฉลี่ยต่อวัน
   - กราฟแท่งแสดงสัดส่วนค่าใช้จ่าย สามารถ **"กดแตะที่หมวดหมู่เพื่อดูว่าซื้ออะไรไปบ้าง กี่บาท"**
   - กล่องข้อความคำแนะนำทางธุรกิจอัตโนมัติ (Smart Profit Insights)

5. **รีพอร์ตวิเคราะห์ผลประกอบการ (Period Reports & Comparisons):**
   - กรองดูข้อมูลได้ทั้ง รายวัน, รายสัปดาห์, รายเดือน, รายไตรมาส, และรายปี
   - ตาราง **"💚 รายรับมาจากอะไร"** และ **"🔴 รายจ่ายไปกับอะไร"**
   - ส่งออกข้อมูลเป็นไฟล์ Excel (.csv) ภาษาไทยไม่เพี้ยน (UTF-8 BOM)

6. **คลังสูตรเมนูเส้นไอเดียทั่วโลก 120+ เมนู (Noodle Recipes):**
   - รวมสูตรก๋วยเตี๋ยวและเมนูเส้นจากไทย, จีน, ญี่ปุ่น, เกาหลี, อิตาลี ฯลฯ
   - ปุ่มสุ่มเมนู 8 จาน และหน้าต่างป๊อปอัปดูวัตถุดิบและวิธีทำทีละขั้นตอน

---

## 🚀 วิธีนำขึ้น Cloudflare Pages (ฟรี 100%)

ระบบได้รับการออกแบบให้เป็น Static Single Page Application พร้อม Deploy ขึ้น Cloudflare Pages ได้ฟรีตลอดชีพ:

### วิธีที่ 1: Deploy ผ่านคำสั่งเดียวด้วย `deploy_cloudflare.bat`
1. ดับเบิลคลิกที่ไฟล์ **`deploy_cloudflare.bat`**
2. ระบบจะเปิดหน้าต่างเบราว์เซอร์ให้กด **Log in to Cloudflare** (หากยังไม่ได้เข้าสู่ระบบ)
3. ระบบจะทำการอัปโหลดโฟลเดอร์ `public` ขึ้น Cloudflare Pages ให้ทันที
4. คุณจะได้รับ URL ปลอดภัย (เช่น `https://wanwanwan.pages.dev`) สามารถส่งให้ลูกค้าบันทึกได้ทันที!

### วิธีที่ 2: เชื่อมต่อผ่าน Cloudflare Dashboard กับ GitHub
1. เข้าไปที่ [Cloudflare Dashboard](https://dash.cloudflare.com/) > ไปที่เมนู **Compute (Workers) > Workers & Pages**
2. กด **Create Application** > เลือกแท็บ **Pages** > กด **Connect to Git**
3. เลือก Repository `longchitire-th/wanwanwan-app` หรือ `longchitire-th/GGavity`
4. ตั้งค่า Build Settings:
   - **Framework preset:** `None`
   - **Build command:** (เว้นว่างไว้)
   - **Build output directory:** `public` (หรือ `/` หากอยู่ใน wanwanwan-app)
5. กด **Save and Deploy** จะได้รับ URL ฟรีทันที และทุกครั้งที่มีการอัปเดตโค้ด ระบบจะ Deploy อัตโนมัติ

---

## 💻 วิธีเปิดใช้งานบนเครื่องคอมพิวเตอร์ (Localhost)

1. ดับเบิลคลิกที่ไฟล์ **`start.bat`**
2. เบราว์เซอร์จะเปิดหน้าเว็บขึ้นมาที่:
   👉 **`http://localhost:3838`**
3. หากต้องการเปิดบนโทรศัพท์มือถือในวง Wi-Fi เดียวกัน ให้เปิด URL ที่แสดงในหน้าต่างคอนโซล

---

## 📁 โครงสร้างโปรเจกต์

```
GGavity/
├── start.bat                  # ดับเบิลคลิกเปิดโปรแกรมบนคอมทันที
├── deploy_cloudflare.bat       # สคริปต์ Deploy ขึ้น Cloudflare Pages
├── server.js                  # Express API Server ท้องถิ่น (Port 3838)
├── data/
│   ├── db.json                # ฐานข้อมูล JSON บรรจุ 269 รายการจาก Google Drive
├── public/
│   ├── index.html             # หน้าเว็บหลัก Modern Responsive SPA
│   ├── logo-wanwan.png        # โลโก้วุ่นวายโภชนา
│   ├── css/
│   │   └── style.css          # CSS โมเดิร์น สะอาดตา อ่านง่าย
│   └── js/
│       ├── initial_data.js    # ข้อมูลตั้งต้น 269 รายการจากชีต
│       ├── recipes_data.js    # คลังสูตรเมนูเส้น 120+ รายการ
│       ├── app.js             # ตรรกะแอป การบันทึก และ Sync
│       ├── dashboard.js       # ตรรกะแดชบอร์ด & Drill-down
│       ├── report.js          # ตรรกะรีพอร์ตและเปรียบเทียบรอบเวลา
│       ├── recipes.js         # ระบบค้นหาและสุ่มสูตรอาหาร
│       └── data_manage.js     # ตารางข้อมูลดิบและลิงก์ Google Drive
└── services/
    ├── db_service.js          # จัดการข้อมูลและการคำนวณ
    └── analytics_service.js   # สรุปผลและส่งออก CSV ภาษาไทย
```
