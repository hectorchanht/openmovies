<script lang="ts">
	import { onMount } from 'svelte';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { TmdbCatalog } from '$lib/tmdb';
	import { continueWatching } from '$lib/personal';
	import { store } from '$lib/store.svelte';
	import type { Title } from '$lib/types';

	const catalog = new TmdbCatalog(import.meta.env.PUBLIC_TMDB_API_KEY as string | undefined);
	// G2 (2026-11-20): homepage rows are separate real feeds — trending
	// movies, trending TV, and TMDB's real top_rated — not one shared
	// trending pool sliced/sorted client-side.
	let heroPool = $state<Title[]>([]);
	let movieRow = $state<Title[]>([]);
	let tvRow = $state<Title[]>([]);
	let topRatedRow = $state<Title[]>([]);
	let searchPool = $state<Title[] | null>(null);
	let source = $state<'tmdb' | 'demo'>('demo');
	let query = $state('');

	onMount(async () => {
		const [all, movies, shows, topMovies, topShows] = await Promise.all([
			catalog.trending(),
			catalog.trendingMovies(),
			catalog.trendingTv(),
			catalog.topRated('movie'),
			catalog.topRated('tv')
		]);
		heroPool = all.titles; source = all.source;
		movieRow = movies.titles;
		tvRow = shows.titles;
		// Real top_rated from both media types, merged by rating.
		topRatedRow = [...topMovies.titles, ...topShows.titles].sort((a, b) => b.rating - a.rating).slice(0, 20);
	});

	// Lookup pool for Continue Watching / Because You Watched: every row
	// plus any search results, deduped by type+id.
	const allTitles = $derived.by(() => {
		const seen = new Map<string, Title>();
		for (const t of [...heroPool, ...movieRow, ...tvRow, ...topRatedRow, ...(searchPool ?? [])]) {
			if (!seen.has(`${t.type}:${t.id}`)) seen.set(`${t.type}:${t.id}`, t);
		}
		return [...seen.values()];
	});
	const byId = (id: number) => allTitles.find((t) => t.id === id);
	const cw = $derived(continueWatching(store.personal));
	const featured = $derived(heroPool[0]);
	const movies = $derived(searchPool ? searchPool.filter((t) => t.type === 'movie') : movieRow);
	const shows = $derived(searchPool ? searchPool.filter((t) => t.type === 'tv') : tvRow);
	const because = $derived.by(() => {
		const last = cw[0] ? byId(cw[0].titleId) : undefined;
		if (!last) return [] as Title[];
		return allTitles.filter((t) => t.id !== last.id && t.genres.some((g) => last.genres.includes(g))).slice(0, 8);
	});

	async function doSearch() {
		if (!query.trim()) { searchPool = null; return; }
		const c = await catalog.search(query);
		searchPool = c.titles; source = c.source;
	}
</script>

{#if featured}
	<section class="hero" style={`background:${featured.art}`}>
		<div class="hero-in">
			<span class="pill">Featured · {featured.type === 'tv' ? 'TV Show' : 'Movie'}</span>
			<h1>{featured.name}</h1>
			<p>{featured.overview}</p>
			<p class="muted small">{featured.year} · ★ {featured.rating.toFixed(1)} · {featured.genres.join(' · ')}</p>
			<div class="hero-btns">
				<a class="btn primary ico" href={`/watch/${featured.id}?type=${featured.type}`} aria-label="Play" title="Play"><Icon name="play" /></a>
				<button class="btn ico" class:on={store.personal.watchlist.includes(featured.id)} onclick={() => store.toggleWatchlist(featured.id)} aria-label={store.personal.watchlist.includes(featured.id) ? 'In My List' : 'Add to My List'} title={store.personal.watchlist.includes(featured.id) ? 'In My List' : 'Add to My List'}><Icon name={store.personal.watchlist.includes(featured.id) ? 'check' : 'bookmark'} /></button>
				<a class="btn ico" href={`/title/${featured.id}?type=${featured.type}`} aria-label="More info" title="More info"><Icon name="info" /></a>
			</div>
		</div>
	</section>
{/if}

<form class="searchbar" onsubmit={(e) => { e.preventDefault(); void doSearch(); }}>
	<input type="text" placeholder="Search movies & TV shows…" bind:value={query} aria-label="Search" />
	<button class="btn primary ico" type="submit" aria-label="Search" title="Search"><Icon name="search" /></button>
</form>
{#if source === 'demo'}<p class="small muted">Showing the demo catalogue — live TMDB data appears here once a TMDB API key is configured. Playback, resume and your lists already work.</p>{/if}

{#if cw.length}
	<div class="row-head"><h2>Continue Watching</h2><a href="/my" aria-label="My List" title="My List"><Icon name="arrowRight" /></a></div>
	<div class="scroller">
		{#each cw as e}{#if byId(e.titleId)}<PosterCard title={byId(e.titleId)!} resume={e} />{/if}{/each}
	</div>
{/if}

{#if because.length}
	<div class="row-head"><h2>Because You Watched</h2></div>
	<div class="scroller">{#each because as t}<PosterCard title={t} />{/each}</div>
{/if}

<div class="row-head"><h2>Trending Movies</h2><a href="/browse?type=movie" aria-label="Browse all movies" title="Browse all"><Icon name="arrowRight" /></a></div>
<div class="scroller">{#each movies as t}<PosterCard title={t} />{/each}</div>

<div class="row-head"><h2>Trending Series</h2><a href="/browse?type=tv" aria-label="Browse all series" title="Browse all"><Icon name="arrowRight" /></a></div>
<div class="scroller">{#each shows as t}<PosterCard title={t} />{/each}</div>

{#if !searchPool}
	<div class="row-head"><h2>Top Rated</h2></div>
	<div class="scroller">{#each topRatedRow as t}<PosterCard title={t} />{/each}</div>
{/if}

<style>
	.hero { border-radius: 18px; margin-top: 18px; border: 1px solid var(--line); overflow: hidden; }
	.hero-in { padding: 28px 22px; max-width: 640px; background: rgba(5, 6, 12, 0.45); }
	.hero h1 { font-size: clamp(28px, 6vw, 46px); margin: 10px 0 8px; letter-spacing: -0.02em; }
	.hero p { line-height: 1.5; }
	.hero-btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
	.searchbar { display: flex; gap: 10px; margin-top: 18px; }
	.searchbar input { flex: 1; }
</style>
