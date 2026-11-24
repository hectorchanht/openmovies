<script lang="ts">
	import { onMount } from 'svelte';
	import { requestCode, verifyCode, apiConfigured } from '$lib/api';
	import { store } from '$lib/store.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let email = $state('');
	let code = $state('');
	let stage = $state<'email' | 'code' | 'local' | 'done'>('email');
	let msg = $state('');

	onMount(() => { if (store.signedIn) stage = 'done'; });

	async function send() {
		msg = '';
		const r = await requestCode(email.trim());
		if (r.ok) { stage = 'code'; msg = 'Code sent — check your inbox. It expires in 10 minutes.'; }
		else if (r.reason === 'mail-not-configured' || r.reason === 'not-configured') {
			stage = 'local';
			msg = 'Email sign-in is not switched on yet on this home. You can still create a free on-device profile below — watching never needs an account.';
		} else if (r.reason === 'rate-limited') msg = 'One code per minute — wait a moment and try again.';
		else msg = 'Something went wrong sending the code. Try again.';
	}

	async function verify() {
		const r = await verifyCode(email.trim(), code.trim());
		if (r) { await store.signIn(email.trim(), r.token); stage = 'done'; }
		else msg = 'That code did not check out. Codes expire after 10 minutes and 5 tries.';
	}

	function localProfile() {
		// On-device profile: data is keyed to this name on this device only.
		void store.signIn(email.trim() || 'local-profile', 'local');
		stage = 'done';
	}
</script>

<h1>Sign in — free, forever</h1>
<p class="muted">No password. No payment. Your account exists <strong>only</strong> for your personal stuff: watched, liked, Continue Watching resume and watchlist. Watching itself never needs an account.</p>

{#if stage === 'done'}
	<div class="panel verdict-official">
		<strong>You're in{store.session?.email ? ` as ${store.session.email}` : ''}.</strong>
		<p class="small muted">Your lists follow you — across devices, and across domains if OpenMovies ever has to move home.</p>
		<a class="btn primary ico" href="/my" aria-label="Go to My List" title="Go to My List"><Icon name="bookmark" /></a>
	</div>
{:else if stage === 'code'}
	<div class="panel">
		<p>{msg}</p>
		<input type="text" inputmode="numeric" placeholder="6-digit code" bind:value={code} aria-label="6-digit code" />
		<button class="btn primary ico" onclick={verify} disabled={code.trim().length !== 6} aria-label="Verify and sign in" title="Verify and sign in"><Icon name="login" /></button>
		{#if msg && stage === 'code' && code}<p class="small" style="color:var(--bad)">{msg}</p>{/if}
	</div>
{:else}
	<div class="panel">
		<label class="small muted">Email
			<input type="email" placeholder="you@example.com" bind:value={email} />
		</label>
		<button class="btn primary ico" onclick={send} disabled={!email.includes('@')} aria-label="Email me a sign-in code" title="Email me a sign-in code"><Icon name="mail" /></button>
		{#if msg}<p class="small muted">{msg}</p>{/if}
		{#if stage === 'local'}
			<hr />
			<button class="btn ico" onclick={localProfile} aria-label="Continue with an on-device profile instead" title="Continue with an on-device profile instead"><Icon name="smartphone" /></button>
			<p class="small muted">On-device profiles keep your lists on this browser only, under the name above. {apiConfigured() ? '' : ''}</p>
		{/if}
	</div>
{/if}

<style>
	h1 { letter-spacing: -0.02em; }
	.panel { display: grid; gap: 12px; max-width: 520px; }
	hr { border: 0; border-top: 1px solid var(--line); width: 100%; }
</style>
