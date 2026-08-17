"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LibraryResponse, Movie } from "@/lib/media/types";

export default function CinemaNightPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [winner, setWinner] = useState<Movie | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => { void fetch("/api/media/library", { cache: "no-store" }).then((response) => response.json()).then((result: LibraryResponse) => setMovies(result.movies.filter((movie) => movie.mediaType === "movie"))).catch(() => undefined); }, []);
  const filtered = useMemo(() => movies.filter((movie) => !query || `${movie.title} ${movie.year || ""} ${movie.genres.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [movies, query]);
  function toggle(id: string) { setWinner(null); setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 8 ? [...current, id] : current); }
  function choose() { const pool = movies.filter((movie) => selected.includes(movie.id)); if (pool.length) setWinner(pool[Math.floor(Math.random() * pool.length)]); }
  return <main className="event-shell">
    <header className="event-header"><div><Link href="/tv">← Home</Link><p className="eyebrow">HOUSEHOLD EVENT</p><h1>Cinema Night</h1><p>Build tonight’s shortlist, then let Constant’s Hub make the final call.</p></div><div className="event-count"><strong>{selected.length}</strong><span>in tonight’s lineup</span></div></header>
    {winner ? <section className="cinema-winner" style={(winner.backdropUrl || winner.posterUrl) ? { backgroundImage: `linear-gradient(90deg, #080a10 15%, #080a10aa), url(${winner.backdropUrl || winner.posterUrl})` } : undefined}><p className="eyebrow">TONIGHT’S FEATURE</p><h2>{winner.title}</h2><p>{winner.overview || `${winner.year || ""} ${winner.genres.join(" · ")}`}</p><div className="hero-actions"><Link className="primary-button" href={`/tv/watch/${winner.id}`}>▶ Start Movie</Link><button className="secondary-button" onClick={choose}>Pick Again</button></div></section> : null}
    <section className="event-toolbar"><label><span>Find a movie</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your library…" /></label><button className="primary-button" disabled={selected.length < 2} onClick={choose}>✦ Choose Tonight’s Movie</button></section>
    <div className="cinema-grid">{filtered.map((movie) => <button key={movie.id} className={`cinema-choice${selected.includes(movie.id) ? " selected" : ""}`} onClick={() => toggle(movie.id)}><span className="cinema-poster">{movie.posterUrl ? <img /* eslint-disable-line @next/next/no-img-element -- NAS artwork is served by the media API */ src={movie.posterUrl} alt="" /> : <b>{movie.title.slice(0, 2).toUpperCase()}</b>}<i>{selected.includes(movie.id) ? "✓" : "+"}</i></span><strong>{movie.title}</strong><small>{movie.year || ""}{movie.genres[0] ? ` · ${movie.genres[0]}` : ""}</small></button>)}</div>
  </main>;
}
