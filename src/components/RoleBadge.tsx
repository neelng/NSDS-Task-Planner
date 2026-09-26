import clsx from "clsx";
import type { DisplayRole } from "@/lib/teams";

const STYLES: Record<DisplayRole, string> = {
  Admin: "bg-ink text-gold ring-1 ring-gold/50",
  Director: "bg-gold-tint text-gold-dark ring-1 ring-gold/60",
  Lead: "bg-stone-100 text-stone-700 ring-1 ring-stone-300",
  Member: "bg-stone-100 text-muted ring-1 ring-stone-200",
};

export default function RoleBadge({ role }: { role: DisplayRole }) {
  return (
    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", STYLES[role])}>
      {role}
    </span>
  );
}
