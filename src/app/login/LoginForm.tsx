"use client";

import { FormEvent, useState } from "react";

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    const result = await response.json().catch(() => ({ error: "Unable to sign in." }));

    if (!response.ok) {
      setError(result.error ?? "Unable to sign in.");
      setSubmitting(false);
      return;
    }

    window.location.assign(nextPath);
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        <span>Username</span>
        <input name="username" autoComplete="username" autoCapitalize="none" required autoFocus />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error ? <p className="login-error" role="alert">{error}</p> : null}
      <button className="primary-button login-button" disabled={submitting} type="submit">
        {submitting ? "Signing in…" : "Enter Constant’s Hub"}
      </button>
    </form>
  );
}
