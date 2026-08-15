"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Profile = { id: string; username: string; displayName: string; role: "family" | "kids" | "guest"; disabled: boolean; expiresAt: string | null; createdAt: string };

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Profile["role"]>("family");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/profiles", { cache: "no-store" });
    const result = await response.json() as { profiles?: Profile[]; error?: string };
    if (!response.ok) throw new Error(result.error || "Could not load profiles.");
    setProfiles(result.profiles || []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((reason: Error) => setError(reason.message)), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not create profile.");
      event.currentTarget.reset(); setRole("family"); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create profile."); }
    finally { setBusy(false); }
  }

  async function change(profile: Profile, action: "toggle" | "delete") {
    const deleting = action === "delete";
    if (deleting && !window.confirm(`Delete ${profile.displayName}? They will immediately lose access.`)) return;
    setError("");
    const response = await fetch(deleting ? `/api/admin/profiles?id=${encodeURIComponent(profile.id)}` : "/api/admin/profiles", {
      method: deleting ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" },
      body: deleting ? undefined : JSON.stringify({ id: profile.id, disabled: !profile.disabled }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || "Could not update profile."); else await load();
  }

  return <main className="admin-shell">
    <header className="admin-header"><div><Link href="/settings">← System Status</Link><p className="eyebrow">OWNER ONLY</p><h1>Profiles</h1><p className="admin-copy">Create household logins here. Passwords and PINs are securely hashed and stored on your NAS.</p></div></header>
    {error ? <div className="state-card error">{error}</div> : null}
    <section className="admin-panel"><p className="eyebrow">NEW PROFILE</p><h2>Add someone</h2>
      <form className="profile-form" onSubmit={create}>
        <label><span>Display name</span><input name="displayName" required maxLength={40} placeholder="Lisa" /></label>
        <label><span>Username</span><input name="username" required minLength={3} maxLength={32} autoCapitalize="none" placeholder="lisa" /></label>
        <label><span>Password</span><input name="password" required minLength={8} type="password" autoComplete="new-password" /></label>
        <label><span>Profile type</span><select name="role" value={role} onChange={(event) => setRole(event.target.value as Profile["role"])}><option value="family">Family</option><option value="kids">Kids</option><option value="guest">Guest</option></select></label>
        {role === "kids" ? <label><span>Parent PIN (optional)</span><input name="pin" inputMode="numeric" pattern="[0-9]{4,8}" type="password" placeholder="4–8 digits" /></label> : null}
        {role === "guest" ? <label><span>Expires</span><input name="expiresAt" required type="datetime-local" /></label> : null}
        <button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create profile"}</button>
      </form>
    </section>
    <section className="admin-panel"><p className="eyebrow">HOUSEHOLD ACCESS</p><h2>Managed profiles</h2>
      <div className="profile-list">{profiles.length ? profiles.map((profile) => <article className="profile-row" key={profile.id}><div className={`profile-avatar role-${profile.role}`}>{profile.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{profile.displayName}</strong><span>@{profile.username} · {profile.role}{profile.expiresAt ? ` · expires ${new Date(profile.expiresAt).toLocaleString()}` : ""}</span></div><div className="profile-actions"><button className="secondary-button" onClick={() => void change(profile, "toggle")}>{profile.disabled ? "Enable" : "Disable"}</button><button className="danger-button" onClick={() => void change(profile, "delete")}>Delete</button></div></article>) : <p className="admin-copy">No extra profiles yet. Your environment login is the Owner account.</p>}</div>
    </section>
  </main>;
}
