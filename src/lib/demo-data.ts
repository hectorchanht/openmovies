import type { Title } from './types';

/**
 * Demo dataset — clearly labelled in the UI as demo data.
 * Rows carry REAL TMDB ids of well-known titles so the embed providers
 * resolve actual playback, while all descriptive copy below is our own
 * one-line summary (no TMDB text is bundled). Poster art is generated CSS
 * gradients (see `art`), never hotlinked artwork. When PUBLIC_TMDB_API_KEY
 * is set, the TMDB adapter replaces this dataset entirely with live data.
 */
export const DEMO_TITLES: Title[] = [
	{
		id: 27205, type: 'movie', name: 'Inception', year: 2010,
		genres: ['Sci-Fi', 'Action'], rating: 8.4, runtimeMin: 148,
		overview: 'A thief who steals secrets from inside dreams takes one last job: plant an idea instead.',
		art: 'linear-gradient(135deg,#1d2b64,#f8cd30)'
	},
	{
		id: 157336, type: 'movie', name: 'Interstellar', year: 2014,
		genres: ['Sci-Fi', 'Drama'], rating: 8.5, runtimeMin: 169,
		overview: 'Explorers cross a wormhole looking for a new home as Earth slowly becomes unlivable.',
		art: 'linear-gradient(135deg,#0f2027,#2c5364)'
	},
	{
		id: 155, type: 'movie', name: 'The Dark Knight', year: 2008,
		genres: ['Action', 'Crime'], rating: 9.0, runtimeMin: 152,
		overview: 'Batman pushes his limits against the Joker, an agent of chaos tearing Gotham apart.',
		art: 'linear-gradient(135deg,#232526,#414345)'
	},
	{
		id: 693134, type: 'movie', name: 'Dune: Part Two', year: 2024,
		genres: ['Sci-Fi', 'Adventure'], rating: 8.2, runtimeMin: 166,
		overview: 'Paul Atreides joins the Fremen and walks the road toward revenge and destiny on Arrakis.',
		art: 'linear-gradient(135deg,#c7903a,#5c3317)'
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
		id: 354912, type: 'movie', name: 'Coco', year: 2017,
		genres: ['Animation', 'Family'], rating: 8.2, runtimeMin: 105,
		overview: 'A young musician journeys to the Land of the Dead to unlock his family history.',
		art: 'linear-gradient(135deg,#f953c6,#b91d73)'
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
		id: 1399, type: 'tv', name: 'Game of Thrones', year: 2011,
		genres: ['Drama', 'Fantasy'], rating: 8.4, seasons: 8,
		overview: 'Noble families wage war for the Iron Throne as an ancient enemy returns.',
		art: 'linear-gradient(135deg,#16222a,#3a6073)',
		episodes: [
			{ season: 1, episode: 1, title: 'Winter Is Coming', runtimeMin: 62 },
			{ season: 1, episode: 2, title: 'The Kingsroad', runtimeMin: 56 },
			{ season: 1, episode: 3, title: 'Lord Snow', runtimeMin: 58 }
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
