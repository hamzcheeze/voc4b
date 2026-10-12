# Vocabulary performance

Measured on 12 October 2026 with two local Bun production builds, real Supabase, and real Cambridge and Simple Wiktionary responses. These numbers exclude Google account interaction and Vercel cold starts.

Each version ran five times in alternating paired order. Each temporary account started with one saved word. The five added words were cold in each server's dictionary cache. All saves returned HTTP 201, matched the database read-back, and appeared in the browser. The scripts deleted their temporary accounts after each run. Server tracing ran separately from the reported measurements.

| Path            | Before median | After median | Reduction | Before range    | After range   |
| --------------- | ------------- | ------------ | --------- | --------------- | ------------- |
| Home vocabulary | 590 ms        | 285 ms       | 52%       | 461 to 630 ms   | 274 to 342 ms |
| Add word        | 1061 ms       | 757 ms       | 29%       | 1015 to 1164 ms | 602 to 779 ms |

All five paired samples improved on both paths. [Raw samples and network profile](performance-2026-10-12.json) include request counts and validation results.

The network profile identifies sequential database round trips as avoidable latency. Home now receives its owner's vocabulary with the server-rendered page. A successful save uses the confirmed entry in the POST response instead of requesting the whole library again. Quota and duplicate preflight reads run concurrently; the save transaction still enforces both rules. Snapshots are scoped to the verified owner and discarded after an account transition. A stale list response cannot overwrite a completed save or deletion.

External dictionary latency still affects new words. The scraper retains its complete pronunciation, definition, example and verb-form data. Large libraries still use the existing complete-list pagination.

## Repeat the comparison

Build the baseline and updated sources separately with `bun install --frozen-lockfile` and `bun run build`. Start the builds on ports 3002 and 3003. Use the same Supabase configuration for both. The baseline commit is recorded in the JSON artifact.

```sh
bun scripts/compare-performance.mjs --before http://localhost:3002 --after http://localhost:3003 --output /tmp/voc4b-performance.json
```

The comparison requires local servers and creates isolated verification accounts in the configured database. For a single version, run the measurement directly.

```sh
bun scripts/measure-performance.mjs --url http://localhost:3003 --output /tmp/voc4b-single-performance.json
```
