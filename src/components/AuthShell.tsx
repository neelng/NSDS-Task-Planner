import type { ReactNode } from "react";
import Image from "next/image";
import { LOGO_SRC } from "@/lib/brand";

/** Dark full-page frame with the society seal, shared by the sign-in and set-password screens. */
export default function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(207,185,145,0.18),transparent_60%)]"
      />
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Image
            src={LOGO_SRC}
            alt="Purdue National Security & Defense Society seal"
            width={132}
            height={132}
            priority
            className="rounded-full shadow-[0_0_60px_rgba(207,185,145,0.25)]"
          />
          <p className="mt-5 font-display text-xs font-semibold uppercase tracking-[0.35em] text-gold">Purdue</p>
          <h1 className="mt-1 font-display text-xl font-semibold uppercase leading-snug tracking-wide text-white">
            National Security
            <br />
            &amp; Defense Society
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.25em] text-white/40">Task Planner</p>
        </div>

        <div className="mt-8 rounded-xl border border-gold/30 bg-charcoal p-6 shadow-2xl">{children}</div>

        {footer && <p className="mt-5 text-center text-xs text-white/35">{footer}</p>}
      </div>
    </div>
  );
}

export const authInputCls =
  "mt-3 w-full rounded-md border border-white/15 bg-ink px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-gold-bright";

export const authButtonCls =
  "mt-4 w-full rounded-md bg-gold-bright px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gold disabled:opacity-50";

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
    >
      {message}
    </div>
  );
}
