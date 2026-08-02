"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS, ROLE_DESCRIPTIONS, ROLE_LABELS, type Profile } from "@/lib/roles";
import { signOut } from "@/app/auth-actions";

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = NAV_ITEMS.filter((item) => item.roles.includes(profile.role));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/zest-logo.png" alt="ZEST for English" />
          <button className="mobile-close" type="button" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="product-name">
          <span>ZE CenterOS</span>
          <small>Production Operations Platform</small>
        </div>
        <nav className="sidebar-nav">
          {visible.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link className={active ? "nav-item nav-active" : "nav-item"} href={item.href} key={item.href} onClick={() => setOpen(false)}>
                <i>{item.short}</i><span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-security">
          <strong>Role access enforced</strong>
          <span>UI permission + Supabase Row Level Security</span>
        </div>
        <div className="user-card">
          <span className="role-avatar">{profile.full_name.slice(0, 2).toUpperCase()}</span>
          <div><strong>{profile.full_name}</strong><small>{ROLE_LABELS[profile.role]} · {ROLE_DESCRIPTIONS[profile.role]}</small></div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu" type="button" onClick={() => setOpen(true)}>☰</button>
          <div className="topbar-title">
            <strong>{ROLE_LABELS[profile.role]} Workspace</strong>
            <span>Live database · Không có role switcher · Không có demo data</span>
          </div>
          <div className="row-actions"><Link className="button button-ghost" href="/profile">Hồ sơ</Link><form action={signOut}><button className="button button-ghost" type="submit">Đăng xuất</button></form></div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
