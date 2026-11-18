<script lang="ts">
	import { onMount } from 'svelte';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import { TmdbCatalog } from '$lib/tmdb';
	import { continueWatching } from '$lib/personal';
	import { store } from '$lib/store.svelte';
	import type { Title } from '$lib/types';

	const catalog = new TmdbCatalog(import.meta.env.PUBLIC_TMDB_API_KEY as string | undefined);
	let titles = $state<Title[]>([]);
	let source = $state<'tmdb' | 'demo'>('demo');
	let query = $state('');

	onMount(async () => {
		const c = await catalog.trending();
		titles = c.titles; source = c.source;
	});

	const byId = (id: number) => titles.find((t) => t.id === id);
	const cw = $derived(continueWatching(store.personal));
	const featured = $derived(titles[0]);
	const movies = $derived(titles.filter((t) => t.type === 'movie'));
	const shows = $derived(titles.filter((t) => t.type === 'tv'));
	const topRated = $derived([...titles].sort((a, b) => b.rating - a.rating).slice(0, 10));
	const because = $derived.by(() => {
		const last = cw[0] ? byId(cw[0].titleId) : undefined;
		if (!last) return [] as Title[];
		return titles.filter((t) => t.id !== last.id && t.genres.some((g) => last.genres.includes(g))).slice(0, 8);
	});

	async function doSearch() {
		const c = await catalog.search(query);
		titles = c.titles; source = c.source;
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
				<a class="btn primary" href={`/watch/${featured.id}?type=${featured.type}`}>▶ Play</a>
				<button class="btn" class:on={store.personal.watchlist.includes(featured.id)} onclick={() => store.toggleWatchlist(featured.id)}>
					{store.personal.watchlist.includes(featured.id) ? '✓ In My List' : '+ My List'}
				</button>
				<a class="btn" href={`/title/${featured.id}?type=${featured.type}`}>More info</a>
			</div>
		</div>
	</section>
{/if}

<form class="searchbar" onsubmit={(e) => { e.preventDefault(); void doSearch(); }}>
	<input type="text" placeholder="Search movies & TV shows…" bind:value={query} aria-label="Search" />
	<button class="btn primary" type="submit">Search</button>
</form>
{#if source === 'demo'}<p class="small muted">Showing the demo catalogue — live TMDB data appears here once a TMDB API key is configured. Playback, resume and your lists already work.</p>{/if}

{#if cw.length}
	<div class="row-head"><h2>Continue Watching</h2><a href="/my">My List →</a></div>
	<div class="scroller">
		{#each cw as e}{#if byId(e.titleId)}<PosterCard title={byId(e.titleId)!} resume={e} />{/if}{/each}
	</div>
{/if}

{#if because.length}
	<div class="row-head"><h2>Because You Watched</h2></div>
	<div class="scroller">{#each because as t}<PosterCard title={t} />{/each}</div>
{/if}

<div class="row-head"><h2>Trending Movies</h2><a href="/browse?type=movie">Browse all →</a></div>
<div class="scroller">{#each movies as t}<PosterCard title={t} />{/each}</div>

<div class="row-head"><h2>Trending Series</h2><a href="/browse?type=tv">Browse all →</a></div>
<div class="scroller">{#each shows as t}<PosterCard title={t} />{/each}</div>

<div class="row-head"><h2>Top Rated</h2></div>
<div class="scroller">{#each topRated as t}<PosterCard title={t} />{/each}</div>

<style>
	.hero { border-radius: 18px; margin-top: 18px; border: 1px solid var(--line); overflow: hidden; }
	.hero-in { padding: 28px 22px; max-width: 640px; background: rgba(5, 6, 12, 0.45); }
	.hero h1 { font-size: clamp(28px, 6vw, 46px); margin: 10px 0 8px; letter-spacing: -0.02em; }
	.hero p { line-height: 1.5; }
	.hero-btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
	.searchbar { display: flex; gap: 10px; margin-top: 18px; }
	.searchbar input { flex: 1; }
</style>
