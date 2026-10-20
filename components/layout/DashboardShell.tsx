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
  ShieldCheck,
  Package,
  Truck,
  ChevronDown,
  BarChart3,
  Database,
  CalendarDays,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import NotificationBell from "./NotificationBell";
import RequestsBell from "./RequestsBell";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Other paths that belong to this entry, e.g. a case page reached from the RMA dashboard. */
  also?: string[];
};

/**
 * A group in the sidebar. A titled section folds open and closed; an untitled
 * one, or one holding a single entry, is shown as plain links.
 */
type NavSection = {
  key: string;
  title?: string;
  icon?: React.ReactNode;
  /** Open until the user closes it — for what is opened all day. */
  defaultOpen?: boolean;
  items: NavItem[];
};

// Grouped by what the page is for, the same groups in every portal. Profile is
// in none of them: it is in the menu under the name at the top right. The small
// portals keep their groups open — they fold only when someone folds them.
const NAV_SECTIONS: Record<string, NavSection[]> = {
  technician: [
    {
      key: "home",
      items: [{ href: "/technician/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> }],
    },
    {
      key: "tickets",
      title: "Tiket",
      icon: <Ticket size={18} />,
      defaultOpen: true,
      items: [
        { href: "/technician/tickets", label: "My Tickets", icon: <Ticket size={18} /> },
        { href: "/technician/tickets/create", label: "Create Ticket", icon: <PlusCircle size={18} /> },
      ],
    },
    {
      key: "team",
      title: "Tim",
      icon: <Users size={18} />,
      defaultOpen: true,
      items: [
        { href: "/technician/schedule", label: "Schedule", icon: <CalendarDays size={18} /> },
        { href: "/technician/leaderboard", label: "Leaderboard", icon: <Trophy size={18} /> },
      ],
    },
  ],
  admin: [
    {
      key: "home",
      items: [{ href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> }],
    },
    {
      key: "tickets",
      title: "Tiket",
      icon: <Ticket size={18} />,
      defaultOpen: true,
      items: [
        { href: "/admin/tickets", label: "All Tickets", icon: <Ticket size={18} /> },
        { href: "/admin/tickets/create", label: "Create Ticket", icon: <PlusCircle size={18} /> },
      ],
    },
    // The RMA desk's own pages, opened inside the admin portal: an
    // administrator stays in this sidebar instead of being moved to the desk's.
    {
      key: "rma",
      title: "Klaim & RMA",
      icon: <ShieldCheck size={18} />,
      items: [
        { href: "/rma/dashboard", label: "Dashboard RMA", icon: <LayoutDashboard size={18} />, also: ["/rma/cases"] },
        { href: "/rma/tickets", label: "Tiket Klaim", icon: <Ticket size={18} /> },
        { href: "/rma/logs", label: "Log RMA", icon: <Activity size={18} /> },
      ],
    },
    {
      key: "reports",
      title: "Laporan",
      icon: <BarChart3 size={18} />,
      items: [
        { href: "/admin/performance", label: "Performance", icon: <TrendingUp size={18} /> },
        { href: "/admin/leaderboard", label: "Leaderboard", icon: <Trophy size={18} /> },
        { href: "/admin/reports/parts", label: "Laporan Part", icon: <Package size={18} /> },
        { href: "/admin/logs", label: "Log Tiket", icon: <Activity size={18} /> },
      ],
    },
    {
      key: "master",
      title: "Data Master",
      icon: <Database size={18} />,
      items: [
        { href: "/admin/stores", label: "Stores", icon: <Store size={18} /> },
        { href: "/admin/users", label: "Users", icon: <Users size={18} /> },
        { href: "/admin/vendors", label: "Vendor", icon: <Truck size={18} />, also: ["/rma/vendors"] },
      ],
    },
    {
      key: "settings",
      items: [{ href: "/admin/settings/access", label: "Pengaturan Akses", icon: <Settings size={18} /> }],
    },
  ],
  // Log Aktivitas sits after the work pages on purpose: it is a reference page,
  // read after the work, while the ones above it are what the desk opens to act.
  rma: [
    {
      key: "home",
      items: [{ href: "/rma/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} />, also: ["/rma/cases"] }],
    },
    {
      key: "tickets",
      title: "Tiket",
      icon: <Ticket size={18} />,
      defaultOpen: true,
      items: [
        { href: "/rma/tickets", label: "All Tickets", icon: <Ticket size={18} /> },
        { href: "/rma/tickets/create", label: "Create Ticket", icon: <PlusCircle size={18} /> },
      ],
    },
    {
      key: "reports",
      title: "Laporan",
      items: [{ href: "/rma/logs", label: "Log Aktivitas", icon: <Activity size={18} /> }],
    },
    {
      key: "master",
      title: "Data Master",
      items: [{ href: "/rma/vendors", label: "Vendor", icon: <Truck size={18} /> }],
    },
  ],
  sales: [
    {
      key: "home",
      items: [{ href: "/sales/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> }],
    },
    {
      key: "tickets",
      title: "Tiket",
      icon: <Ticket size={18} />,
      defaultOpen: true,
      items: [
        { href: "/sales/tickets", label: "My Tickets", icon: <Ticket size={18} /> },
        { href: "/sales/tickets/create", label: "Create Ticket", icon: <PlusCircle size={18} /> },
      ],
    },
  ],
};

/**
 * How closely a page belongs to an entry: the length of the matching path, so
 * the most specific entry wins ("/admin/tickets/create" over "/admin/tickets").
 * A portal's dashboard matches only itself, or every page would light it up.
 */
function matchScore(item: NavItem, pathname: string, dashboard: string): number {
  let best = 0;
  for (const path of [item.href, ...(item.also ?? [])]) {
    const hit = pathname === path || (path !== dashboard && pathname.startsWith(`${path}/`));
    if (hit && path.length > best) best = path.length;
  }
  return best;
}

const ROLE_LABELS: Record<string, string> = {
  technician: "Technician",
  admin: "Administrator",
  sales: "Sales",
  rma: "RMA",
};

interface DashboardShellProps {
  children: React.ReactNode;
  role: "customer" | "technician" | "admin" | "sales" | "rma";
  userName: string;
  userId: string;
  isCoordinator?: boolean;
}

// Only Administrator and Technician have a profile page. Sales had a sidebar
// entry to /sales/profile, which does not exist, and a menu entry to
// /admin/profile, which is Administrator-only — so for Sales and RMA the
// entry is hidden rather than pointed at a page that refuses them.
const PROFILE_HREF: Partial<Record<DashboardShellProps["role"], string>> = {
  admin: "/admin/profile",
  technician: "/technician/profile",
};
const TICKETS_HREF: Partial<Record<DashboardShellProps["role"], string>> = {
  admin: "/admin/tickets",
  technician: "/technician/tickets",
  sales: "/sales/tickets",
};

export default function DashboardShell({ children, role, userName, userId, isCoordinator = false }: DashboardShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);     // mobile drawer
  const [collapsed, setCollapsed] = useState(false);          // desktop collapse
  const [profileOpen, setProfileOpen] = useState(false);      // profile dropdown
  const profileRef = useRef<HTMLDivElement>(null);

  // Swipe gesture state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);
  const isSwiping = useRef(false);
  const isScrolling = useRef(false);

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

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('[role="dialog"]') || 
      target.closest('[role="alertdialog"]') || 
      target.closest('input[type="range"]') || 
      target.closest('.overflow-x-auto') ||
      target.closest('[data-radix-scroll-area-viewport]')
    ) {
      return;
    }

    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentX.current = e.touches[0].clientX;
    isScrolling.current = false;
    isSwiping.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping.current || isScrolling.current) return;
    
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    
    // Wait for at least 25px of movement to determine swipe vs scroll intent
    if (Math.abs(deltaX) < 25 && Math.abs(deltaY) < 25) {
      return;
    }

    // Lock scrolling if movement is mostly vertical (requires very deliberate horizontal drag to swipe)
    if (Math.abs(deltaY) > Math.abs(deltaX) * 0.5) {
      isScrolling.current = true;
      isSwiping.current = false;
      setSwipeOffset(0);
      return;
    }

    touchCurrentX.current = e.touches[0].clientX;
    
    if (sidebarOpen) {
      if (deltaX < 0) setSwipeOffset(Math.max(-260, deltaX));
    } else {
      if (deltaX > 0) setSwipeOffset(Math.min(260, deltaX));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    isSwiping.current = false;
    
    const endX = e.changedTouches[0].clientX;
    const delta = endX - touchStartX.current;
    
    if (sidebarOpen && delta < -100) {
      setSidebarOpen(false);
    } else if (!sidebarOpen && delta > 100) {
      setSidebarOpen(true);
    }
    setSwipeOffset(0);
  };

  const sections = NAV_SECTIONS[role] || [];
  const navItems = sections.flatMap((section) => section.items);
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const profileHref = PROFILE_HREF[role];
  const ticketsHref = TICKETS_HREF[role];

  // The entry for this page: the longest matching path wins.
  const dashboard = `/${role}/dashboard`;
  let activeItem: NavItem | null = null;
  let activeScore = 0;
  for (const item of navItems) {
    const score = matchScore(item, pathname, dashboard);
    if (score > activeScore) {
      activeItem = item;
      activeScore = score;
    }
  }
  const currentLabel = activeItem?.label ?? "Dashboard";
  const activeSectionKey = sections.find((section) => activeItem && section.items.includes(activeItem))?.key;

  // A group is open when the user opened it, or — until they say otherwise —
  // when it holds the page on screen or is one opened all day. Arriving on a
  // page of a group the user had closed opens it again, adjusted during render
  // rather than in an effect, so there is no closed-then-open flash.
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (activeSectionKey && openOverride[activeSectionKey] === false) {
      setOpenOverride((prev) => ({ ...prev, [activeSectionKey]: true }));
    }
  }
  const isOpen = (section: NavSection) =>
    openOverride[section.key] ?? (section.key === activeSectionKey || Boolean(section.defaultOpen));
  const toggle = (section: NavSection) =>
    setOpenOverride((prev) => ({ ...prev, [section.key]: !isOpen(section) }));

  const renderLink = (item: NavItem, sub: boolean) => {
    const isActive = activeItem?.href === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`sidebar-link ${sub ? "sidebar-sublink" : ""} ${isActive ? "active" : ""} ${collapsed ? "collapsed" : ""}`.trim().replace(/\s+/g, " ")}
        onClick={() => setSidebarOpen(false)}
        title={collapsed ? item.label : undefined}
        aria-current={isActive ? "page" : undefined}
        suppressHydrationWarning
      >
        {item.icon}
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <div 
      className="dashboard-layout relative overflow-x-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside 
        className={`sidebar ${sidebarOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}
        style={isSwiping.current && swipeOffset !== 0 ? {
          transform: `translateX(${sidebarOpen ? swipeOffset : -260 + swipeOffset}px)`,
          transition: "none"
        } : {}}
      >
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
          {sections.map((section, i) => {
            // Icon-only: every entry stays one click away, groups shown as a rule between them.
            if (collapsed) {
              return (
                <div key={section.key} className="sidebar-plain-group">
                  {i > 0 && section.title && <div className="sidebar-divider" role="separator" />}
                  {section.items.map((item) => renderLink(item, false))}
                </div>
              );
            }
            if (!section.title || section.items.length === 1) {
              return (
                <div key={section.key} className="sidebar-plain-group">
                  {section.items.map((item) => renderLink(item, false))}
                </div>
              );
            }
            const open = isOpen(section);
            const holdsActive = section.key === activeSectionKey;
            return (
              <div key={section.key} className="sidebar-group">
                <button
                  type="button"
                  className={`sidebar-link sidebar-group-btn ${holdsActive && !open ? "has-active" : ""}`.trim()}
                  aria-expanded={open}
                  aria-controls={`nav-group-${section.key}`}
                  onClick={() => toggle(section)}
                >
                  {section.icon}
                  <span>{section.title}</span>
                  <ChevronDown
                    className="sidebar-group-chevron"
                    style={{ transform: open ? "rotate(180deg)" : undefined }}
                    aria-hidden
                  />
                </button>
                {open && (
                  <div id={`nav-group-${section.key}`} className="sidebar-group-items">
                    {section.items.map((item) => renderLink(item, true))}
                  </div>
                )}
              </div>
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
            {/* Requests bell — Admin, Sales, and Store Coordinators */}
            {(role === "admin" || role === "sales" || isCoordinator) && (
              <RequestsBell />
            )}

            <NotificationBell role={role} />

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
                    {profileHref && (
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
                    )}
                    {ticketsHref && (
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
                    )}

                    {(profileHref || ticketsHref) && (
                      <div style={{ borderTop: "1px solid var(--border-light)", margin: "0.375rem 0" }} />
                    )}

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
