# Test-first evidence and validation

The project initially contained only an unrelated PDF. Tests were written before implementation.

1. `tdd-red.log`: missing domain/use-case/adapter/component modules and SQL migration (5 failing suites).
2. Minimal placeholders were then created, still without behavior. `tdd-red-behavior.log`: **23 failed, 9 passed, 5 skipped**, 5 failing files. Positive calendar/enrichment/use-case and UI assertions demonstrated real absent behavior; several rejection-only tests trivially passed against the throwing placeholders and are not claimed as red evidence. The database tests failed setup because the migration did not yet exist.
3. Implemented the rules/adapters/display/migration. First green run: **37/37** (the later aggregate `tdd-green.log` supersedes this output).
4. Added config/demo tests before those files existed, captured `tdd-red-config-demo.log` (2 failing suites), then implemented them. **46/46** passed.
5. Added API authentication/origin/body regression checks and upgraded tooling to clear dependency advisories; full suite **50/50** at that stage; a further test-first same-day chronological ordering case (`tdd-red-chronology.log`: 1 failed, 20 passed) brings the final suite to **51/51**. Browser tests are integration/QA checks, not claimed to have preceded implementation.

## What the tests cover

- Bangkok midnight (16:59:59Z → 17:00:00Z), 0/1/2 daily slots, input limits.
- Exact day/month/year history filters, ASC/DESC, invalid calendar dates.
- Primary stress exactly once, readable Latin respelling, rejection of IPA/missing Thai/bad structures.
- AI before persistence, full day avoids AI, provider failure/invalid words/429 do not save.
- 0/1/2 UI control counts, visible saved words and semantic/colored stress.
- Explicit production configuration behavior and honest demo persistence/errors.
- Actual migration executed by PGlite PostgreSQL: unauthenticated denial, direct-insert denial, two-word cap, RLS user isolation, invalid-pronunciation rejection.
- HTTP auth/config/origin/size boundaries.
- Desktop/mobile browser integration: additions, reload persistence, grouped history, empty filters, sort reversal, modal keyboard focus, error/no-slot behavior, horizontal overflow and axe accessibility.

## Real multi-connection cap test

PGlite does not model simultaneous independent database connections. Separately tested a disposable **PostgreSQL 14** instance on loopback port 55439. Eight concurrent psql processes raced through the actual RPC: **exactly 2 succeeded, 6 returned daily_limit**. Result saved in `concurrency.log`. No external database/user data was touched.

To reproduce against an **empty disposable local PostgreSQL database** (never your notebook):

```sh
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/postgres-bootstrap.sql -f supabase/migrations/001_vocabulary.sql
TEST_DATABASE_URL="$TEST_DATABASE_URL" node scripts/test-concurrency.mjs
```

The bootstrap emulates only `auth.uid()` and auth users/roles needed by the migration. Supabase's external JWT verification still needs a credentialed smoke test. The race script inserts a distinct test user; a fresh database is required for each run.

## Live acceptance after setup

1. Create two confirmed users; user A's rows must be absent for B.
2. Add two real words to A; third fails through RPC, including from separate tabs.
3. Observe meaningful pronunciation, simple English explanation and a natural Thai translation of the same sentence.
4. Try an invalid word and verify no row/slot. Temporarily use an invalid Groq key, verify provider error and no row, then restore the correct key.
5. Around Bangkok midnight, next day's slots reopen. The app refreshes on focus/15-second tick; authoritative SQL chooses day after lock and enrichment, never from client date.
6. Check deployed Vercel page refresh/auth and Supabase Site URL.

No keys were available during implementation; no claim of real cloud AI output, hosted auth, or deployed persistence is made.

Final browser QA: **6/6 passed** (3 desktop, 3 mobile); axe reported **0 violations** on empty and one-word pages. Build, typecheck, lint and `npm audit` passed with **0 vulnerabilities**.

## Monochrome and dark-mode revision

Theme tests were written before implementation. `tdd-red-theme.log` records **6/6 failures** against placeholders, then all six passed after implementation. They cover system preference, explicit-choice priority, invalid stored values, persistence, storage failures and accessible two-way toggling. Final aggregate: **60/60 unit/integration tests**.

Updated browser QA: **10/10 passed** (5 desktop, 5 mobile). Added checks for theme persistence through navigation/reload, system preference updates, achromatic text colors, accessible dark-mode dialogs, and light/dark History pages. Axe reported **0 violations** in the tested views. Updated screenshots include `preview-desktop-dark.png` and `preview-mobile-dark.png`. Typecheck, lint and production build passed.
