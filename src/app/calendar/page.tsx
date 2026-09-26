"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { sortTeams } from "@/lib/teams";
import { inScope, useScope } from "@/lib/use-scope";
import CalendarView from "@/components/CalendarView";
import PageHeader from "@/components/PageHeader";
import { useTaskModal } from "@/components/use-task-modal";

export default function CalendarPage() {
  const { user } = useAuth();
  const { tasks, teams, colorFor, ready } = useData();
  const { scopeId } = useScope();
  const { openEdit, modal } = useTaskModal(scopeId);
  const [onlyMine, setOnlyMine] = useState(false);

  const scoped = useMemo(
    () =>
      tasks.filter(
        (t) => inScope(t.teamPath, scopeId) && (!onlyMine || (user && t.assigneeIds.includes(user.uid)))
      ),
    [tasks, scopeId, onlyMine, user]
  );

  const divisions = useMemo(() => sortTeams(teams.filter((t) => t.parentId === null)), [teams]);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Open tasks and those completed in the last 14 days."
        actions={
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="accent-gold-dark"
            />
            Only my tasks
          </label>
        }
      />

      {divisions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {divisions.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorFor(d.path) }} />
              {d.name}
            </span>
          ))}
        </div>
      )}

      {!ready ? <p className="text-sm text-muted">Loading tasks…</p> : <CalendarView tasks={scoped} onSelect={openEdit} />}
      {modal}
    </div>
  );
}
