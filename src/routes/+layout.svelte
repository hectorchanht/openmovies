<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	import Icon from '$lib/components/Icon.svelte';
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
			<a href="/privacy" aria-label="Privacy" title="Privacy"><Icon name="shield" /></a> · <a href="/gateway" aria-label="Gateway and official domains" title="Gateway and official domains"><Icon name="globe" /></a>
		</p>
	</footer>
</main>

<style>
	.foot { margin-top: 48px; border-top: 1px solid var(--line); padding-top: 16px; }
	.foot a { text-decoration: underline; display: inline-flex; vertical-align: middle; }
</style>
