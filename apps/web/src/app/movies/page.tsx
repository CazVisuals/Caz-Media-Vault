import { Suspense } from "react";
import MoviesClient from "./MoviesClient";

function MoviesLoading() {
  return (
    <main className="min-h-screen bg-[#07090f] text-white">
      <header className="border-b border-white/10 bg-[#0b0e16]">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-2xl font-bold">
            Movies
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/50">
          Loading movie library...
        </div>
      </div>
    </main>
  );
}

export default function MoviesPage() {
  return (
    <Suspense fallback={<MoviesLoading />}>
      <MoviesClient />
    </Suspense>
  );
}