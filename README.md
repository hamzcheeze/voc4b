# voc4b

สมุดคำศัพท์ภาษาอังกฤษวันละสองคำ ใช้ข้อมูลจาก Dictionary API ที่ดึงหน้า Cambridge Dictionary แล้วเก็บความหมาย ตัวอย่าง IPA เสียง และรูปคำกริยาลง Supabase โดยไม่มีคำแปลไทย

## เริ่มในเครื่อง

ใช้ Node.js 22.19 ขึ้นไป แล้วรันคำสั่งในโฟลเดอร์โปรเจกต์

```sh
npm install
npm run dev
```

เปิด http://localhost:3000 หากยังไม่มี Supabase keys แอปใช้เดโมที่เก็บคำตัวอย่างในเบราว์เซอร์ ทดลอง `rescind` และ `serene` ได้ เดโมไม่เรียก Dictionary API หรือ Supabase

## เชื่อมข้อมูลจริง

1. สำหรับฐานข้อมูลใหม่ รัน `supabase/migrations/001_vocabulary.sql` ใน Supabase SQL Editor ก่อน
2. รัน `supabase/migrations/002_dictionary.sql` สำหรับทั้งฐานข้อมูลใหม่และฐานข้อมูลเดิม Migration นี้เก็บข้อมูลอังกฤษของวันก่อนหน้าเป็น `legacy` และเปลี่ยนการบันทึกใหม่เป็นข้อมูลพจนานุกรม
3. สร้างผู้ใช้ที่ยืนยันอีเมลแล้วใน Supabase Authentication แล้วเข้าสู่ระบบในแอป
4. ตั้งค่าต่อไปนี้ใน `.env.local` แล้วรีสตาร์ต Next.js

```dotenv
APP_MODE=live
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
DICTIONARY_API_URL=http://127.0.0.1:3001
NEXT_PUBLIC_ALLOW_SIGNUP=false
```

ใช้ `NEXT_PUBLIC_SUPABASE_ANON_KEY` แทน publishable key ได้ ไม่ต้องตั้งค่า Groq แล้ว `DICTIONARY_API_URL` เป็น URL ฝั่งเซิร์ฟเวอร์ ห้ามเติม `NEXT_PUBLIC_` ให้ตัวแปรนี้

ให้เซิร์ฟเวอร์จาก `cambridge-dictionary-api` ทำงานบนพอร์ต 3001 เปิด `/api/dictionary/en/ought` เพื่อยืนยันว่าได้ JSON ก่อนเพิ่มคำในแอป โปรเจกต์พจนานุกรมมี dependencies และขั้นตอนรันใน README ของตัวเอง

คำที่เพิ่มต้องเป็นภาษาอังกฤษหนึ่งคำ เซิร์ฟเวอร์เรียก `GET /api/dictionary/en/{word}` แล้วตรวจสอบข้อมูลก่อนบันทึก HTTP error คำที่ไม่พบ ผลลัพธ์ผิดรูปแบบ หรือคำที่ redirect ไปคนละคำจะไม่ใช้ช่องคำศัพท์ของวันนั้น

หาก scraper ส่งรายการที่ข้อความความหมายว่างมาด้วย แอปจะข้ามรายการนั้น โดยเก็บความหมายและตัวอย่างของรายการที่มีข้อความครบ ถ้าไม่เหลือความหมาย แอปจะไม่บันทึกคำ

## ล้างศัพท์ของวันนี้

ใช้ `clear_vocabulary_today(p_expected_day)` ผ่านเซสชันของผู้ใช้ ฟังก์ชันนี้ตรวจว่าวันที่ที่ระบุตรงกับวันปัจจุบันใน Asia/Bangkok หลังได้ lock แล้วจึงลบเฉพาะคำของผู้ใช้ที่เรียก แอปไม่ล้างข้อมูลอัตโนมัติ

สคริปต์ต่อไปนี้ต้องใช้ access token ของผู้ใช้ที่เข้าสู่ระบบแล้ว และจะหยุดถ้าวันที่เปลี่ยนไป ห้ามใช้ service-role key แทน token ของผู้ใช้

```sh
SUPABASE_USER_ACCESS_TOKEN=your-user-access-token node scripts/clear-today.mjs --day 2026-10-10
```

## ใช้งานบนเซิร์ฟเวอร์

ตั้ง `DICTIONARY_API_URL` เป็น URL ของ Dictionary API ที่เซิร์ฟเวอร์ Next.js ติดต่อได้ URL localhost ใช้ได้เมื่อทั้งสองโปรเจกต์รันในเครื่องเดียวกันเท่านั้น ตั้ง Supabase Site URL ให้ตรงกับ URL ของแอป แล้วรัน `npm run build` และ `npm start`

## ตรวจสอบโค้ด

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

[คู่มือทดสอบ](docs/TESTING.md) อธิบายการตรวจฐานข้อมูลและ browser [โครงสร้างโปรเจกต์](docs/ARCHITECTURE.md) อธิบายชนิดข้อมูลและการบันทึก
