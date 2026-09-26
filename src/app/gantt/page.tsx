"use client";

import { useMemo } from "react";
import { useData } from "@/lib/data-context";
import { inScope, useScope } from "@/lib/use-scope";
import GanttView from "@/components/GanttView";
import PageHeader from "@/components/PageHeader";
import { useTaskModal } from "@/components/use-task-modal";

export default function GanttPage() {
  const { tasks, ready } = useData();
  const { scopeId } = useScope();
  const { openEdit, modal } = useTaskModal(scopeId);

  const scoped = useMemo(
    () => tasks.filter((t) => t.status !== "completed" && inScope(t.teamPath, scopeId)),
    [tasks, scopeId]
  );

  return (
    <div>
      <PageHeader title="Gantt chart" subtitle="Open tasks grouped by team." />
      {!ready ? <p className="text-sm text-muted">Loading tasks…</p> : <GanttView tasks={scoped} onOpen={openEdit} />}
      {modal}
    </div>
  );
}
