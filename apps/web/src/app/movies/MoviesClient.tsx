"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

type MediaItem = {
  name: string;
  type: "folder" | "file";
  path: string;
};

type ScanResponse = {
  success: boolean;
  root?: string;
  items?: MediaItem[];
  error?: string;
};

type MetadataMovie = {
  id: number;
  title: string;
  year: string | null;
  overview: string | null;
  rating: number | null;
  posterUrl: string | null;
  genres: string[];
};

type MetadataResponse = {
  success: boolean;
  movie?: MetadataMovie | null;
  error?: string;
};

type Movie = {
  fileName: string;
  title: string;
  year: string | null;
  path: string;
  metadata: MetadataMovie | null;
  metadataLoading: boolean;
};

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".m4v",
  ".webm",
];

function isVideoFile(fileName: string) {
  const lower = fileName.toLowerCase();

  return VIDEO_EXTENSIONS.some((extension) =>
    lower.endsWith(extension)
  );
}

function cleanMovieName(fileName: string) {
  const withoutExtension = fileName.replace(
    /\.[^/.]+$/,
    ""
  );

  const yearMatch = withoutExtension.match(
    /\((19|20)\d{2}\)/
  );

  const year = yearMatch
    ? yearMatch[0].replace(/[()]/g, "")
    : null;

  let title = withoutExtension
    .replace(/\((19|20)\d{2}\)/, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    title = withoutExtension;
  }

  return {
    title,
    year,
  };
}

export default function MoviesPage() {
  const searchParams = useSearchParams();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [selectedGenre, setSelectedGenre] =
    useState("All");

  useEffect(() => {
    const genre =
      searchParams.get("genre");

    if (genre) {
      setSelectedGenre(genre);
    } else {
      setSelectedGenre("All");
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadMovies() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          "/api/media/scan",
          {
            cache: "no-store",
          }
        );

        const result =
          (await response.json()) as ScanResponse;

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ||
              "Could not load media."
          );
        }

        const scannedMovies: Movie[] = (
          result.items ?? []
        )
          .filter(
            (item) =>
              item.type === "file" &&
              isVideoFile(item.name) &&
              !item.name.startsWith(".")
          )
          .map((item) => {
            const parsed =
              cleanMovieName(item.name);

            return {
              fileName: item.name,
              title: parsed.title,
              year: parsed.year,
              path: item.path,
              metadata: null,
              metadataLoading: true,
            };
          })
          .sort((a, b) =>
            a.title.localeCompare(b.title)
          );

        setMovies(scannedMovies);

        await Promise.all(
          scannedMovies.map(
            async (movie) => {
              try {
                const params =
                  new URLSearchParams({
                    title: movie.title,
                  });

                if (movie.year) {
                  params.set(
                    "year",
                    movie.year
                  );
                }

                const metadataResponse =
                  await fetch(
                    `/api/media/metadata?${params.toString()}`,
                    {
                      cache: "no-store",
                    }
                  );

                const metadataResult =
                  (await metadataResponse.json()) as MetadataResponse;

                setMovies((current) =>
                  current.map((item) =>
                    item.path === movie.path
                      ? {
                          ...item,
                          metadata:
                            metadataResponse.ok &&
                            metadataResult.success
                              ? metadataResult.movie ??
                                null
                              : null,
                          metadataLoading:
                            false,
                        }
                      : item
                  )
                );
              } catch {
                setMovies((current) =>
                  current.map((item) =>
                    item.path === movie.path
                      ? {
                          ...item,
                          metadataLoading:
                            false,
                        }
                      : item
                  )
                );
              }
            }
          )
        );
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load movies."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadMovies();
  }, []);

  const genres = useMemo(() => {
    const genreSet =
      new Set<string>();

    movies.forEach((movie) => {
      movie.metadata?.genres?.forEach(
        (genre) => {
          genreSet.add(genre);
        }
      );
    });

    return [
      "All",
      ...Array.from(
        genreSet
      ).sort(),
    ];
  }, [movies]);

  const filteredMovies = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    return movies.filter((movie) => {
      const title =
        movie.metadata?.title ??
        movie.title;

      const year =
        movie.metadata?.year ??
        movie.year ??
        "";

      const overview =
        movie.metadata?.overview ??
        "";

      const genresForMovie =
        movie.metadata?.genres ??
        [];

      const matchesSearch =
        !query ||
        title
          .toLowerCase()
          .includes(query) ||
        year
          .toLowerCase()
          .includes(query) ||
        overview
          .toLowerCase()
          .includes(query) ||
        movie.fileName
          .toLowerCase()
          .includes(query) ||
        genresForMovie.some(
          (genre) =>
            genre
              .toLowerCase()
              .includes(query)
        );

      const matchesGenre =
        selectedGenre === "All" ||
        genresForMovie.includes(
          selectedGenre
        );

      return (
        matchesSearch &&
        matchesGenre
      );
    });
  }, [
    movies,
    search,
    selectedGenre,
  ]);

  return (
    <main className="min-h-screen bg-[#07090f] text-white">
      <header className="border-b border-white/10 bg-[#0b0e16]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <a
              href="/"
              className="text-sm text-white/40 transition hover:text-white"
            >
              ← Home
            </a>

            <h1 className="mt-2 text-2xl font-bold">
              Movies
            </h1>
          </div>

          <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            NAS Connected
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-400">
              Library
            </p>

            <h2 className="mt-2 text-4xl font-bold">
              Movie Collection
            </h2>

            <p className="mt-3 text-white/45">
              {movies.length}{" "}
              {movies.length === 1
                ? "movie"
                : "movies"}{" "}
              found on your Synology NAS.
            </p>

            {selectedGenre !==
            "All" ? (
              <p className="mt-2 text-sm text-indigo-300">
                Showing genre:{" "}
                {selectedGenre}
              </p>
            ) : null}
          </div>

          <div className="w-full sm:max-w-sm">
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search title, year, genre..."
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-white outline-none placeholder:text-white/25 focus:border-indigo-500"
            />
          </div>
        </section>

        <section className="mt-6">
          <div className="flex flex-wrap gap-2">
            {genres.map(
              (genre) => {
                const active =
                  selectedGenre ===
                  genre;

                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() =>
                      setSelectedGenre(
                        genre
                      )
                    }
                    className={[
                      "rounded-full border px-4 py-2 text-sm transition",
                      active
                        ? "border-indigo-500 bg-indigo-600 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/60 hover:border-indigo-500/40 hover:text-white",
                    ].join(" ")}
                  >
                    {genre}
                  </button>
                );
              }
            )}
          </div>
        </section>

        {error ? (
          <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/50">
            Scanning Synology
            library...
          </div>
        ) : null}

        {!loading &&
        !error &&
        filteredMovies.length ===
          0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-white/15 p-10 text-center">
            <div className="text-5xl">
              🎬
            </div>

            <h3 className="mt-5 text-xl font-semibold">
              No movies found
            </h3>

            <p className="mt-2 text-sm text-white/40">
              Try another search or
              choose another genre.
            </p>
          </div>
        ) : null}

        {!loading &&
        !error &&
        filteredMovies.length >
          0 ? (
          <section className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredMovies.map(
              (movie) => {
                const displayTitle =
                  movie.metadata
                    ?.title ??
                  movie.title;

                const displayYear =
                  movie.metadata
                    ?.year ??
                  movie.year;

                const overview =
                  movie.metadata
                    ?.overview;

                const rating =
                  movie.metadata
                    ?.rating;

                const posterUrl =
                  movie.metadata
                    ?.posterUrl;

                const movieGenres =
                  movie.metadata
                    ?.genres ?? [];

                return (
                  <article
                    key={movie.path}
                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] transition hover:border-indigo-500/40 hover:bg-white/[0.055]"
                  >
                    <div className="relative aspect-[2/3] overflow-hidden bg-gradient-to-br from-indigo-950/70 via-slate-950 to-black">
                      {posterUrl ? (
                        <img
                          src={
                            posterUrl
                          }
                          alt={`${displayTitle} poster`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <div className="text-center">
                            <div className="text-6xl">
                              🎬
                            </div>

                            <p className="mt-4 px-5 text-sm font-medium text-white/60">
                              {movie.metadataLoading
                                ? "Loading poster..."
                                : displayTitle}
                            </p>
                          </div>
                        </div>
                      )}

                      {rating !==
                        null &&
                      rating !==
                        undefined ? (
                        <div className="absolute right-3 top-3 rounded-full bg-black/75 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                          ⭐{" "}
                          {rating.toFixed(
                            1
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="p-5">
                      <h3 className="text-lg font-semibold">
                        {
                          displayTitle
                        }
                      </h3>

                      <p className="mt-1 text-sm text-white/40">
                        {displayYear ||
                          "Year unknown"}
                      </p>

                      {movieGenres.length >
                      0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {movieGenres.map(
                            (genre) => (
                              <button
                                key={
                                  genre
                                }
                                type="button"
                                onClick={() =>
                                  setSelectedGenre(
                                    genre
                                  )
                                }
                                className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/60 transition hover:border-indigo-500/40 hover:text-white"
                              >
                                {
                                  genre
                                }
                              </button>
                            )
                          )}
                        </div>
                      ) : null}

                      {overview ? (
                        <p className="mt-4 line-clamp-4 text-sm leading-6 text-white/50">
                          {overview}
                        </p>
                      ) : (
                        <p className="mt-4 text-sm text-white/30">
                          {movie.metadataLoading
                            ? "Loading movie details..."
                            : "No description available."}
                        </p>
                      )}

                      <div className="mt-5 border-t border-white/10 pt-4">
                        <p className="break-all text-xs text-white/25">
                          {
                            movie.fileName
                          }
                        </p>
                      </div>
                    </div>
                  </article>
                );
              }
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}