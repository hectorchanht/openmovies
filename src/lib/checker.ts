/**
 * Domain checker — the anti-fake core of the survival kit.
 * Official homes are an explicit allowlist. Anything else that *looks* like
 * us (name patterns, look-alike TLDs) is flagged; unknown domains are simply
 * "not official" — the rule taught everywhere on the gateway page:
 * if it is not listed, it is not OpenMovies.
 */
export const OFFICIAL_HOMES = ['openmovies.dawnstudio.app'] as const;
export const GATEWAY_HOMES = ['dawnstudio.app'] as const; // the Dawn gateway hub lists every app's current home

export type Verdict = { kind: 'official' | 'gateway' | 'lookalike' | 'unknown'; message: string };

const LOOKALIKE_PATTERNS = [/openmovies/i, /open-movies/i, /openmovie[^s]/i, /0penmovies/i, /openmovies-/i];

export function normalizeHost(input: string): string {
	let h = input.trim().toLowerCase();
	h = h.replace(/^https?:\/\//, '').replace(/^www\./, '');
	h = h.split('/')[0].split('?')[0].split(':')[0];
	return h;
}

export function checkDomain(input: string): Verdict {
	const host = normalizeHost(input);
	if (!host) return { kind: 'unknown', message: 'Enter a domain to check it.' };
	if ((OFFICIAL_HOMES as readonly string[]).includes(host))
		return { kind: 'official', message: `${host} is an official OpenMovies home.` };
	if ((GATEWAY_HOMES as readonly string[]).includes(host) || host.endsWith('.dawnstudio.app'))
		return { kind: 'gateway', message: `${host} is a Dawn Studio home — the Dawn Free Port there lists our current address.` };
	if (LOOKALIKE_PATTERNS.some((re) => re.test(host)))
		return {
			kind: 'lookalike',
			message: `Not official. ${host} uses our name but is not listed on the gateway — do not sign in there, and never enter a code or password.`
		};
	return { kind: 'unknown', message: `Not official. ${host} is not on the official list. If it is not listed on the gateway, it is not OpenMovies.` };
}

/** Fake-pattern warnings shown verbatim on the gateway page. */
export const FAKE_WARNINGS = [
	'Any site with pop-ups, redirects or download-this-player prompts is not us — the real OpenMovies has no ads.',
	'Any app-store app using our name is not us — OpenMovies runs in your browser; add it to your home screen instead.',
	'We never ask for payment, a card, or your email password. Sign-in is a 6-digit code we email you, nothing else.',
	'If a domain is not listed on the Dawn Free Port, it is not OpenMovies.'
] as const;
