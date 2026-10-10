# two words — สมุดคำศัพท์วันละสองคำ

## เริ่มใช้งานฉบับภาษาไทย

แอปพร้อมทดสอบในเครื่องแล้ว แต่ยังไม่ได้เชื่อมบัญชีจริงหรือ deploy ภายนอก ใช้ Next.js + TypeScript แยก domain/use case/adapters เพื่อให้นักพัฒนาคนอื่นดูแลต่อได้

- เปิดเทอร์มินัลในโฟลเดอร์โปรเจกต์ รัน `npm ci` แล้ว `npm run dev` เปิด http://localhost:3000
- หน้าจอใช้โทนขาวดำ ฟอนต์ Inter / Noto Sans Thai กดไอคอนพระจันทร์หรือดวงอาทิตย์ด้านขวาบนเพื่อสลับธีม แอปจำค่าที่เลือก และใช้ธีมของเครื่องเมื่อยังไม่เคยเลือก
- ถ้ายังไม่มี keys จะเห็นป้าย **เดโม** ชัดเจน คำตัวอย่างเก็บในเบราว์เซอร์ ไม่ใช่ผลจาก AI จริง ทดลองเพิ่ม `rescind` และ `serene` ทีละคำได้ พอครบสองคำปุ่มเพิ่มจะหายไป
- เริ่มระบบจริง: สมัคร **Supabase Free** สร้าง project แล้วรัน `supabase/migrations/001_vocabulary.sql` ใน SQL Editor
- สำหรับสมุดส่วนตัว สร้างผู้ใช้ใน Authentication → Users → Add user → Create new user แล้วเลือก **Auto Confirm User** ปิด “Allow new users to sign up” ใน Supabase ไม่ต้องใช้บริการส่งอีเมลเพิ่ม บัญชีนี้เข้าแอปด้วยอีเมลและรหัสผ่านได้
- สมัคร **Groq Free** และสร้าง API key โดยไม่อัปเกรด Developer ใช้ `openai/gpt-oss-20b` ตามเอกสารปัจจุบัน
- คัดลอก `.env.example` เป็น `.env.local` กรอก URL / publishable key ของ Supabase และ Groq key ตั้ง `APP_MODE=live` แล้วรีสตาร์ท server ห้ามใส่ service-role key และห้ามทำ Groq key เป็น `NEXT_PUBLIC_`
- Deploy ด้วย **Vercel Hobby** สำหรับงานส่วนตัว ตั้ง Node 22.x, Build `npm run build`, เพิ่ม env ชุดเดียวกันใน Production แล้วเปลี่ยน Supabase Site URL เป็น URL HTTPS ของ Vercel ใช้โดเมนฟรี `vercel.app`
- วันนี้และเพดานสองคำอิง **Asia/Bangkok** ฐานข้อมูลบังคับแบบ atomic พร้อม RLS แยกผู้ใช้ คำผิด / AI ล้มเหลว / รูปแบบผลลัพธ์ผิดจะยังไม่บันทึกหรือใช้ช่องคำศัพท์
- สิ่งที่ยังต้องทำภายนอกมีเพียงสร้าง project/บัญชีผู้ใช้ กรอก keys รัน migration และ deploy บนบัญชีของคุณ รายละเอียดทุกขั้นตอนอยู่ด้านล่าง

ข้อจำกัดแพ็กเกจฟรี: Groq 30 requests/นาที, 1,000/วัน, 8,000 tokens/นาที, 200,000/วัน (รวมระดับองค์กร); Supabase DB 500 MB และพัก project หลังไม่ใช้งาน 1 สัปดาห์; Vercel Hobby ใช้เฉพาะงานส่วนตัว/ไม่ใช่เชิงพาณิชย์ แหล่งเอกสารทางการและวิธีตรวจโควตาอยู่ในตารางด้านล่าง

A real Next.js App Router + TypeScript application, ready for Vercel. Preserve the original `vocab2words.pdf`; it is not part of the runtime.

## Try locally

Requires Node **22.19+** (use Node 22 LTS on Vercel).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. With **no environment variables**, development explicitly shows a **เดโม** indicator, with sample history and zero entries today. Try `rescind`, `serene`, `thrive`, `deliberate`, `subtle`, or `resilient`. One word per submission, two per Bangkok calendar day. Samples are authored fixtures, **not AI**. Additions persist only in this browser's localStorage, and “ล้างเดโม” resets them. Web Locks coordinate demo writes across tabs where supported. The production database is the authority for real concurrent writes.

`APP_MODE=demo` explicitly enables a demo deployment. A production build without complete live settings displays a setup error instead of silently falling back to demo. Partial configuration also fails visibly in development. Do not copy placeholder live settings just to run the demo.

## Real Supabase + AI setup (no payment method needed)

No external account/project has been created and no cloud data has been saved in this workspace. You provide your own accounts/keys. Do not upgrade any service to a paid plan.

1. Register at https://supabase.com/dashboard (email or GitHub), choose **Free**, create a project, choose a nearby region and a strong database password. Account registration and a Free project do not require a paid subscription. You do not need a service-role key.
2. In **SQL Editor → New query**, paste and run **`supabase/migrations/001_vocabulary.sql` once**. This creates the table, SELECT-only RLS, atomic save RPC and today-count RPC. Do not manually grant INSERT/UPDATE/DELETE to browser roles.
3. For this **personal notebook**, use **Authentication → Users → Add user → Create new user**. Enter your email and a password of at least 8 characters, and enable **Auto Confirm User**. This is an intentional administrator-created account, so the app does not need any SMTP provider. In **Authentication → Sign In / Providers**, enable Email/password and **disable “Allow new users to sign up”**. Leave `NEXT_PUBLIC_ALLOW_SIGNUP=false`. Sign in with that user in the app.
4. Set **Authentication → URL Configuration → Site URL** to `http://localhost:3000` while developing, then your Vercel HTTPS URL after deploying. If you later enable public signups, configure email delivery first and then enable both Supabase signups and `NEXT_PUBLIC_ALLOW_SIGNUP=true`. Built-in SMTP sends only to project-team email addresses, currently **2 messages/hour**; it is not general public email delivery. Email verification remains enabled for public signup. See [official SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp). For a personal notebook there is no need to add another email service or card.
5. Get the **Project URL** and **publishable key** from Supabase's Connect / API Keys panel. `sb_publishable_...` or the legacy **anon** key is acceptable. Never use **service_role** or `sb_secret_...` here.
6. Register at https://console.groq.com on **Free**, then create a key at https://console.groq.com/keys. Do not upgrade to Developer or attach billing. The [billing FAQ](https://console.groq.com/docs/billing-faqs) requires a payment method for the upgrade from Free to Developer, not Free usage. `openai/gpt-oss-20b` is currently a [production model](https://console.groq.com/docs/models) and supports [strict structured outputs](https://console.groq.com/docs/structured-outputs).
7. Copy `.env.example` to `.env.local` and replace URL/public key and `GROQ_API_KEY`. Set `APP_MODE=live`. `GROQ_API_KEY` and `GROQ_MODEL` are **server-only**, never `NEXT_PUBLIC_` values. `.env.local` is ignored by Git. Restart `npm run dev`.
8. Sign in. Enter one real English word. The server verifies the Supabase user, checks today's count, requests AI enrichment and validates its output, then atomically saves via the user's authenticated Supabase connection. Look in the Table Editor to confirm the real row. Invalid word, timeout, 429, invalid respelling/structure, or failed save leaves the daily slot unused. No static dictionary fallback is presented as AI.

## Verified free-tier constraints

Checked **10 October 2026** against official provider documentation. Quotas may change; the account's limits page is authoritative.

| Service                         | Free usage and limits                                                                                                                                                          | Billing / registration                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groq Free, `openai/gpt-oss-20b` | 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute, 200,000 tokens/day. Organization-wide; any limit can be reached first. A 429 is handled without saving a word.    | Create account and API key, remain Free. Payment method is required to upgrade to Developer. [Rate limits](https://console.groq.com/docs/rate-limits), [billing FAQ](https://console.groq.com/docs/billing-faqs).                                                                                                                       |
| Supabase Free                   | 2 active Free projects; 500 MB DB/project; 50,000 monthly active users; 5 GB egress; inactive projects pause after 1 week. Free overages can restrict service.                 | Create a Free project, no paid upgrade needed. Password auth with a manually confirmed personal user needs no email provider. [Pricing](https://supabase.com/pricing), [Free plan billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [quota restrictions](https://supabase.com/docs/guides/platform/billing-faq). |
| Vercel Hobby                    | Free for **personal/non-commercial** use. Includes 1 million function invocations, 4 CPU-hours, and other bounded resources; most over-limit usage requires waiting for reset. | Choose Hobby rather than Pro or a paid add-on; use the free `vercel.app` domain. [Hobby limits and eligibility](https://vercel.com/docs/plans/hobby), [Hobby without a payment method](https://vercel.com/docs/plans/pro-plan/trials), [pricing](https://vercel.com/pricing).                                                           |

Groq's two daily successful vocabulary requests are far below typical Free limits for one personal user; retries/concurrent requests still consume API tokens and requests even if no word is saved. Disable public registration as above to protect a personal API key's quota. The app does not purchase overage or auto-upgrade accounts.

## Deploy to Vercel Hobby

1. Put this folder in your own Git repository and push to GitHub/GitLab/Bitbucket. Exclude `.env.local`, `.next`, `node_modules`; the original large PDF is unrelated and can remain local (do not accidentally push it unless desired).
2. Sign in to https://vercel.com/new; select **Hobby/personal** and import the repo. Framework preset **Next.js**; project root is this app's folder. Use Node **22.x**, install `npm ci`, build `npm run build`, default output directory.
3. Add `APP_MODE=live`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-20b`, `NEXT_PUBLIC_ALLOW_SIGNUP=false` to the project's Production environment. Set the same variables in Preview only if you want previews to connect to that database; use a separate Free project for test data when feasible.
4. Deploy. Use the free generated `*.vercel.app` URL; no domain purchase or Pro features are required. Update Supabase Site URL to the deployed HTTPS origin. Environment changes require a redeploy, including public variables compiled into the client.
5. Verify login, add one word, refresh, check History and confirm Supabase rows belong to that user's UUID. Confirm the second word removes the add button and the third RPC request is refused. Sign in with another test user to verify private isolation. If the project was paused, resume it in Supabase first.

Only the external account/project/API-key configuration and actual Vercel deployment remain. Live hosted auth and AI correctness/latency cannot be verified without those credentials. Local tests exercise their boundaries with mocks and real PostgreSQL SQL. The deployment is not claimed to be live.

## Tests and maintenance

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm audit
# Browser tests, once Chromium is installed:
npx playwright install chromium
npm run test:e2e
```

See **`docs/TESTING.md`** for test-first evidence and real concurrency instructions; **`docs/ARCHITECTURE.md`** for ownership and future changes. Screenshots and QA logs live under `docs/`.
