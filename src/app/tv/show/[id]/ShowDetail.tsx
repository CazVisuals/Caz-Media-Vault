"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TvSidebar } from "@/components/media/TvSidebar";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import { OfflineDownloadButton } from "@/components/media/OfflineDownloadButton";
import type { LibraryResponse, Movie } from "@/lib/media/types";

export default function ShowDetail({ id }: { id: string }) {
  const [episodes, setEpisodes] = useState<Movie[]>([]);
  const [error, setError] = useState("");
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ mediaId: string; seconds: number; completed: boolean }[]>([]);
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
  useEffect(() => { void fetch("/api/user/state", { cache: "no-store" }).then((response) => response.json()).then((state: { progress?: { mediaId: string; seconds: number; completed: boolean }[] }) => setProgress(state.progress || [])).catch(() => undefined); }, []);

  const seasons = useMemo(() => Array.from(new Set(episodes.map((episode) => episode.seasonNumber || 0))), [episodes]);
  const show = episodes[0];
  if (error) return <main className="show-shell"><TvSidebar /><div className="state-card error">{error}</div></main>;
  if (!show) return <main className="show-shell"><TvSidebar /><div className="state-card">Loading show…</div></main>;

  const background = show.backdropUrl || show.posterUrl;
  const nextEpisode = episodes.find((episode) => !progress.find((item) => item.mediaId === episode.id)?.completed) || episodes[0];
  const activeSeason = selectedSeason ?? nextEpisode?.seasonNumber ?? seasons[0] ?? 0;
  const seasonEpisodes = episodes.filter((episode) => (episode.seasonNumber || 0) === activeSeason);
  const watchedEpisodes = progress.filter((item) => item.completed && episodes.some((episode) => episode.id === item.mediaId)).length;
  return <main className="show-shell"><TvSidebar />
    <section className="show-hero" style={background ? { backgroundImage: `linear-gradient(90deg, #05070b 8%, rgba(5,7,11,.88) 55%, rgba(5,7,11,.45)), url(${background})` } : undefined}>
      <Link href="/tv#shows" className="back-link focusable" data-focusable="true">← TV Shows</Link>
      <div><p className="eyebrow">TV SERIES</p><h1>{show.seriesTitle || show.title}</h1><p>{seasons.length} {seasons.length === 1 ? "season" : "seasons"} · {episodes.length} {episodes.length === 1 ? "episode" : "episodes"} · {watchedEpisodes} watched</p>{nextEpisode ? <Link href={`/tv/watch/${nextEpisode.id}`} className="primary-button focusable" data-focusable="true">▶ {progress.some((item) => item.mediaId === nextEpisode.id && item.seconds > 30) ? "Continue series" : "Start series"}</Link> : null}</div>
    </section>
    <section className="show-seasons">
      <div className="season-toolbar"><div><p className="eyebrow">EPISODE GUIDE</p><h2>Season {String(activeSeason).padStart(2, "0")}</h2></div><div className="season-tabs" aria-label="Choose season">{seasons.map((season) => <button key={season} type="button" className={`season-tab focusable${season === activeSeason ? " active" : ""}`} data-focusable="true" aria-pressed={season === activeSeason} onClick={() => setSelectedSeason(season)}>Season {season}</button>)}</div></div>
      <section className="season-section"><div className="episode-list">{seasonEpisodes.map((episode) => { const state = progress.find((item) => item.mediaId === episode.id); return <article key={episode.id} className="episode-entry"><Link href={`/tv/watch/${episode.id}`} className="episode-card focusable" data-focusable="true"><div className="episode-thumb">{episode.posterUrl ? <img /* eslint-disable-line @next/next/no-img-element -- NAS art supports TV browsers */ src={episode.posterUrl} alt="" /> : <span>CH</span>}<b>{state?.completed ? "✓" : "▶"}</b></div><div><small>EPISODE {String(episode.episodeNumber || 0).padStart(2, "0")}{state?.completed ? " · WATCHED" : state?.seconds ? " · CONTINUE" : ""}</small><h3>{episode.title}</h3><p>{episode.overview || episode.fileName}</p></div></Link><OfflineDownloadButton movie={episode} compact /></article>; })}</div></section>
    </section>
  </main>;
}
