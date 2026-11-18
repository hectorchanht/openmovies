import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Deployment note (v1): the app is a client-rendered SPA — all metadata comes
 * from the TMDB adapter (or the bundled demo dataset) in the browser, and all
 * server logic (auth codes, per-user sync, analytics) lives in the standalone
 * openmovies-api Worker (see worker/). That lets the web tier ship through
 * Dawn Studio's proven Pages direct-upload route. adapter-cloudflare is kept
 * in devDependencies: switching `adapter-static` -> `adapter-cloudflare` is a
 * one-line change if/when SSR routes are ever needed.
 */
/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ fallback: 'index.html' }),
		prerender: { entries: [] }
	}
};

export default config;
