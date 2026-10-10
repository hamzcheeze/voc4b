# Maintenance guide

## Ownership

- `src/domain/vocabulary.ts`: product rules, Bangkok calendar day, input/AI validation, valid history filters and ordering. No Next.js, database or network dependency. All entry data is plain typed data.
- `src/application/add-word.ts`: the add-word use case and two small ports (`VocabularyRepository`, `WordEnricher`). Validate → count → enrich → atomic save. Count is an early cost-saving check, not the concurrency guarantee.
- `src/application/config.ts`: explicit demo/live/unconfigured policy. Production never silently becomes demo.
- `src/adapters/groq.ts`: server-used Groq HTTP adapter, strict output request plus independent Zod validation, 25-second timeout, useful errors. No browser import path uses this adapter. Change providers by implementing `WordEnricher`; keep domain output unchanged. Check current model availability/limits before changing the configured model.
- `src/adapters/supabase.ts`: authenticated user-scoped Supabase adapter. Paginated history avoids the default 1,000-row cutoff. The public key does not authorize access by itself; RLS and user JWT do. No service role anywhere.
- `src/adapters/demo.ts`: explicitly authored fixtures and browser-only persistence, separate from the live ports. Unsupported demo words explain why they cannot be added. Cross-tab demo write protection uses Web Locks when supported, not a claim of production-grade security.
- `src/app/api/words/route.ts`: thin HTTP boundary: mode, bearer verification with `getUser`, same-origin POST, bounded payload, use-case invocation, private no-store response. Network/provider errors do not persist an entry. No incoming user ID or day is accepted.
- `src/components/workspace.tsx`: browser session, refresh/loading/error state, shared notebook shell. Request generation prevents stale results from a signed-out user appearing in a new session. Default private-user setup avoids paid SMTP dependencies. Browser JWT storage is Supabase's standard client auth flow; React escapes all word/definition text and there is no raw HTML renderer.
- `src/components/words.tsx`: reusable display + exact single-add-control policy. Stress has both semantic `<strong>` and an explicitly stronger color.
- `src/app/page.tsx`, `src/app/history/page.tsx`: today and grouped history interaction. Native modal dialog supplies focus containment; Escape/cancel works except while saving. Date changes refresh every 15 seconds and on window focus.
- `supabase/migrations/001_vocabulary.sql`: production authorization and invariants. Change SQL through a new numbered migration for existing installations, never rewrite a previously applied file without migration planning.

## Database invariants

The only browser-visible table grant is SELECT with `auth.uid() = user_id` RLS. The security-definer save RPC has an empty search path and fully qualified table/auth references. It authenticates, validates fields, takes a transaction advisory lock per user, then derives the calendar day from **wall clock after the lock**, in Asia/Bangkok. Counts and insert occur under that lock. The unique `(user_id,day,slot)` constraint with slots only 1 or 2 provides a second cap defense. Same-word duplicates within a day are rejected; the same word can be reviewed on another day. Callers cannot supply day, slot, or owner. INSERT/UPDATE/DELETE grants do not exist for authenticated users, so edits or deletion cannot reopen a slot.

Hash lock collisions could serialize unrelated users; they cannot violate the cap. Product day is deliberately fixed to Bangkok; changing it requires a coordinated domain + database migration and a decision about existing calendar dates.

## Intentional scope

No card-gated service, paid dictionary, paid fonts, external asset CDN, or Sites/Cloudflare hosting. No deletion/edit UI is added because the requested daily notebook is append-only. Data export/backup is an owner's Supabase administration concern; Free does not include paid backups. History is paginated from Supabase and filtered locally; for much larger datasets add server-side query ports without moving the domain semantics into components.

External live semantics need a credentialed smoke check: AI outputs may be structurally valid but still semantically imperfect. The prompt validates real words and aligns Thai to the generated English explanation; schema tests verify format rather than claiming linguistic certainty. Demo fixtures never masquerade as model results.

## Appearance

The interface uses neutral grayscale variables in `src/app/globals.css`, self-hosted Inter and Noto Sans Thai, document-style rows and thin line icons (`src/components/icon.tsx`). Stressed syllables remain bold and use the primary text color in both appearances. Decorative headings, slogans and repeated completion copy have been removed.

`src/components/theme-script.ts` exports only SSR-safe constants and a fixed bootstrap script. The root layout applies the stored or system theme before rendering page content and suppresses the expected root attribute hydration mismatch. The client `theme-toggle.tsx` uses `useSyncExternalStore` to reflect the document theme, persists explicit choices, follows system changes before an explicit choice, and synchronizes preference changes from other tabs. Storage restrictions do not prevent toggling the current page. UI preference never changes notebook data or production configuration.
