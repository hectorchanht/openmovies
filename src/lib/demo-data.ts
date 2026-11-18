import type { Title } from './types';

/**
 * Demo dataset — clearly labelled in the UI as demo data.
 * Rows carry REAL TMDB ids of well-known titles so the embed providers
 * resolve actual playback, while all descriptive copy below is our own
 * one-line summary (no TMDB text is bundled). Poster art is generated CSS
 * gradients (see `art`), never hotlinked artwork. When PUBLIC_TMDB_API_KEY
 * is set, the TMDB adapter replaces this dataset entirely with live data.
 *
 * CARRIAGE AUDIT 2026-11-18 (Hector's iPad "We Couldn't Find This Content"
 * report): every id below was re-verified against TMDB, AND every row was
 * live-probed on Server 1 (VidLink) from a residential IP in a real
 * browser — all rows returned a real stream (S1E1 for TV). VidLink's
 * catalogue is spotty: Interstellar (157336), Dune: Part Two (693134),
 * Coco (354912) and Game of Thrones (1399) are NOT carried by VidLink
 * (its API returns null), so they were swapped for verified-carried
 * equivalents (Tenet, Top Gun: Maverick, Spider-Man: Across the
 * Spider-Verse, House of the Dragon). Re-audit before swapping rows back.
 */
export const DEMO_TITLES: Title[] = [
	{
		id: 27205, type: 'movie', name: 'Inception', year: 2010,
		genres: ['Sci-Fi', 'Action'], rating: 8.4, runtimeMin: 148,
		overview: 'A thief who steals secrets from inside dreams takes one last job: plant an idea instead.',
		art: 'linear-gradient(135deg,#1d2b64,#f8cd30)'
	},
	{
		id: 577922, type: 'movie', name: 'Tenet', year: 2020,
		genres: ['Sci-Fi', 'Action'], rating: 7.2, runtimeMin: 150,
		overview: 'An operative learns to move through inverted time to stop a war between the present and the future.',
		art: 'linear-gradient(135deg,#141e30,#243b55)'
	},
	{
		id: 155, type: 'movie', name: 'The Dark Knight', year: 2008,
		genres: ['Action', 'Crime'], rating: 9.0, runtimeMin: 152,
		overview: 'Batman pushes his limits against the Joker, an agent of chaos tearing Gotham apart.',
		art: 'linear-gradient(135deg,#232526,#414345)'
	},
	{
		id: 361743, type: 'movie', name: 'Top Gun: Maverick', year: 2022,
		genres: ['Action', 'Drama'], rating: 8.2, runtimeMin: 130,
		overview: 'Thirty years on, Maverick trains a new squad of pilots for a mission no pilot has ever come back from.',
		art: 'linear-gradient(135deg,#1e3c72,#2a5298)'
	},
	{
		id: 872585, type: 'movie', name: 'Oppenheimer', year: 2023,
		genres: ['Drama', 'History'], rating: 8.1, runtimeMin: 180,
		overview: 'The life of J. Robert Oppenheimer and the making of the atomic bomb.',
		art: 'linear-gradient(135deg,#3a1c71,#d76d77)'
	},
	{
		id: 496243, type: 'movie', name: 'Parasite', year: 2019,
		genres: ['Thriller', 'Drama'], rating: 8.5, runtimeMin: 132,
		overview: 'A poor family schemes its way into a wealthy household, with consequences nobody planned.',
		art: 'linear-gradient(135deg,#134e5e,#71b280)'
	},
	{
		id: 603692, type: 'movie', name: 'John Wick: Chapter 4', year: 2023,
		genres: ['Action', 'Thriller'], rating: 7.8, runtimeMin: 169,
		overview: 'John Wick fights across the world for a path out from under the High Table.',
		art: 'linear-gradient(135deg,#41295a,#2f0743)'
	},
	{
		id: 569094, type: 'movie', name: 'Spider-Man: Across the Spider-Verse', year: 2023,
		genres: ['Animation', 'Action'], rating: 8.3, runtimeMin: 140,
		overview: 'Miles Morales catapults across the multiverse and clashes with a society of Spider-People over how to save his family.',
		art: 'linear-gradient(135deg,#8e2de2,#ff6a00)'
	},
	{
		id: 1396, type: 'tv', name: 'Breaking Bad', year: 2008,
		genres: ['Drama', 'Crime'], rating: 9.5, seasons: 5,
		overview: 'A chemistry teacher turned meth maker descends into the criminal underworld.',
		art: 'linear-gradient(135deg,#0a3d2e,#1f7a4d)',
		episodes: [
			{ season: 1, episode: 1, title: 'Pilot', runtimeMin: 58 },
			{ season: 1, episode: 2, title: "Cat's in the Bag...", runtimeMin: 48 },
			{ season: 1, episode: 3, title: "...And the Bag's in the River", runtimeMin: 48 }
		]
	},
	{
		id: 94997, type: 'tv', name: 'House of the Dragon', year: 2022,
		genres: ['Drama', 'Fantasy'], rating: 8.4, seasons: 3,
		overview: 'The Targaryens at the height of their power begin a slow, fiery fall over who inherits the Iron Throne.',
		art: 'linear-gradient(135deg,#3a0d0d,#b31217)',
		episodes: [
			{ season: 1, episode: 1, title: 'The Heirs of the Dragon', runtimeMin: 66 },
			{ season: 1, episode: 2, title: 'The Rogue Prince', runtimeMin: 54 },
			{ season: 1, episode: 3, title: 'Second of His Name', runtimeMin: 63 }
		]
	},
	{
		id: 66732, type: 'tv', name: 'Stranger Things', year: 2016,
		genres: ['Sci-Fi', 'Drama'], rating: 8.6, seasons: 4,
		overview: 'A small town, a missing boy, and a parallel world leaking into ours.',
		art: 'linear-gradient(135deg,#8e0e00,#1f1c18)',
		episodes: [
			{ season: 1, episode: 1, title: 'The Vanishing of Will Byers', runtimeMin: 49 },
			{ season: 1, episode: 2, title: 'The Weirdo on Maple Street', runtimeMin: 56 },
			{ season: 1, episode: 3, title: 'Holly, Jolly', runtimeMin: 52 }
		]
	},
	{
		id: 93405, type: 'tv', name: 'Squid Game', year: 2021,
		genres: ['Drama', 'Thriller'], rating: 7.8, seasons: 3,
		overview: '456 debt-ridden players risk their lives in childhood games for a huge cash prize.',
		art: 'linear-gradient(135deg,#e91e63,#111111)',
		episodes: [
			{ season: 1, episode: 1, title: 'Red Light, Green Light', runtimeMin: 60 },
			{ season: 1, episode: 2, title: 'Hell', runtimeMin: 63 },
			{ season: 1, episode: 3, title: 'The Man with the Umbrella', runtimeMin: 55 }
		]
	},
	{
		id: 100088, type: 'tv', name: 'The Last of Us', year: 2023,
		genres: ['Drama', 'Sci-Fi'], rating: 8.6, seasons: 2,
		overview: 'Twenty years after the outbreak, a smuggler escorts a girl who might be the cure.',
		art: 'linear-gradient(135deg,#283c2a,#0d1f0c)',
		episodes: [
			{ season: 1, episode: 1, title: 'When You Are Lost in the Darkness', runtimeMin: 81 },
			{ season: 1, episode: 2, title: 'Infected', runtimeMin: 53 },
			{ season: 1, episode: 3, title: 'Long, Long Time', runtimeMin: 75 }
		]
	},
	{
		id: 119051, type: 'tv', name: 'Wednesday', year: 2022,
		genres: ['Comedy', 'Fantasy'], rating: 8.5, seasons: 2,
		overview: 'Wednesday Addams investigates a mystery at Nevermore Academy.',
		art: 'linear-gradient(135deg,#232526,#000000)',
		episodes: [
			{ season: 1, episode: 1, title: "Wednesday's Child Is Full of Woe", runtimeMin: 59 },
			{ season: 1, episode: 2, title: 'Woe Is the Loneliest Number', runtimeMin: 57 },
			{ season: 1, episode: 3, title: 'Friend or Woe', runtimeMin: 55 }
		]
	}
];

export const ALL_GENRES = [...new Set(DEMO_TITLES.flatMap((t) => t.genres))].sort();
