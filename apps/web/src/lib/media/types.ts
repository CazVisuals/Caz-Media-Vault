export type Movie = {
  id: string;
  title: string;
  year: string | null;
  fileName: string;
  relativePath: string;
  modifiedAt: string;
  size: number;
  genre: string | null;
  genres: string[];
  overview: string | null;
  rating: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
};

export type LibraryResponse = {
  success: true;
  scannedAt: string;
  movieCount: number;
  movies: Movie[];
};
