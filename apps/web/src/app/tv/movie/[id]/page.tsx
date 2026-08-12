import MovieDetail from "./MovieDetail";

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MovieDetail id={id} />;
}
