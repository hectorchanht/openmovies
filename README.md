# OpenMovies

Watch movies and TV shows **free, with no ads** — the movie sibling of
[OpenMusic](https://openmusic.lol), by [Dawn Studio](https://dawnstudio.app).

**Live:** https://openmovies.dawnstudio.app

- No account needed to watch. A free account (emailed 6-digit code, no
  password, no payment) exists **only** for your personal stuff: watched,
  liked, Continue Watching resume, and watchlist.
- Metadata from TMDB (when a key is configured; a labelled demo catalogue
  ships otherwise). Playback is embedded from switchable third-party
  servers — OpenMovies hosts no video.
- Built to move house: free sites get taken down, so the permanent address
  book is the Dawn Studio gateway hub. Your lists follow your account, not
  the domain. There is no official Discord.
- Your data is used for product analysis only. **It is never sold.**

## Develop

```bash
npm install
npm run dev     # http://localhost:4322
npm test        # vitest — unit + API mock-auth e2e
npm run check   # svelte-check
npm run build   # static SPA -> build/
```

Env (build-time): `PUBLIC_TMDB_API_KEY`, `PUBLIC_OPENSUBTITLES_API_KEY`
(optional), and `PUBLIC_API_BASE` — the openmovies-api Worker origin
(see `worker/`). `PUBLIC_API_BASE` has NO code default: a bundle built
without it runs API-less (no email sign-in, no Worker resolver cache).
`scripts/deploy-web.py` always sets it and aborts if the built bundle
does not contain it — deploy through the script, never by hand.

## Layout

- `src/lib/tmdb.ts` — TMDB adapter + demo fallback
- `src/lib/providers.ts` — playback provider registry (swap providers here)
- `src/lib/resolve.ts` — client resolver memo (session + localStorage, 6h)
- `src/lib/personal.ts` — watched/liked/resume/watchlist logic (pure, tested)
- `worker/` — auth codes + per-user sync + anonymous analytics API (D1)

## Resolver caching (Cloudflare Cache API, mirroring OpenMusic)

Playback resolution is cached at two layers so repeat plays are instant:

- **Edge (API Worker, `caches.default`)** — `GET /resolve` payloads 6h;
  `GET /providers/health` probe rounds 5 min, or only 2 min when a provider
  failed (negative caching: a dead server is never hammered, and the cached
  "down" answer powers instant failover in the player); `GET /tmdb/:type/:id`
  metadata 24h with 2-min negative entries on upstream failure. Cache keys
  are versioned synthetic own-origin URLs built only from anonymous
  resolver params — no secrets, no per-user data. Responses carry
  `x-om-cache: HIT | MISS | NEG`.
- **Client** — `resolve.ts` memoizes in-session and in localStorage for
  the same 6h; any API failure falls back to the local provider registry,
  so watching never depends on the API.
- `src/routes/gateway` — the Built to Move House survival page

License: Apache-2.0 (same as OpenMusic).
