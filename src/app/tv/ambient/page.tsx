"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LibraryResponse, Movie } from "@/lib/media/types";

export default function AmbientPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(new Date());
  useEffect(() => { void fetch("/api/media/library", { cache: "no-store" }).then((response) => response.json()).then((result: LibraryResponse) => setMovies(result.movies.filter((movie) => movie.backdropUrl || movie.posterUrl))).catch(() => undefined); }, []);
  useEffect(() => { const clock = window.setInterval(() => setNow(new Date()), 1000); const rotation = window.setInterval(() => setIndex((value) => value + 1), 18_000); return () => { window.clearInterval(clock); window.clearInterval(rotation); }; }, []);
  const featured = useMemo(() => movies.length ? movies[index % movies.length] : null, [index, movies]);
  const artwork = featured?.backdropUrl || featured?.posterUrl;
  return <main className="ambient-shell" style={artwork ? { backgroundImage: `url(${artwork})` } : undefined}>
    <div className="ambient-shade" />
    <Link href="/tv" className="ambient-exit focusable" data-focusable="true">← Exit Ambient Mode</Link>
    <div className="ambient-clock"><strong>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong><span>{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span></div>
    {featured ? <div className="ambient-title"><p className="eyebrow">FROM YOUR COLLECTION</p><h1>{featured.title}</h1><p>{featured.year}{featured.genres.length ? ` · ${featured.genres.slice(0, 2).join(" · ")}` : ""}</p></div> : null}
  </main>;
}
