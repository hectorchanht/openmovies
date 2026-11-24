<script lang="ts">
	import { onMount } from 'svelte';
	import { PROVIDERS, parseProgressMessage, providerById, providerMarker } from '$lib/providers';
	import { BUILTIN_TRACKS, searchSubtitles, type SubtitleTrack } from '$lib/subtitles';
	import { resolveSource } from '$lib/resolve';
	import { fetchProviderHealth } from '$lib/api';
	import { store } from '$lib/store.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { resumeKey } from '$lib/types';
	import type { Title } from '$lib/types';

	let { title, season = 1, episode = 1 }: { title: Title; season?: number; episode?: number } = $props();

	// Default is EmbedWave (2026-11-20): verified in a real-browser
	// harness to play inside the exact P0 sandbox with no popup, no
	// redirect and no sandbox refusal — the first real provider that
	// satisfies the sandbox contract. The Demo Player is the simulated
	// fallback (Server 2). Ad-supported servers are opt-in via their
	// 有廣告 tag unless the user opens Ad Mode (see the iframe below).
	let providerId = $state('embedwave');
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
		const target = { id: title.id, type: title.type, season, episode };
		const stamp = `${pid}:${target.id}:${target.type}:${season}:${episode}`;
		void resolveSource(pid, target).then((r) => {
			if (`${providerId}:${title.id}:${title.type}:${season}:${episode}` === stamp) src = r.embedUrl;
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

	function switchTo(id: string) {
		if (id !== providerId) store.noteServerSwitch();
		providerId = id;
		// Tapping a 有廣告-tagged chip IS the opt-in: it turns Ad Mode on
		// (sticky) so the tagged provider loads unsandboxed right away —
		// one tap from "can't play" to playing, no separate enable step.
		if (providerById(id).adSupported) setAdMode(true);
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
			// Deliberately NO failover here: an edge-probe failure is not
			// evidence about this device's reachability, so the selected
			// server never changes on probe data (see providerMarker).
			unconfirmedIds = health.filter((p) => !p.ok).map((p) => p.id);
		});
		void searchSubtitles({ tmdbId: title.id, type: title.type, season, episode }).then((t) => (tracks = t));
		const onMsg = (ev: MessageEvent) => {
			if (!frame?.src) return;
			try {
				if (ev.origin !== new URL(frame.src).origin) return;
			} catch { return; }
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
		return () => { window.removeEventListener('message', onMsg); clearInterval(timer); };
	});

	const fmt = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
</script>

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
			<iframe bind:this={frame} title={`Player — ${title.name}`} src={src} sandbox={embedUnsandboxed ? undefined : 'allow-scripts allow-same-origin allow-presentation'} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="origin"></iframe>
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
{#if currentProvider.adSupported}
	<p class="small muted">呢個 Server 有廣告：撳 Play 時可能彈廣告，撳一次交叉（X）閂咗佢就得。我哋唔會從呢啲廣告賺錢 — 廣告係 provider 強制顯示，同我哋無關。This server carries ads: a pop-up may appear when you press play — close it once (tap X). We earn nothing from these ads — the provider forces them; they are not ours.</p>
{:else if currentProvider.note}
	<p class="small muted">{currentProvider.note}</p>
{/if}
<p class="small muted">If a server is slow or down, switch servers — your place is kept. Third-party servers run sandboxed by default, so they can never redirect this tab or open pop-up ads; a server tagged 有廣告 runs unsandboxed only when you select it — that selection is your opt-in. Progress in the Demo Player is saved automatically; other servers keep their own resume.</p>

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
</style>
