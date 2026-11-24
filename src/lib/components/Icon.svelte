<script lang="ts">
	// Shared singleton icon set (Dawn-Design §8 v1.6 icon sweep, 2026-11-23):
	// Lucide-style inline SVG — 24 viewBox, stroke=currentColor, stroke-width 2,
	// round caps/joins. Fixed size only (20 default, 28 for `big`): icons never
	// stretch their control. Decorative by default (aria-hidden); the owning
	// control carries the accessible name via aria-label/title.
	let { name, big = false, filled = false }: { name: string; big?: boolean; filled?: boolean } = $props();
	const paths: Record<string, string> = {
		home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22v-10h6v10"/>',
		grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
		bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
		globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
		login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
		logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
		search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
		info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
		check: '<path d="M20 6 9 17l-5-5"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
		arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
		mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
		smartphone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/>',
		copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
		shield: '<path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z"/>',
		eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
		film: '<rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
		tv: '<rect x="2" y="7" width="20" height="15" rx="2"/><path d="m17 2-5 5-5-5"/>',
		megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
		cc: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10.5 10.2A2.3 2.3 0 0 0 8.6 9.5c-1.2 0-2.1 1.1-2.1 2.5s.9 2.5 2.1 2.5a2.3 2.3 0 0 0 1.9-.7M19 10.2a2.3 2.3 0 0 0-1.9-.7c-1.2 0-2.1 1.1-2.1 2.5s.9 2.5 2.1 2.5a2.3 2.3 0 0 0 1.9-.7"/>'
	};
	const solid: Record<string, string> = {
		play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/>',
		pause: '<rect x="5" y="4" width="4.5" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14.5" y="4" width="4.5" height="16" rx="1" fill="currentColor" stroke="none"/>',
		heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>'
	};
	const size = $derived(big ? 28 : 20);
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill={filled && solid[name] ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="flex:none;display:block">{@html solid[name] ?? paths[name] ?? ''}</svg>
