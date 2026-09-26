"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { callSendEmail } from "@/lib/email-client";
import {
  addTaskUpdateEntry,
  createTask,
  deleteTask,
  updateTaskFull,
  updateTaskProgress,
  watchTaskUpdates,
} from "@/lib/firestore";
import { canDeleteTask, editableFieldsFor, manageableTeams } from "@/lib/permissions";
import { parseDateInput, toDateInputValue } from "@/lib/task-utils";
import { peopleInSubtree } from "@/lib/teams";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdateEntry,
} from "@/lib/types";
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from "@/lib/ui";
import PersonPicker from "./PersonPicker";
import TeamPicker from "./TeamPicker";

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  defaultTeamId?: string | null;
}

export default function TaskModal({ open, onClose, task, defaultTeamId }: TaskModalProps) {
  const { user } = useAuth();
  const { teams, teamsById, users, usersById } = useData();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("med");
  const [status, setStatus] = useState<TaskStatus>("not_started");
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState("");
  const [emailAssignees, setEmailAssignees] = useState(true);
  const [showEveryone, setShowEveryone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [updates, setUpdates] = useState<TaskUpdateEntry[]>([]);

  const creatable = useMemo(() => manageableTeams(user, teams), [user, teams]);
  const team = teamsById.get(teamId) ?? null;
  const mode = task ? editableFieldsFor(user, team, task) : team ? editableFieldsFor(user, team) : "none";
  const isEdit = Boolean(task);
  const fieldsDisabled = mode !== "all";

  // Re-seed the form whenever the modal opens for a different task (or a fresh new-task form).
  // Adjusting state during render: https://react.dev/learn/you-might-not-need-an-effect
  const openKey = open ? (task?.id ?? "__new__") : null;
  const [seededKey, setSeededKey] = useState<string | null>(null);
  if (openKey !== null && openKey !== seededKey) {
    setSeededKey(openKey);
    setUpdates([]);
    setNote("");
    setFormError(null);
    setSaved(false);
    setShowEveryone(false);
    setEmailAssignees(true);
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setTeamId(task.teamId);
      setAssigneeIds(task.assigneeIds);
      setStartDate(toDateInputValue(task.startDate));
      setEndDate(toDateInputValue(task.endDate));
      setPriority(task.priority);
      setStatus(task.status);
      setProgress(task.progress);
    } else {
      const preferred = creatable.find((t) => t.id === defaultTeamId) ?? creatable[0];
      setTitle("");
      setDescription("");
      setTeamId(preferred?.id ?? "");
      setAssigneeIds([]);
      setStartDate(toDateInputValue(new Date()));
      setEndDate(toDateInputValue(new Date()));
      setPriority("med");
      setStatus("not_started");
      setProgress(0);
    }
  }

  useEffect(() => {
    if (!open || !task) return;
    return watchTaskUpdates(task.id, setUpdates);
  }, [open, task]);

  const candidates = useMemo(() => {
    const inTeam = teamId ? new Set(peopleInSubtree(teams, teamId)) : new Set<string>();
    // Fresh org charts have no members yet, so fall back to everyone.
    const useAll = showEveryone || inTeam.size === 0;
    return users.filter((u) => useAll || inTeam.has(u.uid));
  }, [users, teams, teamId, showEveryone]);

  if (!open) return null;

  function changeStatus(next: TaskStatus) {
    setStatus(next);
    if (next === "completed") setProgress(100);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (saved) {
      onClose();
      return;
    }
    setFormError(null);

    if (mode === "progress-only" && task) {
      setSaving(true);
      try {
        await updateTaskProgress(task, progress, status);
        if (note.trim()) await addTaskUpdateEntry(task.id, user.uid, note.trim(), progress);
        onClose();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to update task.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (mode !== "all" || !team) return;

    if (!title.trim()) return setFormError("Title is required.");
    if (!startDate || !endDate) return setFormError("Start and end dates are required.");
    const start = parseDateInput(startDate, false);
    const end = parseDateInput(endDate, true);
    if (end < start) return setFormError("End date must be on or after the start date.");

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        teamId: team.id,
        teamPath: team.path,
        assigneeIds,
        startDate: start,
        endDate: end,
        status,
        progress,
        priority,
      };
      let savedTaskId: string;
      if (task) {
        await updateTaskFull(task, payload);
        savedTaskId = task.id;
      } else {
        savedTaskId = await createTask({ ...payload, createdBy: user.uid });
      }
      if (note.trim() && task) await addTaskUpdateEntry(task.id, user.uid, note.trim(), progress);

      const newlyAdded = assigneeIds.filter(
        (id) => id !== user.uid && !(task?.assigneeIds ?? []).includes(id)
      );
      if (emailAssignees && newlyAdded.length > 0) {
        try {
          await callSendEmail({ mode: "task-assigned", taskId: savedTaskId, assigneeIds: newlyAdded });
        } catch (err) {
          setSaved(true);
          setFormError(
            `Task saved, but the assignment email could not be sent: ${
              err instanceof Error ? err.message : "unknown error"
            }`
          );
          setSaving(false);
          return;
        }
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save task.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await deleteTask(task.id);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to delete task.");
      setSaving(false);
    }
  }

  const newAssignees = assigneeIds.filter(
    (id) => id !== user?.uid && !(task?.assigneeIds ?? []).includes(id)
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gold/30 bg-ink px-5 py-3">
          <h2 className="font-display text-base font-semibold tracking-wide text-gold">
            {isEdit ? (fieldsDisabled ? "Task details" : "Edit task") : "New task"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {mode === "progress-only" && (
            <p className="rounded-md bg-gold-tint px-3 py-2 text-xs text-gold-dark">
              You&apos;re assigned to this task. You can update its status and progress.
            </p>
          )}
          {mode === "none" && isEdit && (
            <p className="rounded-md bg-stone-100 px-3 py-2 text-xs text-muted">
              You can view this task but only its assignees and team leads can change it.
            </p>
          )}

          <div>
            <label className={labelCls}>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={fieldsDisabled}
              className={inputCls}
              placeholder="e.g. Design event flyer"
            />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={fieldsDisabled}
              rows={3}
              className={inputCls}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className={labelCls}>Team</label>
              <TeamPicker
                value={teamId}
                options={creatable}
                onChange={(id) => {
                  setTeamId(id);
                  if (!isEdit) setAssigneeIds([]);
                }}
                disabled={fieldsDisabled}
              />
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                disabled={fieldsDisabled}
                className={inputCls}
              >
                {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={fieldsDisabled}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Due date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={fieldsDisabled}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={labelCls + " mb-0"}>Assignees</label>
              {!fieldsDisabled && (
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={showEveryone}
                    onChange={(e) => setShowEveryone(e.target.checked)}
                    className="accent-gold-dark"
                  />
                  Show everyone
                </label>
              )}
            </div>
            <PersonPicker
              candidates={candidates}
              selectedIds={assigneeIds}
              onChange={setAssigneeIds}
              disabled={fieldsDisabled}
              placeholder={showEveryone ? "Search everyone…" : "Search this team…"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={status}
                onChange={(e) => changeStatus(e.target.value as TaskStatus)}
                disabled={mode === "none"}
                className={inputCls}
              >
                {Object.entries(STATUS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Progress: {progress}%</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                disabled={mode === "none"}
                className="mt-2 w-full accent-gold-dark"
              />
            </div>
          </div>

          {isEdit && mode !== "none" && (
            <div>
              <label className={labelCls}>Add a progress note</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you get done?"
                className={inputCls}
              />
            </div>
          )}

          {isEdit && updates.length > 0 && (
            <div>
              <label className={labelCls}>Activity</label>
              <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md bg-paper p-2 text-xs text-stone-700">
                {updates.map((u) => (
                  <li key={u.id}>
                    <span className="font-semibold">{usersById.get(u.authorId)?.name ?? "Someone"}</span>
                    {" · "}
                    {u.note} <span className="text-muted">({u.progress}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === "all" && newAssignees.length > 0 && (
            <label className="flex items-center gap-2 rounded-md bg-gold-tint px-3 py-2 text-sm text-gold-dark">
              <input
                type="checkbox"
                checked={emailAssignees}
                onChange={(e) => setEmailAssignees(e.target.checked)}
                className="accent-gold-dark"
              />
              Email {newAssignees.length === 1 ? "the new assignee" : `the ${newAssignees.length} new assignees`}{" "}
              about this task
            </label>
          )}

          {formError && (
            <p className={saved ? "text-sm text-amber-700" : "text-sm text-red-600"}>{formError}</p>
          )}

          <div className="flex items-center justify-between border-t border-line pt-4">
            <div>
              {isEdit && canDeleteTask(user, team) && (
                <button type="button" onClick={handleDelete} disabled={saving} className={btnDanger}>
                  Delete task
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={btnSecondary}>
                {mode === "none" ? "Close" : "Cancel"}
              </button>
              {mode !== "none" && (
                <button type="submit" disabled={saving} className={btnPrimary}>
                  {saved ? "Close" : saving ? "Saving…" : isEdit ? "Save changes" : "Create task"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
