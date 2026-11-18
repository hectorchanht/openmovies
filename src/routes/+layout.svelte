<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	import { store } from '$lib/store.svelte';
	import { onMount } from 'svelte';
	let { children } = $props();
	onMount(() => store.load());
</script>

<Nav />
<main class="wrap">
	{@render children()}
	<footer class="foot">
		<p class="small muted">
			OpenMovies by Dawn Studio — free, no ads, no pop-ups. Watching never needs an account.
			<a href="/privacy">Privacy</a> · <a href="/gateway">Gateway &amp; official domains</a>
		</p>
	</footer>
</main>

<style>
	.foot { margin-top: 48px; border-top: 1px solid var(--line); padding-top: 16px; }
	.foot a { text-decoration: underline; }
</style>
