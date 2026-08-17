"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MediaCard } from "@/components/media/MediaCard";
import { TvSidebar } from "@/components/media/TvSidebar";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import { buildCollections } from "@/lib/media/collections";
import type { LibraryResponse, Movie } from "@/lib/media/types";

type CollectionSettings = { collections?: Record<string, string[]>; hiddenCollections?: string[]; collectionArtwork?: Record<string, string> };

export default function CollectionsPage() {
  return <Suspense fallback={<main className="browse-shell"><TvSidebar /><div className="state-card">Building collections…</div></main>}><CollectionsContent /></Suspense>;
}

function CollectionsContent() {
  const requestedName = useSearchParams().get("name");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [settings, setSettings] = useState<CollectionSettings>({});
  const [error, setError] = useState("");
  useTvNavigation();
  useEffect(() => {
    void Promise.all([
      fetch("/api/media/library", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/media/collections", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([library, saved]: [LibraryResponse, CollectionSettings]) => {
      if (!library.success) throw new Error("Library unavailable.");
      setMovies(library.movies); setSettings(saved);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Collections unavailable."));
  }, []);
  const collections = useMemo(() => buildCollections(movies, settings.collections || {}, settings.hiddenCollections || []), [movies, settings]);
  const selected = requestedName ? collections.find((item) => item.name.toLowerCase() === requestedName.toLowerCase()) : null;
  const artwork = selected ? movies.find((movie) => movie.id === settings.collectionArtwork?.[selected.name]) || selected.movies[0] : null;

  if (error) return <main className="browse-shell"><TvSidebar /><div className="state-card error">{error}</div></main>;
  if (requestedName && !selected && movies.length) return <main className="browse-shell"><TvSidebar /><div className="state-card">That collection is empty or hidden.<br /><Link href="/tv/collections">Browse all collections →</Link></div></main>;
  if (selected) return <main className="collection-shell"><TvSidebar />
    <header className="collection-hero" style={artwork?.backdropUrl ? { backgroundImage: `linear-gradient(90deg, #05070b 8%, #05070bc7 48%, #05070b33), linear-gradient(0deg, #05070b, transparent 65%), url(${artwork.backdropUrl})` } : undefined}>
      <Link href="/tv/collections" className="back-link focusable" data-focusable="true">← All Collections</Link>
      <div><p className="eyebrow">CURATED COLLECTION</p><h1>{selected.name}</h1><p>{selected.movies.length} titles · ordered by release year</p></div>
    </header>
    <section className="collection-content"><div className="library-grid">{selected.movies.map((movie) => <MediaCard key={movie.id} movie={movie} />)}</div></section>
  </main>;

  return <main className="browse-shell"><TvSidebar /><header className="browse-header"><p className="eyebrow">EXPLORE YOUR UNIVERSES</p><h1>Collections</h1><p>{collections.length} automatically organized and custom collections</p></header>
    <section className="collection-grid">{collections.map((collection) => {
      const featured = movies.find((movie) => movie.id === settings.collectionArtwork?.[collection.name]) || collection.movies[0];
      return <Link key={collection.name} href={`/tv/collections?name=${encodeURIComponent(collection.name)}`} className="collection-card focusable" data-focusable="true" style={featured?.backdropUrl ? { backgroundImage: `linear-gradient(0deg, #080b11f5 5%, #080b1166 75%), url(${featured.backdropUrl})` } : undefined}><span>{collection.automatic ? "AUTO COLLECTION" : "CUSTOM COLLECTION"}</span><strong>{collection.name}</strong><small>{collection.movies.length} titles · {collection.movies[0]?.year || "—"}–{collection.movies.at(-1)?.year || "—"}</small></Link>;
    })}</section>
  </main>;
}

