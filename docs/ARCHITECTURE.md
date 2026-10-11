# Dictionary data flow

`Workspace.add()` sends the requested word to authenticated `POST /api/words`. The route verifies the Supabase session and calls `addWord()`. The use case validates the word, checks today's count, calls `DictionaryProvider.lookup()`, and saves the entry with `VocabularyRepository.save(word, entry)`.

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

## Database writes

Authenticated users can select only their own rows through RLS. Direct inserts, updates, and deletes are denied. `save_vocabulary(p_word, p_entry)` verifies the nested JSON schema because a user can call the RPC without going through Next.js.

The save RPC uses an empty search path and takes a transaction advisory lock for the authenticated user. It calculates the Bangkok date after the lock, checks the two-word limit and case-insensitive duplicate word, then inserts. The unique user/day/slot constraint is a second cap check.

`clear_vocabulary_today(p_expected_day)` uses the same lock and date rule. The expected day is a guard, not a choice of deletion date. After the lock, the RPC refuses a day mismatch and deletes only the caller's current-day rows. When omitted, the expected day defaults to the Bangkok date at invocation. The local script passes the authorized date explicitly.

## Display

`WordCard` displays the requested word, the US IPA and audio when available, the first definition, and its examples. UK pronunciation is the fallback. Disclosures contain additional senses, pronunciation variants, and verb forms. The UI retains the monochrome palette and theme preference. React renders dictionary text without HTML injection.

The demo uses authored fixtures in a versioned localStorage key. It uses no network service. Live Supabase rows pass the same Zod content schema at the repository boundary. Missing migration errors tell the user to apply migration 002.
