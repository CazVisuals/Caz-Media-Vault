import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const MEDIA_ROOT = "/Volumes/video";

function isInsideMediaRoot(filePath: string) {
  const resolvedRoot = path.resolve(MEDIA_ROOT);
  const resolvedPath = path.resolve(filePath);

  return (
    resolvedPath === resolvedRoot ||
    resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const source =
      typeof body.source === "string"
        ? body.source
        : "";

    const destination =
      typeof body.destination === "string"
        ? body.destination
        : "";

    if (!source || !destination) {
      return NextResponse.json(
        {
          success: false,
          error: "Source and destination are required.",
        },
        { status: 400 }
      );
    }

    if (
      !isInsideMediaRoot(source) ||
      !isInsideMediaRoot(destination)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid media path.",
        },
        { status: 400 }
      );
    }

    if (source === destination) {
      return NextResponse.json(
        {
          success: false,
          error: "Movie is already in the suggested location.",
        },
        { status: 400 }
      );
    }

    try {
      await fs.access(source);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Source movie no longer exists.",
        },
        { status: 404 }
      );
    }

    try {
      await fs.access(destination);

      return NextResponse.json(
        {
          success: false,
          error:
            "A file already exists at the destination. Nothing was moved.",
        },
        { status: 409 }
      );
    } catch {
      // Destination does not exist. Safe to continue.
    }

    const destinationFolder =
      path.dirname(destination);

    await fs.mkdir(destinationFolder, {
      recursive: true,
    });

    await fs.rename(source, destination);

    return NextResponse.json({
      success: true,
      message: "Movie organized successfully.",
      previousPath: source,
      newPath: destination,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not move movie.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}