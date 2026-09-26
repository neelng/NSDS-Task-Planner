"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useData } from "@/lib/data-context";
import { useNow } from "@/lib/use-now";
import { useScope } from "@/lib/use-scope";
import { buildTree, flattenTree } from "@/lib/teams";

/** Sidebar navigator: picking a team scopes every page to that team and everything under it. */
export default function TeamTree({ onNavigate }: { onNavigate?: () => void }) {
  const { teams, tasks } = useData();
  const { scopeId, setScope } = useScope();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Open and overdue counts per team, counting tasks in every team beneath it.
  const now = useNow();
  const counts = useMemo(() => {
    const map = new Map<string, { open: number; overdue: number }>();
    for (const t of tasks) {
      if (t.status === "completed") continue;
      const overdue = t.endDate.toMillis() < now;
      for (const id of t.teamPath) {
        const c = map.get(id) ?? { open: 0, overdue: 0 };
        c.open += 1;
        if (overdue) c.overdue += 1;
        map.set(id, c);
      }
    }
    return map;
  }, [tasks, now]);

  // Teams whose children are showing: the ones expanded by hand, plus the path down to the selection.
  const openIds = useMemo(() => {
    const open = new Set(expanded);
    teams.find((t) => t.id === scopeId)?.path.slice(0, -1).forEach((id) => open.add(id));
    return open;
  }, [teams, expanded, scopeId]);

  const rows = useMemo(() => {
    const collapsed = new Set(teams.filter((t) => !openIds.has(t.id)).map((t) => t.id));
    return flattenTree(buildTree(teams), collapsed);
  }, [teams, openIds]);

  const hasChildren = useMemo(() => new Set(teams.map((t) => t.parentId).filter(Boolean)), [teams]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      // Collapsing a team that is only open because it's on the selected path removes the hand-set flag too.
      if (openIds.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function select(id: string | null) {
    setScope(id);
    // Selecting a team also reveals its subteams.
    if (id && hasChildren.has(id)) setExpanded((prev) => new Set(prev).add(id));
    onNavigate?.();
  }

  if (teams.length === 0) {
    return <p className="px-3 text-xs text-white/40">No teams yet.</p>;
  }

  return (
    <ul className="space-y-0.5">
      <li>
        <button
          onClick={() => select(null)}
          className={clsx(
            "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] transition",
            scopeId === null
              ? "bg-gold/15 font-semibold text-gold"
              : "text-white/70 hover:bg-white/5 hover:text-white"
          )}
        >
          <Layers size={14} />
          All teams
        </button>
      </li>
      {rows.map(({ team, depth }) => {
        const c = counts.get(team.id);
        const active = scopeId === team.id;
        const open = openIds.has(team.id);
        return (
          <li key={team.id} style={{ paddingLeft: depth * 12 }}>
            <div
              className={clsx(
                "group flex items-center rounded-md transition",
                active ? "bg-gold/15" : "hover:bg-white/5"
              )}
            >
              {hasChildren.has(team.id) ? (
                <button
                  onClick={() => toggle(team.id)}
                  aria-label={open ? `Collapse ${team.name}` : `Expand ${team.name}`}
                  className="p-1.5 text-white/40 hover:text-white"
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-[26px]" />
              )}
              <button
                onClick={() => select(team.id)}
                className={clsx(
                  "flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 pr-2 text-left text-[13px]",
                  active ? "font-semibold text-gold" : "text-white/75 group-hover:text-white"
                )}
              >
                <span className="truncate">{team.name}</span>
                {c && (
                  <span className="flex shrink-0 items-center gap-1 text-[11px]">
                    {c.overdue > 0 && (
                      <span className="rounded bg-red-500/20 px-1 text-red-300" title="Overdue">
                        {c.overdue}
                      </span>
                    )}
                    <span className="text-white/40">{c.open}</span>
                  </span>
                )}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
