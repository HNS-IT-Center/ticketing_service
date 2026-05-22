"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  User,
  LogOut,
  Menu,
  X,
  Wrench,
  Users,
  Trophy,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Settings,
  Activity,
  Store,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import NotificationBell from "./NotificationBell";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: Record<string, NavItem[]> = {
  technician: [
    { href: "/technician/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/technician/tickets", label: "My Tickets", icon: <Ticket size={18} /> },
    { href: "/technician/tickets/create", label: "Create Ticket", icon: <PlusCircle size={18} /> },
    { href: "/technician/schedule", label: "Schedule", icon: <Users size={18} /> },
    { href: "/technician/leaderboard", label: "Leaderboard", icon: <Trophy size={18} /> },
    { href: "/technician/profile", label: "Profile", icon: <User size={18} /> },
  ],
  admin: [
    { href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/admin/tickets", label: "All Tickets", icon: <Ticket size={18} /> },
    { href: "/technician/tickets/create", label: "Create Ticket", icon: <PlusCircle size={18} /> },
    { href: "/admin/stores", label: "Stores", icon: <Store size={18} /> },
    { href: "/admin/users", label: "Users", icon: <Users size={18} /> },
    { href: "/admin/performance", label: "Performance", icon: <TrendingUp size={18} /> },
    { href: "/admin/leaderboard", label: "Leaderboard", icon: <Trophy size={18} /> },
    { href: "/admin/logs", label: "Logs", icon: <Activity size={18} /> },
    { href: "/admin/profile", label: "Profile", icon: <User size={18} /> },
  ],
  sales: [
    { href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/admin/tickets", label: "All Tickets", icon: <Ticket size={18} /> },
    { href: "/technician/tickets/create", label: "Create Ticket", icon: <PlusCircle size={18} /> },
    { href: "/admin/stores", label: "Stores", icon: <Store size={18} /> },
    { href: "/admin/profile", label: "Profile", icon: <User size={18} /> },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  technician: "Technician",
  admin: "Administrator",
  sales: "Sales",
};

interface DashboardShellProps {
  children: React.ReactNode;
  role: "customer" | "technician" | "admin" | "sales";
  userName: string;
  userId: string;
}

export default function DashboardShell({ children, role, userName, userId }: DashboardShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);     // mobile drawer
  const [collapsed, setCollapsed] = useState(false);          // desktop collapse
  const [profileOpen, setProfileOpen] = useState(false);      // profile dropdown
  const profileRef = useRef<HTMLDivElement>(null);

  // Restore collapse state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar_collapsed", String(!prev));
      return !prev;
    });
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navItems = NAV_ITEMS[role] || [];
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const profileHref = role === "sales" ? "/admin/profile" : `/${role}/profile`;
  const ticketsHref = role === "admin" || role === "sales" ? "/admin/tickets" : `/${role}/tickets`;

  const currentLabel =
    navItems.find((n) => pathname === n.href || pathname.startsWith(n.href))?.label ?? "Dashboard";

  return (
    <div className="dashboard-layout">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        {/* Logo area */}
        <div className="sidebar-logo" style={{ justifyContent: collapsed ? "center" : "flex-start", gap: "0.5rem" }}>
          {/* Logo icon (always shown) */}
          <div style={{ width: "2rem", height: "2rem", borderRadius: "0.375rem", overflow: "hidden", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-hns.jpg"
              alt="HNS IT Center"
              style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
            />
          </div>
          {/* Full name — hidden when collapsed */}
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                HNS IT Center
              </div>
              <div style={{ fontSize: "0.6875rem", opacity: 0.6, marginTop: "2px" }}>
                {ROLE_LABELS[role]}
              </div>
            </div>
          )}
        </div>

        {/* Desktop collapse toggle — floats outside the sidebar right edge */}
        <button
          onClick={toggleCollapse}
          className="sidebar-collapse-btn"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Nav links */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== `/${role}/dashboard` && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""} ${collapsed ? "collapsed" : ""}`}
                onClick={() => setSidebarOpen(false)}
                title={collapsed ? item.label : undefined}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sign out at bottom */}
        <div style={{ padding: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <form action={logoutAction}>
            <button
              type="submit"
              className={`sidebar-link ${collapsed ? "collapsed" : ""}`}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer" }}
              title={collapsed ? "Sign Out" : undefined}
            >
              <LogOut size={18} />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className={`dashboard-main ${collapsed ? "sidebar-collapsed" : ""}`}>
        {/* Topbar */}
        <header className="dashboard-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="mobile-menu-btn"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <h2 style={{ fontSize: "1.0625rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              {currentLabel}
            </h2>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <NotificationBell userId={userId} role={role} />

            {/* ── Profile badge with dropdown ── */}
            <div ref={profileRef} style={{ position: "relative" }}>
              <button
                onClick={() => setProfileOpen((p) => !p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "var(--white)",
                  border: "1px solid var(--border)",
                  borderRadius: "999px",
                  padding: "0.25rem 0.75rem 0.25rem 0.25rem",
                  cursor: "pointer",
                  transition: "box-shadow 0.2s",
                }}
                aria-haspopup="true"
                aria-expanded={profileOpen}
              >
                <div style={{
                  width: "1.75rem", height: "1.75rem", borderRadius: "50%",
                  background: "var(--primary)", color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
                }}>
                  {initials}
                </div>
                <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>
                  {userName.split(" ")[0]}
                </span>
              </button>

              {/* Dropdown */}
              {profileOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 0.5rem)",
                    width: "200px",
                    background: "var(--white)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-lg)",
                    zIndex: 50,
                    overflow: "hidden",
                    animation: "fadeIn 0.15s ease",
                  }}
                >
                  {/* User info header */}
                  <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border-light)" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)" }}>{userName}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem", textTransform: "capitalize" }}>{ROLE_LABELS[role]}</div>
                  </div>

                  {/* Menu items */}
                  <div style={{ padding: "0.375rem" }}>
                    <Link
                      href={profileHref}
                      onClick={() => setProfileOpen(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.625rem",
                        padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)",
                        fontSize: "0.875rem", color: "var(--text-primary)",
                        textDecoration: "none", transition: "background 0.15s",
                      }}
                      className="dropdown-item"
                    >
                      <User size={15} style={{ flexShrink: 0 }} />
                      Profile
                    </Link>
                    <Link
                      href={ticketsHref}
                      onClick={() => setProfileOpen(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.625rem",
                        padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)",
                        fontSize: "0.875rem", color: "var(--text-primary)",
                        textDecoration: "none", transition: "background 0.15s",
                      }}
                      className="dropdown-item"
                    >
                      <Ticket size={15} style={{ flexShrink: 0 }} />
                      My Tickets
                    </Link>

                    <div style={{ borderTop: "1px solid var(--border-light)", margin: "0.375rem 0" }} />

                    <form action={logoutAction}>
                      <button
                        type="submit"
                        style={{
                          display: "flex", alignItems: "center", gap: "0.625rem",
                          padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)",
                          fontSize: "0.875rem", color: "var(--accent)",
                          background: "none", border: "none", cursor: "pointer",
                          width: "100%", textAlign: "left", transition: "background 0.15s",
                          fontFamily: "inherit",
                        }}
                        className="dropdown-item-danger"
                      >
                        <LogOut size={15} style={{ flexShrink: 0 }} />
                        Sign Out
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
