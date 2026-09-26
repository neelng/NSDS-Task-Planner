"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronsUpDown, Search } from "lucide-react";
import { useData } from "@/lib/data-context";
import { buildTree, flattenTree } from "@/lib/teams";
import type { Team } from "@/lib/types";
import { inputCls } from "@/lib/ui";

function crumbs(team: Team, names: Map<string, string>): string[] {
  return team.path.map((id) => names.get(id) ?? "?");
}

/** Searchable team selector that shows the full path ("Technical › Team 3 › Perception"). */
export default function TeamPicker({
  value,
  options,
  onChange,
  disabled,
  placeholder = "Select a team",
}: {
  value: string;
  options: Team[];
  onChange: (teamId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { teams, teamsById } = useData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const names = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  // Keep options in org-chart order rather than alphabetical.
  const ordered = useMemo(() => {
    const order = new Map(
      flattenTree(buildTree(teams), new Set()).map((n, i) => [n.team.id, i] as const)
    );
    return [...options].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }, [teams, options]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ordered;
    return ordered.filter((t) => crumbs(t, names).join(" ").toLowerCase().includes(needle));
  }, [ordered, q, names]);

  const current = teamsById.get(value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={clsx(inputCls, "flex items-center justify-between gap-2 text-left")}
      >
        <span className={clsx("truncate", !current && "text-muted/60")}>
          {current ? crumbs(current, names).join(" › ") : placeholder}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-line bg-white shadow-lg">
            <div className="relative border-b border-line p-2">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search teams…"
                className={clsx(inputCls, "pl-8")}
              />
            </div>
            <ul className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted">No matching teams.</li>
              )}
              {filtered.map((t) => {
                const parts = crumbs(t, names);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(t.id);
                        setOpen(false);
                        setQ("");
                      }}
                      className={clsx(
                        "block w-full px-3 py-1.5 text-left text-sm hover:bg-gold-tint",
                        t.id === value && "bg-gold-tint"
                      )}
                    >
                      {parts.length > 1 && (
                        <span className="text-muted">{parts.slice(0, -1).join(" › ")} › </span>
                      )}
                      <span className="font-medium text-ink">{parts[parts.length - 1]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
