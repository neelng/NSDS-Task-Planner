"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { useData } from "@/lib/data-context";
import type { AppUser } from "@/lib/types";
import { inputCls } from "@/lib/ui";
import Avatar from "./Avatar";

/** Multi-select people search: chips for the chosen people, a filtered list of the rest. */
export default function PersonPicker({
  candidates,
  selectedIds,
  onChange,
  disabled,
  placeholder = "Search people…",
}: {
  candidates: AppUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { usersById } = useData();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates
      .filter((u) => !selectedIds.includes(u.uid))
      .filter(
        (u) =>
          !needle ||
          u.name.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle) ||
          u.title.toLowerCase().includes(needle)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [candidates, selectedIds, q]);

  return (
    <div className="relative">
      {selectedIds.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const u = usersById.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink py-0.5 pl-0.5 pr-2 text-xs text-white"
              >
                <Avatar name={u?.name ?? "?"} size={20} />
                {u?.name ?? "Unknown"}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                    aria-label={`Remove ${u?.name ?? "person"}`}
                    className="text-white/60 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {!disabled && (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            className={inputCls}
          />
          {focused && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFocused(false)} aria-hidden="true" />
              <ul
                className={clsx(
                  "absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-line bg-white py-1 shadow-lg"
                )}
              >
                {matches.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted">No one else to add.</li>
                )}
                {matches.map((u) => (
                  <li key={u.uid}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange([...selectedIds, u.uid]);
                        setQ("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gold-tint"
                    >
                      <Avatar name={u.name} size={22} />
                      <span className="font-medium text-ink">{u.name}</span>
                      <span className="truncate text-xs text-muted">{u.title || u.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {disabled && selectedIds.length === 0 && <p className="text-sm text-muted">No one assigned.</p>}
    </div>
  );
}
