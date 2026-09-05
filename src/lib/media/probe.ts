import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_CONCURRENT_PROBES = 2;
let activeProbes = 0;
const probeWaiters: Array<() => void> = [];

async function acquireProbeSlot() {
  if (activeProbes < MAX_CONCURRENT_PROBES) { activeProbes += 1; return; }
  await new Promise<void>((resolve) => probeWaiters.push(resolve));
  activeProbes += 1;
}

function releaseProbeSlot() {
  activeProbes = Math.max(0, activeProbes - 1);
  probeWaiters.shift()?.();
}

type ProbeJson = {
  format?: { format_name?: string; duration?: string };
  streams?: { codec_type?: string; codec_name?: string; profile?: string; pix_fmt?: string; width?: number; height?: number }[];
};

export type MediaProbe = {
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  videoProfile: string | null;
  pixelFormat: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  mobileCompatible: boolean;
  conversionMode: "remux" | "audio-convert" | "transcode" | null;
  compatibilityReason: string;
};

export async function probeMedia(filePath: string): Promise<MediaProbe> {
  await acquireProbeSlot();
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }));
  } finally {
    releaseProbeSlot();
  }
  const result = JSON.parse(stdout) as ProbeJson;
  const video = result.streams?.find((stream) => stream.codec_type === "video");
  const audio = result.streams?.find((stream) => stream.codec_type === "audio");
  const container = result.format?.format_name || "unknown";
  const genuineMp4 = container.split(",").some((name) => name === "mov" || name === "mp4" || name === "m4a" || name === "3gp" || name === "3g2" || name === "mj2");
  const copySafePixelFormat = video?.pix_fmt === "yuv420p" || video?.pix_fmt === "yuvj420p";
  const videoCompatible = video?.codec_name === "h264" && copySafePixelFormat;
  const audioCompatible = !audio || audio.codec_name === "aac";
  const mobileCompatible = genuineMp4 && videoCompatible && audioCompatible;
  const conversionMode = mobileCompatible ? null : videoCompatible ? (audioCompatible ? "remux" : "audio-convert") : "transcode";
  const videoReason = video?.codec_name === "h264" && !copySafePixelFormat
    ? `H.264 pixel format is ${video.pix_fmt || "unknown"}`
    : `video is ${video?.codec_name || "unknown"}`;
  const reasons = [!genuineMp4 && `container is ${container}`, !videoCompatible && videoReason, !audioCompatible && `audio is ${audio?.codec_name || "unknown"}`].filter(Boolean);
  return {
    container,
    videoCodec: video?.codec_name || null,
    audioCodec: audio?.codec_name || null,
    videoProfile: video?.profile || null,
    pixelFormat: video?.pix_fmt || null,
    width: video?.width || null,
    height: video?.height || null,
    durationSeconds: result.format?.duration ? Number(result.format.duration) : null,
    mobileCompatible,
    conversionMode,
    compatibilityReason: mobileCompatible ? "H.264/AAC MP4 — ready for mobile playback." : `Conversion required: ${reasons.join(", ")}.`,
  };
}
