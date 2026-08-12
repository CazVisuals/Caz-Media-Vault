"use client";

import { useEffect, useState } from "react";

type ConnectionState =
  | "checking"
  | "connected"
  | "error";

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

  const [refreshing, setRefreshing] =
    useState(false);

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

  async function refreshLibrary() {
    try {
      setRefreshing(true);

      await checkConnections();

      setMessage(
        "Library scan completed successfully."
      );
    } finally {
      setRefreshing(false);
    }
  }

  function formatDate(
    value: string | null
  ) {
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

  return (
    <main className="min-h-screen bg-[#07090f] text-white">
      {/* HEADER */}

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
            disabled={refreshing}
            onClick={() =>
              void refreshLibrary()
            }
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh Library"}
          </button>
        </div>
      </header>

      {/* CONTENT */}

      <div className="mx-auto max-w-5xl px-6 py-10">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-400">
            Caz Media Vault
          </p>

          <h2 className="mt-2 text-4xl font-bold">
            System Settings
          </h2>

          <p className="mt-3 max-w-2xl text-white/45">
            Monitor your Synology NAS,
            movie metadata connection, and
            Media Vault configuration.
          </p>
        </section>

        {/* SUCCESS MESSAGE */}

        {message ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            ✓ {message}
          </div>
        ) : null}

        {/* CONNECTION OVERVIEW */}

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-3xl">
                  🗄️
                </div>

                <p className="mt-4 text-sm text-white/40">
                  Storage
                </p>

                <h3 className="mt-1 text-xl font-semibold">
                  Synology NAS
                </h3>
              </div>

              {statusBadge(nasStatus)}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-3xl">
                  🎬
                </div>

                <p className="mt-4 text-sm text-white/40">
                  Metadata
                </p>

                <h3 className="mt-1 text-xl font-semibold">
                  TMDB
                </h3>
              </div>

              {statusBadge(tmdbStatus)}
            </div>
          </div>
        </section>

        {/* NAS SETTINGS */}

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-white/40">
                Storage Connection
              </p>

              <h3 className="mt-1 text-2xl font-semibold">
                Synology Media Library
              </h3>

              <p className="mt-2 text-sm text-white/40">
                Primary storage location
                used by Caz Media Vault.
              </p>
            </div>

            {statusBadge(nasStatus)}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/30">
                Media Root
              </p>

              <p className="mt-3 break-all text-sm font-medium text-white/75">
                {mediaRoot}
              </p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/30">
                Library Items
              </p>

              <p className="mt-3 text-3xl font-bold">
                {nasStatus === "checking"
                  ? "—"
                  : itemCount}
              </p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/30">
                Last Scan
              </p>

              <p className="mt-3 text-sm leading-6 text-white/70">
                {formatDate(lastScan)}
              </p>
            </div>
          </div>
        </section>

        {/* TMDB */}

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-white/40">
                Movie Information
              </p>

              <h3 className="mt-1 text-2xl font-semibold">
                TMDB Metadata
              </h3>

              <p className="mt-2 max-w-xl text-sm leading-6 text-white/40">
                TMDB supplies movie
                posters, titles, release
                years, descriptions,
                ratings, and genres.
              </p>
            </div>

            {statusBadge(tmdbStatus)}
          </div>

          <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/30">
                  API Credential
                </p>

                <p className="mt-2 text-sm font-medium text-white/75">
                  TMDB_READ_ACCESS_TOKEN
                </p>
              </div>

              <span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-white/40">
                Private
              </span>
            </div>

            <p className="mt-3 text-xs text-white/30">
              Stored in .env.local and
              never exposed to the browser.
            </p>
          </div>
        </section>

        {/* ORGANIZER SAFETY */}

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <div>
            <p className="text-sm text-white/40">
              File Management
            </p>

            <h3 className="mt-1 text-2xl font-semibold">
              Organizer Safety
            </h3>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
              <p className="font-medium text-emerald-200">
                ✓ Protected Media Root
              </p>

              <p className="mt-2 text-sm text-white/40">
                File operations are
                restricted to {mediaRoot}.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
              <p className="font-medium text-emerald-200">
                ✓ No Overwriting
              </p>

              <p className="mt-2 text-sm text-white/40">
                Existing destination
                files cannot be replaced.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
              <p className="font-medium text-emerald-200">
                ✓ Confirmation Required
              </p>

              <p className="mt-2 text-sm text-white/40">
                Every movie move requires
                your approval.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
              <p className="font-medium text-emerald-200">
                ✓ Automatic Folders
              </p>

              <p className="mt-2 text-sm text-white/40">
                Genre folders are created
                when needed.
              </p>
            </div>
          </div>
        </section>

        {/* QUICK LINKS */}

        <section className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30">
            Quick Access
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <a
              href="/movies"
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-indigo-500/40 hover:bg-white/[0.05]"
            >
              <div className="text-3xl">
                🎬
              </div>

              <p className="mt-4 font-semibold">
                Movie Library
              </p>

              <p className="mt-1 text-sm text-white/35">
                Browse your collection
              </p>
            </a>

            <a
              href="/organize"
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-indigo-500/40 hover:bg-white/[0.05]"
            >
              <div className="text-3xl">
                🗂️
              </div>

              <p className="mt-4 font-semibold">
                Organizer
              </p>

              <p className="mt-1 text-sm text-white/35">
                Organize new movies
              </p>
            </a>

            <a
              href="/recent"
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-indigo-500/40 hover:bg-white/[0.05]"
            >
              <div className="text-3xl">
                🕐
              </div>

              <p className="mt-4 font-semibold">
                Recently Added
              </p>

              <p className="mt-1 text-sm text-white/35">
                Latest library activity
              </p>
            </a>
          </div>
        </section>

        {/* VERSION */}

        <footer className="mt-12 border-t border-white/10 pt-6">
          <div className="flex flex-col gap-2 text-xs text-white/25 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Caz Media Vault
            </p>

            <p>
              Version 1.0
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}