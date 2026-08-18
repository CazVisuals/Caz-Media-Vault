import type { Movie } from "@/lib/media/types";

export type MediaCollection = { name: string; movies: Movie[]; automatic: boolean };

const franchiseRules: { name: string; pattern: RegExp }[] = [
  { name: "Disney", pattern: /snow white|pinocchio|fantasia|dumbo|bambi|cinderella|alice in wonderland|peter pan|lady and the tramp|sleeping beauty|101 dalmatians|jungle book|aristocats|robin hood|little mermaid|beauty and the beast|aladdin|lion king|pocahontas|hunchback of notre dame|hercules|mulan|tarzan|emperor.s new groove|lilo (?:and|&) stitch|treasure planet|brother bear|chicken little|meet the robinsons|bolt|princess and the frog|tangled|wreck[\s-]*it ralph|frozen|big hero 6|zootopia|moana|raya and the last dragon|encanto|wish|mary poppins|tron|pirates of the caribbean|haunted mansion|hocus pocus|disney/i },
  { name: "Pixar", pattern: /toy story|a bug.s life|monsters[,\s]|finding nemo|the incredibles|cars|ratatouille|wall[\s-]*e|\bup\b|brave|monsters university|inside out|the good dinosaur|finding dory|coco|incredibles 2|onward|\bsoul\b|luca|turning red|lightyear|elemental|elio|pixar/i },
  { name: "Marvel", pattern: /spider[\s-]*man|spider[\s-]*verse|venom|avengers|iron[\s-]*man|captain america|captain marvel|thor|black panther|guardians of the galaxy|doctor strange|ant[\s-]*man|deadpool|wolverine|\bx[\s-]*men\b|fantastic four|marvels?|shang[\s-]*chi|eternals|black widow|hulk/i },
  { name: "DC Universe", pattern: /batman|superman|wonder woman|aquaman|justice league|suicide squad|harley quinn|shazam|blue beetle|the flash|man of steel|joker|black adam|dc universe/i },
  { name: "Star Wars", pattern: /star[\s-]*wars|mandalorian|book of boba fett|\bandor\b|\bahsoka\b|obi[\s-]*wan/i },
  { name: "Wizarding World", pattern: /harry potter|fantastic beasts|wizarding world/i },
  { name: "Middle-earth", pattern: /lord of the rings|\bhobbit\b|middle[\s-]*earth/i },
  { name: "James Bond", pattern: /james bond|\b007\b/i },
  { name: "Jurassic", pattern: /jurassic park|jurassic world/i },
  { name: "Fast & Furious", pattern: /fast (?:and|&) furious|fast & furious|fast five|fast x|tokyo drift|hobbs (?:and|&) shaw/i },
  { name: "Mission: Impossible", pattern: /mission[:\s-]*impossible/i },
  { name: "Transformers", pattern: /transformers|bumblebee|rise of the beasts/i },
  { name: "Alien & Predator", pattern: /\balien\b|aliens|prometheus|alien covenant|\bpredator\b|prey|alien vs[.]? predator/i },
  { name: "Rocky & Creed", pattern: /\brocky\b|\bcreed\b/i },
  { name: "Planet of the Apes", pattern: /planet of the apes/i },
  { name: "Pirates of the Caribbean", pattern: /pirates of the caribbean/i },
  { name: "Indiana Jones", pattern: /indiana jones/i },
  { name: "The Hunger Games", pattern: /hunger games|ballad of songbirds/i },
  { name: "DreamWorks", pattern: /shrek|kung fu panda|how to train your dragon|madagascar|puss in boots|trolls|boss baby|croods|megamind|abominable|bad guys|dreamworks/i },
  { name: "Holiday", pattern: /christmas|holiday|santa|home alone|the grinch/i },
];

function chronological(a: Movie, b: Movie) {
  const yearA = Number(a.year) || Number.MAX_SAFE_INTEGER;
  const yearB = Number(b.year) || Number.MAX_SAFE_INTEGER;
  return yearA - yearB || a.title.localeCompare(b.title, undefined, { numeric: true });
}

export function buildCollections(movies: Movie[], customCollections: Record<string, string[]> = {}, hiddenCollections: string[] = []) {
  const groups = new Map<string, { movies: Movie[]; automatic: boolean }>();
  const hidden = new Set(hiddenCollections);
  const add = (name: string, movie: Movie, automatic = true) => {
    if (!name || hidden.has(name)) return;
    const group = groups.get(name) || { movies: [], automatic };
    if (!group.movies.some((item) => item.id === movie.id)) group.movies.push(movie);
    group.automatic &&= automatic;
    groups.set(name, group);
  };

  for (const movie of movies.filter((item) => item.mediaType !== "tv")) {
    const searchable = `${movie.title} ${movie.collection || ""}`;
    if (movie.collection) add(movie.collection, movie);
    for (const rule of franchiseRules) if (rule.pattern.test(searchable)) add(rule.name, movie);
  }
  for (const [name, ids] of Object.entries(customCollections)) {
    if (hidden.has(name)) continue;
    for (const id of ids) {
      const movie = movies.find((item) => item.id === id && item.mediaType !== "tv");
      if (movie) add(name, movie, false);
    }
  }
  return Array.from(groups, ([name, group]) => ({ name, automatic: group.automatic, movies: [...group.movies].sort(chronological) }))
    .filter((collection) => collection.movies.length > 0 && (!collection.automatic || collection.movies.length >= 2))
    .sort((a, b) => b.movies.length - a.movies.length || a.name.localeCompare(b.name));
}
