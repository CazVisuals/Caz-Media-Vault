"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OfflineDownloadButton } from "@/components/media/OfflineDownloadButton";
import type { Movie } from "@/lib/media/types";
import styles from "./MediaCard.module.css";

export function MediaCard({ movie }: { movie: Movie }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (!menuOpen) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); }; document.body.style.overflow = "hidden"; window.addEventListener("keydown", close); return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", close); }; }, [menuOpen]);
  const detailHref = movie.mediaType === "tv" ? `/tv/show/${encodeURIComponent(movie.seriesTitle || movie.title)}` : `/tv/movie/${movie.id}`;
  return <>
    <article className={`media-card group ${styles.card}`}>
      <div className={`poster-shell netflix-poster-shell ${styles.posterShell}`}>
        <Link href={`/tv/watch/${movie.id}`} aria-label={`Play ${movie.title}`} className="netflix-poster-play focusable" data-focusable="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {movie.posterUrl ? <img src={movie.posterUrl} alt="" className="poster" /> : <div className="poster-fallback"><span>CH</span></div>}
          <div className="netflix-poster-shade" /><span className="netflix-play-circle" aria-hidden="true"><span className="netflix-play-triangle" /></span>
        </Link>
        {movie.rating !== null ? <span className="rating">★ {movie.rating.toFixed(1)}</span> : null}
        <div className="netflix-card-footer">
          <Link href={detailHref} aria-label={`Information about ${movie.title}`} className="focusable netflix-footer-button" data-focusable="true"><span aria-hidden="true">ⓘ</span></Link>
          <button type="button" aria-label={`More options for ${movie.title}`} className="focusable netflix-footer-button netflix-more-button" data-focusable="true" onClick={() => setMenuOpen(true)}>⋮</button>
        </div>
      </div>
      <Link href={detailHref} className="focusable block truncate font-semibold text-white" data-focusable="true">{movie.title}</Link><span>{movie.year || "Year unknown"}{movie.genre ? ` · ${movie.genre}` : ""}</span>
    </article>
    {menuOpen ? <div className="netflix-sheet-layer" role="presentation" onClick={() => setMenuOpen(false)}><section className="netflix-action-sheet" role="dialog" aria-modal="true" aria-label={`Options for ${movie.title}`} onClick={(event) => event.stopPropagation()}>
      <header className="netflix-sheet-header"><h2>{movie.title}</h2><button type="button" className="netflix-sheet-close" aria-label="Close" onClick={() => setMenuOpen(false)}>×</button></header>
      <div className="netflix-sheet-actions">
        <Link href={detailHref} className="netflix-sheet-action" onClick={() => setMenuOpen(false)}><span aria-hidden="true">ⓘ</span><strong>{movie.mediaType === "tv" ? "Episodes and Info" : "Movie Info"}</strong></Link>
        <Link href={`/tv/watch/${movie.id}`} className="netflix-sheet-action" onClick={() => setMenuOpen(false)}><span aria-hidden="true" className="netflix-sheet-play-icon"><span className="netflix-play-triangle" /></span><strong>Play</strong></Link>
        <div className="netflix-sheet-action netflix-download-action"><span aria-hidden="true">↓</span><div className="netflix-download-copy"><strong>Download</strong><small>Save to this device for offline playback</small></div><OfflineDownloadButton movie={movie} compact /></div>
      </div>
    </section></div> : null}
  </>;
}
