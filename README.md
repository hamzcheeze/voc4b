# voc4b

A daily English vocabulary notebook. Next.js reads definitions, examples, IPA, and audio from Cambridge Dictionary, then stores them in Supabase. Verb forms come from Simple Wiktionary. The app does not provide Thai translations.

## Run locally

Use Node.js 22.19 or later. From the project folder, run:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Without Supabase keys, the app runs in demo mode and stores sample words in your browser. Try `rescind` or `serene`. Demo mode does not connect to a dictionary or Supabase.

## Connect Supabase

1. For a new database, run `supabase/migrations/001_vocabulary.sql` in the Supabase SQL Editor.
2. Run `supabase/migrations/002_dictionary.sql` on both new and existing databases. This migration preserves older English entries as `legacy` content and changes new entries to dictionary content.
3. Run `supabase/migrations/003_unique_words.sql` to prevent saving a word already in your library on any earlier day. Existing entries are preserved.
4. Run `supabase/migrations/004_remove_today_word.sql` to allow removing one of today's words and filling its slot with another word.
5. Create a user with a confirmed email in Supabase Authentication, then sign in to the app.
6. Add these values to `.env.local` and restart Next.js:

```dotenv
APP_MODE=live
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_ALLOW_SIGNUP=false
```

You can use `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead of the publishable key.

Add one English word at a time. `POST /api/words` verifies the user's session, fetches Cambridge pages from the Next.js server through `CambridgeDictionary`, parses the HTML with Cheerio, and validates the entry before saving it.
`DELETE /api/words?id=...` removes only a word saved today by the signed-in user.

A failed request, missing word, malformed response, or unrelated redirect leaves today's word slots unchanged. If Simple Wiktionary is unavailable, Cambridge data can still be saved without verb forms. The app skips blank definitions and does not save an entry if no usable definitions remain.

## Clear today's words

The `clear_vocabulary_today(p_expected_day)` function checks that the requested date still matches the current date in `Asia/Bangkok`, then deletes only the calling user's words for that day. The app never clears data automatically.

Use an access token from the signed-in user. The script stops if the date has changed. Do not use a service-role key in place of a user token.

```sh
SUPABASE_USER_ACCESS_TOKEN=your-user-access-token node scripts/clear-today.mjs --day 2026-10-10
```

## Deploy

Set the Supabase variables above and configure the Supabase Site URL to match your app URL. Use a Node.js server that can reach `dictionary.cambridge.org`, `simple.wiktionary.org`, and Supabase. Then run:

```sh
npm ci
npm run build
npm start
```

The Next.js app contains the dictionary extraction logic in `src/adapters/dictionary.ts`. You can remove the `cambridge-dictionary-api` folder before deployment. The app does not need a separate dictionary server. See [Third-party notices](THIRD_PARTY_NOTICES.md) for attribution and license details.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

See the [testing guide](docs/TESTING.md) for database and browser checks, and the [architecture guide](docs/ARCHITECTURE.md) for data types and storage.
