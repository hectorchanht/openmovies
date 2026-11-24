<script lang="ts">
	import { checkDomain, FAKE_WARNINGS, OFFICIAL_HOMES } from '$lib/checker';
	import Icon from '$lib/components/Icon.svelte';

	let input = $state('');
	const verdict = $derived(input.trim() ? checkDomain(input) : null);
	const moves = [
		{ date: 'Launch', home: 'openmovies.dawnstudio.app', note: 'First home — a Dawn Studio subdomain, so no domain purchase stands between you and watching.' }
	];
</script>

<h1>Gateway — Built to Move House</h1>
<p class="muted">Free streaming sites get taken down and have to move. OpenMovies is built for that from day one: <strong>this app's permanent address book is the Dawn Free Port at <span class="mono">dawnstudio.app/gateway</span></strong>, which lists the current home of every Dawn free app. Bookmark that hub — if this home ever disappears, the new home is announced there and nowhere else. Your account and lists move with the site; you just sign in at the new address.</p>

<div class="panel verdict-official">
	<span class="pill">Current official home</span>
	<p class="home">{OFFICIAL_HOMES[0]}</p>
	<a class="btn primary ico" href="/" aria-label="Enter OpenMovies" title="Enter OpenMovies"><Icon name="home" /></a>
	<button class="btn ico" onclick={() => navigator.clipboard?.writeText(`https://${OFFICIAL_HOMES[0]}`)} aria-label="Copy address" title="Copy address"><Icon name="copy" /></button>
</div>

<h2>Check a domain</h2>
<p class="small muted">Found an “OpenMovies” site somewhere else? Check it before you sign in.</p>
<div class="checker">
	<input type="text" placeholder="e.g. openmovies.buzz" bind:value={input} aria-label="Domain to check" />
</div>
{#if verdict}
	<div class="panel" class:verdict-official={verdict.kind === 'official' || verdict.kind === 'gateway'} class:verdict-lookalike={verdict.kind === 'lookalike' || verdict.kind === 'unknown'}>
		<strong>{verdict.kind === 'official' || verdict.kind === 'gateway' ? '✓ ' : '✕ '}{verdict.message}</strong>
	</div>
{/if}

<h2>Fake sites — the rules</h2>
<ul class="warn">
	{#each FAKE_WARNINGS as w}<li>{w}</li>{/each}
</ul>

<h2>If this home disappears</h2>
<ol class="steps">
	<li>Go to the Dawn Free Port (<span class="mono">dawnstudio.app/gateway</span>) — the new home is listed there first.</li>
	<li>Verify the new address with the checker above before signing in.</li>
	<li>Sign in with the same email — watched, liked, resume and watchlist are waiting for you.</li>
</ol>

<h2>Move log</h2>
<div class="eps">
	{#each moves as m}
		<div class="panel"><strong>{m.date} — {m.home}</strong><p class="small muted">{m.note}</p></div>
	{/each}
</div>
<p class="small muted">This log shows real moves only, starting with the launch above — no invented history.</p>

<div class="panel">
	<h2 style="margin-top:0">No Discord — yet</h2>
	<p class="small muted">OpenMovies is run solo, and there is no time to moderate a community properly, so there is <strong>no official Discord</strong> — anyone running one under our name is not us. If a volunteer ever steps up as a free mod/admin, a community channel may open, and it will be announced on the Dawn Free Port first. Until then, the Free Port is the only announcement channel.</p>
</div>

<style>
	h1 { letter-spacing: -0.02em; }
	.home { font-size: 22px; font-weight: 800; margin: 8px 0 12px; }
	.mono { font-family: ui-monospace, monospace; }
	.checker { max-width: 480px; margin-bottom: 12px; }
	.warn li, .steps li { margin-bottom: 8px; line-height: 1.5; }
	.eps { display: grid; gap: 10px; margin-bottom: 10px; }
</style>
