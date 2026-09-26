import clsx from "clsx";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export default function Avatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-ink font-semibold text-gold ring-1 ring-gold/40",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
