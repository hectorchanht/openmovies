<script lang="ts">
	import { onMount } from 'svelte';
	import { BINGE_SERVERS, FAILOVER_TIMEOUT_MS, PROVIDERS, bingeServerQuality, nextFailoverProvider, parseBingeMessage, parseProgressMessage, providerById, providerMarker } from '$lib/providers';
	import { TIER_LABEL, chipSpeedLabel, connectionTier, deviceProbesToHealth, fastestProviderId, formatMs, playTier, probeDeviceLatency, readMeasurements, recordMeasurement, type PlayMeasurements } from '$lib/speed';
	import type { ProviderHealthInfo } from '$lib/api';
	import { BUILTIN_TRACKS, searchSubtitles, type SubtitleTrack } from '$lib/subtitles';
	import { resolveSource } from '$lib/resolve';
	import { fetchProviderHealth } from '$lib/api';
	import { store } from '$lib/store.svelte';
	import { isUnreleased, resumeKey } from '$lib/types';
	import type { Title } from '$lib/types';

	let {
		title,
		season = 1,
		episode = 1,
		onFirstPlay
	}: { title: Title; season?: number; episode?: number; onFirstPlay?: () => void } = $props();

	// Default is BingeAPI (Hector ruling 2026-11-24): the BingeBang
	// player as an embed — free, no ads, 12 servers with automatic
	// failover behind one iframe. Its docs require NO sandbox (a
	// sandbox blocks its player scripts) and Hector ruled that OK
	// for this named provider, so it carries requiresUnsandboxed in
	// the registry and renders unsandboxed by default. EmbedWave is
	// the sandbox-clean fallback (Server 2). Ad-supported servers
	// stay opt-in via their 有廣告 tag / Ad Mode (see the iframe below).
	let providerId = $state('bingeapi');
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
	// Two unsandboxed paths, both explicit in the registry: (a) a clean
	// provider that requires it (BingeAPI, Hector 2026-11-24), and
	// (b) Ad Mode ON + an ad-supported provider (Hector 2026-11-20).
	const embedUnsandboxed = $derived(currentProvider.requiresUnsandboxed || (adMode && currentProvider.adSupported));
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

	// Embed URL: BingeAPI is built locally at once (direct-connect,
	// below); other providers come from the resolver layer (memoized
	// in-session + localStorage, backed by the Worker's Cloudflare edge
	// cache) — server switches and Continue Watching never re-resolve a
	// known source.
	let src = $state('');
	$effect(() => {
		const pid = providerId;
		if (unreleased) {
			src = '';
			return;
		}
		const target = { id: title.id, type: title.type, season, episode };
		const stamp = `${pid}:${target.id}:${target.type}:${season}:${episode}`;
		// Direct-connect for BingeAPI (Hector 2026-11-24): no intermediate
		// steps between the user and the player — the embed URL is built
		// locally and set at once, never waiting on a resolver network
		// round-trip. Playback behaviour is still recorded (progress
		// events -> resume + speed measurements below). Other providers
		// keep the resolver layer (edge cache + local fallback).
		if (pid === 'bingeapi') {
			src = providerById('bingeapi').build(target);
			loadStartedAt = performance.now();
			playStamp = stamp;
			return;
		}
		void resolveSource(pid, target).then((r) => {
			if (`${providerId}:${title.id}:${title.type}:${season}:${episode}` === stamp) {
				let url = r.embedUrl;
				// VidLink accepts a startAt hint: when the viewer's place is
				// already known (its own progress events feed `pos`), carry
				// it across a server switch instead of restarting the title.
				if (pid === 'vidlink' && pos > 5 && !url.includes('startAt')) {
					url += `${url.includes('?') ? '&' : '?'}startAt=${Math.floor(pos)}`;
				}
				src = url;
				loadStartedAt = performance.now();
				playStamp = stamp;
				if (pid !== 'bingeapi') currentBingeServer = '';
			}
		});
	});
	// Providers the Worker's EDGE health probe could not confirm. The
	// probe runs from Cloudflare's network, which providers often block
	// while real devices connect fine — so an unconfirmed probe only
	// earns a chip "· unverified" marker (see providerMarker). It is
	// never shown as "down" and never causes a server to be skipped:
	// servers are tried in listed order.
	let unconfirmedIds = $state<string[]>([]);
	// Source-speed transparency (Hector 2026-11-24): every provider
	// shows its speed; the numbers are measured, never fabricated.
	// Primary connection signal = a probe run on THIS device at page
	// load (deviceProbes); the Worker's edge latency (healthList) is
	// the fallback when a device probe could not run. Device
	// time-to-play (this user's own, persisted locally) headlines once
	// it exists. loadStartedAt/playStamp track the in-flight embed so
	// the first progress event can be timed honestly.
	let healthList = $state<ProviderHealthInfo[]>([]);
	let deviceProbes = $state<Record<string, number | null>>({});
	const deviceHealth = $derived(deviceProbesToHealth(deviceProbes));
	const fastestId = $derived(fastestProviderId(deviceHealth) ?? fastestProviderId(healthList));
	let measurements = $state<PlayMeasurements>({});
	let loadStartedAt = 0;
	let playStamp = '';
	let currentBingeServer = $state('');
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
	// source-switching). The signal is the device's OWN experience: a
	// freshly loaded embed that gives no sign of life — no load event
	// on the embed frame, no postMessage from its origin — within
	// FAILOVER_TIMEOUT_MS is presumed dead ON THIS DEVICE, and the
	// player advances to the next server in the rotation
	// (providers.nextFailoverProvider: starts from the default
	// BingeAPI, never into the simulated Demo Player, never into an
	// ad-supported server unless Ad Mode is already on) and says so in
	// a note — honesty, not silence. Manual switching stays and resets
	// the rotation. The edge probe never causes a skip (see onMount).
	// Cross-origin embeds cannot be read, so a shell page that loads
	// but finds no source still counts as "alive" — that residual is
	// the server-side per-title resolution work.
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
		if (!loadStartedAt || providerId === 'demo') return;
		measurements = recordMeasurement(measurements, providerId, { loadMs: performance.now() - loadStartedAt }, Date.now());
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

	/** First progress event for this embed = the moment it actually
	 * started playing on this device; time it once per embed load. */
	function noteFirstPlay() {
		if (!loadStartedAt || !playStamp) return;
		playStamp = '';
		measurements = recordMeasurement(measurements, providerId, { playMs: performance.now() - loadStartedAt }, Date.now());
		// The cover-flight overlay on the watch page listens for this:
		// the movie is playing, so the cover can land and fade away.
		onFirstPlay?.();
	}

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
		measurements = readMeasurements();
		// Device connection probes — the PRIMARY speed signal (Hector
		// 2026-11-24): time each hosted provider's origin from this
		// device, in parallel, at page load. A probe that fails or
		// times out records null = not measured (never "down").
		for (const p of PROVIDERS) {
			if (p.id === 'demo') continue;
			let origin = '';
			try {
				origin = new URL(p.build({ id: title.id, type: title.type, season, episode })).origin;
			} catch {
				continue;
			}
			if (!origin.startsWith('http')) continue;
			void probeDeviceLatency(`${origin}/favicon.ico`, (u, init) => fetch(u, init)).then((ms) => {
				deviceProbes = { ...deviceProbes, [p.id]: ms };
			});
		}
		void fetchProviderHealth().then((health) => {
			if (!health) return;
			// The edge probe NEVER causes a skip or a switch: a failed
			// probe is not evidence about this device's reachability,
			// so the selected server never changes on probe data (see
			// providerMarker). Automatic failover (above) is a separate
			// mechanism driven only by this device's own embed
			// experience. The latency numbers ARE shown to the user
			// (chip labels, fastest badge, speed panel) as the fallback
			// connection signal — surfacing speed is the point; silently
			// acting on it is not.
			healthList = health;
			unconfirmedIds = health.filter((p) => !p.ok).map((p) => p.id);
		});
		void searchSubtitles({ tmdbId: title.id, type: title.type, season, episode }).then((t) => (tracks = t));
		// BingeAPI sends 'duration' and 'time' as separate events, so
		// the last seen duration is kept here and paired with 'time'.
		let bingeDuration = 0;
		const onMsg = (ev: MessageEvent) => {
			if (!frame?.src) return;
			try {
				if (ev.origin !== new URL(frame.src).origin) return;
			} catch { return; }
			// Any message from the embed's own origin is a sign of life:
			// the failover timer stands down (see armFailover).
			markSignalled();
			const s = parseProgressMessage(ev.data);
			if (s) { noteFirstPlay(); save(s.currentTime, s.duration); return; }
			const b = parseBingeMessage(ev.data);
			if (!b) return;
			if (b.server) { currentBingeServer = b.server; return; }
			if (b.duration) bingeDuration = b.duration;
			else if (b.currentTime !== undefined && bingeDuration > 0) { noteFirstPlay(); save(b.currentTime, bingeDuration); }
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
			<button class="btn primary big" onclick={() => (playing = !playing)}>{playing ? 'Pause' : pos > 5 ? `Resume from ${fmt(pos)}` : 'Play'}</button>
			<input class="seek" type="range" min="0" max={duration} value={pos} oninput={(e) => { pos = Number((e.currentTarget as HTMLInputElement).value); save(pos, duration); }} aria-label="Seek" />
			<p class="small muted">{fmt(pos)} / {fmt(duration)}</p>
		</div>
	{:else if src}
		<!-- Sandbox contract (Hector rulings 2026-11-20 + 2026-11-24): the
		     iframe is sandboxed with exactly the safe token set below — no
		     top-navigation token and no popup token of any kind (the
		     contract test spells them out and fails if one ever appears) —
		     so the browser itself blocks the popunder / whole-tab ad
		     redirect an unsandboxed embed served in production. There are
		     exactly TWO paths to an iframe without a sandbox, both gated
		     on the provider registry: (a) requiresUnsandboxed — a clean,
		     ad-free provider whose docs forbid a sandbox (BingeAPI, the
		     default; Hector 2026-11-24 named it explicitly), and
		     (b) Ad Mode: Ad Mode on AND this provider is adSupported,
		     because availability outranks ad-purity — sandboxed,
		     ad-funded providers refuse to play at all. The key block
		     forces a fresh iframe when the sandbox state flips, because
		     browsers apply sandbox flags only at navigation time. -->
		{#key embedUnsandboxed}
			<iframe bind:this={frame} title={`Player — ${title.name}`} src={src} onload={onFrameLoad} sandbox={embedUnsandboxed ? undefined : 'allow-scripts allow-same-origin allow-presentation'} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="origin"></iframe>
		{/key}
	{:else}
		<div class="stage"><p class="muted small">Loading server…</p></div>
	{/if}
</div>

<div class="controls">
	<div class="servers" role="group" aria-label="Playback server">
		{#each PROVIDERS as p}
			<button class="chip" class:on={providerId === p.id} onclick={() => switchTo(p.id)}>{p.label}{providerMarker(p, unconfirmedIds)}{chipSpeedLabel(p.id, healthList, measurements, deviceProbes)}{p.id === fastestId ? ' · 最快 Fastest' : ''}</button>
		{/each}
	</div>
	<button class="chip" class:on={adMode} onclick={() => setAdMode(!adMode)} aria-pressed={adMode}>廣告模式 Ad Mode · {adMode ? 'ON' : 'OFF'}</button>
	<label class="subs small muted">Subtitles
		<select bind:value={track}>
			{#each tracks as t}<option value={t.lang}>{t.label}</option>{/each}
		</select>
	</label>
</div>
{#if failoverNote}
	<p class="small failover" role="status">{failoverNote}</p>
{/if}
<div class="speeds" aria-label="Source speeds">
	<p class="small muted speeds-head">邊個 source 最快？ Which source is fastest? 連接 = 你部機量度 server 幾快應機（量唔到就顯示我哋喺 Cloudflare 探測嘅數）；開播 = 你部機上次真係幾快開到戲。Connection is measured on your own device (our Cloudflare edge probe is shown when your device has no measurement yet); time-to-play is what your own device measured last time.</p>
	{#each PROVIDERS as p}
		{@const h = healthList.find((x) => x.id === p.id)}
		{@const dp = deviceProbes[p.id]}
		{@const m = measurements[p.id]}
		<p class="small speedrow">
			<span>{p.label}{p.id === fastestId ? ' · 最快 Fastest' : ''}</span>
			{#if p.id === 'demo'}
				<span class="muted">本機模擬 On-device · 冇連接速度</span>
			{:else}
				<span class="muted">連接 Connection: {#if typeof dp === 'number' && dp > 0}{formatMs(dp)} · {TIER_LABEL[connectionTier(dp)]}（你部機 This device）{h?.ok && h.latencyMs > 0 ? ` · 探測 Edge: ${formatMs(h.latencyMs)}` : ''}{:else if h?.ok && h.latencyMs > 0}{formatMs(h.latencyMs)} · {TIER_LABEL[connectionTier(h.latencyMs)]}（探測 Edge）{:else}未測 Not measured{/if}{m?.playMs ? ` · 開播 Time-to-play: ${formatMs(m.playMs)} · ${TIER_LABEL[playTier(m.playMs)]}` : ''}</span>
			{/if}
		</p>
	{/each}
	{#if providerId === 'bingeapi'}
		<p class="small muted">BingeAPI 入面有 12 個 servers，會自動揀最快嗰個、死咗自動跳下一個：{BINGE_SERVERS.map((s) => `${s.name} (${s.quality})`).join(' · ')}</p>
		{#if currentBingeServer}
			<p class="small">而家播緊嗰個 BingeAPI server: {currentBingeServer}{bingeServerQuality(currentBingeServer) ? ` · ${bingeServerQuality(currentBingeServer)}` : ''}</p>
		{/if}
	{/if}
</div>
{#if currentProvider.adSupported}
	<p class="small muted">呢個 Server 有廣告：撳 Play 時可能彈廣告，撳一次交叉（X）閂咗佢就得。我哋唔會從呢啲廣告賺錢 — 廣告係 provider 強制顯示，同我哋無關。This server carries ads: a pop-up may appear when you press play — close it once (tap X). We earn nothing from these ads — the provider forces them; they are not ours.</p>
{:else if currentProvider.note}
	<p class="small muted">{currentProvider.note}</p>
{/if}
<p class="small muted">If a server doesn't respond, the player switches to the next one automatically — or switch servers yourself; your place is kept. BingeAPI (Server 1, no ads) is reached directly and runs without a sandbox because its player needs it — inside it, its own 12 servers switch automatically if one fails. Other clean servers run sandboxed, so they can never redirect this tab or open pop-up ads; a server tagged 有廣告 runs unsandboxed only when you select it — that selection is your opt-in. Progress in the Demo Player is saved automatically; other servers keep their own resume.</p>
{/if}

<style>
	.player { position: relative; aspect-ratio: 16/9; background: #000; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--line); }
	.player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
	.stage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; text-align: center; }
	.stagename { font-size: 22px; font-weight: 800; margin: 0; }
	.backdrop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.45; }
	.stage > :not(.backdrop) { position: relative; }
	.unreleased-badge { font-weight: 700; padding: 8px 16px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); margin: 0; }
	.overview { max-width: 560px; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
	.failover { color: var(--accent); }
	.big { font-size: 16px; padding: 12px 26px; }
	.seek { width: min(520px, 90%); accent-color: var(--accent); }
	.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-top: 12px; }
	.servers { display: flex; flex-wrap: wrap; gap: 8px; }
	.subs select { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; margin-left: 6px; }
	.speeds { margin-top: 10px; border: 1px solid var(--line); border-radius: var(--radius); padding: 8px 12px; }
	.speeds-head { margin: 4px 0 6px; }
	.speedrow { display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: space-between; margin: 4px 0; }
</style>
