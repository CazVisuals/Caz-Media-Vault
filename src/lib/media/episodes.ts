import path from "node:path";

export type EpisodeInfo = {
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
};

export function parseEpisodeName(fileName: string): EpisodeInfo | null {
  const stem = path.basename(fileName, path.extname(fileName));
  const match = stem.match(/(?:^|[ ._-])(?:s(\d{1,2})[ ._-]*e(\d{1,3})|(\d{1,2})x(\d{1,3}))(?:[ ._-]|$)/i);
  if (!match) return null;

  const seasonNumber = Number(match[1] || match[3]);
  const episodeNumber = Number(match[2] || match[4]);
  const seriesTitle = stem
    .slice(0, match.index)
    .replace(/\((19|20)\d{2}\)/g, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!seriesTitle || !Number.isSafeInteger(seasonNumber) || !Number.isSafeInteger(episodeNumber)) return null;
  return { seriesTitle, seasonNumber, episodeNumber };
}

export function episodeCode(episode: EpisodeInfo) {
  return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
}
