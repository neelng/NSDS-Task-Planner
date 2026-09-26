"use client";

import { useCallback, useState } from "react";
import type { Task } from "@/lib/types";
import TaskModal from "./TaskModal";

/** Owns the create/edit modal so each page only needs `openCreate`, `openEdit` and `modal`. */
export function useTaskModal(defaultTeamId?: string | null) {
  const [state, setState] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });

  const openCreate = useCallback(() => setState({ open: true, task: null }), []);
  const openEdit = useCallback((task: Task) => setState({ open: true, task }), []);

  const modal = (
    <TaskModal
      open={state.open}
      task={state.task}
      defaultTeamId={defaultTeamId}
      onClose={() => setState((s) => ({ ...s, open: false }))}
    />
  );

  return { openCreate, openEdit, modal };
}
