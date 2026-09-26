"use client";

import { useEffect, useMemo, useState } from "react";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { Search } from "lucide-react";
import clsx from "clsx";
import { useData } from "@/lib/data-context";
import { fetchCompletedTasksPage } from "@/lib/firestore";
import { EMPTY_FILTER, filterTasks } from "@/lib/task-utils";
import type { Task } from "@/lib/types";
import { btnSecondary, inputCls, labelCls } from "@/lib/ui";
import { useScope } from "@/lib/use-scope";
import PageHeader from "@/components/PageHeader";
import TaskCard from "@/components/TaskCard";
import { useTaskModal } from "@/components/use-task-modal";

function monthLabel(t: Task): string {
  const d = t.completedAt?.toDate();
  return d ? d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Unknown date";
}

/** Remounted (via `key`) whenever the server-side filters change, so it always starts clean. */
function ArchiveList({
  teamId,
  fromStr,
  toStr,
  search,
  onOpen,
}: {
  teamId: string | null;
  fromStr: string;
  toStr: string;
  search: string;
  onOpen: (t: Task) => void;
}) {
  const { teamsById, usersById } = useData();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => ({
      from: fromStr ? new Date(`${fromStr}T00:00:00`) : null,
      to: toStr ? new Date(`${toStr}T23:59:59.999`) : null,
    }),
    [fromStr, toStr]
  );

  useEffect(() => {
    let cancelled = false;
    fetchCompletedTasksPage({ teamId, from: range.from, to: range.to })
      .then((page) => {
        if (cancelled) return;
        setTasks(page.tasks);
        setCursor(page.lastDoc);
        setHasMore(page.hasMore);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, range]);

  async function loadMore() {
    setLoading(true);
    try {
      const page = await fetchCompletedTasksPage({ teamId, from: range.from, to: range.to, cursor });
      setTasks((prev) => [...prev, ...page.tasks]);
      setCursor(page.lastDoc);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more.");
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(
    () => filterTasks(tasks, { ...EMPTY_FILTER, status: "all", search }, { usersById, teamsById }),
    [tasks, search, usersById, teamsById]
  );

  const months = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const t of visible) {
      const key = monthLabel(t);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()];
  }, [visible]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p className="font-semibold">Couldn&apos;t load the archive.</p>
        <p className="mt-1 break-words">{error}</p>
        <p className="mt-2 text-xs">
          If this mentions an index, deploy the indexes with{" "}
          <code>firebase deploy --only firestore:indexes</code> and wait a few minutes.
        </p>
      </div>
    );
  }

  return (
    <div>
      {months.map(([month, list]) => (
        <section key={month} className="mb-6">
          <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.15em] text-gold-dark">
            {month}
          </h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {list.map((t) => (
              <TaskCard key={t.id} task={t} onClick={() => onOpen(t)} showStatus={false} />
            ))}
          </div>
        </section>
      ))}

      {!loading && visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-muted">
          {tasks.length === 0 ? "No completed tasks match these filters." : "No loaded tasks match your search. Try loading more."}
        </p>
      )}
      {loading && <p className="text-sm text-muted">Loading…</p>}

      {hasMore && !loading && (
        <button onClick={loadMore} className={clsx(btnSecondary, "w-full")}>
          Load older tasks
        </button>
      )}
    </div>
  );
}

export default function ArchivePage() {
  const { scopeId } = useScope();
  const { openEdit, modal } = useTaskModal(scopeId);
  const [fromStr, setFromStr] = useState("");
  const [toStr, setToStr] = useState("");
  const [search, setSearch] = useState("");

  return (
    <div>
      <PageHeader title="Archive" subtitle="Completed tasks, newest first. Scroll back through everything the society has finished." />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <label className={labelCls}>Search loaded tasks</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, team or person…"
              className={clsx(inputCls, "pl-8")}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Completed from</label>
          <input type="date" value={fromStr} onChange={(e) => setFromStr(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Completed to</label>
          <input type="date" value={toStr} onChange={(e) => setToStr(e.target.value)} className={inputCls} />
        </div>
      </div>

      <ArchiveList
        key={`${scopeId ?? ""}|${fromStr}|${toStr}`}
        teamId={scopeId}
        fromStr={fromStr}
        toStr={toStr}
        search={search}
        onOpen={openEdit}
      />
      {modal}
    </div>
  );
}
