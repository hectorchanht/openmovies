<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Player from '$lib/components/Player.svelte';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import { TmdbCatalog } from '$lib/tmdb';
	import { downloadOptions } from '$lib/providers';
	import { trackEvent } from '$lib/api';
	import { store, type PosterFlight } from '$lib/store.svelte';
	import type { Title } from '$lib/types';

	const catalog = new TmdbCatalog(import.meta.env.PUBLIC_TMDB_API_KEY as string | undefined);
	let title = $state<Title | null>(null);
	let similar = $state<Title[]>([]);
	let season = $state(1);
	let episode = $state(1);
	const dlOptions = $derived(
		title ? downloadOptions({ id: title.id, type: title.type, season, episode }) : []
	);

	// Cover-flight (Hector 2026-11-24): the tapped card's cover flies
	// from its card rectangle to full screen over this page WHILE the
	// Player below is already loading the fastest source. The cover
	// lands (fades out) the moment the player reports first play, or
	// after a fallback timeout so it can never trap the user.
	let flight = $state<PosterFlight | null>(null);
	let flightFull = $state(false);
	let flightGone = $state(false);
	let flightFallback: ReturnType<typeof setTimeout> | undefined;

	function dismissFlight() {
		if (!flight || flightGone) return;
		flightGone = true;
		if (flightFallback) clearTimeout(flightFallback);
		setTimeout(() => {
			flight = null;
			store.clearFlight();
		}, 400);
	}

	onMount(async () => {
		const id = Number(page.params.id);
		const type = (page.url.searchParams.get('type') === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
		season = Number(page.url.searchParams.get('s') ?? 1) || 1;
		episode = Number(page.url.searchParams.get('e') ?? 1) || 1;
		const f = store.flight;
		if (f && f.titleId === id && Date.now() - f.ts < 3000) {
			flight = f;
			requestAnimationFrame(() => requestAnimationFrame(() => (flightFull = true)));
			flightFallback = setTimeout(dismissFlight, 6000);
		} else if (f) {
			store.clearFlight();
		}
		title = await catalog.detail(id, type);
		if (title) {
			trackEvent('play', title.id);
			similar = await catalog.similar(title);
		}
	});
</script>

{#if title}
	<h1 class="t">{title.name}{#if title.type === 'tv'} <span class="muted">· S{season} E{episode}</span>{/if}</h1>
	<Player {title} {season} {episode} onFirstPlay={dismissFlight} />
	{#if flight}
		<div
			class="flight"
			style={flightFull
				? 'left:0;top:0;width:100vw;height:100dvh;border-radius:0;'
				: `left:${flight.rect.x}px;top:${flight.rect.y}px;width:${flight.rect.w}px;height:${flight.rect.h}px;border-radius:12px;`}
			style:opacity={flightGone ? 0 : 1}
			style:background={flight.art}
			aria-hidden="true"
		>
			{#if flight.poster}<img src={flight.poster} alt="" />{/if}
			<span class="fname">{flight.name}</span>
			<span class="fbar"><span></span></span>
		</div>
	{/if}
	<div class="btns">
		<button class="btn" class:on={store.personal.liked.includes(title.id)} onclick={() => title && store.toggleLiked(title.id)}>
			{store.personal.liked.includes(title.id) ? '♥ Liked' : '♡ Like'}
		</button>
		<button class="btn" class:on={store.personal.watchlist.includes(title.id)} onclick={() => title && store.toggleWatchlist(title.id)}>
			{store.personal.watchlist.includes(title.id) ? '✓ In My List' : '+ My List'}
		</button>
		<button class="btn" onclick={() => title && store.markWatched(title.id)}>Mark watched</button>
		{#if title && dlOptions.length}
			<button class="btn" onclick={() => { if (title) { store.recordDownload(title.id); trackEvent('download', title.id); window.open(dlOptions[0].url, '_blank', 'noopener'); } }}>⬇ Download this {title.type === 'tv' ? 'episode' : 'movie'} · free</button>
		{/if}
		<a class="btn" href={`/title/${title.id}?type=${title.type}`}>Details</a>
	</div>
	{#if similar.length}
		<div class="row-head"><h2>More Like This</h2></div>
		<div class="scroller">{#each similar as t}<PosterCard title={t} />{/each}</div>
	{/if}
{:else}
	<p class="muted">Loading player…</p>
{/if}

<style>
	.t { font-size: 22px; letter-spacing: -0.01em; }
	.t .muted { font-size: 16px; }
	.btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
	.flight {
		position: fixed; z-index: 80; overflow: hidden; pointer-events: none;
		transition: left 0.6s cubic-bezier(0.2, 0.7, 0.2, 1), top 0.6s cubic-bezier(0.2, 0.7, 0.2, 1),
			width 0.6s cubic-bezier(0.2, 0.7, 0.2, 1), height 0.6s cubic-bezier(0.2, 0.7, 0.2, 1),
			border-radius 0.6s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.35s ease;
	}
	.flight img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.fname {
		position: absolute; left: 20px; bottom: 34px; font-size: clamp(22px, 6vw, 40px); font-weight: 800;
		text-shadow: 0 2px 14px rgba(0, 0, 0, 0.65);
	}
	.fbar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255, 255, 255, 0.25); overflow: hidden; }
	.fbar span { display: block; height: 100%; width: 40%; background: var(--accent); animation: fslide 1.1s ease-in-out infinite; }
	@keyframes fslide { 0% { transform: translateX(-100%);} 100% { transform: translateX(350%);} }
	@media (prefers-reduced-motion: reduce) { .flight { transition: opacity 0.2s ease; } .fbar span { animation: none; } }
</style>
