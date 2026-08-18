"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Movie } from "@/lib/media/types";
import styles from "./FeaturedHero.module.css";

const ROTATE_MS = 7_000;

function featuredSelection(movies: Movie[]) {
  const bucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  return [...movies].filter((movie) => movie.mediaType === "movie").sort((left, right) => score(left.id, bucket) - score(right.id, bucket)).slice(0, 8);
}
function score(id: string, seed: number) { let value = seed | 0; for (let index = 0; index < id.length; index += 1) value = Math.imul(value ^ id.charCodeAt(index), 16777619); return value >>> 0; }

export function FeaturedHero({ movies }: { movies: Movie[] }) {
  const featured = useMemo(() => featuredSelection(movies), [movies]);
  const [index, setIndex] = useState(0);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);
  const safeIndex = index % Math.max(featured.length, 1);
  const current = featured[safeIndex];
  useEffect(() => { if (featured.length < 2 || trailerOpen || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; const timer = window.setInterval(() => setIndex((value) => (value + 1) % featured.length), ROTATE_MS); return () => window.clearInterval(timer); }, [featured.length, trailerOpen, paused]);
  function move(direction: number) { if (!featured.length) return; setTrailerOpen(false); setIndex((value) => (value + direction + featured.length) % featured.length); }
  if (!current) return <section className="hero empty-hero"><div className="hero-content"><p className="eyebrow">HOME CINEMA</p><h1>What do you want to watch?</h1><p>Your private Synology library will appear here.</p></div></section>;
  const artwork = current.backdropUrl || current.posterUrl;
  return <section className="hero featured-hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }} onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 45) move(end < touchStart.current ? 1 : -1); touchStart.current = null; }}>
    <div key={`${current.id}-art`} className="hero-backdrop" style={artwork ? { backgroundImage: `url(${artwork})` } : undefined} /><div className="hero-shade" />
    {trailerOpen && current.trailerYouTubeId ? <div className="hero-trailer"><iframe title={`${current.title} trailer`} src={`https://www.youtube-nocookie.com/embed/${current.trailerYouTubeId}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /><button className="trailer-close focusable" data-focusable="true" onClick={() => setTrailerOpen(false)}>✕ Close trailer</button></div> : null}
    {!trailerOpen ? <>
      <Link href={`/tv/watch/${current.id}`} aria-label={`Play ${current.title}`} className={`focusable ${styles.centerPlay}`} data-focusable="true"><span className={styles.playTriangle} aria-hidden="true" /></Link>
      <div key={`${current.id}-copy`} className="hero-content hero-copy"><p className="eyebrow !text-blue-400">FEATURED MOVIE</p><h1>{current.title}</h1><div className="hero-metadata"><span>{current.year || "Year unknown"}</span>{current.genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}{current.rating !== null ? <span>★ {current.rating.toFixed(1)}</span> : null}{current.runtimeMinutes ? <span>{current.runtimeMinutes} min</span> : null}</div><p className="hero-overview">{current.overview || "Ready to stream from your private collection."}</p><div className="hero-actions"><Link href={`/tv/watch/${current.id}`} className={`primary-button cinematic-play focusable !rounded-full ${styles.playButton}`} data-focusable="true"><span className={styles.playTriangle} aria-hidden="true" /><span>Play Movie</span></Link><Link href={`/tv/movie/${current.id}`} className={`secondary-button cinematic-button focusable !rounded-full ${styles.secondaryAction}`} data-focusable="true">ⓘ Info</Link>{current.trailerYouTubeId ? <button className={`secondary-button cinematic-button focusable !rounded-full ${styles.secondaryAction}`} data-focusable="true" onClick={() => setTrailerOpen(true)}>▷ Trailer</button> : null}</div></div>
    </> : null}
    {featured.length > 1 && !trailerOpen ? <><button className="hero-arrow hero-previous focusable" data-focusable="true" aria-label="Previous featured movie" onClick={() => move(-1)}>‹</button><button className="hero-arrow hero-next focusable" data-focusable="true" aria-label="Next featured movie" onClick={() => move(1)}>›</button><div className="hero-dots" aria-label="Featured movies">{featured.map((movie, itemIndex) => <button key={movie.id} className={itemIndex === safeIndex ? "active" : ""} aria-label={`Show ${movie.title}`} aria-current={itemIndex === safeIndex ? "true" : undefined} onClick={() => { setTrailerOpen(false); setIndex(itemIndex); }} />)}</div></> : null}
  </section>;
}
