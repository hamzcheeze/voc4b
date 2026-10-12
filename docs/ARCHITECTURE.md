# Dictionary data flow

`Workspace.add()` sends the requested word to authenticated `POST /api/words`. The route verifies the NextAuth cookie session and calls `addWord()`. The use case validates the word, checks today's count, calls `DictionaryProvider.lookup()`, and saves the entry with `VocabularyRepository.save(word, entry)`.

`POST /api/words` is the backend for the vocabulary UI. It calls `CambridgeDictionary` directly inside the Next.js Node server. The server does not call a separate dictionary service or an HTTP route in the same app.

`CambridgeDictionary` fetches `https://dictionary.cambridge.org/us/dictionary/english/{word}` and `https://simple.wiktionary.org/wiki/{word}`. Cheerio reads Cambridge's headword, parts of speech, pronunciation blocks, definition blocks, and examples. It reads verb forms from Simple Wiktionary's inflection table. The adapter validates the extracted object with `dictionaryEntrySchema` before returning it. It skips blank definitions and does not extract translations. A failed Wiktionary lookup yields an empty `verbForms` array without discarding Cambridge data.

Each upstream request has a 10-second timeout through the response body and a 2 MiB HTML limit. The fetch follows at most five redirects within the original HTTPS origin. The upstream origins are fixed in server-only code. A missing or unrelated headword, invalid entry, or failed Cambridge request prevents a save.

The route owns one `CambridgeDictionary` instance. It caches successful entries for 30 minutes and keeps at most 1,000 entries in memory. Failed lookups are not cached. The cache belongs to a warm Next.js server instance, so a restart or another instance starts with an empty cache. Upstream fetches use `cache: "no-store"` so an invalid HTML response cannot enter Next.js's fetch cache.

The extraction logic comes from `chenelias/cambridge-dictionary-api`. The app owns its dependencies and copy of that logic in `src/adapters/dictionary.ts`, with attribution in [Third-party notices](../THIRD_PARTY_NOTICES.md). The nested clone is a reference copy and can be deleted before deployment.

The requested word remains `Vocabulary.word`. A canonical phrase such as `ought to` remains `content.entry.headword`. The adapter accepts the requested headword or a phrase that begins with that word followed by a space. It rejects unrelated redirect results.

## Stored content

`dictionaryEntrySchema` defines the normalized entry and supplies its TypeScript type. `Vocabulary.content` has two variants.

- `dictionary` contains `headword`, `partsOfSpeech`, `pronunciations`, `definitions`, and `verbForms`.
- `legacy` contains the previous English explanation and syllables. The UI marks these rows as older data.

Migration 002 backfills legacy content before dropping the old English, Thai, and syllable columns. It never deletes rows. Reapplying migration 002 keeps existing dictionary content.

## Accounts and sessions

NextAuth owns Google, Facebook, and the registered ChatGPT OIDC flow. Its Supabase adapter stores users, linked provider accounts, and sessions in `next_auth`. All authentication tables have RLS enabled and service-role-only privileges. Supabase Auth no longer authenticates notebook requests.

Migration 005 copies the existing Supabase user UUIDs before repointing the vocabulary foreign key. It leaves vocabulary and Supabase Auth records intact. Google can attach an authoritative Gmail or verified Workspace identity to an imported email. Facebook and ChatGPT do not merge accounts based on email alone. Repeat sign-ins resolve the stored provider subject.

Database sessions persist for 400 days and renew during use. Logout deletes the session record. Session JSON contains the application user ID, not provider access tokens or Supabase secrets. The browser holds an HttpOnly opaque session cookie. Vocabulary refresh depends on user ID rather than session-object changes, so session renewal does not replace the notebook with a loading state.

## Database writes

Only the Next.js server reads or writes vocabulary. The API derives the owner ID from a verified NextAuth session. The repository includes that ID in every list, duplicate check, and RPC. Browsers cannot choose a trusted owner or call service-only RPCs directly.

The save RPC validates the nested entry, uses an empty search path, and takes a transaction advisory lock for the owner. It calculates the Bangkok date after the lock, checks the two-word limit and case-insensitive duplicate word, then inserts. The unique user/day/slot constraint is a second cap check. Deleting today's word takes the same lock and compacts the remaining slot so a replacement can be saved.

Migration 005 removes the previous browser-authenticated RPC access. The optional clear-today script uses the authenticated Next.js API and an explicit current Bangkok date.

## Display

`WordCard` displays the requested word, the US IPA and audio when available, the first definition, and its examples. UK pronunciation is the fallback. Disclosures contain additional senses, pronunciation variants, and verb forms. The UI retains the monochrome palette and theme preference. React renders dictionary text without HTML injection.

The demo uses authored fixtures in a versioned localStorage key. It uses no network service. Live Supabase rows pass the same Zod content schema at the repository boundary. Missing migration errors ask for the latest SQL migration.
