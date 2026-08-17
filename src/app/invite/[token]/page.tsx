"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, use } from "react";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [invite, setInvite] = useState<{ role: string; expiresAt: string | null } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    void fetch(`/api/invite/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invite unavailable.");
      setInvite(result.invite);
    }).catch((reason: Error) => setError(reason.message));
  }, [token]);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirmPassword") || "")) { setError("Passwords do not match."); setBusy(false); return; }
    try {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create account.");
      setComplete(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create account."); }
    finally { setBusy(false); }
  }

  if (complete) return <main className="login-shell"><section className="login-card"><p className="eyebrow">CONSTANT'S MEDIA VAULT</p><h1>You're all set</h1><p>Your account has been created. This invite can no longer be used.</p><Link href="/login" className="primary-button">Sign in</Link></section></main>;
  return <main className="login-shell"><section className="login-card"><p className="eyebrow">CONSTANT'S MEDIA VAULT</p><h1>Accept invitation</h1>{invite ? <p>Create your own login for this {invite.role} profile{invite.expiresAt ? ` · access expires ${new Date(invite.expiresAt).toLocaleString()}` : ""}.</p> : null}{error ? <div className="state-card error">{error}</div> : null}{invite ? <form className="profile-form" onSubmit={accept}><label><span>Display name</span><input name="displayName" required maxLength={40} /></label><label><span>Username</span><input name="username" required minLength={3} maxLength={32} autoCapitalize="none" /></label><label><span>Password</span><input name="password" required minLength={8} type="password" autoComplete="new-password" /></label><label><span>Confirm password</span><input name="confirmPassword" required minLength={8} type="password" autoComplete="new-password" /></label>{invite.role === "kids" ? <label><span>Parent PIN (optional)</span><input name="pin" inputMode="numeric" pattern="[0-9]{4,8}" type="password" /></label> : null}<button className="primary-button" disabled={busy}>{busy ? "Creating account…" : "Create my account"}</button></form> : null}</section></main>;
}
