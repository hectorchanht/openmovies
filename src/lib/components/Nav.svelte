<script lang="ts">
	import { page } from '$app/state';
	import { store } from '$lib/store.svelte';

	const tabs = [
		{ href: '/', label: 'Home' },
		{ href: '/browse', label: 'Browse' },
		{ href: '/my', label: 'My List' },
		{ href: '/gateway', label: 'Gateway' }
	];
	const active = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<header class="topbar">
	<a class="brand" href="/">Open<span>Movies</span></a>
	<nav class="toplinks">
		{#each tabs as t}<a class:on={active(t.href)} href={t.href}>{t.label}</a>{/each}
	</nav>
	{#if store.signedIn}
		<a class="who" href="/my">{store.session?.email}</a>
	{:else}
		<a class="btn primary signin" href="/signin">Sign in free</a>
	{/if}
</header>

<nav class="bottombar" aria-label="Primary">
	{#each tabs as t}<a class:on={active(t.href)} href={t.href}>{t.label}</a>{/each}
</nav>

<style>
	.topbar {
		position: sticky; top: 0; z-index: 40; display: flex; align-items: center; gap: 18px;
		padding: 12px 16px; background: rgba(11, 14, 23, 0.92); backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--line);
	}
	.brand { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
	.brand span { color: var(--accent); }
	.toplinks { display: none; gap: 16px; margin-left: 8px; }
	.toplinks a { color: var(--muted); font-weight: 600; font-size: 14px; }
	.toplinks a.on { color: var(--text); }
	.who { margin-left: auto; color: var(--muted); font-size: 13px; max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.signin { margin-left: auto; padding: 7px 14px; font-size: 14px; }
	@media (min-width: 760px) {
		.toplinks { display: flex; }
		.signin, .who { margin-left: auto; }
	}
	.bottombar {
		position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: grid; grid-template-columns: repeat(4, 1fr);
		background: rgba(11, 14, 23, 0.96); border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom);
	}
	.bottombar a { text-align: center; padding: 12px 4px; font-size: 13px; font-weight: 700; color: var(--muted); min-height: 48px; }
	.bottombar a.on { color: var(--accent-soft); }
	@media (min-width: 760px) { .bottombar { display: none; } }
</style>
