"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS, ROLE_LABELS, type Profile } from "@/lib/roles";
import { signOut } from "@/app/auth-actions";

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = NAV_ITEMS[profile.role];
  const activeItem = visible.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const todayLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date());

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/zest-logo.png" alt="ZEST for English" />
          <button className="mobile-close" type="button" onClick={() => setOpen(false)} aria-label="Đóng menu">×</button>
        </div>
        <div className="product-name">
          <span>ZE CenterOS</span>
          <small>Quản lý vận hành trung tâm</small>
        </div>
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {visible.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link className={active ? "nav-item nav-active" : "nav-item"} href={item.href} key={item.href} onClick={() => setOpen(false)}>
                <i aria-hidden="true">{item.short}</i><span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link className="user-card user-card-link" href="/profile">
            <span className="role-avatar">{profile.full_name.slice(0, 2).toUpperCase()}</span>
            <div><strong>{profile.full_name}</strong><small>{ROLE_LABELS[profile.role]} · Xem hồ sơ</small></div>
          </Link>
          <form action={signOut}><button className="sidebar-signout" type="submit">Đăng xuất</button></form>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu" type="button" onClick={() => setOpen(true)} aria-label="Mở menu">☰</button>
          <div className="topbar-title">
            <strong>{activeItem?.label || "ZE CenterOS"}</strong>
            <span>{todayLabel}</span>
          </div>
          <div className="topbar-actions">
            <Link className="topbar-button topbar-schedule" href="/schedule">◷ Xem lịch tuần</Link>
            <Link className="topbar-button" href="/profile">Hồ sơ</Link>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
