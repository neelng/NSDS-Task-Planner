"use client";

import { useMemo, useState } from "react";
import { Gantt, ViewMode, type Task as GanttTask } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import clsx from "clsx";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { canEditTaskFully } from "@/lib/permissions";
import { updateTaskFull } from "@/lib/firestore";
import { buildTree, type TeamNode } from "@/lib/teams";
import { inputCls } from "@/lib/ui";
import { useScope } from "@/lib/use-scope";
import type { Task } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
const TEAM_PREFIX = "team:";
const RANGES = {
  near: { label: "Last month to next 4 months", from: -30, to: 120 },
  wide: { label: "Last 6 months to next year", from: -180, to: 365 },
  all: { label: "Everything open", from: -Infinity, to: Infinity },
} as const;
type RangeKey = keyof typeof RANGES;

function startOfDay(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

export default function GanttView({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const { user } = useAuth();
  const { teams, teamsById, colorFor } = useData();
  const { setScope } = useScope();
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week);
  const [range, setRange] = useState<RangeKey>("near");
  const [showList, setShowList] = useState(true);
  // Team rows the user has expanded or collapsed by hand; deeper teams start collapsed.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  // Fixed for the life of the page so the chart doesn't re-scroll under the user.
  const [today] = useState(() => startOfDay(Date.now()));

  const { rows, hidden } = useMemo(() => {
    const { from, to } = RANGES[range];
    const lo = today.getTime() + from * DAY;
    const hi = today.getTime() + to * DAY;
    const inRange = tasks.filter(
      (t) => t.endDate.toMillis() >= lo && t.startDate.toMillis() <= hi
    );

    const usedTeams = new Set<string>();
    inRange.forEach((t) => t.teamPath.forEach((id) => usedTeams.add(id)));
    const byTeam = new Map<string, Task[]>();
    for (const t of inRange) {
      const list = byTeam.get(t.teamId) ?? [];
      list.push(t);
      byTeam.set(t.teamId, list);
    }

    const out: GanttTask[] = [];

    // Depth-first so each team row is followed by its own tasks, then its subteams.
    const walk = (node: TeamNode, parentId?: string) => {
      const projectId = TEAM_PREFIX + node.team.id;
      const color = colorFor(node.team.path);
      const slot = out.length;
      out.push({ id: projectId, type: "project", name: node.team.name, start: today, end: today, progress: 0 });

      let start = Infinity;
      let end = -Infinity;
      let progressSum = 0;
      let count = 0;
      const absorb = (s: number, e: number, p: number, n: number) => {
        start = Math.min(start, s);
        end = Math.max(end, e);
        progressSum += p;
        count += n;
      };

      const own = [...(byTeam.get(node.team.id) ?? [])].sort(
        (a, b) => a.startDate.toMillis() - b.startDate.toMillis()
      );
      for (const t of own) {
        const canEdit = canEditTaskFully(user, teamsById.get(t.teamId));
        out.push({
          id: t.id,
          type: "task",
          name: t.title,
          start: t.startDate.toDate(),
          end: t.endDate.toDate(),
          progress: t.progress,
          project: projectId,
          isDisabled: !canEdit,
          styles: {
            backgroundColor: color,
            backgroundSelectedColor: color,
            progressColor: "rgba(0,0,0,0.35)",
            progressSelectedColor: "rgba(0,0,0,0.5)",
          },
        });
        absorb(t.startDate.toMillis(), t.endDate.toMillis(), t.progress, 1);
      }

      for (const child of node.children) {
        const s = walk(child, projectId);
        if (s) absorb(s.start, s.end, s.progressSum, s.count);
      }

      out[slot] = {
        id: projectId,
        type: "project",
        name: node.team.name,
        start: new Date(start),
        end: new Date(end),
        progress: count ? progressSum / count : 0,
        project: parentId,
        isDisabled: true,
        hideChildren: overrides[projectId] ?? node.team.path.length > 2,
        styles: {
          backgroundColor: color,
          backgroundSelectedColor: color,
          progressColor: "rgba(0,0,0,0.45)",
          progressSelectedColor: "rgba(0,0,0,0.6)",
        },
      };
      return { start, end, progressSum, count };
    };

    const tree = buildTree(teams.filter((t) => usedTeams.has(t.id)));
    tree.forEach((n) => walk(n));
    return { rows: out, hidden: tasks.length - inRange.length };
  }, [tasks, teams, teamsById, colorFor, today, range, overrides, user]);

  async function handleDateChange(g: GanttTask): Promise<boolean> {
    const task = tasks.find((t) => t.id === g.id);
    if (!task || !canEditTaskFully(user, teamsById.get(task.teamId))) return false;
    // Snap to whole days: start of the first day, end of the last.
    const start = startOfDay(g.start.getTime());
    const end = endOfDay(new Date(g.end.getTime() - 60_000));
    await updateTaskFull(task, { startDate: start, endDate: end < start ? endOfDay(start) : end });
    return true;
  }

  const rowCount = rows.length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-line bg-white p-0.5">
          {[ViewMode.Day, ViewMode.Week, ViewMode.Month].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={clsx(
                "rounded px-3 py-1.5 text-sm font-medium transition",
                viewMode === mode ? "bg-ink text-gold" : "text-muted hover:text-ink"
              )}
            >
              {mode}
            </button>
          ))}
        </div>
        <select value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className={clsx(inputCls, "w-auto")}>
          {Object.entries(RANGES).map(([k, r]) => (
            <option key={k} value={k}>
              {r.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showList}
            onChange={(e) => setShowList(e.target.checked)}
            className="accent-gold-dark"
          />
          Task list
        </label>
        {hidden > 0 && (
          <span className="text-xs text-muted">{hidden} task{hidden === 1 ? "" : "s"} outside this range</span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-muted">
          No scheduled tasks in this range.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <Gantt
            tasks={rows}
            viewMode={viewMode}
            viewDate={today}
            locale="en-US"
            listCellWidth={showList ? "190px" : ""}
            columnWidth={viewMode === ViewMode.Month ? 260 : viewMode === ViewMode.Week ? 90 : 56}
            rowHeight={38}
            headerHeight={48}
            ganttHeight={rowCount > 14 ? 600 : 0}
            barFill={68}
            barCornerRadius={4}
            timeStep={DAY}
            todayColor="rgba(218,170,0,0.14)"
            fontFamily="var(--font-geist-sans), system-ui, sans-serif"
            fontSize="12px"
            onDateChange={handleDateChange}
            onExpanderClick={(t) =>
              setOverrides((o) => ({ ...o, [t.id]: !(o[t.id] ?? t.hideChildren ?? false) }))
            }
            onClick={(t) => {
              if (t.id.startsWith(TEAM_PREFIX)) {
                setScope(t.id.slice(TEAM_PREFIX.length));
                return;
              }
              const task = tasks.find((x) => x.id === t.id);
              if (task) onOpen(task);
            }}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        Click a team row to focus on that team. Drag a bar to reschedule it (leads and directors only).
      </p>
    </div>
  );
}
