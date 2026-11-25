import { providerById } from './providers';

/**
 * Cover-flight embed warming (Hector 2026-11-24 19:57): the flight
 * animation itself lives on the watch page (the tapped card records
 * its cover rect in the store — see PosterCard + store.startFlight);
 * THIS module is the other half of the effect: the fastest source
 * starts loading AT TAP TIME, in parallel with the flight, not after
 * navigation. warmEmbed starts a real load of the default provider's
 * embed for the tapped title in a hidden offscreen frame, so DNS/TLS,
 * the provider shell and its source scan are already warm when the
 * watch page mounts its own player frame against the same origin —
 * by the time the cover lands, the movie is already playing
 * ("一打開就已經正在播放"). It is a preload, not a hidden player:
 * one frame at a time, self-removing, never audible/visible.
 * DOM-light (document injected) so the URL building is testable.
 */

/** The embed URL the flight warms: the DEFAULT provider (BingeAPI),
 * built directly — the exact URL the watch page will load (ruling 3
 * direct-connect), so the warm-up is for the real thing. TV warms the
 * tapped episode when the card knows it (Continue Watching), else
 * S1E1. */
export function flightEmbedUrlFor(
	t: { id: number; type: 'movie' | 'tv' },
	ep?: { season?: number; episode?: number }
): string {
	return providerById('bingeapi').build({
		id: t.id,
		type: t.type,
		season: ep?.season ?? 1,
		episode: ep?.episode ?? 1
	});
}

interface WarmDoc {
	createElement(tag: 'iframe'): HTMLIFrameElement;
	body: { appendChild(n: HTMLIFrameElement): void };
}

let warmFrame: HTMLIFrameElement | null = null;
let warmTimer: ReturnType<typeof setTimeout> | undefined;

function stopWarm(): void {
	if (warmTimer !== undefined) {
		clearTimeout(warmTimer);
		warmTimer = undefined;
	}
	if (warmFrame) {
		try {
			warmFrame.remove();
		} catch {
			/* already gone */
		}
		warmFrame = null;
	}
}

function defaultDoc(): WarmDoc | null {
	try {
		return typeof document !== 'undefined' ? (document as unknown as WarmDoc) : null;
	} catch {
		return null;
	}
}

/**
 * Start loading an embed NOW, offscreen. A new tap replaces the
 * previous warm frame; a safety timeout removes it so it can never
 * linger unseen.
 */
export function warmEmbed(url: string, doc: WarmDoc | null = defaultDoc()): void {
	if (!doc) return;
	stopWarm();
	const f = doc.createElement('iframe');
	f.src = url;
	f.setAttribute('aria-hidden', 'true');
	f.setAttribute('tabindex', '-1');
	f.style.cssText =
		'position:fixed;left:-10000px;top:0;width:320px;height:180px;border:0;visibility:hidden;pointer-events:none;';
	doc.body.appendChild(f);
	warmFrame = f;
	warmTimer = setTimeout(stopWarm, 20_000);
}
