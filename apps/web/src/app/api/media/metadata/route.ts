import { NextRequest, NextResponse } from "next/server";

type TmdbGenre = {
  id: number;
  name: string;
};

type TmdbMovie = {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
  genre_ids?: number[];
};

type SearchResponse = {
  results: TmdbMovie[];
};

type GenreResponse = {
  genres: TmdbGenre[];
};

async function getGenres(token: string) {
  const response = await fetch(
    "https://api.themoviedb.org/3/genre/movie/list?language=en-US",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `TMDB genre request failed with status ${response.status}.`
    );
  }

  const result =
    (await response.json()) as GenreResponse;

  return result.genres ?? [];
}

export async function GET(request: NextRequest) {
  try {
    const token = process.env.TMDB_READ_ACCESS_TOKEN;

    if (!token) {
      throw new Error(
        "TMDB_READ_ACCESS_TOKEN is missing."
      );
    }

    const { searchParams } = new URL(request.url);

    const title =
      searchParams.get("title")?.trim();

    const year =
      searchParams.get("year")?.trim();

    if (!title) {
      return NextResponse.json(
        {
          success: false,
          error: "Movie title is required.",
        },
        { status: 400 }
      );
    }

    const url = new URL(
      "https://api.themoviedb.org/3/search/movie"
    );

    url.searchParams.set("query", title);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("language", "en-US");

    if (year) {
      url.searchParams.set("year", year);
    }

    const [movieResponse, genres] =
      await Promise.all([
        fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            accept: "application/json",
          },
          cache: "no-store",
        }),
        getGenres(token),
      ]);

    if (!movieResponse.ok) {
      throw new Error(
        `TMDB movie request failed with status ${movieResponse.status}.`
      );
    }

    const result =
      (await movieResponse.json()) as SearchResponse;

    const movie = result.results?.[0];

    if (!movie) {
      return NextResponse.json({
        success: true,
        movie: null,
      });
    }

    const genreNames =
      movie.genre_ids
        ?.map(
          (id) =>
            genres.find((genre) => genre.id === id)
              ?.name
        )
        .filter(
          (name): name is string =>
            Boolean(name)
        ) ?? [];

    return NextResponse.json({
      success: true,
      movie: {
        id: movie.id,
        title: movie.title,
        year: movie.release_date
          ? movie.release_date.slice(0, 4)
          : null,
        overview: movie.overview || null,
        rating:
          movie.vote_average ?? null,
        posterUrl: movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : null,
        genres: genreNames,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not load movie metadata.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}