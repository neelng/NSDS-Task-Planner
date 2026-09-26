"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** The selected team subtree lives in the URL (?team=<id>) so views can be shared. */
export function useScope() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const scopeId = params.get("team");

  const setScope = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("team", id);
      else next.delete("team");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [params, router, pathname]
  );

  return { scopeId, setScope };
}

export function withScope(href: string, scopeId: string | null): string {
  return scopeId ? `${href}?team=${scopeId}` : href;
}

export function inScope(teamPath: string[], scopeId: string | null): boolean {
  return !scopeId || teamPath.includes(scopeId);
}
