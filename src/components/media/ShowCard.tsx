import Link from "next/link";
import type { Movie } from "@/lib/media/types";

export function ShowCard({ show, episodeCount }: { show: Movie; episodeCount: number }) {
  return <Link className="media-card focusable" href={`/tv/show/${show.id}`} data-focusable="true">
    <div className="poster-shell">
      {/* eslint-disable-next-line @next/next/no-img-element -- local NAS artwork supports older TV browsers */}
      {show.posterUrl ? <img src={show.posterUrl} alt="" className="poster" /> : <div className="poster-fallback"><span>CH</span></div>}
      <span className="episode-count">{episodeCount} {episodeCount === 1 ? "episode" : "episodes"}</span>
    </div>
    <strong>{show.seriesTitle || show.title}</strong>
    <span>{show.year || "Year unknown"} · TV Series</span>
  </Link>;
}
