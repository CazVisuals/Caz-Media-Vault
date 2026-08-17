import LoginForm from "./LoginForm";

function safeNext(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/tv";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">PRIVATE HOME CINEMA</p>
        <div className="login-mark">CH</div>
        <h1>Welcome home.</h1>
        <p className="login-copy">Sign in to enter Constant’s Hub.</p>
        <LoginForm nextPath={safeNext(params.next)} />
        <small>Private access for the Constant household</small>
      </section>
    </main>
  );
}
