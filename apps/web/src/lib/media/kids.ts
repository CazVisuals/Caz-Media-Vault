const CHILD_CERTIFICATIONS = new Set(["G", "PG", "TV-Y", "TV-Y7", "TV-G", "TV-PG"]);
const BLOCKED_CERTIFICATIONS = new Set(["PG-13", "R", "NC-17", "TV-14", "TV-MA"]);

export function isKidsMovie(genres: string[], certification: string | null | undefined) {
  const normalizedGenres = new Set(genres.map((genre) => genre.trim().toLowerCase()));
  if (normalizedGenres.has("kids") || normalizedGenres.has("kids & family")) return true;

  const rating = certification?.trim().toUpperCase() || "";
  if (BLOCKED_CERTIFICATIONS.has(rating)) return false;
  if (rating === "G") return true;

  const family = normalizedGenres.has("family");
  const animation = normalizedGenres.has("animation");
  if (family && (!rating || CHILD_CERTIFICATIONS.has(rating))) return true;
  return animation && CHILD_CERTIFICATIONS.has(rating);
}
