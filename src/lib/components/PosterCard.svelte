<script lang="ts">
	import { posterUrl } from '$lib/tmdb';
	import { progressOf } from '$lib/types';
	import type { ResumeEntry, Title } from '$lib/types';

	let { title, resume }: { title: Title; resume?: ResumeEntry } = $props();
	const poster = $derived(posterUrl(title));
	const pct = $derived(resume ? Math.round(progressOf(resume) * 100) : 0);
</script>

<!-- One tap = play (Hector 2026-11-24): a card goes STRAIGHT to the
     watch page, where the player loads and autoplays — no intermediate
     detail page, no manual Play step. Details stay one tap away from
     the watch page's Details button. -->
<a class="card" href={`/watch/${title.id}?type=${title.type}`}>
	<div class="poster" style={`background:${title.art}`}>
		{#if poster}<img src={poster} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{/if}
		<span class="ptitle">{title.name}</span>
		<span class="badge">{title.type === 'tv' ? 'TV' : 'Movie'}</span>
		{#if resume}<span class="bar"><span style={`width:${pct}%`}></span></span>{/if}
	</div>
	<div class="meta">
		<strong>{title.name}</strong>
		<span class="muted small">{title.year} · ★ {title.rating.toFixed(1)}{#if resume} · {pct}%{/if}</span>
	</div>
</a>

<style>
	.card { display: block; }
	.poster {
		position: relative; aspect-ratio: 2/3; border-radius: 12px; overflow: hidden;
		display: flex; align-items: flex-end; padding: 10px; border: 1px solid var(--line);
	}
	.poster img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.ptitle { position: relative; font-weight: 800; font-size: 15px; line-height: 1.15; text-shadow: 0 1px 8px rgba(0,0,0,0.6); }
	.badge { position: absolute; top: 8px; left: 8px; font-size: 10px; font-weight: 800; letter-spacing: 0.05em; background: rgba(0,0,0,0.55); padding: 3px 7px; border-radius: 6px; }
	.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,0.25); }
	.bar span { display: block; height: 100%; background: var(--accent); }
	.meta { display: grid; gap: 2px; margin-top: 8px; }
	.meta strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
