import type { NextConfig } from "next";
import path from "node:path";

// Pin the project root so Next.js doesn't walk up into C:\Users\dsipu
// (whose stray package-lock.json caused noisy "ignored package-lock.json"
// warnings in the console on every dev/build/start).
const projectRoot = __dirname;

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(projectRoot),
  },
  outputFileTracingRoot: path.resolve(projectRoot),
};

export default nextConfig;
