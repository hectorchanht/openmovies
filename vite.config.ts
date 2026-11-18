import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	// src/lib/api.ts reads import.meta.env.PUBLIC_API_BASE. Vite's default
	// envPrefix (VITE_) filters PUBLIC_* out of import.meta.env, so a build
	// with PUBLIC_API_BASE set still baked an EMPTY env object and the web
	// client silently ran API-less (2026-11-18 incident). PUBLIC_* is
	// client-public by SvelteKit convention, so exposing it here is safe.
	envPrefix: ['VITE_', 'PUBLIC_'],
	test: {
		include: ['src/**/*.{test,spec}.ts', 'worker/**/*.{test,spec}.ts'],
		environment: 'node'
	}
});
