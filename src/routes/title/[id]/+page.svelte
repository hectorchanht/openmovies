<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import { TmdbCatalog } from '$lib/tmdb';
	import { downloadOptions } from '$lib/providers';
	import { trackEvent } from '$lib/api';
	import { store } from '$lib/store.svelte';
	import type { Title } from '$lib/types';

	const catalog = new TmdbCatalog(import.meta.env.PUBLIC_TMDB_API_KEY as string | undefined);
	let title = $state<Title | null>(null);
	let similar = $state<Title[]>([]);
	let missing = $state(false);

	onMount(async () => {
		const id = Number(page.params.id);
		const type = (page.url.searchParams.get('type') === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
		title = await catalog.detail(id, type);
		if (!title) { missing = true; return; }
		trackEvent('detail', title.id);
		similar = await catalog.similar(title);
	});

	const liked = $derived(title ? store.personal.liked.includes(title.id) : false);
	const listed = $derived(title ? store.personal.watchlist.includes(title.id) : false);
	const watched = $derived(title ? store.personal.watched.includes(title.id) : false);
	// Download shows only when a provider really exposes a download URL for
	// this title (capability flag in the provider registry). Always free.
	const downloads = $derived(title ? downloadOptions({ id: title.id, type: title.type }) : []);
	function startDownload() {
		if (!title || !downloads.length) return;
		store.recordDownload(title.id);
		trackEvent('download', title.id);
		window.open(downloads[0].url, '_blank', 'noopener');
	}
</script>

{#if missing}
	<h1>Not found</h1>
	<p class="muted">That title is not in the catalogue. <a href="/browse" style="text-decoration:underline">Browse everything →</a></p>
{:else if title}
	<section class="head" style={`background:${title.art}`}>
		<div class="head-in">
			<span class="pill">{title.type === 'tv' ? `TV · ${title.seasons ?? 1} season${(title.seasons ?? 1) > 1 ? 's' : ''}` : `Movie · ${title.runtimeMin ?? '—'} min`}</span>
			<h1>{title.name}</h1>
			<p class="muted">{title.year} · ★ {title.rating.toFixed(1)} · {title.genres.join(' · ')}</p>
			<p class="ov">{title.overview}</p>
			<div class="btns">
				<a class="btn primary" href={`/watch/${title.id}?type=${title.type}`}>▶ Play</a>
				<button class="btn" class:on={liked} onclick={() => title && store.toggleLiked(title.id)}>{liked ? '♥ Liked' : '♡ Like'}</button>
				<button class="btn" class:on={listed} onclick={() => title && store.toggleWatchlist(title.id)}>{listed ? '✓ In My List' : '+ My List'}</button>
				{#if downloads.length}
					<button class="btn" onclick={startDownload}>⬇ Download · free</button>
				{/if}
				{#if watched}<span class="chip on">✓ Watched</span>{/if}
			</div>
		</div>
	</section>

	{#if title.type === 'tv' && title.episodes?.length}
		<div class="row-head"><h2>Episodes · Season 1</h2></div>
		<div class="eps">
			{#each title.episodes as ep}
				<a class="panel ep" href={`/watch/${title.id}?type=tv&s=${ep.season}&e=${ep.episode}`}>
					<strong>S{ep.season} E{ep.episode} · {ep.title}</strong>
					<span class="muted small">{ep.runtimeMin} min</span>
					<span class="btn primary play">Play</span>
				</a>
			{/each}
		</div>
	{/if}

	{#if similar.length}
		<div class="row-head"><h2>More Like This</h2></div>
		<div class="scroller">{#each similar as t}<PosterCard title={t} />{/each}</div>
	{/if}
{:else}
	<p class="muted">Loading…</p>
{/if}

<style>
	.head { border-radius: 18px; margin-top: 18px; border: 1px solid var(--line); overflow: hidden; }
	.head-in { padding: 26px 22px; max-width: 680px; background: rgba(5, 6, 12, 0.5); }
	h1 { font-size: clamp(26px, 5vw, 40px); margin: 10px 0 6px; letter-spacing: -0.02em; }
	.ov { line-height: 1.55; }
	.btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; align-items: center; }
	.eps { display: grid; gap: 10px; }
	.ep { display: flex; align-items: center; gap: 12px; }
	.ep .play { margin-left: auto; padding: 7px 14px; font-size: 13px; }
</style>
