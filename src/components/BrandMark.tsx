import Image from "next/image";
import clsx from "clsx";
import { LOGO_SRC } from "@/lib/brand";

/** Society seal plus wordmark. */
export default function BrandMark({
  size = 44,
  stacked = false,
  className,
}: {
  size?: number;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3",
        stacked && "flex-col text-center",
        className
      )}
    >
      <Image
        src={LOGO_SRC}
        alt="Purdue National Security & Defense Society seal"
        width={size}
        height={size}
        priority
        className="shrink-0 rounded-full"
      />
      <div className="font-display leading-tight">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">Purdue</div>
        <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white">
          National Security
          <br />
          &amp; Defense Society
        </div>
      </div>
    </div>
  );
}
