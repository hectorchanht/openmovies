<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Player from '$lib/components/Player.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import { TmdbCatalog } from '$lib/tmdb';
	import { downloadOptions } from '$lib/providers';
	import { trackEvent } from '$lib/api';
	import { store } from '$lib/store.svelte';
	import type { Title } from '$lib/types';

	const catalog = new TmdbCatalog(import.meta.env.PUBLIC_TMDB_API_KEY as string | undefined);
	let title = $state<Title | null>(null);
	let similar = $state<Title[]>([]);
	let season = $state(1);
	let episode = $state(1);
	const dlOptions = $derived(
		title ? downloadOptions({ id: title.id, type: title.type, season, episode }) : []
	);

	onMount(async () => {
		const id = Number(page.params.id);
		const type = (page.url.searchParams.get('type') === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
		season = Number(page.url.searchParams.get('s') ?? 1) || 1;
		episode = Number(page.url.searchParams.get('e') ?? 1) || 1;
		title = await catalog.detail(id, type);
		if (title) {
			trackEvent('play', title.id);
			similar = await catalog.similar(title);
		}
	});
</script>

{#if title}
	<h1 class="t">{title.name}{#if title.type === 'tv'} <span class="muted">· S{season} E{episode}</span>{/if}</h1>
	<Player {title} {season} {episode} />
	<div class="btns">
		<button class="btn ico" class:on={store.personal.liked.includes(title.id)} onclick={() => title && store.toggleLiked(title.id)} aria-label={store.personal.liked.includes(title.id) ? 'Liked' : 'Like'} title={store.personal.liked.includes(title.id) ? 'Liked' : 'Like'} aria-pressed={store.personal.liked.includes(title.id)}><Icon name="heart" filled={store.personal.liked.includes(title.id)} /></button>
		<button class="btn ico" class:on={store.personal.watchlist.includes(title.id)} onclick={() => title && store.toggleWatchlist(title.id)} aria-label={store.personal.watchlist.includes(title.id) ? 'In My List' : 'Add to My List'} title={store.personal.watchlist.includes(title.id) ? 'In My List' : 'Add to My List'} aria-pressed={store.personal.watchlist.includes(title.id)}><Icon name={store.personal.watchlist.includes(title.id) ? 'check' : 'bookmark'} /></button>
		<button class="btn ico" onclick={() => title && store.markWatched(title.id)} aria-label="Mark watched" title="Mark watched"><Icon name="eye" /></button>
		{#if title && dlOptions.length}
			<button class="btn ico" onclick={() => { if (title) { store.recordDownload(title.id); trackEvent('download', title.id); window.open(dlOptions[0].url, '_blank', 'noopener'); } }} aria-label={`Download this ${title.type === 'tv' ? 'episode' : 'movie'} · free`} title="Download · free"><Icon name="download" /></button>
		{/if}
		<a class="btn ico" href={`/title/${title.id}?type=${title.type}`} aria-label="Details" title="Details"><Icon name="info" /></a>
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
</style>
