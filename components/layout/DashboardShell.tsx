"use client";

import { usePathname } from "next/navigation";
import { DraftScopeProvider } from "@/lib/draft";
import type { NavIcon, NavItem, NavSection } from "@/lib/nav";
import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Cpu,
  User,
  LogOut,
  Users,
  Trophy,
  TrendingUp,
  Settings,
  History,
  Store,
  ShieldCheck,
  Package,
  Truck,
  ChevronDown,
  BarChart3,
  Database,
  CalendarDays,
  ClipboardList,
  Target,
  Gauge,
  ClipboardCheck,
  PackageSearch,
  Landmark,
  Contact, Barcode } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotificationBell from "./NotificationBell";
import RequestsBell from "./RequestsBell";

// Icons travel from the server as names (lib/nav.ts builds the menu there).
const ICONS: Record<NavIcon, React.ComponentType<{ size?: number }>> = {
  dashboard: LayoutDashboard,
  ticket: Ticket,
  plus: PlusCircle,
  list: ClipboardList,
  shield: ShieldCheck,
  chart: BarChart3,
  gauge: Gauge,
  check: ClipboardCheck,
  cpu: Cpu,
  "package-search": PackageSearch,
  landmark: Landmark,
  trending: TrendingUp,
  target: Target,
  trophy: Trophy,
  package: Package,
  calendar: CalendarDays,
  contact: Contact,
  history: History,
  store: Store,
  users: Users,
  truck: Truck,
  settings: Settings,
  database: Database,
  barcode: Barcode,
};

function NavGlyph({ name }: { name?: NavIcon }) {
  if (!name) return null;
  const Icon = ICONS[name];
  return <Icon size={18} />;
}

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
  toko: "Kepala Toko",
  stok: "Admin Stok",
  finance: "Finance",
};

interface DashboardShellProps {
  children: React.ReactNode;
  role: "customer" | "technician" | "admin" | "sales" | "rma" | "toko" | "stok" | "finance";
  userName: string;
  userId: string;
  isCoordinator?: boolean;
  /** The menu, built on the server from what this person may open (lib/nav.ts). */
  sections: NavSection[];
  /** This person's own dashboard; it lights up only on itself. */
  home: string;
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
  toko: "/toko/tickets",
  stok: "/stok/rakitan",
  finance: "/finance/klaim",
};

/**
 * The desktop collapse, kept in localStorage under the key it has always had.
 * Read through useSyncExternalStore: "expanded" on the server and during
 * hydration, so the first client render matches the server's HTML, then the
 * saved value straight after — the same order the old effect gave.
 */
const COLLAPSED_KEY = "sidebar_collapsed";
const collapsedListeners = new Set<() => void>();
const collapsedStore = {
  subscribe(onChange: () => void) {
    collapsedListeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      collapsedListeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  },
  get: () => localStorage.getItem(COLLAPSED_KEY) === "true",
  getServer: () => false,
  set(collapsed: boolean) {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    collapsedListeners.forEach((notify) => notify());
  },
};

/**
 * The frame around every staff portal: sidebar, top bar, and the page.
 *
 * Built on the shadcn sidebar. On desktop it collapses to icons (remembered in
 * localStorage, as before); below 768px it is a Sheet from the left, which a
 * swipe opens and closes like the old drawer did.
 *
 * The page itself (`<main>`) deliberately carries no `data-slot`: legacy pages
 * still rely on the unlayered reset in globals.css, and a `data-slot` around
 * them would switch it off for all of them at once. The shell's own parts do
 * carry one, so Tailwind spacing works there.
 */
export default function DashboardShell({ children, role, userName, userId, isCoordinator = false, sections, home }: DashboardShellProps) {
  const collapsed = useSyncExternalStore(collapsedStore.subscribe, collapsedStore.get, collapsedStore.getServer);

  return (
    <TooltipProvider>
      <SidebarProvider open={!collapsed} onOpenChange={(open) => collapsedStore.set(!open)}>
        <ShellFrame role={role} userName={userName} userId={userId} isCoordinator={isCoordinator} sections={sections} home={home}>
          {children}
        </ShellFrame>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function ShellFrame({ children, role, userName, userId, isCoordinator = false, sections, home }: DashboardShellProps) {
  const pathname = usePathname();
  const { openMobile, setOpenMobile } = useSidebar();

  // Swipe right anywhere to open the menu on a phone, swipe left to close it —
  // the gesture the old drawer had. A mostly vertical drag is a scroll and is
  // left alone, as is anything inside a dialog, a slider or a sideways scroller.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    const inMenu = target.closest('[data-mobile="true"]');
    if (
      (!inMenu && (target.closest('[role="dialog"]') || target.closest('[role="alertdialog"]'))) ||
      target.closest('input[type="range"]') ||
      target.closest(".overflow-x-auto")
    ) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx) * 0.5) return;
    if (!openMobile && dx > 100) setOpenMobile(true);
    else if (openMobile && dx < -100) setOpenMobile(false);
  };

  const navItems = sections.flatMap((section) => section.items);

  // The entry for this page: the longest matching path wins.
  const dashboard = home;
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

  return (
    // overflow-x-clip, as the old shell's overflow-x-hidden did: some legacy
    // pages still have a row wider than a 360px phone (a status badge in
    // .mobile-ticket-card on /admin/tickets), and the page must not scroll
    // sideways. clip, not hidden, so the sticky top bar keeps sticking.
    <div className="flex min-h-svh w-full overflow-x-clip" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <a
        href="#konten"
        data-slot="skip-link"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Langsung ke konten
      </a>

      <AppSidebar role={role} sections={sections} activeItem={activeItem} pathname={pathname} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-slot="app-topbar"
          className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-2 md:px-6"
        >
          <div className="flex min-w-0 items-center gap-1 md:gap-2">
            <SidebarTrigger className="text-muted-foreground" aria-label="Buka atau tutup menu" />
            <h2 className="truncate text-base font-medium text-muted-foreground md:text-[1.0625rem]">{currentLabel}</h2>
          </div>

          <div className="flex shrink-0 items-center gap-1 md:gap-2">
            {/* Requests bell — Admin, Sales, and Store Coordinators */}
            {(role === "admin" || role === "sales" || isCoordinator) && <RequestsBell />}
            <NotificationBell role={role} />
            <ProfileMenu role={role} userName={userName} />
          </div>
        </header>

        {/* Page content */}
        <main id="konten" tabIndex={-1} className="dashboard-content outline-none">
          {/* Drafts are kept per signed-in user (lib/draft.ts). */}
          <DraftScopeProvider userId={userId}>{children}</DraftScopeProvider>
        </main>
      </div>
    </div>
  );
}

function AppSidebar({
  role,
  sections,
  activeItem,
  pathname,
}: {
  role: DashboardShellProps["role"];
  sections: NavSection[];
  activeItem: NavItem | null;
  pathname: string;
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const iconOnly = state === "collapsed" && !isMobile;
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
  const setSectionOpen = (section: NavSection, open: boolean) =>
    setOpenOverride((prev) => ({ ...prev, [section.key]: open }));

  // Following a link on a phone closes the menu, as the old drawer did.
  const closeOnPhone = () => {
    if (isMobile) setOpenMobile(false);
  };

  const plainLink = (item: NavItem) => (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton
        isActive={activeItem?.href === item.href}
        tooltip={item.label}
        render={<Link href={item.href} onClick={closeOnPhone} aria-current={activeItem?.href === item.href ? "page" : undefined} />}
      >
        <NavGlyph name={item.icon} />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="size-8 shrink-0 overflow-hidden rounded-md bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-hns.jpg" alt="HNS IT Center" className="block size-full object-cover" />
          </span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm leading-tight font-bold">HNS IT Center</div>
            <div className="text-[0.6875rem] text-sidebar-foreground/75">{ROLE_LABELS[role]}</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section, i) => {
          // Icon-only: every entry stays one click away, groups shown as a rule between them.
          if (iconOnly || !section.title || section.items.length === 1) {
            return (
              <SidebarGroup key={section.key} className="py-1">
                {iconOnly && i > 0 && section.title && <SidebarSeparator className="mx-0 mb-2" />}
                <SidebarGroupContent>
                  <SidebarMenu>{section.items.map(plainLink)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          const open = isOpen(section);
          const holdsActive = section.key === activeSectionKey;
          return (
            <Collapsible key={section.key} open={open} onOpenChange={(next) => setSectionOpen(section, next)}>
              <SidebarGroup className="py-1">
                <SidebarGroupLabel
                  render={<CollapsibleTrigger />}
                  className={`h-11 w-full cursor-pointer gap-2 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground md:h-8 ${holdsActive && !open ? "bg-sidebar-accent/60 text-sidebar-foreground" : ""}`}
                >
                  <NavGlyph name={section.icon} />
                  <span className="flex-1 text-left">{section.title}</span>
                  <ChevronDown aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenuSub className="mr-0 border-sidebar-border">
                      {section.items.map((item) => {
                        const isActive = activeItem?.href === item.href;
                        return (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton
                              isActive={isActive}
                              render={<Link href={item.href} onClick={closeOnPhone} aria-current={isActive ? "page" : undefined} />}
                            >
                              <NavGlyph name={item.icon} />
                              <span>{item.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <form action={logoutAction}>
              <SidebarMenuButton type="submit" tooltip="Sign Out">
                <LogOut />
                <span>Sign Out</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function ProfileMenu({ role, userName }: { role: DashboardShellProps["role"]; userName: string }) {
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const profileHref = PROFILE_HREF[role];
  const ticketsHref = TICKETS_HREF[role];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu akun ${userName}`}
        className="flex h-11 items-center gap-2 rounded-full border border-border bg-card py-1 pr-1 pl-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:pr-3 md:h-9"
      >
        <Avatar className="size-8 md:size-7">
          <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium text-foreground sm:inline">{userName.split(" ")[0]}</span>
        <ChevronDown aria-hidden className="hidden size-3.5 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{userName}</span>
            <span className="text-xs font-normal text-muted-foreground">{ROLE_LABELS[role]}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {(profileHref || ticketsHref) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {profileHref && (
                <DropdownMenuItem render={<Link href={profileHref} />}>
                  <User aria-hidden />
                  Profile
                </DropdownMenuItem>
              )}
              {ticketsHref && (
                <DropdownMenuItem render={<Link href={ticketsHref} />}>
                  <Ticket aria-hidden />
                  My Tickets
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem variant="destructive" nativeButton render={<button type="submit" className="w-full" />}>
            <LogOut aria-hidden />
            Sign Out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
