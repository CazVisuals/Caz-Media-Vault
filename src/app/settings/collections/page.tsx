"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { buildCollections } from "@/lib/media/collections";
import type { Movie } from "@/lib/media/types";

type CollectionResponse = { collections?: Record<string, string[]>; hiddenCollections?: string[]; collectionArtwork?: Record<string, string> };

export default function CollectionsPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [settings, setSettings] = useState<CollectionResponse>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  async function load() {
    const [library, saved] = await Promise.all([fetch("/api/media/library", { cache: "no-store" }).then((r) => r.json()), fetch("/api/media/collections", { cache: "no-store" }).then((r) => r.json())]);
    setMovies((library.movies || []).filter((item: Movie) => item.mediaType === "movie")); setSettings(saved || {});
  }
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(() => setError("Could not load collections.")), 0); return () => window.clearTimeout(timer); }, []);
  const generated = useMemo(() => buildCollections(movies, settings.collections || {}, []), [movies, settings.collections]);
  const visibleMovies = movies.filter((movie) => `${movie.title} ${movie.year || ""}`.toLowerCase().includes(search.toLowerCase()));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/media/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, previousName: editing, mediaIds: selected }) });
    const result = await response.json() as { error?: string }; if (!response.ok) setError(result.error || "Could not save collection."); else { cancelEdit(); await load(); }
  }
  function edit(collectionName: string, ids: string[]) { setEditing(collectionName); setName(collectionName); setSelected(ids); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function cancelEdit() { setEditing(null); setName(""); setSelected([]); setSearch(""); }
  async function remove(collectionName: string) { if (!confirm(`Delete ${collectionName}?`)) return; await fetch(`/api/media/collections?name=${encodeURIComponent(collectionName)}`, { method: "DELETE" }); await load(); }
  async function preference(collectionName: string, body: { hidden?: boolean; artworkId?: string | null }) { await fetch("/api/media/collections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: collectionName, ...body }) }); await load(); }

  return <main className="admin-shell"><header className="admin-header"><div><Link href="/settings">← System Status</Link><p className="eyebrow">OWNER ONLY</p><h1>Collection Studio</h1><p className="admin-copy">Build custom shelves and control the automatic franchises shown to your household.</p></div></header>{error ? <div className="state-card error">{error}</div> : null}
    <section className="admin-panel collection-editor"><div className="queue-heading"><div><p className="eyebrow">{editing ? "EDIT COLLECTION" : "NEW COLLECTION"}</p><h2>{editing || "Create a custom collection"}</h2></div>{editing ? <button className="secondary-button" onClick={cancelEdit}>Cancel editing</button> : null}</div><form onSubmit={save} className="profile-form"><label><span>Collection name</span><input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Family Favorites" /></label><label><span>Filter titles</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search movies…" /></label><div className="collection-picker">{visibleMovies.map((movie) => <label key={movie.id}><input type="checkbox" checked={selected.includes(movie.id)} onChange={() => setSelected((current) => current.includes(movie.id) ? current.filter((id) => id !== movie.id) : [...current, movie.id])} /> <span>{movie.title} {movie.year ? `(${movie.year})` : ""}</span></label>)}</div><button className="primary-button" disabled={!selected.length}>{editing ? "Save changes" : "Create collection"}</button></form></section>
    <section className="admin-panel"><p className="eyebrow">COLLECTION MANAGER</p><h2>Automatic & custom collections</h2><div className="managed-collections">{generated.map((collection) => { const customIds = settings.collections?.[collection.name]; const hidden = settings.hiddenCollections?.includes(collection.name); return <article className={`managed-collection${hidden ? " is-hidden" : ""}`} key={collection.name}><div><strong>{collection.name}</strong><span>{collection.movies.length} titles · {customIds ? "Custom" : "Automatic"} · chronological</span></div><select aria-label={`${collection.name} artwork`} value={settings.collectionArtwork?.[collection.name] || ""} onChange={(event) => void preference(collection.name, { artworkId: event.target.value || null })}><option value="">Automatic artwork</option>{collection.movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title} {movie.year ? `(${movie.year})` : ""}</option>)}</select><div className="profile-actions"><Link className="secondary-button" href={`/tv/collections?name=${encodeURIComponent(collection.name)}`}>Open</Link>{customIds ? <button className="secondary-button" onClick={() => edit(collection.name, customIds)}>Edit</button> : null}<button className="secondary-button" onClick={() => void preference(collection.name, { hidden: !hidden })}>{hidden ? "Show" : "Hide"}</button>{customIds ? <button className="danger-button" onClick={() => void remove(collection.name)}>Delete</button> : null}</div></article>; })}</div></section>
  </main>;
}
