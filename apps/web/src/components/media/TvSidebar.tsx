"use client";

import Link from "next/link";
import { useState } from "react";

const links = [
  { href: "/tv", icon: "⌂", label: "Home" },
  { href: "/tv/browse?view=recent", icon: "◷", label: "Recently Added" },
  { href: "/tv/browse?view=shows", icon: "▣", label: "TV Shows" },
  { href: "/tv/browse?view=kids", icon: "★", label: "Kids & Family" },
  { href: "/tv/browse?view=movies", icon: "▶", label: "Movies" },
  { href: "/settings", icon: "⚙", label: "Settings" },
];

export function TvSidebar() {
  const [open, setOpen] = useState(false);
  return <>
    <button className="menu-toggle focusable" data-focusable="true" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
    {open ? <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
    <aside className={`tv-sidebar${open ? " open" : ""}`}>
      <div className="sidebar-brand"><span>CONSTANT’S</span><strong>HUB</strong></div>
      <nav aria-label="Main navigation">{links.map((item) => <Link key={item.href} href={item.href} className="sidebar-link focusable" data-focusable="true" onClick={() => setOpen(false)}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav>
      <button className="sidebar-close focusable" data-focusable="true" onClick={() => setOpen(false)}>Close</button>
    </aside>
  </>;
}
