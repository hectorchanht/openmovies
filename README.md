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

Env (build-time, all optional): `PUBLIC_TMDB_API_KEY`,
`PUBLIC_OPENSUBTITLES_API_KEY`, `PUBLIC_API_BASE`
(default: the openmovies-api Worker — see `worker/`).

## Layout

- `src/lib/tmdb.ts` — TMDB adapter + demo fallback
- `src/lib/providers.ts` — playback provider registry (swap providers here)
- `src/lib/personal.ts` — watched/liked/resume/watchlist logic (pure, tested)
- `worker/` — auth codes + per-user sync + anonymous analytics API (D1)
- `src/routes/gateway` — the Built to Move House survival page

License: Apache-2.0 (same as OpenMusic).
