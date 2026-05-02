"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  User,
  Bell,
  LogOut,
  Menu,
  X,
  Wrench,
  Users,
  BarChart3,
  Trophy,
  Settings,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import NotificationBell from "./NotificationBell";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: Record<string, NavItem[]> = {
  customer: [
    {
      href: "/customer/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard />,
    },
    { href: "/customer/tickets", label: "My Tickets", icon: <Ticket /> },
    {
      href: "/customer/tickets/create",
      label: "Create Ticket",
      icon: <PlusCircle />,
    },
    { href: "/customer/profile", label: "Profile", icon: <User /> },
  ],
  technician: [
    {
      href: "/technician/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard />,
    },
    {
      href: "/technician/tickets",
      label: "My Tickets",
      icon: <Ticket />,
    },
    {
      href: "/technician/leaderboard",
      label: "Leaderboard",
      icon: <Trophy />,
    },
    { href: "/technician/profile", label: "Profile", icon: <User /> },
  ],
  admin: [
    {
      href: "/admin/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard />,
    },
    { href: "/admin/tickets", label: "All Tickets", icon: <Ticket /> },
    { href: "/admin/users", label: "Users", icon: <Users /> },
    {
      href: "/admin/performance",
      label: "Performance",
      icon: <TrendingUp />,
    },
    {
      href: "/admin/leaderboard",
      label: "Leaderboard",
      icon: <Trophy />,
    },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  customer: "Customer",
  technician: "Technician",
  admin: "Administrator",
};

interface DashboardShellProps {
  children: React.ReactNode;
  role: "customer" | "technician" | "admin";
  userName: string;
  userId: string;
}

export default function DashboardShell({
  children,
  role,
  userName,
  userId,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = NAV_ITEMS[role] || [];
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="dashboard-layout">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <div
            style={{
              width: "2rem",
              height: "2rem",
              borderRadius: "0.5rem",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Wrench size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.2 }}>
              TechServe
            </div>
            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "2px" }}>
              {ROLE_LABELS[role]}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== `/${role}/dashboard` &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <form action={logoutAction}>
            <button type="submit" className="sidebar-link" style={{ width: "100%", background: "none", border: "none", cursor: "pointer" }}>
              <LogOut size={18} />
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="dashboard-main">
        {/* Topbar */}
        <header className="dashboard-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                display: "none",
                alignItems: "center",
                justifyContent: "center",
                width: "2.25rem",
                height: "2.25rem",
                border: "none",
                background: "none",
                cursor: "pointer",
                borderRadius: "0.5rem",
                color: "var(--text-secondary)",
              }}
              className="mobile-menu-btn"
              aria-label="Open menu"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h2 style={{ fontSize: "1.0625rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              {navItems.find((n) => pathname === n.href || pathname.startsWith(n.href))?.label ?? "Dashboard"}
            </h2>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <NotificationBell userId={userId} />
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "var(--white)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              padding: "0.25rem 0.75rem 0.25rem 0.25rem",
            }}>
              <div style={{
                width: "1.75rem",
                height: "1.75rem",
                borderRadius: "50%",
                background: "var(--primary)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {initials}
              </div>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>
                {userName.split(" ")[0]}
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="dashboard-content">{children}</main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
