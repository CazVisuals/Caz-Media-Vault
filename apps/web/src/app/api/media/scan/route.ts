import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const MEDIA_ROOT = "/Volumes/video";

type MediaItem = {
  name: string;
  type: "folder" | "file";
  path: string;
  relativePath: string;
  modifiedAt: string | null;
};

async function scanDirectory(
  directory: string,
  root: string
): Promise<MediaItem[]> {
  const entries = await fs.readdir(directory, {
    withFileTypes: true,
  });

  const items: MediaItem[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(
      directory,
      entry.name
    );

    const relativePath = path.relative(
      root,
      fullPath
    );

    let modifiedAt: string | null = null;

    try {
      const stats = await fs.stat(fullPath);

      modifiedAt =
        stats.mtime?.toISOString() ?? null;
    } catch {
      modifiedAt = null;
    }

    if (entry.isDirectory()) {
      items.push({
        name: entry.name,
        type: "folder",
        path: fullPath,
        relativePath,
        modifiedAt,
      });

      const children =
        await scanDirectory(
          fullPath,
          root
        );

      items.push(...children);

      continue;
    }

    if (entry.isFile()) {
      items.push({
        name: entry.name,
        type: "file",
        path: fullPath,
        relativePath,
        modifiedAt,
      });
    }
  }

  return items;
}

export async function GET() {
  try {
    const items = await scanDirectory(
      MEDIA_ROOT,
      MEDIA_ROOT
    );

    return NextResponse.json({
      success: true,
      root: MEDIA_ROOT,
      scannedAt:
        new Date().toISOString(),
      items,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not scan media folder.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}