"use client";

import { useEffect, useMemo, useState } from "react";

type MediaItem = {
  name: string;
  type: "folder" | "file";
  path: string;
  relativePath: string;
  modifiedAt: string | null;
};

type ScanResponse = {
  success: boolean;
  items?: MediaItem[];
  error?: string;
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

function cleanTitle(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function RecentPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRecent() {
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

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ||
              "Could not load media library."
          );
        }

        setItems(result.items ?? []);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load recent media."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadRecent();
  }, []);

  const movies = useMemo(() => {
    return items
      .filter(
        (item) =>
          item.type === "file" &&
          isVideoFile(item.name) &&
          !item.name.startsWith(".")
      )
      .sort((a, b) => {
        const aTime = a.modifiedAt
          ? new Date(a.modifiedAt).getTime()
          : 0;

        const bTime = b.modifiedAt
          ? new Date(b.modifiedAt).getTime()
          : 0;

        return bTime - aTime;
      });
  }, [items]);

  return (
    <main className="min-h-screen bg-[#07090f] text-white">
      <header className="border-b border-white/10 bg-[#0b0e16]">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <a
            href="/"
            className="text-sm text-white/40 transition hover:text-white"
          >
            ← Home
          </a>

          <h1 className="mt-2 text-2xl font-bold">
            Recently Added
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-400">
          Library Activity
        </p>

        <h2 className="mt-2 text-4xl font-bold">
          Latest Media
        </h2>

        <p className="mt-3 text-white/45">
          Movies sorted by the file&apos;s most
          recent modification time on your NAS.
        </p>

        {error ? (
          <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/50">
            Scanning library...
          </div>
        ) : null}

        {!loading &&
        !error &&
        movies.length > 0 ? (
          <section className="mt-8 space-y-3">
            {movies.map((movie, index) => (
              <article
                key={movie.path}
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-xl">
                    🎬
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {cleanTitle(movie.name)}
                    </h3>

                    <p className="mt-1 truncate text-xs text-white/35">
                      {movie.relativePath}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-sm text-white/60">
                    {formatDate(movie.modifiedAt)}
                  </p>

                  {index < 3 ? (
                    <p className="mt-1 text-xs font-medium text-indigo-300">
                      Recently added
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {!loading &&
        !error &&
        movies.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-white/15 p-10 text-center text-white/40">
            No movies found.
          </div>
        ) : null}
      </div>
    </main>
  );
}