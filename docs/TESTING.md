# Verify dictionary storage

Run the local checks.

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

`dictionary.test.ts` checks the response-to-domain mapping against literal expected data. It covers all nonblank senses and their examples, blank derived-word definitions, pronunciation variants, verb forms, translation removal, unrelated headwords, unsafe audio URLs, HTTP failures, and malformed JSON.

`add-word.test.ts` checks lookup before save, the early daily cap, and no save after a provider failure. UI tests check US pronunciation, UK fallback, audio controls, additional senses, and honest legacy display.

`database.test.ts` runs the production migrations on PGlite PostgreSQL. It checks legacy history, migration reruns, nested JSON validation, authentication, RLS, daily limits, direct-write denial, and caller-scoped current-day deletion. PGlite does not prove simultaneous connections.

## Test separate database connections

Use an empty disposable PostgreSQL database. This script creates test users and writes test vocabulary.

```sh
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/postgres-bootstrap.sql -f supabase/migrations/001_vocabulary.sql -f supabase/migrations/002_dictionary.sql
TEST_DATABASE_URL="$TEST_DATABASE_URL" node scripts/test-concurrency.mjs
```

Eight simultaneous connections must produce two saved entries and six `daily_limit` errors.

## Read the real Dictionary API

Start the Dictionary API on port 3001. The optional live test only reads the provider and never saves vocabulary.

```sh
RUN_LIVE_CHECK=1 npx vitest run tests/live-connection.test.ts
```

## Verify real Supabase writes

Run the live app and Dictionary API, apply migration 002, and set `SUPABASE_SECRET_KEY` in `.env.local`.

```sh
RUN_LIVE_WRITE_CHECK=1 npx vitest run tests/live-save.test.ts
```

This opt-in check creates two confirmed temporary accounts without sending email. It signs in with the public key, adds words through the local app API, compares Supabase data with the Dictionary API, and checks user isolation and the daily cap. Cleanup deletes only the accounts created by this run and their vocabulary. It does not sign in as an existing user. Set `LIVE_APP_URL` if the local app uses a different port.

## Check the browser

Run the app in explicit demo mode for the notebook browser suite. If port 3000 already hosts a live notebook, use an isolated copy and port instead of changing its session.

```sh
APP_MODE=demo npm run test:e2e
```

The browser suite covers two-word additions, reload persistence, history filtering, keyboard focus, provider-free demo errors, mobile overflow, accessibility, theme persistence, and IPA display. The demo cannot verify live Supabase writes or remote audio playback.

For live acceptance, sign in, add one word, reload, and compare `content.entry` in Supabase with the provider response. Verify that each sense and example remains intact and Thai fields are absent. Check the audio button against its stored Cambridge URL. Failed lookup must leave the count unchanged. Check that a second user cannot see the first user's rows.
