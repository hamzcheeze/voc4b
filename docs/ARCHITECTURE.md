# Dictionary data flow

`Workspace.add()` sends the requested word to authenticated `POST /api/words`. The route verifies the Supabase session and calls `addWord()`. The use case validates the word, checks today's count, calls `DictionaryProvider.lookup()`, and saves the entry with `VocabularyRepository.save(word, entry)`.

`CambridgeDictionary` calls the configured Dictionary API. The API supplies English meanings and pronunciation from Cambridge pages. Its verb forms come from Simple Wiktionary. The adapter treats JSON as `unknown`, validates the wire response with Zod, and normalizes the field names. It removes definition and example translations. It preserves every definition, example, source, IPA, audio URL, and verb form.

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
