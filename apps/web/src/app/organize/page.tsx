"use client";

import { useEffect, useMemo, useState } from "react";

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

type MoviePreview = {
  fileName: string;
  currentPath: string;
  title: string;
  year: string | null;
  genres: string[];
  primaryGenre: string;
  suggestedPath: string;
  metadataLoading: boolean;
};

type MoveResponse = {
  success: boolean;
  message?: string;
  error?: string;
  previousPath?: string;
  newPath?: string;
};

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".m4v",
  ".webm",
];

const GENRE_PRIORITY = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Science Fiction",
  "Thriller",
  "War",
  "Western",
];

function isVideoFile(fileName: string) {
  const lower = fileName.toLowerCase();

  return VIDEO_EXTENSIONS.some((extension) =>
    lower.endsWith(extension)
  );
}

function cleanMovieName(fileName: string) {
  const extensionMatch = fileName.match(/\.[^/.]+$/);
  const extension = extensionMatch?.[0] ?? "";

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
    extension,
  };
}

function choosePrimaryGenre(genres: string[]) {
  for (const genre of GENRE_PRIORITY) {
    if (genres.includes(genre)) {
      return genre;
    }
  }

  return genres[0] || "Other";
}

function sanitizeFolderName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export default function OrganizePage() {
  const [movies, setMovies] = useState<MoviePreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [movingPath, setMovingPath] =
    useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadPreview() {
      try {
        setLoading(true);
        setError("");
        setMessage("");

        const scanResponse = await fetch(
          "/api/media/scan",
          {
            cache: "no-store",
          }
        );

        const scanResult =
          (await scanResponse.json()) as ScanResponse;

        if (
          !scanResponse.ok ||
          !scanResult.success
        ) {
          throw new Error(
            scanResult.error ||
              "Could not scan media library."
          );
        }

        const root =
          scanResult.root || "/Volumes/video";

        const scannedMovies: MoviePreview[] = (
          scanResult.items ?? []
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
              currentPath: item.path,
              title: parsed.title,
              year: parsed.year,
              genres: [],
              primaryGenre: "Checking...",
              suggestedPath: "",
              metadataLoading: true,
            };
          });

        setMovies(scannedMovies);

        await Promise.all(
          scannedMovies.map(async (movie) => {
            try {
              const parsed =
                cleanMovieName(movie.fileName);

              const params =
                new URLSearchParams({
                  title: movie.title,
                });

              if (movie.year) {
                params.set("year", movie.year);
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

              const metadata =
                metadataResponse.ok &&
                metadataResult.success
                  ? metadataResult.movie
                  : null;

              const genres =
                metadata?.genres ?? [];

              const primaryGenre =
                choosePrimaryGenre(genres);

              const displayTitle =
                metadata?.title ??
                movie.title;

              const displayYear =
                metadata?.year ??
                movie.year;

              const cleanTitle =
                sanitizeFolderName(
                  displayYear
                    ? `${displayTitle} (${displayYear})`
                    : displayTitle
                );

              const suggestedFileName =
                `${cleanTitle}${parsed.extension}`;

              const suggestedPath =
                `${root}/${primaryGenre}/${suggestedFileName}`;

              setMovies((current) =>
                current.map((item) =>
                  item.currentPath ===
                  movie.currentPath
                    ? {
                        ...item,
                        title: displayTitle,
                        year: displayYear,
                        genres,
                        primaryGenre,
                        suggestedPath,
                        metadataLoading: false,
                      }
                    : item
                )
              );
            } catch {
              const parsed =
                cleanMovieName(movie.fileName);

              const fallbackTitle =
                sanitizeFolderName(
                  movie.year
                    ? `${movie.title} (${movie.year})`
                    : movie.title
                );

              setMovies((current) =>
                current.map((item) =>
                  item.currentPath ===
                  movie.currentPath
                    ? {
                        ...item,
                        primaryGenre: "Other",
                        suggestedPath:
                          `${root}/Other/${fallbackTitle}${parsed.extension}`,
                        metadataLoading: false,
                      }
                    : item
                )
              );
            }
          })
        );
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not build organization preview."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadPreview();
  }, []);

  async function moveMovie(
    movie: MoviePreview
  ) {
    if (
      movie.metadataLoading ||
      !movie.suggestedPath
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Move this movie?\n\n${movie.currentPath}\n\nTO\n\n${movie.suggestedPath}`
    );

    if (!confirmed) {
      return;
    }

    try {
      setMovingPath(movie.currentPath);
      setError("");
      setMessage("");

      const response = await fetch(
        "/api/media/move",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            source: movie.currentPath,
            destination:
              movie.suggestedPath,
          }),
        }
      );

      const result =
        (await response.json()) as MoveResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "Could not move movie."
        );
      }

      setMovies((current) =>
        current.filter(
          (item) =>
            item.currentPath !==
            movie.currentPath
        )
      );

      setMessage(
        result.message ||
          `${movie.title} was organized successfully.`
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not move movie."
      );
    } finally {
      setMovingPath(null);
    }
  }

  const filteredMovies = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    if (!query) {
      return movies;
    }

    return movies.filter((movie) => {
      return (
        movie.title
          .toLowerCase()
          .includes(query) ||
        movie.fileName
          .toLowerCase()
          .includes(query) ||
        movie.primaryGenre
          .toLowerCase()
          .includes(query) ||
        movie.genres.some((genre) =>
          genre
            .toLowerCase()
            .includes(query)
        )
      );
    });
  }, [movies, search]);

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
              Organize Library
            </h1>
          </div>

          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            Controlled Move
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-400">
            Safe Organizer
          </p>

          <h2 className="mt-2 text-4xl font-bold">
            Organization Preview
          </h2>

          <p className="mt-3 max-w-2xl text-white/45">
            Review the suggested destination
            before moving each movie. Media
            Vault will not overwrite an existing
            file.
          </p>
        </section>

        <div className="mt-8">
          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search preview..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-white outline-none placeholder:text-white/25 focus:border-indigo-500"
          />
        </div>

        {message ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/50">
            Building organization preview...
          </div>
        ) : null}

        {!loading &&
        !error &&
        filteredMovies.length > 0 ? (
          <section className="mt-8 space-y-4">
            {filteredMovies.map(
              (movie) => (
                <article
                  key={movie.currentPath}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-semibold">
                        {movie.title}
                      </h3>

                      <p className="mt-1 text-sm text-white/40">
                        {movie.year ||
                          "Year unknown"}
                      </p>

                      {movie.genres.length >
                      0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {movie.genres.map(
                            (genre) => (
                              <span
                                key={genre}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55"
                              >
                                {genre}
                              </span>
                            )
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="w-fit rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-300">
                      {movie.metadataLoading
                        ? "Checking..."
                        : movie.primaryGenre}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30">
                        Current
                      </p>

                      <p className="mt-3 break-all text-sm text-white/55">
                        {movie.currentPath}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">
                        Suggested
                      </p>

                      <p className="mt-3 break-all text-sm text-emerald-100/70">
                        {movie.metadataLoading
                          ? "Calculating..."
                          : movie.suggestedPath}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-4 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-white/30">
                      Original file:{" "}
                      {movie.fileName}
                    </p>

                    <button
                      type="button"
                      disabled={
                        movie.metadataLoading ||
                        !movie.suggestedPath ||
                        movingPath ===
                          movie.currentPath
                      }
                      onClick={() =>
                        void moveMovie(movie)
                      }
                      className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {movingPath ===
                      movie.currentPath
                        ? "Moving..."
                        : "Move Movie"}
                    </button>
                  </div>
                </article>
              )
            )}
          </section>
        ) : null}

        {!loading &&
        !error &&
        filteredMovies.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-white/15 p-10 text-center text-white/40">
            No movies found.
          </div>
        ) : null}
      </div>
    </main>
  );
}