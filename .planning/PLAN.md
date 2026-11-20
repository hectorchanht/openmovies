# OpenMovies — GSD brief (2026-11-18)

**Decision (Hector):** "Open movies go." Real build, not just the prototype
(approved prototype = Muse artifact `openmovies`, BingeBang-style UI).

**Governing skills:** GSD workflow · Karpathy guidelines (simplicity, surgical
changes, verifiable goals) · Impeccable (design + audit before done) ·
app-creation governance (tests as deploy gate, live smoke + rollback mindset).

**Hard constraints (Hector):**
- No domain purchase — launch on openmovies.dawnstudio.app.
- No Discord anywhere. Announcement channel = Dawn Studio gateway hub only.
- Free + no ads + no pop-ups/redirects. No account needed to watch.
- Free account ONLY for watched / liked / resume / watchlist (+ achievements).
- User data for ANALYSIS only, never sold. Privacy copy says exactly that.
- Pure-interest → open source (public repo hectorchanht/openmovies).

**Stack:** SvelteKit 2 + Svelte 5 (runes) + TS strict (Dawn standing:
SvelteKit default). Web tier = prerendered SPA on Cloudflare Pages
(adapter-static; server logic lives in the openmovies-api Worker + D1 —
see worker/). Tailwind skipped deliberately: one hand-written CSS file keeps
the footprint smaller (Karpathy: fewest moving parts).

**Content:** TMDB adapter behind PUBLIC_TMDB_API_KEY (demo dataset ships so
the app runs with no key; key = the one blocker for live metadata).
Playback = provider registry (VidLink verified patterns + progress events;
VidSrc, VidKing documented patterns, unverified live; Demo simulated player).
Subtitles = OpenSubtitles adapter hook (built-in tracks without a key).

**Deploy gate:** vitest green (unit + mock-auth e2e of the API + core flow
logic) → build → Pages direct upload → custom domain → purge → live smoke.
