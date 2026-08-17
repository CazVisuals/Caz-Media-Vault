"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { Movie } from "@/lib/media/types";

export default function CollectionsPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [collections, setCollections] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  async function load() {
    const [library, saved] = await Promise.all([fetch("/api/media/library", { cache: "no-store" }).then((r) => r.json()), fetch("/api/media/collections", { cache: "no-store" }).then((r) => r.json())]);
    setMovies((library.movies || []).filter((item: Movie) => item.mediaType === "movie")); setCollections(saved.collections || {});
  }
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(() => setError("Could not load collections.")), 0); return () => window.clearTimeout(timer); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") || "");
    const response = await fetch("/api/media/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mediaIds: selected }) });
    const result = await response.json() as { error?: string }; if (!response.ok) setError(result.error || "Could not save collection."); else { setSelected([]); event.currentTarget.reset(); await load(); }
  }
  async function remove(name: string) { if (!confirm(`Delete ${name}?`)) return; await fetch(`/api/media/collections?name=${encodeURIComponent(name)}`, { method: "DELETE" }); await load(); }
  return <main className="admin-shell"><header className="admin-header"><div><Link href="/settings">← System Status</Link><p className="eyebrow">OWNER ONLY</p><h1>Custom Collections</h1></div></header>{error ? <div className="state-card error">{error}</div> : null}<section className="admin-panel"><form onSubmit={save} className="profile-form"><label><span>Collection name</span><input name="name" required placeholder="Family Favorites" /></label><div className="collection-picker">{movies.map((movie) => <label key={movie.id}><input type="checkbox" checked={selected.includes(movie.id)} onChange={() => setSelected((current) => current.includes(movie.id) ? current.filter((id) => id !== movie.id) : [...current, movie.id])} /> <span>{movie.title} {movie.year ? `(${movie.year})` : ""}</span></label>)}</div><button className="primary-button" disabled={!selected.length}>Save collection</button></form></section><section className="admin-panel"><h2>Saved collections</h2>{Object.entries(collections).map(([name, ids]) => <div className="profile-row" key={name}><div><strong>{name}</strong><span>{ids.length} titles</span></div><button className="danger-button" onClick={() => void remove(name)}>Delete</button></div>)}</section></main>;
}
