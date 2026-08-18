"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/tv", icon: "⌂", label: "Home" },
  { href: "/tv/browse?view=shows", icon: "▣", label: "Shows" },
  { href: "/tv/browse?view=movies", icon: "◎", label: "Movies" },
  { href: "/tv/collections", icon: "◆", label: "Collections" },
  { href: "/tv", icon: "♡", label: "My List" },
  { href: "/tv/offline", icon: "↓", label: "Downloads" },
  { href: "/tv/search", icon: "⌕", label: "Search" },
];

const mobileLinks = [
  { href: "/tv", icon: "⌂", label: "Home" },
  { href: "/tv/browse?view=shows", icon: "▣", label: "Shows" },
  { href: "/tv/browse?view=movies", icon: "◎", label: "Movies" },
  { href: "/tv/collections", icon: "◆", label: "Collections" },
  { href: "/tv", icon: "♡", label: "My List" },
  { href: "/tv/offline", icon: "↓", label: "Downloads" },
  { href: "/settings/profiles", icon: "♙", label: "Profile" },
];

export function TvSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { authenticated?: boolean; profile?: { role?: string } | null }) => {
        setAuthenticated(Boolean(result.authenticated));
        setAdmin(result.profile?.role === "owner" || result.profile?.role === "admin");
      })
      .catch(() => {
        setAuthenticated(false);
        setAdmin(false);
      });
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) => {
    const base = href.split("?")[0];
    if (href === "/tv") return pathname === "/tv";
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  return <>
    <button className="menu-toggle focusable" data-focusable="true" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
    {open ? <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
    <aside className={`tv-sidebar${open ? " open" : ""}`}>
      <Link href="/tv" className="sidebar-brand focusable" data-focusable="true" onClick={() => setOpen(false)}>
        <span className="sidebar-logo-mark">C</span>
        <span className="sidebar-brand-copy"><strong>CONSTANT&apos;S</strong><small>MEDIA VAULT</small></span>
      </Link>
      <nav aria-label="Main navigation">
        {links.map((item) => <Link key={`${item.href}-${item.label}`} href={item.href} className={`sidebar-link focusable${isActive(item.href) && item.label !== "My List" ? " active" : ""}`} data-focusable="true" onClick={() => setOpen(false)}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
        {admin ? <Link href="/settings/profiles" className={`sidebar-link focusable${pathname.startsWith("/settings/profiles") ? " active" : ""}`} data-focusable="true" onClick={() => setOpen(false)}><span aria-hidden="true">♙</span>Profiles</Link> : null}
        {admin ? <Link href="/settings" className={`sidebar-link focusable${pathname === "/settings" ? " active" : ""}`} data-focusable="true" onClick={() => setOpen(false)}><span aria-hidden="true">⚙</span>Settings</Link> : null}
      </nav>
      <div className="sidebar-footer">
        {authenticated ? <button className="sidebar-link sidebar-logout focusable" data-focusable="true" onClick={() => void logout()}><span aria-hidden="true">↪</span>Log out</button> : null}
        <button className="sidebar-close focusable" data-focusable="true" onClick={() => setOpen(false)}>Close</button>
      </div>
    </aside>
    <nav className="mobile-dock" aria-label="Quick navigation">
      {mobileLinks.filter((item) => item.label !== "Profile" || admin).map((item) => <Link key={`${item.href}-${item.label}`} href={item.href} className={isActive(item.href) && item.label !== "My List" ? "active" : ""}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></Link>)}
    </nav>
  </>;
}
