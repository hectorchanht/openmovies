<script lang="ts">
	import { onMount } from 'svelte';
	import { FAILOVER_TIMEOUT_MS, PROVIDERS, nextFailoverProvider, parseProgressMessage, providerById, providerMarker } from '$lib/providers';
	import { BUILTIN_TRACKS, searchSubtitles, type SubtitleTrack } from '$lib/subtitles';
	import { resolveSource } from '$lib/resolve';
	import { fetchProviderHealth } from '$lib/api';
	import { store } from '$lib/store.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { isUnreleased, resumeKey } from '$lib/types';
	import type { Title } from '$lib/types';

	let { title, season = 1, episode = 1 }: { title: Title; season?: number; episode?: number } = $props();

	// Default is EmbedWave (2026-11-20): verified in a real-browser
	// harness to play inside the exact P0 sandbox with no popup, no
	// redirect and no sandbox refusal — the first real provider that
	// satisfies the sandbox contract. BingeAPI (Server 2, 2026-11-24) is
	// the next real server; the Demo Player is the simulated fallback
	// (Server 3). Ad-supported servers are opt-in via their 有廣告 tag
	// unless the user opens Ad Mode (see the embed below).
	let providerId = $state('embedwave');
	// Unreleased titles (TMDB release date still in the future) have no
	// source ANYWHERE — no provider can play what does not exist yet.
	// The player renders an honesty state for them instead of a row of
	// dead server chips (2026-11-24: Hector hit exactly this on an
	// unreleased film and every server "failed"). See the markup below.
	const unreleased = $derived(isUnreleased(title.releaseDate));
	// Ad Mode (Hector ruling 2026-11-20, lightest form): the disclosure
	// is the 有廣告 · Ads tag on the provider chip itself. A user who
	// taps a tagged provider has knowingly opted in — that tap IS the
	// consent (see switchTo) — so a selected adSupported provider renders
	// without the sandbox directly, no notices, dialogs or extra steps.
	// Ad Mode state follows that selection, is persisted per device and
	// stays sticky; the visible toggle can switch it back off, which
	// re-sandboxes everything immediately. embedUnsandboxed below is the
	// single gate: Ad Mode on AND an ad-supported provider. Clean
	// providers are sandboxed in every state, and the default selection
	// is always a clean one.
	const AD_MODE_KEY = 'om_ad_mode';
	let adMode = $state(false);
	const currentProvider = $derived(providerById(providerId));
	const embedUnsandboxed = $derived(adMode && currentProvider.adSupported);
	function setAdMode(on: boolean) {
		adMode = on;
		try {
			localStorage.setItem(AD_MODE_KEY, on ? '1' : '0');
		} catch {
			/* storage unavailable (private mode etc.) — the mode just won't persist */
		}
	}
	let tracks = $state<SubtitleTrack[]>(BUILTIN_TRACKS);
	let track = $state('en');
	// Demo (simulated) player state
	let playing = $state(false);
	let pos = $state(0);
	const duration = $derived((title.type === 'movie' ? (title.runtimeMin ?? 100) : 50) * 60);
	let frame: HTMLIFrameElement | undefined = $state();

	// Embed URL comes from the resolver layer (memoized in-session +
	// localStorage, backed by the Worker's Cloudflare edge cache) — server
	// switches and Continue Watching never re-resolve a known source.
	let src = $state('');
	$effect(() => {
		const pid = providerId;
		if (unreleased) {
			src = '';
			return;
		}
		const target = { id: title.id, type: title.type, season, episode };
		const stamp = `${pid}:${target.id}:${target.type}:${season}:${episode}`;
		void resolveSource(pid, target).then((r) => {
			if (`${providerId}:${title.id}:${title.type}:${season}:${episode}` !== stamp) return;
			let url = r.embedUrl;
			// VidLink accepts a startAt hint: when the viewer's place is
			// already known (its own progress events feed `pos`), carry
			// it across a server switch instead of restarting the title.
			if (pid === 'vidlink' && pos > 5 && !url.includes('startAt')) {
				url += `${url.includes('?') ? '&' : '?'}startAt=${Math.floor(pos)}`;
			}
			src = url;
		});
	});
	// Providers the Worker's EDGE health probe could not confirm. The
	// probe runs from Cloudflare's network, which providers often block
	// while real devices connect fine — so an unconfirmed probe only
	// earns a chip "· unverified" marker (see providerMarker). It is
	// never shown as "down" and never causes a server to be skipped:
	// servers are tried in listed order.
	let unconfirmedIds = $state<string[]>([]);
	const key = $derived(resumeKey({ type: title.type, id: title.id, season: title.type === 'tv' ? season : undefined, episode: title.type === 'tv' ? episode : undefined }));

	let lastSave = 0;
	function save(positionSec: number, durationSec: number) {
		const now = Date.now();
		if (now - lastSave < 4000 && positionSec > 5) return;
		lastSave = now;
		store.recordResume({ titleId: title.id, type: title.type, season: title.type === 'tv' ? season : undefined, episode: title.type === 'tv' ? episode : undefined, positionSec: Math.floor(positionSec), durationSec: Math.floor(durationSec), updatedAt: now });
	}

	// Automatic failover (2026-11-24, Hector directive — "instant,
	// ad-free, like bingebang.sx"; FMHY grading criterion: automatic
	// source-switching). This reverses the 2026-11-20 no-failover
	// stance for DEVICE-SIDE signals only: the old objection was that
	// the edge probe's vantage says nothing about the user's device —
	// so the probe still never causes a skip (see onMount). Here the
	// signal is the device's own experience: a freshly loaded embed
	// that gives no sign of life — no load event on the embed frame,
	// no postMessage from its origin — within FAILOVER_TIMEOUT_MS is
	// presumed dead ON THIS DEVICE, and the player advances to the
	// next server in the rotation (providers.nextFailoverProvider:
	// never into the simulated Demo Player, never into an ad-supported
	// server unless Ad Mode is already on) and says so in a note —
	// honesty, not silence. Manual switching stays and resets the
	// rotation. Cross-origin embeds cannot be read, so a shell page
	// that loads but finds no source still counts as "alive" — that
	// residual is Wave 2's server-side per-title resolution.
	let failoverNote = $state('');
	let triedIds = $state<string[]>([]);
	let failoverTimer: ReturnType<typeof setTimeout> | undefined;
	let failoverJump = false;

	function clearFailoverTimer() {
		if (failoverTimer !== undefined) {
			clearTimeout(failoverTimer);
			failoverTimer = undefined;
		}
	}
	function markSignalled() {
		clearFailoverTimer();
	}
	function onFrameLoad() {
		markSignalled();
	}
	function armFailover() {
		clearFailoverTimer();
		if (unreleased || providerId === 'demo' || !src) return;
		failoverTimer = setTimeout(onFailoverTimeout, FAILOVER_TIMEOUT_MS);
	}
	function onFailoverTimeout() {
		failoverTimer = undefined;
		const from = currentProvider;
		const next = nextFailoverProvider(providerId, triedIds, { adMode });
		if (!next) {
			failoverNote = 'No server responded — try switching manually · 所有伺服器都無回應，可以手動切換其他 Server 試下。';
			return;
		}
		triedIds = [...triedIds, providerId];
		failoverNote = `${from.label} didn't respond — switched to ${next.label} · ${from.label} 無回應，已自動切換至 ${next.label}。`;
		failoverJump = true;
		switchTo(next.id);
		failoverJump = false;
	}

	// (Re)arm the failover timer whenever a fresh embed URL lands.
	$effect(() => {
		void src;
		void providerId;
		armFailover();
		return clearFailoverTimer;
	});

	function switchTo(id: string) {
		if (id !== providerId) store.noteServerSwitch();
		providerId = id;
		// Tapping a 有廣告-tagged chip IS the opt-in: it turns Ad Mode on
		// (sticky) so the tagged provider loads unsandboxed right away —
		// one tap from "can't play" to playing, no separate enable step.
		if (providerById(id).adSupported) setAdMode(true);
		// A manual switch is the user taking over: reset the failover
		// rotation and its note. Failover's own jumps (failoverJump)
		// keep both, so the chain can continue and the note survives.
		if (!failoverJump) {
			triedIds = [];
			failoverNote = '';
		}
	}

	onMount(() => {
		try {
			adMode = localStorage.getItem(AD_MODE_KEY) === '1';
		} catch {
			/* storage unavailable — Ad Mode stays off, the safe default */
		}
		const existing = store.personal.resume[key];
		if (existing) pos = existing.positionSec;
		void fetchProviderHealth().then((health) => {
			if (!health) return;
			// The edge probe NEVER causes a skip or a switch: a failed
			// probe is not evidence about this device's reachability,
			// so the selected server never changes on probe data (see
			// providerMarker). Automatic failover (2026-11-24) is a
			// separate mechanism driven only by this device's own
			// embed experience — see armFailover / onFailoverTimeout.
			unconfirmedIds = health.filter((p) => !p.ok).map((p) => p.id);
		});
		void searchSubtitles({ tmdbId: title.id, type: title.type, season, episode }).then((t) => (tracks = t));
		const onMsg = (ev: MessageEvent) => {
			if (!frame?.src) return;
			try {
				if (ev.origin !== new URL(frame.src).origin) return;
			} catch { return; }
			// Any message from the embed's own origin is a sign of life:
			// the failover timer stands down (see armFailover).
			markSignalled();
			const s = parseProgressMessage(ev.data);
			if (s) save(s.currentTime, s.duration);
		};
		window.addEventListener('message', onMsg);
		const timer = setInterval(() => {
			if (providerId === 'demo' && playing) {
				pos = Math.min(duration, pos + 1);
				save(pos, duration);
				if (pos >= duration) { playing = false; store.markWatched(title.id); }
			}
		}, 1000);
		return () => { window.removeEventListener('message', onMsg); clearInterval(timer); clearFailoverTimer(); };
	});

	const fmt = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
</script>

{#if unreleased}
	<div class="player">
		<div class="stage" style={`background:${title.art}`}>
			{#if title.backdropPath}
				<img class="backdrop" src={`https://image.tmdb.org/t/p/w500${title.backdropPath}`} alt="" aria-hidden="true" />
			{/if}
			<p class="stagename">{title.name}</p>
			<p class="unreleased-badge">Not yet released — no sources exist yet · 未上映，未有片源</p>
			<p class="small">Expected release · 預計上映：{title.releaseDate}</p>
			{#if title.genres.length || title.rating > 0}
				<p class="small muted">{title.year}{#if title.genres.length} · {title.genres.join(' · ')}{/if}{#if title.rating > 0} · ★ {title.rating.toFixed(1)}{/if}</p>
			{/if}
			{#if title.overview}
				<p class="small muted overview">{title.overview}</p>
			{/if}
		</div>
	</div>
	<p class="small muted">This title has not been released yet, so no streaming server anywhere has it — the servers are not broken; the film simply does not exist to stream yet. Come back after the release date. 呢套戲仲未上映，全世界都未有片源 — 唔係 Server 壞咗，係套戲未出；出咗之後返嚟就睇到。</p>
{:else}
<div class="player">
	{#if providerId === 'demo'}
		<div class="stage" style={`background:${title.art}`}>
			<p class="stagename">{title.name}</p>
			<p class="muted small">Demo player — simulated playback so resume, Continue Watching and achievements work end-to-end without any third-party server.</p>
			<button class="btn primary big ico" onclick={() => (playing = !playing)} aria-label={playing ? 'Pause' : pos > 5 ? `Resume from ${fmt(pos)}` : 'Play'} title={playing ? 'Pause' : pos > 5 ? `Resume from ${fmt(pos)}` : 'Play'}><Icon name={playing ? 'pause' : 'play'} big /></button>{#if !playing && pos > 5}<span class="small muted">{fmt(pos)}</span>{/if}
			<input class="seek" type="range" min="0" max={duration} value={pos} oninput={(e) => { pos = Number((e.currentTarget as HTMLInputElement).value); save(pos, duration); }} aria-label="Seek" />
			<p class="small muted">{fmt(pos)} / {fmt(duration)}</p>
		</div>
	{:else if src}
		<!-- Sandbox contract (Hector rulings 2026-11-20): the iframe is
		     sandboxed with exactly the safe token set below — no
		     top-navigation token and no popup token of any kind (the
		     contract test spells them out and fails if one ever appears) —
		     so the browser itself blocks the popunder / whole-tab ad
		     redirect an unsandboxed embed served in production. The ONE
		     exception is Ad Mode: embedUnsandboxed (Ad Mode on AND this
		     provider is adSupported) is the only path to an iframe without
		     a sandbox, and it exists because availability outranks
		     ad-purity — sandboxed, ad-funded providers refuse to play at
		     all. The key block forces a fresh iframe when the sandbox
		     state flips, because browsers apply sandbox flags only at
		     navigation time. -->
		{#key embedUnsandboxed}
			<iframe bind:this={frame} onload={onFrameLoad} title={`Player — ${title.name}`} src={src} sandbox={embedUnsandboxed ? undefined : 'allow-scripts allow-same-origin allow-presentation'} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="origin"></iframe>
		{/key}
	{:else}
		<div class="stage"><p class="muted small">Loading server…</p></div>
	{/if}
</div>

<div class="controls">
	<div class="servers" role="group" aria-label="Playback server">
		{#each PROVIDERS as p}
			<button class="chip" class:on={providerId === p.id} onclick={() => switchTo(p.id)}>{p.label}{providerMarker(p, unconfirmedIds)}</button>
		{/each}
	</div>
	<button class="chip admode" class:on={adMode} onclick={() => setAdMode(!adMode)} aria-pressed={adMode} aria-label="廣告模式 Ad Mode" title="廣告模式 Ad Mode"><Icon name="megaphone" /><span>{adMode ? 'ON' : 'OFF'}</span></button>
	<label class="subs small muted"><Icon name="cc" />
		<select bind:value={track} aria-label="Subtitles">
			{#each tracks as t}<option value={t.lang}>{t.label}</option>{/each}
		</select>
	</label>
</div>
{#if failoverNote}
	<p class="small failover" role="status">{failoverNote}</p>
{/if}
{#if currentProvider.adSupported}
	<p class="small muted">呢個 Server 有廣告：撳 Play 時可能彈廣告，撳一次交叉（X）閂咗佢就得。我哋唔會從呢啲廣告賺錢 — 廣告係 provider 強制顯示，同我哋無關。This server carries ads: a pop-up may appear when you press play — close it once (tap X). We earn nothing from these ads — the provider forces them; they are not ours.</p>
{:else if currentProvider.note}
	<p class="small muted">{currentProvider.note}</p>
{/if}
<p class="small muted">If a server doesn't respond, the player switches to the next one automatically — or switch servers yourself; your place is kept. Third-party servers run sandboxed by default, so they can never redirect this tab or open pop-up ads; a server tagged 有廣告 runs unsandboxed only when you select it — that selection is your opt-in. Progress in the Demo Player is saved automatically; other servers keep their own resume.</p>
{/if}

<style>
	.player { position: relative; aspect-ratio: 16/9; background: #000; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--line); }
	.player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
	.stage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; text-align: center; }
	.stagename { font-size: 22px; font-weight: 800; margin: 0; }
	.big { font-size: 16px; padding: 12px 26px; }
	.seek { width: min(520px, 90%); accent-color: var(--accent); }
	.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-top: 12px; }
	.servers { display: flex; flex-wrap: wrap; gap: 8px; }
	.subs { display: inline-flex; align-items: center; gap: 6px; }
	.subs select { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
	.admode { display: inline-flex; align-items: center; gap: 6px; }
	.backdrop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.45; }
	.stage > :not(.backdrop) { position: relative; }
	.unreleased-badge { font-weight: 700; padding: 8px 16px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); margin: 0; }
	.overview { max-width: 560px; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
	.failover { color: var(--accent); }
</style>
