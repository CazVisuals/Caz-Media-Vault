"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/tv", icon: "⌂", label: "Home" },
  { href: "/tv/browse?view=recent", icon: "◷", label: "Recently Added" },
  { href: "/tv/browse?view=shows", icon: "▣", label: "TV Shows" },
  { href: "/tv/browse?view=kids", icon: "★", label: "Kids & Family" },
  { href: "/tv/browse?view=movies", icon: "▶", label: "Movies" },
];

export function TvSidebar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => { void fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()).then((result: { authenticated?: boolean; profile?: { role?: string } | null }) => { setAuthenticated(Boolean(result.authenticated)); setOwner(result.profile?.role === "owner"); }).catch(() => { setAuthenticated(false); setOwner(false); }); }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }
  return <>
    <button className="menu-toggle focusable" data-focusable="true" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
    {open ? <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
    <aside className={`tv-sidebar${open ? " open" : ""}`}>
      <div className="sidebar-brand"><span>CONSTANT’S</span><strong>HUB</strong></div>
      <nav aria-label="Main navigation">{links.map((item) => <Link key={item.href} href={item.href} className="sidebar-link focusable" data-focusable="true" onClick={() => setOpen(false)}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}{owner ? <Link href="/settings" className="sidebar-link focusable" data-focusable="true" onClick={() => setOpen(false)}><span aria-hidden="true">⚙</span>Settings</Link> : null}</nav>
      <div className="sidebar-footer">
        {authenticated ? <button className="sidebar-link sidebar-logout focusable" data-focusable="true" onClick={() => void logout()}><span aria-hidden="true">↪</span>Log out</button> : null}
        <button className="sidebar-close focusable" data-focusable="true" onClick={() => setOpen(false)}>Close</button>
      </div>
    </aside>
  </>;
}
