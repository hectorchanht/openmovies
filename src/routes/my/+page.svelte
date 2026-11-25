<script lang="ts">
	import { onMount } from 'svelte';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import { TmdbCatalog } from '$lib/tmdb';
	import { continueWatching } from '$lib/personal';
	import { achievementsFor } from '$lib/types';
	import { store } from '$lib/store.svelte';
	import type { Title } from '$lib/types';

	const catalog = new TmdbCatalog(import.meta.env.PUBLIC_TMDB_API_KEY as string | undefined);
	let titles = $state<Title[]>([]);
	onMount(async () => { titles = (await catalog.trending()).titles; });

	const pick = (ids: number[]) => ids.map((id) => titles.find((t) => t.id === id)).filter((t): t is Title => !!t);
	const cw = $derived(continueWatching(store.personal));
	const achievements = $derived(achievementsFor(store.personal));
</script>

<h1>My List</h1>
{#if store.signedIn}
	<p class="muted small">Signed in as {store.session?.email} — your lists sync across devices and follow you if OpenMovies ever moves home. <button class="chip" onclick={() => store.signOut()}>Sign out</button></p>
{:else}
	<div class="panel">
		<strong>Guest mode — this device only.</strong>
		<p class="small muted">Watching never needs an account. A free account exists only to keep your watched list, liked titles, resume points and watchlist in sync — <a href="/signin" style="text-decoration:underline">sign in free</a>. No payment, ever.</p>
	</div>
{/if}

{#if cw.length}
	<div class="row-head"><h2>Continue Watching</h2></div>
	<div class="grid">
		{#each cw as e}{#if pick([e.titleId])[0]}<PosterCard title={pick([e.titleId])[0]} resume={e} />{/if}{/each}
	</div>
{/if}

<div class="row-head"><h2>Watchlist</h2></div>
{#if pick(store.personal.watchlist).length}<div class="grid">{#each pick(store.personal.watchlist) as t}<PosterCard title={t} />{/each}</div>{:else}<p class="muted small">Nothing saved yet — tap “+ My List” on any title.</p>{/if}

<div class="row-head"><h2>Liked</h2></div>
{#if pick(store.personal.liked).length}<div class="grid">{#each pick(store.personal.liked) as t}<PosterCard title={t} />{/each}</div>{:else}<p class="muted small">Titles you like will live here.</p>{/if}

<div class="row-head"><h2>Watched</h2></div>
{#if pick(store.personal.watched).length}<div class="grid">{#each pick(store.personal.watched) as t}<PosterCard title={t} />{/each}</div>{:else}<p class="muted small">Finished titles collect here automatically.</p>{/if}

<div class="row-head"><h2>Downloads</h2></div>
{#if pick(store.personal.downloads).length}<div class="grid">{#each pick(store.personal.downloads) as t}<PosterCard title={t} />{/each}</div><p class="muted small">Titles you started a download for — the files themselves live on your device. Downloads are always free.</p>{:else}<p class="muted small">Downloads you start will be listed here. Always free — no gate, no tip jar.</p>{/if}

<div class="row-head"><h2>Achievements</h2></div>
<div class="ach">
	{#each achievements as a}
		<div class="panel ach-card" class:earned={a.earned}>
			<strong>{a.label}</strong>
			<span class="small muted">{a.earned ? 'Earned' : 'Not yet'}</span>
		</div>
	{/each}
</div>

<style>
	h1 { letter-spacing: -0.02em; }
	.ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
	.ach-card { display: grid; gap: 4px; opacity: 0.55; }
	.ach-card.earned { opacity: 1; border-color: var(--accent); }
</style>
