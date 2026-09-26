"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Archive,
  CalendarDays,
  ChartGantt,
  ListChecks,
  Megaphone,
  Network,
  ShieldCheck,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { canSendEmail, canViewAdminPanel } from "@/lib/permissions";
import { useScope, withScope } from "@/lib/use-scope";
import BrandMark from "./BrandMark";
import TeamTree from "./TeamTree";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  scoped: boolean;
}

const MAIN_NAV: NavItem[] = [
  { href: "/", label: "My tasks", icon: ListChecks, scoped: true },
  { href: "/tasks", label: "All tasks", icon: Table2, scoped: true },
  { href: "/gantt", label: "Gantt chart", icon: ChartGantt, scoped: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, scoped: true },
  { href: "/archive", label: "Archive", icon: Archive, scoped: true },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { scopeId } = useScope();

  const manageNav: NavItem[] = [
    { href: "/teams", label: "Teams", icon: Network, scoped: true },
    ...(canSendEmail(user)
      ? [{ href: "/announcements", label: "Announcements", icon: Megaphone, scoped: false }]
      : []),
    ...(canViewAdminPanel(user)
      ? [{ href: "/admin", label: "Admin", icon: ShieldCheck, scoped: false }]
      : []),
  ];

  function renderItem(item: NavItem) {
    const active = pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.scoped ? withScope(item.href, scopeId) : item.href}
        onClick={onClose}
        className={clsx(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
          active
            ? "bg-gold/15 font-semibold text-gold shadow-[inset_2px_0_0_var(--color-gold-bright)]"
            : "text-white/75 hover:bg-white/5 hover:text-white"
        )}
      >
        <Icon size={16} />
        {item.label}
      </Link>
    );
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-72 -translate-x-full flex-col bg-ink text-white transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0",
          open && "translate-x-0"
        )}
      >
        <div className="flex items-start justify-between border-b border-gold/20 px-4 py-4">
          <BrandMark size={46} />
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded p-1 text-white/60 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="space-y-0.5 px-3 pt-3">
          {MAIN_NAV.map(renderItem)}
          <div className="my-2 border-t border-white/10" />
          {manageNav.map(renderItem)}
        </nav>

        <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-gold/20">
          <p className="px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/80">
            Teams
          </p>
          <div className="scroll-dark min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <TeamTree onNavigate={onClose} />
          </div>
        </div>
      </aside>
    </>
  );
}
