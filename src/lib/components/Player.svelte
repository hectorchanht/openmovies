<script lang="ts">
	import { onMount } from 'svelte';
	import { PROVIDERS, parseProgressMessage } from '$lib/providers';
	import { BUILTIN_TRACKS, searchSubtitles, type SubtitleTrack } from '$lib/subtitles';
	import { resolveSource } from '$lib/resolve';
	import { fetchProviderHealth } from '$lib/api';
	import { store } from '$lib/store.svelte';
	import { resumeKey } from '$lib/types';
	import type { Title } from '$lib/types';

	let { title, season = 1, episode = 1 }: { title: Title; season?: number; episode?: number } = $props();

	let providerId = $state('vidlink');
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
	// Providers the Worker's health probe currently reports down (its
	// negative-cached answer makes this cheap); used for chip markers and
	// a one-time failover of the initial pick.
	let downIds = $state<string[]>([]);
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
	}

	onMount(() => {
		const existing = store.personal.resume[key];
		if (existing) pos = existing.positionSec;
		void fetchProviderHealth().then((health) => {
			if (!health) return;
			downIds = health.filter((p) => !p.ok).map((p) => p.id);
			// Instant failover: if the initial server is reported down, jump
			// straight to the first healthy one instead of a dead iframe.
			if (downIds.includes(providerId)) {
				const alive = PROVIDERS.find((p) => p.id !== 'demo' && !downIds.includes(p.id));
				if (alive) providerId = alive.id;
			}
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
			<button class="btn primary big" onclick={() => (playing = !playing)}>{playing ? 'Pause' : pos > 5 ? `Resume from ${fmt(pos)}` : 'Play'}</button>
			<input class="seek" type="range" min="0" max={duration} value={pos} oninput={(e) => { pos = Number((e.currentTarget as HTMLInputElement).value); save(pos, duration); }} aria-label="Seek" />
			<p class="small muted">{fmt(pos)} / {fmt(duration)}</p>
		</div>
	{:else if src}
		<!-- No sandbox attribute: embed providers (VidLink first of all) refuse
		     to run sandboxed and render "Please Disable Sandbox" instead —
		     Hector's iPad report, 2026-11-18. Parity with BingeBang-class
		     embeds, which are never sandboxed. -->
		<iframe bind:this={frame} title={`Player — ${title.name}`} src={src} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="origin"></iframe>
	{:else}
		<div class="stage"><p class="muted small">Loading server…</p></div>
	{/if}
</div>

<div class="controls">
	<div class="servers" role="group" aria-label="Playback server">
		{#each PROVIDERS as p}
			<button class="chip" class:on={providerId === p.id} onclick={() => switchTo(p.id)}>{p.label}{#if downIds.includes(p.id)} · down{/if}{#if !p.verified && p.id !== 'demo'} · unverified{/if}</button>
		{/each}
	</div>
	<label class="subs small muted">Subtitles
		<select bind:value={track}>
			{#each tracks as t}<option value={t.lang}>{t.label}</option>{/each}
		</select>
	</label>
</div>
<p class="small muted">If a server is slow or down, switch servers — your place is kept. Progress from Server 1 is saved automatically; other servers keep their own resume.</p>

<style>
	.player { position: relative; aspect-ratio: 16/9; background: #000; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--line); }
	.player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
	.stage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; text-align: center; }
	.stagename { font-size: 22px; font-weight: 800; margin: 0; }
	.big { font-size: 16px; padding: 12px 26px; }
	.seek { width: min(520px, 90%); accent-color: var(--accent); }
	.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-top: 12px; }
	.servers { display: flex; flex-wrap: wrap; gap: 8px; }
	.subs select { background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; margin-left: 6px; }
</style>
