"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Mode = "automatic" | "kids" | "not-kids";
type Title = { key: string; title: string; mediaType: "movie" | "tv"; year: string | null; isKids: boolean; override: Exclude<Mode, "automatic"> | null; itemCount: number };

export default function CategoriesPage() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "kids" | "not-kids">("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/categories", { cache: "no-store" });
    const result = await response.json() as { titles?: Title[]; error?: string };
    if (!response.ok) throw new Error(result.error || "Could not load categories.");
    setTitles(result.titles || []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load categories.")), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const visible = useMemo(() => titles.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (filter === "all" || (filter === "kids" ? item.isKids : !item.isKids));
  }), [titles, search, filter]);

  async function change(item: Title, override: Mode) {
    setSaving(item.key); setError("");
    try {
      const response = await fetch("/api/admin/categories", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: item.key, override }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save category.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save category."); }
    finally { setSaving(null); }
  }

  return <main className="admin-shell">
    <header className="admin-header"><div><Link href="/settings">← System Status</Link><p className="eyebrow">MEDIA CATEGORIES</p><h1>Kids Profile Access</h1><p className="admin-copy">Override automatic classifications for an entire show or an individual movie.</p></div></header>
    {error ? <div className="state-card error">{error}</div> : null}
    <section className="admin-panel"><div className="profile-form"><label><span>Find a title</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="The Powerpuff Girls" /></label><label><span>Show</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All titles</option><option value="kids">Kids profile</option><option value="not-kids">Not in Kids profile</option></select></label></div><p><strong>{visible.length}</strong> titles shown</p></section>
    <section className="admin-panel"><div className="profile-list">{visible.map((item) => <article className="profile-row" key={item.key}><div className={`profile-avatar ${item.isKids ? "role-kids" : "role-guest"}`}>{item.mediaType === "tv" ? "TV" : "M"}</div><div><strong>{item.title}{item.year ? ` (${item.year})` : ""}</strong><span>{item.mediaType === "tv" ? `${item.itemCount} episodes` : "Movie"} · {item.isKids ? "Visible in Kids" : "Hidden from Kids"}{item.override ? " · Manual" : " · Automatic"}</span></div><div className="profile-actions"><select aria-label={`Kids category for ${item.title}`} disabled={saving === item.key} value={item.override || "automatic"} onChange={(event) => void change(item, event.target.value as Mode)}><option value="automatic">Automatic</option><option value="kids">Kids &amp; Family</option><option value="not-kids">Not Kids</option></select></div></article>)}</div></section>
  </main>;
}
