"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TvSidebar } from "@/components/media/TvSidebar";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import type { LibraryResponse, Movie } from "@/lib/media/types";

export default function ShowDetail({ id }: { id: string }) {
  const [episodes, setEpisodes] = useState<Movie[]>([]);
  const [error, setError] = useState("");
  useTvNavigation();

  useEffect(() => {
    fetch("/api/media/library", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as LibraryResponse | { success: false; error: string };
      if (!response.ok || !result.success) throw new Error("error" in result ? result.error : "Show not found.");
      const selected = result.movies.find((item) => item.id === id && item.mediaType === "tv");
      if (!selected) throw new Error("Show not found.");
      const series = (selected.seriesTitle || selected.title).toLowerCase();
      setEpisodes(result.movies.filter((item) => item.mediaType === "tv" && (item.seriesTitle || item.title).toLowerCase() === series).sort((a, b) => (a.seasonNumber || 0) - (b.seasonNumber || 0) || (a.episodeNumber || 0) - (b.episodeNumber || 0)));
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Show not found."));
  }, [id]);

  const seasons = useMemo(() => Array.from(new Set(episodes.map((episode) => episode.seasonNumber || 0))), [episodes]);
  const show = episodes[0];
  if (error) return <main className="show-shell"><TvSidebar /><div className="state-card error">{error}</div></main>;
  if (!show) return <main className="show-shell"><TvSidebar /><div className="state-card">Loading show…</div></main>;

  const background = show.backdropUrl || show.posterUrl;
  return <main className="show-shell"><TvSidebar />
    <section className="show-hero" style={background ? { backgroundImage: `linear-gradient(90deg, #05070b 8%, rgba(5,7,11,.88) 55%, rgba(5,7,11,.45)), url(${background})` } : undefined}>
      <Link href="/tv#shows" className="back-link focusable" data-focusable="true">← TV Shows</Link>
      <div><p className="eyebrow">TV SERIES</p><h1>{show.seriesTitle || show.title}</h1><p>{episodes.length} {episodes.length === 1 ? "episode" : "episodes"} in your library</p></div>
    </section>
    <section className="show-seasons">{seasons.map((season) => <section key={season} className="season-section"><h2>Season {String(season).padStart(2, "0")}</h2><div className="episode-list">{episodes.filter((episode) => (episode.seasonNumber || 0) === season).map((episode) => <Link key={episode.id} href={`/tv/watch/${episode.id}`} className="episode-card focusable" data-focusable="true"><div className="episode-thumb">{episode.posterUrl ? <img /* eslint-disable-line @next/next/no-img-element -- NAS art supports TV browsers */ src={episode.posterUrl} alt="" /> : <span>CH</span>}<b>▶</b></div><div><small>EPISODE {String(episode.episodeNumber || 0).padStart(2, "0")}</small><h3>{episode.title}</h3><p>{episode.overview || episode.fileName}</p></div></Link>)}</div></section>)}</section>
  </main>;
}
