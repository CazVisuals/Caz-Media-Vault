"use client";

import { useEffect, useState } from "react";

type ConnectionState = "checking" | "connected" | "error";

type ScanResponse = {
  success: boolean;
  root?: string;
  scannedAt?: string;
  items?: unknown[];
  error?: string;
};

type MetadataResponse = {
  success: boolean;
  movie?: {
    id: number;
    title: string;
  } | null;
  error?: string;
};

export default function SettingsPage() {
  const [nasStatus, setNasStatus] =
    useState<ConnectionState>("checking");

  const [tmdbStatus, setTmdbStatus] =
    useState<ConnectionState>("checking");

  const [mediaRoot, setMediaRoot] =
    useState("/Volumes/video");

  const [itemCount, setItemCount] =
    useState(0);

  const [lastScan, setLastScan] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState("");

  async function checkConnections() {
    setNasStatus("checking");
    setTmdbStatus("checking");
    setMessage("");

    try {
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
            "NAS connection failed."
        );
      }

      setNasStatus("connected");
      setMediaRoot(
        result.root || "/Volumes/video"
      );
      setItemCount(
        result.items?.length ?? 0
      );
      setLastScan(
        result.scannedAt ?? null
      );
    } catch {
      setNasStatus("error");
    }

    try {
      const response = await fetch(
        "/api/media/metadata?title=Supergirl&year=2026",
        {
          cache: "no-store",
        }
      );

      const result =
        (await response.json()) as MetadataResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            "TMDB connection failed."
        );
      }

      setTmdbStatus("connected");
    } catch {
      setTmdbStatus("error");
    }
  }

  useEffect(() => {
    void checkConnections();
  }, []);

  function formatDate(value: string | null) {
    if (!value) {
      return "Not scanned yet";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(
      "en-US",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(date);
  }

  function statusBadge(
    status: ConnectionState
  ) {
    if (status === "checking") {
      return (
        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          Checking...
        </span>
      );
    }

    if (status === "connected") {
      return (
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          ● Connected
        </span>
      );
    }

    return (
      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300">
        ● Error
      </span>
    );
  }

  async function refreshLibrary() {
    setMessage("");

    await checkConnections();

    setMessage(
      "Library scan completed."
    );
  }

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
              Settings
            </h1>
          </div>

          <button
            type="button"
            onClick={() =>
              void refreshLibrary()
            }
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold transition hover:bg-indigo-500"
          >
            Refresh Library
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-400">
            Media Vault
          </p>

          <h2 className="mt-2 text-4xl font-bold">
            System Settings
          </h2>

          <p className="mt-3 text-white/45">
            Connection status and configuration
            for your home media library.
          </p>
        </div>

        {message ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        <section className="mt-8 space-y-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-white/40">
                  Synology NAS
                </p>

                <h3 className="mt-1 text-xl font-semibold">
                  Media Storage
                </h3>
              </div>

              {statusBadge(nasStatus)}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wider text-white/30">
                  Media Root
                </p>

                <p className="mt-2 break-all text-sm text-white/70">
                  {mediaRoot}
                </p>
              </div>

              <div className="rounded-2xl bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wider text-white/30">
                  Items Found
                </p>

                <p className="mt-2 text-xl font-semibold">
                  {itemCount}
                </p>
              </div>

              <div className="rounded-2xl bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wider text-white/30">
                  Last Scan
                </p>

                <p className="mt-2 text-sm text-white/70">
                  {formatDate(lastScan)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-white/40">
                  Movie Metadata
                </p>

                <h3 className="mt-1 text-xl font-semibold">
                  TMDB
                </h3>
              </div>

              {statusBadge(tmdbStatus)}
            </div>

            <p className="mt-5 max-w-2xl text-sm leading-6 text-white/45">
              TMDB provides movie titles,
              release years, descriptions,
              ratings, genres, and poster
              artwork for Media Vault.
            </p>

            <div className="mt-5 rounded-2xl bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wider text-white/30">
                API Credential
              </p>

              <p className="mt-2 text-sm text-white/70">
                TMDB_READ_ACCESS_TOKEN
              </p>

              <p className="mt-1 text-xs text-white/30">
                Stored securely in .env.local
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-white/40">
              Organizer
            </p>

            <h3 className="mt-1 text-xl font-semibold">
              Safety
            </h3>

            <div className="mt-5 space-y-3 text-sm text-white/55">
              <p>
                ✓ Files must remain inside{" "}
                <span className="text-white/80">
                  {mediaRoot}
                </span>
              </p>

              <p>
                ✓ Existing destination files
                are not overwritten
              </p>

              <p>
                ✓ Movies require confirmation
                before being moved
              </p>

              <p>
                ✓ Genre folders are created
                automatically when needed
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <a
            href="/movies"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-indigo-500/40"
          >
            <p className="text-2xl">
              🎬
            </p>

            <p className="mt-3 font-semibold">
              Movies
            </p>
          </a>

          <a
            href="/organize"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-indigo-500/40"
          >
            <p className="text-2xl">
              🗂️
            </p>

            <p className="mt-3 font-semibold">
              Organizer
            </p>
          </a>

          <a
            href="/recent"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-indigo-500/40"
          >
            <p className="text-2xl">
              🕐
            </p>

            <p className="mt-3 font-semibold">
              Recently Added
            </p>
          </a>
        </section>
      </div>
    </main>
  );
}
