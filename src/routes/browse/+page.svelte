<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { filterTitles, TmdbCatalog } from '$lib/tmdb';
	import { ALL_GENRES } from '$lib/demo-data';
	import type { Title } from '$lib/types';

	const catalog = new TmdbCatalog(import.meta.env.PUBLIC_TMDB_API_KEY as string | undefined);
	let titles = $state<Title[]>([]);
	let type = $state<'all' | 'movie' | 'tv'>('all');
	let genre = $state('All');
	let query = $state('');

	onMount(async () => {
		const t = page.url.searchParams.get('type');
		if (t === 'movie' || t === 'tv') type = t;
		titles = (await catalog.trending()).titles;
	});

	const shown = $derived(filterTitles(titles, { type, genre, query }));
	const genres = $derived([...new Set([...ALL_GENRES, ...titles.flatMap((t) => t.genres)])].sort());
</script>

<h1>Browse</h1>
<div class="filters">
	<div class="group" role="group" aria-label="Type">
		{#each [{ v: 'all', label: 'All', icon: 'grid' }, { v: 'movie', label: 'Movies', icon: 'film' }, { v: 'tv', label: 'TV Shows', icon: 'tv' }] as o}
			<button class="chip ico" class:on={type === o.v} onclick={() => (type = o.v as typeof type)} aria-label={o.label} title={o.label} aria-pressed={type === o.v}><Icon name={o.icon} /></button>
		{/each}
	</div>
	<input type="text" placeholder="Filter by name…" bind:value={query} aria-label="Filter by name" />
</div>
<div class="group genres" role="group" aria-label="Genre">
	<button class="chip" class:on={genre === 'All'} onclick={() => (genre = 'All')}>All genres</button>
	{#each genres as g}<button class="chip" class:on={genre === g} onclick={() => (genre = g)}>{g}</button>{/each}
</div>

{#if shown.length}
	<div class="grid">{#each shown as t}<PosterCard title={t} />{/each}</div>
{:else}
	<p class="muted">Nothing matches that filter yet.</p>
{/if}

<style>
	h1 { letter-spacing: -0.02em; }
	.filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
	.filters input { flex: 1; min-width: 180px; width: auto; }
	.group { display: flex; flex-wrap: wrap; gap: 8px; }
	.genres { margin-bottom: 18px; }
</style>
