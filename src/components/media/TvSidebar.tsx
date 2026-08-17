"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/tv", icon: "⌂", label: "Home" },
  { href: "/tv/browse?view=recent", icon: "◷", label: "Recently Added" },
  { href: "/tv/browse?view=shows", icon: "▣", label: "TV Shows" },
  { href: "/tv/browse?view=kids", icon: "★", label: "Kids & Family" },
  { href: "/tv/browse?view=movies", icon: "▶", label: "Movies" },
  { href: "/tv/collections", icon: "◆", label: "Collections" },
  { href: "/tv/offline", icon: "↓", label: "Offline" },
  { href: "/tv/cinema-night", icon: "✦", label: "Cinema Night" },
  { href: "/tv/ambient", icon: "◌", label: "Ambient Mode" },
];

const mobileLinks = [
  { href: "/tv", icon: "⌂", label: "Home" },
  { href: "/tv/browse?view=shows", icon: "▣", label: "Shows" },
  { href: "/tv/search", icon: "⌕", label: "Search" },
  { href: "/tv/offline", icon: "↓", label: "Downloads" },
];

export function TvSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => { void fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()).then((result: { authenticated?: boolean; profile?: { role?: string } | null }) => { setAuthenticated(Boolean(result.authenticated)); setAdmin(result.profile?.role === "owner" || result.profile?.role === "admin"); }).catch(() => { setAuthenticated(false); setAdmin(false); }); }, []);

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
      <nav aria-label="Main navigation">{links.map((item) => <Link key={item.href} href={item.href} className={`sidebar-link focusable${pathname === item.href.split("?")[0] ? " active" : ""}`} data-focusable="true" onClick={() => setOpen(false)}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}{admin ? <Link href="/settings" className={`sidebar-link focusable${pathname.startsWith("/settings") ? " active" : ""}`} data-focusable="true" onClick={() => setOpen(false)}><span aria-hidden="true">⚙</span>Settings</Link> : null}</nav>
      <div className="sidebar-footer">
        {authenticated ? <button className="sidebar-link sidebar-logout focusable" data-focusable="true" onClick={() => void logout()}><span aria-hidden="true">↪</span>Log out</button> : null}
        <button className="sidebar-close focusable" data-focusable="true" onClick={() => setOpen(false)}>Close</button>
      </div>
    </aside>
    <nav className="mobile-dock" aria-label="Quick navigation">{mobileLinks.map((item) => <Link key={item.href} href={item.href} className={pathname === item.href.split("?")[0] ? "active" : ""}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></Link>)}</nav>
  </>;
}
