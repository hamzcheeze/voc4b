# voc4b

A daily English vocabulary notebook. Next.js reads definitions, examples, IPA, and audio from Cambridge Dictionary, then stores them in Supabase. Verb forms come from Simple Wiktionary. The app does not provide Thai translations.

## Run locally

Install Bun 1.4.3 or later. Keep Node.js 22.19 or later available for Vitest and Playwright tooling. The app uses Bun for development, builds, and production. From the project folder, run:

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:3000. Without Supabase keys, the app runs in demo mode and stores sample words in your browser. Try `rescind` or `serene`. Demo mode does not connect to a dictionary or Supabase.

## Connect Supabase and OAuth

1. For a new database, run `supabase/migrations/001_vocabulary.sql` in the Supabase SQL Editor.
2. Run `supabase/migrations/002_dictionary.sql` on both new and existing databases. This migration preserves older English entries as `legacy` content and changes new entries to dictionary content.
3. Run `supabase/migrations/003_unique_words.sql` to prevent saving a word already in your library on any earlier day. Existing entries are preserved.
4. Run `supabase/migrations/004_remove_today_word.sql` to allow removing one of today's words and filling its slot with another word.
5. Run `supabase/migrations/005_nextauth.sql`. It preserves existing vocabulary and user IDs while moving account and session storage to NextAuth.
6. Run `supabase/migrations/006_history_pagination.sql` to index owner-scoped History pages.
7. Run `supabase/migrations/007_thai_meaning.sql` to save personal Thai meanings from the back of each Today card. The function changes only the meaning on a word owned by the signed-in account.
8. In Supabase **Project settings → Data API → Exposed schemas**, add `next_auth` without removing the existing schemas. Its tables allow only server-side service-role access.
9. Add these values to `.env.local`:

```dotenv
APP_MODE=live
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-secret-key
AUTH_SECRET=your-random-auth-secret
AUTH_URL=http://localhost:3000
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
AUTH_FACEBOOK_ID=your-facebook-app-id
AUTH_FACEBOOK_SECRET=your-facebook-app-secret
```

Generate `AUTH_SECRET` with `bun -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'`. Keep this value and `SUPABASE_SECRET_KEY` private. Do not prefix them with `NEXT_PUBLIC_`. The browser does not need a Supabase key. See [.env.example](.env.example) for all settings.

Existing `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` values work as aliases for the Google settings above.

9. Register the provider callbacks below, then restart Next.js. Google needs an OAuth web application. Facebook needs a dedicated development app for localhost and the appropriate app permissions before other people can use it.

| Provider | Local callback                                     |
| -------- | -------------------------------------------------- |
| Google   | `http://localhost:3000/api/auth/callback/google`   |
| Facebook | `http://localhost:3000/api/auth/callback/facebook` |
| ChatGPT  | `http://localhost:3000/api/auth/callback/chatgpt`  |

ChatGPT website sign-in requires an [OAuth client issued by OpenAI](https://developers.openai.com/siwc/website). An OpenAI API key does not enable login. Set `AUTH_CHATGPT_ID` and the registered `AUTH_CHATGPT_TOKEN_AUTH_METHOD`. Confidential clients also need `AUTH_CHATGPT_SECRET`. The button stays unavailable until its configuration is present.

First OAuth sign-in creates the account. Later sign-ins reuse the linked provider identity. To recover an invited account and its vocabulary, use Google with the same Gmail or verified Google Workspace address. Google-verified third-party email alone cannot claim an existing account. Facebook and ChatGPT do not automatically merge accounts by email. Use the original sign-in provider if the app reports an account conflict.

Sessions use an HttpOnly cookie and a database record with a rolling 400-day lifetime. The app renews sessions during use. Provider access-token expiry does not expire the notebook session. Signing out revokes the database session. Browser cookie deletion or long inactivity can still require another sign-in.

For iPhone OAuth testing, use a stable HTTPS domain with registered callbacks. `localhost` on an iPhone refers to the iPhone itself, and OAuth providers may reject raw LAN IP callbacks. Cookies for `localhost` and a LAN IP are separate.

Add one English word at a time. `POST /api/words` verifies the NextAuth session, fetches Cambridge pages from the Next.js server through `CambridgeDictionary`, parses the HTML with Cheerio, and validates the entry before saving it.
`DELETE /api/words?id=...` removes only a word saved today by the signed-in user.
`GET /api/words` returns today's words. History uses `GET /api/history` with page and search parameters. Search matches saved words across the whole collection before pagination. Each response includes up to 100 words and the matching total.

A failed request, missing word, malformed response, or unrelated redirect leaves today's word slots unchanged. If Simple Wiktionary is unavailable, Cambridge data can still be saved without verb forms. The app skips blank definitions and does not save an entry if no usable definitions remain.

## Clear today's words

The app never clears data automatically. The optional script removes today's words through the same authenticated API used by the UI. Copy the signed-in browser's NextAuth session cookie into `AUTH_SESSION_COOKIE` in your local shell. The script requires the explicit current Bangkok date and stops if that date changes. Keep the cookie private.

```sh
AUTH_SESSION_COOKIE='authjs.session-token=your-session-token' bun scripts/clear-today.mjs --day 2026-10-12
```

## Deploy

Set the server secrets above, `AUTH_URL` to your HTTPS origin, and `AUTH_TRUST_HOST=true` only behind a trusted host or proxy. Register each enabled provider's production callback at `/api/auth/callback/{provider}`. Use a server with Bun installed that can reach the configured providers, `dictionary.cambridge.org`, `simple.wiktionary.org`, and Supabase. Then run:

```sh
bun install --frozen-lockfile
bun run build
bun run start
```

The Next.js app contains the dictionary extraction logic in `src/adapters/dictionary.ts`. You can remove the `cambridge-dictionary-api` folder before deployment. The app does not need a separate dictionary server. See [Third-party notices](THIRD_PARTY_NOTICES.md) for attribution and license details.

## Checks

```sh
bun run test
bun run typecheck
bun run lint
bun run build
```

See the [testing guide](docs/TESTING.md) for database and browser checks, and the [architecture guide](docs/ARCHITECTURE.md) for data types and storage.
