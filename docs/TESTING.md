# Verify dictionary storage

Install dependencies with `bun install --frozen-lockfile`, then run the local checks. Keep Node.js 22.19 or later available for Vitest and Playwright. `bun run test` runs Vitest through the package script.

```sh
bun run test
bun run typecheck
bun run lint
bun run build
```

`dictionary.test.ts` serves local HTML fixtures through a mocked fetch and checks the resulting entry against literal expected data. It covers nonblank senses and their examples, blank derived-word definitions, pronunciation variants, verb forms, translation omission, unrelated headwords, unsafe audio URLs, and upstream failures. The fixtures test the Next.js parser without running the reference clone.

`add-word.test.ts` checks lookup before save, the early daily cap, and no save after a provider failure. UI tests check US pronunciation, UK fallback, audio controls, additional senses, and honest legacy display.

`database.test.ts` checks the historical migrations with Supabase Auth identities. The NextAuth database tests run migration 005 on PGlite PostgreSQL and check owner preservation, service-only permissions, daily limits, duplicate words, and current-day deletion. PGlite does not prove simultaneous connections.

## Test separate database connections

Use an empty disposable PostgreSQL database. This script creates test users and writes test vocabulary.

```sh
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/postgres-bootstrap.sql -f supabase/migrations/001_vocabulary.sql -f supabase/migrations/002_dictionary.sql -f supabase/migrations/003_unique_words.sql -f supabase/migrations/004_remove_today_word.sql -f supabase/migrations/005_nextauth.sql
TEST_DATABASE_URL="$TEST_DATABASE_URL" bun scripts/test-concurrency.mjs
```

Eight simultaneous connections must produce two saved entries and six `daily_limit` errors.

## Read the real dictionary pages

The optional live test fetches Cambridge and Simple Wiktionary through `CambridgeDictionary`. It never saves vocabulary and needs no local dictionary service.

```sh
RUN_LIVE_CHECK=1 bun run test -- tests/live-connection.test.ts
```

## Verify real Supabase writes

Run the live Next.js app, apply migrations through 005, expose `next_auth`, and set `SUPABASE_SECRET_KEY` and `AUTH_SECRET` in `.env.local`.

```sh
RUN_LIVE_WRITE_CHECK=1 bun run test -- tests/live-save.test.ts
```

This opt-in check creates temporary NextAuth users and database sessions through the server key. It exercises the cookie-authenticated words API, compares stored data with `CambridgeDictionary.lookup()`, and checks isolation and the daily cap. Cleanup deletes only the temporary users from this run and their vocabulary. It does not prove a Google, Facebook, or ChatGPT consent flow. Set `LIVE_APP_URL` if the local app uses a different port.

## Verify OAuth sign-in

Configure Google credentials and its exact callback URL. From a signed-out browser, click **Continue with Google** and finish consent. Confirm that an imported account keeps its vocabulary. Sign out, sign in again, and confirm that the user ID is unchanged. Open the site in a second browser to check that accounts have separate vocabulary. Signing out must remove the database session so its old cookie cannot access `/api/words`.

Google and Facebook tests need registered OAuth applications. ChatGPT needs an issued OpenAI OAuth client. A local fake provider can test callback mechanics, but it cannot establish real provider readiness. Missing provider credentials leave that provider's button disabled.

For deployment acceptance, build a copy of the Next.js app without the nested `cambridge-dictionary-api` folder. Start that build and run the live write check against its `LIVE_APP_URL`. A successful check proves that the app fetches dictionary data and saves it without the reference clone or its server.

## Check the browser

Run the app in explicit demo mode for the notebook browser suite. If port 3000 already hosts a live notebook, use an isolated copy and port instead of changing its session.

```sh
APP_MODE=demo bun run test:e2e
```

The browser suite covers two-word additions, reload persistence, history filtering, keyboard focus, provider-free demo errors, mobile overflow, accessibility, theme persistence, and IPA display. The demo cannot verify live Supabase writes or remote audio playback.

For live acceptance, sign in, add one word, reload, and compare `content.entry` in Supabase with the provider response. Verify that each sense and example remains intact and Thai fields are absent. Check the audio button against its stored Cambridge URL. Failed lookup must leave the count unchanged. Check that a second user cannot see the first user's rows.
