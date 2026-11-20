# OpenMovies — Real Catalogue + Dawn AUTH Retrofit Brief

- **Date:** 2026-11-20 · **Status:** PREP / AUDIT ONLY — no deploy, no push has been made from this brief.
- **Scope authorised by Hector (2026-11-20):** 「全部可以開始做嘅都開始」 — start everything startable; do not wait idle for the TMDB key.
- **Live today:** https://openmovies.dawnstudio.app (V1, 2026-11-18) — demo catalogue (14 titles), hand-rolled code-only auth.

## Governing skills & canon (named per App Creation Skills Governance)

| Step | Governing skill / canon |
|---|---|
| Workflow | **GSD** (discuss → plan → execute → verify → ship) — sole dev workflow; Superpowers is out |
| Design | **Impeccable** (design + audit steps) + **Dawn Design v1.1** (canonical master `~/workspace/dawn-anatomy/Dawn-Design.md`) + **dawn-apple-design** skill (agent form; on conflict Dawn Design wins) — 3-to-90 / One-Look-Knows test, one Icon + one Accent language, NO glass |
| Code discipline | **Karpathy Guidelines** (simplicity, surgical changes, verifiable success criteria) |
| Code navigation | CodeGraph / repo resource registry — reuse the shared component/service first (GOLD: one function, one method, one path) |
| Library docs | Context7 for external library documentation (TMDB API, @dawn-studio/auth) |
| Auth | **Dawn AUTH standard** — `@dawn-studio/auth` (see §3; Hector standing rule 2026-11-20: ALWAYS reuse, NEVER hand-roll) |
| Safety gates | No-silent-breakage: every seam below carries a failing-if-broken test; deploy = purge + live-verify |

---

## 1. P0 — NO AD REDIRECTS / POPUNDERS EVER (Hector ruling 2026-11-20, overrides everything below)

**Incident (2026-11-20, Hector's iPad):** opening a movie redirected the *whole Safari tab* to `ccads.adsboosters.xyz` (Stake casino ad). **Ruling (now in MEMORY.md Standing Instructions):** opening a title must NEVER redirect / pop-under to an ad; all such 跳轉 are cancelled, never shown, never disturb the user. This **overrides** the 2026-11-18 BingeBang-parity trade-off that removed the iframe sandbox. The "Free, No Ads" promise outranks any single provider: *a provider that only plays when allowed to serve popunders is not acceptable — sandbox it, and if it then refuses to play, demote/replace it.*

### 1.1 Root cause (verified in code)

- `src/lib/components/Player.svelte` (working tree = GitHub head): the provider `<iframe>` carries **no `sandbox` attribute at all** — only `allow="autoplay; fullscreen; encrypted-media; picture-in-picture"`, `allowfullscreen`, `referrerpolicy="origin"`. Without a sandbox, an embed can call `window.open` (popunder) and navigate the top window (`window.top.location`) — exactly the observed whole-tab redirect.
- History: local `HEAD` still has the original `sandbox="allow-scripts allow-same-origin allow-presentation"`; it was removed 2026-11-18 after VidLink rendered "Please Disable Sandbox" on Hector's iPad (comment preserved in Player.svelte). The removal is already live on GitHub (see §4).
- `src/lib/player-embed.test.ts` currently **pins the vulnerable contract**: `expect(iframeTag).not.toContain('sandbox')`. This test must be **reversed** (§1.4).

### 1.2 Per-provider sandbox investigation

Key mechanism (evidence: dev.to, *Rebuilding the movie-web proxy after it shut down — Trapdoor 5: the sandbox-detection trap*, crawled 2026-11-20): some providers run on load —

```js
if (window.frameElement && window.frameElement.sandbox) {
  document.body.innerHTML = 'Please disable sandbox'; return;
}
```

i.e. they detect the **presence** of the sandbox attribute, not which tokens it holds. No token combination (`allow-scripts allow-same-origin allow-presentation`, with or without `allow-forms`) avoids detection: *any* sandbox ⇒ refusal. Token choice still matters for providers that do **not** detect: without `allow-top-navigation` / `allow-top-navigation-by-user-activation` / `allow-popups` / `allow-popups-to-escape-sandbox`, the browser itself blocks top-navigation and popunders.

| Provider | Plays WITH sandbox? | Popunder / top-nav behaviour | TMDB-id URL pattern | Host live? (probe 2026-11-20, VM vantage) | Evidence |
|---|---|---|---|---|---|
| **VidLink** `vidlink.pro` (current Server 1) | **NO — refuses any sandbox** | **GUILTY in production**: unsandboxed, it served the 2026-11-20 whole-tab redirect to `ccads.adsboosters.xyz` on Hector's iPad | `/movie/{id}`, `/tv/{id}/{s}/{e}` ✔ | ✔ resolves, HTTP 200, embed page 200 | Hector iPad reports 2026-11-18 ("Please Disable Sandbox") **and** 2026-11-20 (redirect); dev.to trapdoor-5 names vidlink.pro explicitly |
| **VidFast** `vidfast.pro` (current Server 2) | **NO — same detection** (dev.to names `vidfast.pro` alongside vidlink.pro in the identical snippet) | Unsandboxed popunder risk by the same revenue model; not itself observed by Hector yet | `/movie/{id}`, `/tv/{id}/{s}/{e}` ✔ | ✔ but **301 → `vidfast.vc`** (domain migrating; registry URL in `providers.ts` is stale) | dev.to trapdoor-5; Gridinsoft note "final destination vidfast.vc"; probe redirect 2026-11-20 |
| **VidSrc `.icu`** (removed 2026-11-18) | Unknown | Historically popunder-funded | `/embed/movie/{id}` (IMDb-id on .icu variant) | DNS resolves again at probe time (was NXDOMAIN 2026-11-18 from two networks) but HTTP unreachable from VM (000) — **inconclusive, NOT verified live** | providers.ts removal note; probe 2026-11-20 |
| **VidSrc `.to`** | Unknown — behind Cloudflare browser checks (dev.to trapdoor 7) | Popunder-funded family | `/embed/movie/{tmdb_id}`, `/embed/tv/{tmdb_id}/{s}/{e}` ✔ | ✔ HTTP 200, embed page 200 (1,397 B shell) | Probe 2026-11-20; vidsrc-dlp resolver docs |
| **VidSrc `.xyz` / `.in` / `.cc`** | Unknown | Same family | `.cc`: `/v2/embed/{type}/{id}` | ✘ HTTP 000 from VM — inconclusive, NOT verified live | Probe 2026-11-20 |
| **VidSrc `.vip`** | Unknown | Same family | `/embed/movie/{imdb_id}` (IMDb-id) | ✘ HTTP 000 from VM — inconclusive | Probe 2026-11-20 |
| **VidSrc `.me`** | Unknown | Same family | `/embed/{type}/?tmdb={id}` | 301 (destination not followed) — inconclusive | Probe 2026-11-20 |
| **VidSrc `.pk`** (new, docs site) | Unknown | Claims multi-source player + JSON API; ad behaviour unverified | `embed.vidsrc.pk/movies/{id}`, `/tv/{id}/{s}/{e}` (IMDb or TMDB) ✔ | ✔ HTTP 200, embed page 200 | vidsrc.pk API docs (self-description), probe 2026-11-20 |
| **embed.su** | Unknown | No ad-free claim found; IMDb-id based | `/embed/movie/{imdb_id}`, `/embed/tv/{imdb_id}/{s}/{e}` (needs IMDb id ⇒ requires TMDB `external_ids` mapping — extra work) | ✘ HTTP 000 from VM — inconclusive, NOT verified live | GreasyFork IMDb Watcher source list; probe 2026-11-20 |
| **AutoEmbed** `autoembed.co` | Unknown | No ad-free claim found | `/movie/tmdb/{tmdb_id}`, `/tv/tmdb/{tmdb_id}-{s}-{e}` ✔ | 301 → `autoembed.me` (domain moved) | Probe 2026-11-20; community server lists |
| **2Embed** `2embed.cc` / `2embed.stream` | Unknown | Long-running popunder-funded family (no contrary evidence) | `2embed.cc/embed/{tmdb_id}`, `embedtv/{tmdb_id}&s=&e=`; `.stream/embed/movie/{id}` ✔ | ✔ both HTTP 200, embed page 200 | Probe 2026-11-20; community server lists |
| **SuperEmbed / MultiEmbed** `multiembed.mov` | Unknown | Aggregator; no ad-free claim found | `?video_id={id}&tmdb=1` (+`&s=&e=`) ✔ | ✔ HTTP 200; embed probe 302 → `streamingnow.mov` token URL | Probe 2026-11-20; GreasyFork source list |
| **Videasy** `player.videasy.ws` | Unknown | VidSrc-family player w/ `PLAYER_EVENT` progress events (same contract as VidLink); ad behaviour unverified | `/embed/movie/{id}`, `/embed/tv/{id}/{s}/{e}` ✔ (TMDB or IMDb) | ✔ HTTP 200, embed page 200 (79 KB) | videasy.ws official docs; probe 2026-11-20 |
| **EmbedWave** `embedwave.cc` (new) | **Unknown — must be tested sandboxed in a real browser** | **Claims** zero ads / no popups / no redirects / no third-party scripts "by design" — *self-claimed by an unknown new operator, NOT independently verified* | `/embed/movie/{tmdb_id}`, `/embed/tv/{tmdb_id}/{s}/{e}` ✔ drop-in VidSrc shape | ✔ HTTP 200, embed page 200 | embedwave.cc (self-description), probe 2026-11-20 |

**Honest bottom line:** as of this audit there is **no provider with verified sandbox-clean playback**. VidLink + VidFast are verified sandbox-*refusers*. Every other candidate is unverified on (a) and (b) — a curl probe cannot detect it, because the detection/redirect logic is JS that runs in a real (sandboxed) browser context. The decisive test is a **real-device/browser harness**: load each candidate in an iframe with the §1.3 sandbox, attempt playback + first click, record (plays? / popup attempted? / top-nav attempted?). That harness is step 1 of the fix, not an afterthought.

### 1.3 Recommended concrete fix (P0, do first)

1. **Restore the sandbox on ALL provider iframes**, exactly: `sandbox="allow-scripts allow-same-origin allow-presentation"` — and **never** `allow-top-navigation`, `allow-top-navigation-by-user-activation`, `allow-popups`, `allow-popups-to-escape-sandbox`, `allow-modals`. (Keep `allow="autoplay; fullscreen; encrypted-media; picture-in-picture"`, `allowfullscreen`, `referrerpolicy="origin"`.) Under this sandbox the browser blocks the whole class of the 2026-11-20 incident even from a provider that does not self-detect.
2. **Consequence accepted per Hector's ruling:** VidLink and VidFast will render "Please Disable Sandbox" and stop playing. **Demote both** out of the default/Server 1 slot immediately; keep them listed only if at all behind an honest label, or drop them from `PROVIDERS` — the ruling's default is drop/demote, not keep-unsandboxed. **Never** ship a per-provider "trusted-direct, no sandbox" exception list (the dev.to pattern) — that pattern is precisely what Hector overruled.
3. **New default Server 1 = the first candidate that passes the real-browser sandbox harness** (§1.2), tested in order: EmbedWave (only ad-free claimant) → Videasy → VidSrc.to → 2Embed (.cc) → MultiEmbed → VidSrc.pk. Until one passes, the **Demo Player is the honest default** and real servers are opt-in labelled — a smaller working promise beats a broken "no ads" promise. Also fix VidFast's stale host (`vidfast.pro` → `vidfast.vc`) only if VidFast survives at all.
4. **Belt-and-braces in the player shell** (cheap, provider-independent): no change can stop a *sandboxed* iframe navigating the top frame — the sandbox already does — so no extra JS guard is required; do **not** add click-interception hacks (arms race, breaks playback).
5. **Update the contract test (§1.4)** in the same change; deploy gate = tests green + purge + live-verify + **Hector iPad retest**: open a title, tap play, confirm (i) plays, (ii) no tab jump, no new tab, no casino.

### 1.4 Test changes (no-silent-breakage rule)

- **Reverse `src/lib/player-embed.test.ts`**: replace `has NO sandbox attribute` with: iframe **has** `sandbox="allow-scripts allow-same-origin allow-presentation"` (exact token set).
- **Add a regression test** that fails if any of `allow-top-navigation`, `allow-popups`, `allow-popups-to-escape-sandbox` appear anywhere in `Player.svelte` or in any `PROVIDERS` embed configuration — this is the test that would have caught the 2026-11-20 incident at build time.
- Add a providers-registry test: every non-demo provider's embed host is on an explicit allowlist constant, so a future provider swap cannot silently reintroduce an unsandboxed host.

---

## 2. Real Catalogue — exact gaps vs current code

Current state (verified by reading the code): `src/lib/tmdb.ts` `TmdbCatalog` has `trending() / search() / detail() / similar()`, gated on `PUBLIC_TMDB_API_KEY`, falling back to the 14-title `DEMO_TITLES`. `mapTmdb()` maps `poster_path`/`backdrop_path`; `PosterCard.svelte` already renders the poster via `posterUrl()` with gradient fallback. The Worker (`worker/index.ts`) has a `/tmdb/:type/:id` detail proxy (edge-cached 24 h / 2 min negative) gated on the Worker's own `TMDB_API_KEY` secret. **The adapter skeleton is done; the catalogue *behaviour* is not.** Gaps:

### G1 — CRITICAL: genre mapping is broken for live list data
`mapTmdb()` reads only `raw.genres` (an array present on **detail** responses). TMDB **list** responses (`/trending`, `/search`, `/discover`) carry `genre_ids: number[]` instead — so with a live key, every trending/search title maps to `genres: []`. Consequences: Browse genre chips/filter dead, homepage "Because You Watched" (genre match) dead, genre labels blank on cards.
**Fix:** fetch `/genre/movie/list` + `/genre/tv/list` once (cache in-module + localStorage), build id→name maps per media type, and map `genre_ids` in `mapTmdb`. Pure function — unit-test with real TMDB-shaped fixtures.

### G2 — Homepage rows are one shared pool, and "Top Rated" is fake
`src/routes/+page.svelte` makes **one** `trending()` call (`/trending/all/week`, page 1 ≈ 20 items) and derives everything client-side: Trending Movies = filter, Trending Series = filter, **Top Rated = the same pool sorted by rating, sliced to 10** — it is not TMDB's top-rated catalogue, and a movie-heavy week starves the Series row.
**Fix:** add `trendingMovies()`, `trendingTv()`, `topRated(type)` to `TmdbCatalog` (`/trending/movie/week`, `/trending/tv/week`, `/movie/top_rated`, `/tv/top_rated`), load rows in parallel, keep per-row fallback to demo slices when keyless/failing. Hero keeps `trending[0]`.

### G3 — Backdrop art is fetched but never used
Hero (`+page.svelte`) and the title header (`title/[id]/+page.svelte`) render `background:${title.art}` (gradient) even when `backdropPath` exists. Add a `backdropUrl()` (w1280) beside `posterUrl()` and use it as the hero/header background image with the gradient as fallback/underlay (same onerror-hide pattern as PosterCard).

### G4 — No pagination anywhere
`TmdbCatalog.get()` ignores `page` / `total_pages`; `trending()` and `search()` return page 1 only. Browse therefore can never show more than ~20 titles.
**Fix:** thread an optional `page` through `trending*` / `search` / `discover`, return `{ titles, page, totalPages }` (extend `Catalog`), and add a **Load more** button (Dawn Design: one primary action; infinite scroll is not the house pattern) to Browse and to search results on Home.

### G5 — Genre browse is a filter over the trending pool, not a browse
`browse/+page.svelte` filters the trending pool client-side; genre chips come from `ALL_GENRES` (derived from the **demo** dataset) ∪ genres present in the loaded pool.
**Fix:** add `discover({ type, genreId, page, sortBy })` (`/discover/movie|tv?with_genres=&sort_by=popularity.desc&page=`); genre chips come from the TMDB genre lists (G1) with ids, not names; keep the existing type/genre/name filter UX on top. Default sort `popularity.desc`; offer rating/year sorts only if the grill wants them (keep ≤3 visible actions per Dawn Design).

### G6 — Detail page: no cast, no recommendations, TV episodes are demo-only
`Title` has no cast/director/trailer fields; `detail()` fetches `/{type}/{id}` bare and grafts `episodes` from the **demo** row (`demo?.episodes`) — for live titles the episode list silently disappears (title page shows episodes only for demo TV rows, Season 1 only). `similar()` exists (`/{type}/{id}/similar`, shown as "More Like This") but TMDB **recommendations** (`/recommendations`) are unused, and homepage "Because You Watched" is a local genre match, not `similar()`/`recommendations`.
**Fix:** `detail()` → `/{type}/{id}?append_to_response=credits,recommendations,videos`; extend `Title` with optional `cast: {name, character}[]` (top 8) and use `recommendations` results for "More Like This" with `similar()` as fallback; add a Cast row to the title page. For TV: fetch `/tv/{id}/season/{n}` for the selected season (season selector on title page; episode rows link to the existing watch route). Keep all new fields optional so demo rows and existing tests stay valid (Karpathy: surgical, backwards-compatible).

### G7 — Search is single-page, single-shot
Home search replaces the whole catalogue with page 1 of `/search/multi`. With G4 plumbing, search gets Load more too; keep person-results filtering as-is. No code change needed beyond G4.

### G8 — Two TMDB key channels must stay in sync
Client uses build-time `PUBLIC_TMDB_API_KEY` (Vite env, set by `scripts/deploy-web.py`); Worker proxy uses the `TMDB_API_KEY` secret (set by `scripts/deploy-api.py`). Real Catalogue deploy must set **both from the same key** and the deploy scripts should fail closed if one is set without the other (mirror the existing `PUBLIC_API_BASE` fail-closed grep in deploy-web.py). Decide in the build whether list calls stay client-direct (current design; v3 keys are client-exposed by design) — this brief keeps client-direct for lists and Worker proxy for detail, unchanged.

### TMDB key — Hector's step, answers prepared
Hector is on the TMDB **API → Create** flow (screenshot 2026-11-20). Prepared answers (also given in chat):
- *"Is the intended use of our API for personal use?"* → **No — "I am building a commercial application."** (TMDB's §2 definition: personal use = only yourself. OpenMovies is a public app for other people, even though it is free and non-profit — answering "personal" would be false and risks the key.)
- Application name: **OpenMovies** · URL: **https://openmovies.dawnstudio.app** · Type: website / free streaming catalogue front-end.
- Summary (paste-ready): "OpenMovies is a free, no-ads movie & TV discovery and playback front-end by Dawn Studio. It uses the TMDB API for metadata, posters and backdrops only; playback is via third-party embeds keyed by TMDB ID. Non-commercial, no user data is sold, TMDB attribution will be displayed."
- Remaining form fields are his account/profile details — no agent can supply them. **Once he pastes the v3 API Key, everything in §2 lands with zero further decisions** (adapter already gated on the key).

---

## 3. AUTH retrofit — onto `@dawn-studio/auth` (never hand-roll again)

### 3.1 The violation (current state, verified)
`worker/index.ts` hand-rolls auth: `POST /auth/request-code` + `POST /auth/verify` only — a 6-digit code (`codes` table: `code_hash = SHA-256(email + ':' + code)`, 10-min TTL, 60 s resend cooldown, attempts counter), then a **stateless HMAC token** (`email.exp.hmac`, 30 d) that is never stored, cannot be revoked, and has no session table. **No magic link. No Google.** Copy in `signin/+page.svelte` ("Email me a sign-in code", "expires in 10 minutes") matches the hand-rolled behaviour.

### 3.2 The standard (from `~/workspace/dawn-auth` README/src, v0.2.0)
`@dawn-studio/auth`: `defineAuth()` config (appName/domain/**required own-domain `from`**/resendApiKey/googleClientId) + `createD1Store()` + `schema.sql` + service (`requestMagicLink` / `verifyMagicToken` / `verifyCode` / `signInWithGoogle` / `getSessionUser` / `destroySession`, never-throw typed results) + `DawnAuthClient`. Semantics: **one email carries magic link + 6-digit code for one intent — either burns both**, 15-min single-use, code dies after 5 wrong attempts, raw tokens never touch D1 (only `SHA-256('magic:'|'code:'|'session:' + …)`), sessions are D1 rows (30 d, revocable), httpOnly cookie on web / Bearer seam for native, fixed-window rate limits in D1.

### 3.3 Migration plan for `openmovies-db` (D1)
Current tables (`worker/schema.sql`): `users(email PK, created_at)`, `codes(email PK, …)`, `states(email PK, state, updated_at)` (personal sync), `events` (anonymous analytics).

1. **Additive first (zero-downtime):** apply the lib's `schema.sql` objects that don't collide: `magic_tokens`, `sessions`, `rate_limits` — all `CREATE TABLE IF NOT EXISTS`, no existing table touched.
2. **`users` shape conflict — resolve explicitly:** lib expects `users(id TEXT PK, email TEXT UNIQUE)`; ours is `users(email PK, created_at)`. Recommended: create `users_new` in lib shape, backfill `id = email` (stable, deterministic; ids are internal), copy `created_at` as an extra retained column, swap names in one migration batch. `states` stays keyed by **email** (personal sync is per-app data — the lib deliberately excludes `user_sync`), so watchlist/resume data is untouched by the auth swap.
3. **`codes` table:** leave dormant after cutover (precedent: Dawn admin's reverted code table was left in place, no-delete rule). In-flight codes die naturally within their 10-min TTL.
4. **Sessions:** existing HMAC tokens cannot be converted (they were never stored). Options: (a) hard cutover — everyone signs in once more; (b) **recommended:** dual-read grace — `/me/state` accepts a legacy HMAC token (existing `readToken`) *or* a lib session for 30 days, then the legacy path is deleted in the same follow-up change (GOLD stale-code rule: legacy-compat handler kept only while links/tokens are live in the wild, clearly commented, with a removal date).
5. **Worker bundling change (easy to miss):** `scripts/deploy-api.py` transpiles `worker/index.ts` with bare `npx tsc` (no bundler, no node_modules resolution). Importing `@dawn-studio/auth` requires switching the Worker build to a bundle step (esbuild, as other Dawn Workers do) and adding the dependency to `package.json`. Flag this in the build plan — it is the only non-obvious infra delta.
6. **Worker routes become thin wrappers** over the service layer, keeping the Worker's existing route style/CORS: `POST /auth/request-link` (requestMagicLink), `POST /auth/verify-token` (magic landing POST — scanner-safe), `POST /auth/verify-code`, `POST /auth/google`, `GET /auth/session`, `POST /auth/logout`. The magic landing page is a new web route (`/signin/magic`) that POSTs the token — the token must never be consumed by a GET (mail-scanner prefetch).
7. **Client:** replace `requestCode`/`verifyCode` in `src/lib/api.ts` with `DawnAuthClient` (tokenStorageKey `openmovies:auth-token:v1`). Session transport decision: the web app (Pages origin) and API (api subdomain) are **different origins**, so keep the **Bearer** seam the lib already supports rather than cross-origin cookies. `store.svelte.ts` session shape `{email, token}` survives; `signin/+page.svelte` gains the trio UI: email → "check your inbox" (link **and** code in the one email), code entry, and a Google button that renders only when a client ID is configured. Copy updates: 10 min → **15 min**, mutual-burn wording.
8. **Config for OpenMovies:** `defineAuth({ appName: 'OpenMovies', domain: 'openmovies.dawnstudio.app', from: 'OpenMovies <login@dawnstudio.app>', resendApiKey: env.RESEND_API_KEY, googleClientId: env.GOOGLE_CLIENT_ID })`. **Sender kept exactly: `OpenMovies <login@dawnstudio.app>`** (dawnstudio.app is the verified Resend domain; deploy-api.py already mints a fresh domain-scoped sending key every deploy, fail-closed — unchanged).
9. **The only Hector-only credential: a Google OAuth Web client ID** (public, not a secret — but only Hector can create it in Google Cloud Console for origin `https://openmovies.dawnstudio.app`). The retrofit is **not blocked** by it: ship magic link + code first; `signInWithGoogle` returns the lib's typed `not-configured` and the button stays hidden until the ID lands, then Google lights up with config only.
10. **Tests:** port the worker auth tests to the lib flows (mock D1 already exists in `worker/test-mock-d1.ts`): link+code mutual burn, 5-attempt code death, 15-min expiry, session revoke on logout, rate-limit 429 mapping, legacy-token grace expiry. No-silent-breakage: each behaviour above gets a failing-if-broken test before deploy.

---

## 4. Repo dirty-state disposition (verified against GitHub head)

Method: local blob SHAs compared with GitHub `hectorchanht/openmovies` head **`f45b49ab`** ("Repo hygiene: remove internal planning/docs from public tree + licensing", 2026-11-20T02:46Z, 51 files) via the GitHub Git Data API. **Local `HEAD` (3070017) is stale — the "dirty" tree is mostly the newer, already-pushed state.** Nothing was discarded or force-pushed for this audit.

| # | File | Disposition |
|---|---|---|
| 1 | `scripts/deploy-web.py` | ✅ Already on GitHub (local blob == GH head) |
| 2 | `src/lib/api.ts` | ✅ Already on GitHub |
| 3 | `src/lib/catalog.test.ts` | ✅ Already on GitHub |
| 4 | `src/lib/checker.ts` | ✅ Already on GitHub |
| 5 | `src/lib/components/Player.svelte` | ✅ Already on GitHub (staged + unstaged portions both match GH) — includes the P0 no-sandbox state |
| 6 | `src/lib/demo-data.ts` | ✅ Already on GitHub |
| 7 | `src/lib/player-embed.test.ts` | ✅ Already on GitHub (new file vs local HEAD; pins the NO-sandbox contract — see §1.4) |
| 8 | `src/lib/providers.test.ts` | ✅ Already on GitHub |
| 9 | `src/lib/providers.ts` | ✅ Already on GitHub |
| 10 | `src/lib/resolve.test.ts` | ✅ Already on GitHub |
| 11 | `src/routes/gateway/+page.svelte` | ✅ Already on GitHub |
| 12 | `src/routes/privacy/+page.svelte` | ✅ Already on GitHub |
| 13 | `vite.config.ts` | ✅ Already on GitHub |
| 14 | `worker/cache.test.ts` | ✅ Already on GitHub |
| 15 | `worker/index.ts` | ✅ Already on GitHub |
| 16 | `README.md` | ⚠️ **CONFLICT — differs from both** local HEAD and GH head. GH head carries an extra trailing block ("## Licence — PolyForm Noncommercial License 1.0.0; commercial use requires Dawn Studio acknowledgement") that the local file lacks, while the body of both still says "License: Apache-2.0" — **the GH README is internally inconsistent**. Local-only difference = that block is absent locally. **Do not overwrite either way blindly:** Hector decision needed — which licence governs OpenMovies (Apache-2.0 as in the body / dawn-auth / OpenMusic precedent, or PolyForm Noncommercial as in the appended block)? Then fix the losing copy in one commit. |

**Recommended cleanup (one step, after the licence decision):** re-sync the local clone to GH head `f45b49ab` (fast-forward/reset to the API-pushed history, keeping the README decision applied on top), so `git status` is clean and the DEPLOYED == IN GITHUB rule holds visibly again. Local-only files: **none** besides the README delta — no work is at risk in the dirty tree.

---

## 5. Download providers — research only, NO integration

Current state: **zero download providers.** VidSrc was the only one (`dl.vidsrc.vip` download endpoint + `buildDownload` capability); `vidsrc.icu` and `dl.vidsrc.vip` were verified NXDOMAIN-dead 2026-11-18 and removed — `downloadOptions()` returns `[]`, the UI hides download buttons, and the capability machinery (`Capability = 'stream' | 'download'`, `buildDownload?`) is retained. VidLink/VidFast are stream-only. Findings on alternatives:

| Candidate | Download evidence | Verdict |
|---|---|---|
| **FileMoon MP4 via VidSrc.to embeds** | The VidSrc.to source resolves embeds via VidPlay + **FileMoon**; the FileMoon MP4 transform is documented (DeepWiki, sussy-code/providers): take the FileMoon HLS URL, replace `/hls2/` → `/download/` and `.m3u8` → `.mp4` to get a direct MP4 file URL. | ⚠️ Only documented *download-shaped* route found — but it is a **scrape of a stream host, not a provider download API**: VidSrc.to is Cloudflare-gated, its provider is `disabled: true` by default in that codebase and flagged proxy-blocked; fragile, ToS-grey, and depends on two dying intermediaries. **Research-spike only; do not integrate without a live-probe pass.** |
| **HLS-resolve + yt-dlp (`vidsrc-dlp`, PyPI)** | Actively maintained tool: resolves an HLS stream (Cineby → Mapple → VidSrc.to fallback) and downloads via yt-dlp/ffmpeg. Cineby needs Playwright (up to 4K); Mapple is a direct API (1080p) but requires an API key; VidSrc.to leg is 800p legacy scrape. | ⚠️ Proves "download" = *resolve the stream, then fetch the HLS* — a **client-side/helper-app pattern, not a web embed button**. A browser tab cannot yt-dlp. Relevant only if OpenMovies ever ships a companion helper; **not a `buildDownload` candidate.** |
| **EmbedWave / Videasy / VidSrc.pk / 2Embed / MultiEmbed / AutoEmbed / embed.su** | All documented/probed surfaces are **stream embeds only**; none documents a download URL or a `dl.` endpoint (checked: EmbedWave docs, Videasy docs, VidSrc.pk API reference, community URL-pattern lists). | ❌ No download capability found. (EmbedWave/Videasy remain §1 candidates for *streaming*, not downloads.) |
| **File-host embeds (Doodstream / StreamWish / Voe etc.)** | These hosts do expose download pages — but for files **uploaded to the host**, addressed by file ID, not by TMDB ID. | ❌ Wrong model entirely: OpenMovies holds no uploads and maps by TMDB ID. Not candidates. |

**Recommendation:** keep downloads honestly absent (buttons hidden) until/unless the FileMoon route survives a dedicated live-probe spike (residential vantage, real browser, ™-id → MP4 fetch verified byte-level). Do **not** resurrect any `dl.vidsrc.*` URL on the strength of a DNS record — `.icu` resolving again (§1.2) is not evidence the download endpoint exists.

---

## 6. Test & check results (this audit, 2026-11-20 ~10:49 CST, on the current working tree)

| Gate | Command | Result |
|---|---|---|
| Unit/API tests | `npm test` (vitest) | ✅ **53/53 passed, 7 files** — worker/cache 10, worker/index 4, catalog 9, providers 14, resolve 5, personal 7, player-embed 4 |
| Type/Svelte check | `npm run check` (svelte-check) | ✅ **0 errors, 0 warnings** |

Caveat: the 4 player-embed tests currently pass *because* they pin the vulnerable NO-sandbox contract (§1.1) — green here does not mean safe; §1.4 reverses them as part of the P0 fix.

---

## 7. Sequencing — what starts now vs what waits on Hector

**Startable now (no key, no credential):**
1. **P0 sandbox fix + test reversal (§1.3/§1.4)** + the real-browser sandbox harness over the §1.2 candidate order; Demo Player as interim default.
2. Catalogue code: G1 genre-id mapping, G2 split rows + real Top Rated, G3 backdrop, G4 pagination plumbing, G5 discover/genre browse, G6 detail credits/recommendations/seasons — all land behind the existing key gate and fall back to demo data, so they are testable today with TMDB-shaped fixtures.
3. AUTH retrofit §3.3 steps 1–8 (magic link + code live; Google wired but dark).
4. Repo re-sync after the §4 licence decision.

**Waits on Hector (exactly two items):**
1. **TMDB v3 API Key** — answers prepared in §2; one paste unblocks the real catalogue + both deploy channels (G8).
2. **Google OAuth Web client ID** — unblocks only the Google button (§3.3 step 9).
Plus the §4 **licence decision** (Apache-2.0 vs PolyForm block) and the **P0 iPad retest** as the final live-verify gate.

*Prep only — nothing in this brief has been deployed, committed, or pushed.*
