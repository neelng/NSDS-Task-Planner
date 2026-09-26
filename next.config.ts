import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// While developing, let other devices on the same network (a phone, another laptop) open the dev
// server by this computer's address. Next.js blocks dev resources from any hostname it doesn't
// know, so we allow this machine's own addresses. They are read each time the dev server starts,
// so restart it after switching networks. This has no effect on production builds.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n !== undefined && !n.internal && String(n.family).includes("4"))
  .map((n) => n!.address);

// Extra hostnames, e.g. a tunnel: DEV_ORIGINS=*.trycloudflare.com in .env.local (hostnames only, no port).
const extraOrigins = (process.env.DEV_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...lanAddresses, ...extraOrigins],
};

export default nextConfig;
