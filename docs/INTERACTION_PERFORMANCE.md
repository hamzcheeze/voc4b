# Interaction performance

Today and History now switch using the browser's history API and the vocabulary already held in the workspace. Both views are bundled together. Normal clicks require no document, RSC, or vocabulary request. Direct URLs, refresh, modified clicks, and browser back/forward remain supported. Initial authenticated page loading still fetches the complete owner-scoped library on the server.

Sign out hides private content immediately and shows the sign-in screen. Provider buttons stay disabled while revocation runs. A same-origin endpoint deletes the incoming database session and verifies its disappearance before Auth.js clears cookies and broadcasts logout. Failure keeps sign-in disabled and offers retry. This extra verification runs after the screen changes. The appearance timing below does not mean database revocation completes within that time.

The add dialog prepares dictionary data after a 650 ms pause in a valid, unsaved input. Preparation requires a session, checks quota and duplicates, and never writes vocabulary. The explicit Save request checks everything again and uses the same completed cache or pending source request when available. Successful entries appear only after database confirmation. Preparation adds one background request and extra database reads. Cache and preparation limits are local to a server instance; different Vercel instances may not share a prepared lookup.

Provider sign-in uses Auth.js's server action rather than three consecutive browser calls for providers, CSRF, and sign-in. Next.js protects the action's origin, and the action validates enabled providers. Auth.js retains state, PKCE, nonce, and provider callback checks. For an authoritative, verified Gmail or Google Workspace identity, the existing acceptance rule now runs before two unnecessary preliminary account reads. Auth.js still performs actual account association and session creation. Other identities retain the existing account-linking checks.

## Measured behavior

Two isolated Bun 1.4.3 / Next 16.4 production builds ran against real Supabase and real dictionary publishers. Five paired samples alternated version order. Each sample used a new temporary account and browser. Both builds were warmed before reported samples; the five added words were initially cold in each dictionary cache. Every save returned 201 and was read back through the authenticated database API. Every logout was checked against the session store. Browser errors failed the run. Temporary accounts were deleted.

| User wait                                | Before median | After median | Before range | After range |
| ---------------------------------------- | ------------- | ------------ | ------------ | ----------- |
| Today to History                         | 52 ms         | 30 ms        | 33 to 55 ms     | 28 to 32 ms    |
| History to Today                         | 32 ms         | 25 ms        | 31 to 32 ms     | 24 to 28 ms    |
| Sign out to login screen                 | 157 ms        | 14 ms        | 150 to 200 ms   | 13 to 16 ms    |
| Save to confirmed word                   | 1055 ms       | 449 ms       | 714 to 1248 ms  | 418 to 487 ms  |
| Sign-in click to outgoing Google request | 67 ms         | 55 ms        | 62 to 150 ms    | 51 to 145 ms   |

The Save measurement excludes the same 1600 ms input pause on both versions. Preparation moves dictionary work into that pause; it does not make a lookup itself faster. Immediate Save or slow publisher responses can still require waiting. The remaining confirmed-save wait includes session validation, database checks, and the save transaction.

Navigation issued 15 requests across the baseline samples and zero across the updated samples. The baseline requests included RSC and page JavaScript requests. Updated navigation waits only for client rendering. Sign out no longer waits for network completion before showing its new screen.

Google departure ranges overlap. This measurement does not establish a meaningful overall sign-in speedup. The recorded request trace does establish three browser requests becoming one. It excludes Google account interaction, token/profile exchange, and the OAuth callback. No deployed Vercel, cold-start, mobile-network, or large-library timing claim is made. These local timings do not reproduce the user's reported one-second navigation or three-to-four-second complete sign-in.

[Raw samples and request traces](interaction-performance-2026-10-12.json) record the paired order, baseline commit, machine load, and validation results.

## Repeat

Build the baseline commit recorded in the JSON and the updated source in separate directories. Start each production build with the same Supabase configuration on ports 3002 and 3003. Warm each build with a word outside the reported set. Start with fresh dictionary caches for the reported words.

```sh
bun scripts/compare-interactions.mjs --before http://localhost:3002 --after http://localhost:3003 --output /tmp/interactions.json
```

The scripts create and delete temporary NextAuth accounts and real vocabulary. They accept local URLs only and never print session tokens or credentials. For a single sample, use `scripts/measure-interactions.mjs` with `--url`, `--output`, and `--words`.

Model the Domain shaped the logout states so a pending or failed revocation cannot enable sign-in. Prove It Works required real write read-back, real session disappearance, and browser history checks. Explain the Number kept UI feedback timing separate from server completion and excluded full Google-login claims that these measurements cannot support.
