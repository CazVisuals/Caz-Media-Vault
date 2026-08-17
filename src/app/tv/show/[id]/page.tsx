import ShowDetail from "./ShowDetail";

export default async function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShowDetail id={id} />;
}
