# voc4b

สมุดคำศัพท์ภาษาอังกฤษวันละสองคำ Next.js ดึงความหมาย ตัวอย่าง IPA และเสียงจากหน้า Cambridge Dictionary แล้วเก็บลง Supabase รูปคำกริยามาจาก Simple Wiktionary โดยไม่มีคำแปลไทย

## เริ่มในเครื่อง

ใช้ Node.js 22.19 ขึ้นไป แล้วรันคำสั่งในโฟลเดอร์โปรเจกต์

```sh
npm ci
npm run dev
```

เปิด http://localhost:3000 หากยังไม่มี Supabase keys แอปใช้เดโมที่เก็บคำตัวอย่างในเบราว์เซอร์ ทดลอง `rescind` และ `serene` ได้ เดโมไม่เรียกพจนานุกรมหรือ Supabase

## เชื่อมข้อมูลจริง

1. สำหรับฐานข้อมูลใหม่ รัน `supabase/migrations/001_vocabulary.sql` ใน Supabase SQL Editor ก่อน
2. รัน `supabase/migrations/002_dictionary.sql` สำหรับทั้งฐานข้อมูลใหม่และฐานข้อมูลเดิม Migration นี้เก็บข้อมูลอังกฤษของวันก่อนหน้าเป็น `legacy` และเปลี่ยนการบันทึกใหม่เป็นข้อมูลพจนานุกรม
3. สร้างผู้ใช้ที่ยืนยันอีเมลแล้วใน Supabase Authentication แล้วเข้าสู่ระบบในแอป
4. ตั้งค่าต่อไปนี้ใน `.env.local` แล้วรีสตาร์ต Next.js

```dotenv
APP_MODE=live
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_ALLOW_SIGNUP=false
```

ใช้ `NEXT_PUBLIC_SUPABASE_ANON_KEY` แทน publishable key ได้

คำที่เพิ่มต้องเป็นภาษาอังกฤษหนึ่งคำ `POST /api/words` ตรวจเซสชันของผู้ใช้ แล้วดึงหน้าเว็บพจนานุกรมผ่าน `CambridgeDictionary` ฝั่งเซิร์ฟเวอร์ Next.js ใช้ Cheerio อ่าน HTML และตรวจข้อมูลก่อนบันทึก

HTTP error คำที่ไม่พบ ผลลัพธ์ผิดรูปแบบ หรือคำที่ redirect ไปคนละคำจะไม่ใช้ช่องคำศัพท์ของวันนั้น หาก Simple Wiktionary ไม่พร้อมใช้งาน แอปยังบันทึกความหมายจาก Cambridge ได้โดยไม่มีรูปคำกริยา

หาก scraper ส่งรายการที่ข้อความความหมายว่างมาด้วย แอปจะข้ามรายการนั้น โดยเก็บความหมายและตัวอย่างของรายการที่มีข้อความครบ ถ้าไม่เหลือความหมาย แอปจะไม่บันทึกคำ

## ล้างศัพท์ของวันนี้

ใช้ `clear_vocabulary_today(p_expected_day)` ผ่านเซสชันของผู้ใช้ ฟังก์ชันนี้ตรวจว่าวันที่ที่ระบุตรงกับวันปัจจุบันใน Asia/Bangkok หลังได้ lock แล้วจึงลบเฉพาะคำของผู้ใช้ที่เรียก แอปไม่ล้างข้อมูลอัตโนมัติ

สคริปต์ต่อไปนี้ต้องใช้ access token ของผู้ใช้ที่เข้าสู่ระบบแล้ว และจะหยุดถ้าวันที่เปลี่ยนไป ห้ามใช้ service-role key แทน token ของผู้ใช้

```sh
SUPABASE_USER_ACCESS_TOKEN=your-user-access-token node scripts/clear-today.mjs --day 2026-10-10
```

## ใช้งานบนเซิร์ฟเวอร์

ตั้งค่าตัวแปร Supabase ด้านบน และตั้ง Supabase Site URL ให้ตรงกับ URL ของแอป ใช้เซิร์ฟเวอร์ Node.js ที่ติดต่อ `dictionary.cambridge.org`, `simple.wiktionary.org` และ Supabase ได้ แล้วรัน

```sh
npm ci
npm run build
npm start
```

โปรเจกต์ Next.js มี logic ดึงพจนานุกรมใน `src/adapters/dictionary.ts` แล้ว สามารถลบโฟลเดอร์ `cambridge-dictionary-api` ก่อน deploy ได้ แอปไม่ต้องเปิดเซิร์ฟเวอร์พจนานุกรมแยก ดูแหล่งที่มาและใบอนุญาตใน [Third-party notices](THIRD_PARTY_NOTICES.md)

## ตรวจสอบโค้ด

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

[คู่มือทดสอบ](docs/TESTING.md) อธิบายการตรวจฐานข้อมูลและ browser [โครงสร้างโปรเจกต์](docs/ARCHITECTURE.md) อธิบายชนิดข้อมูลและการบันทึก
