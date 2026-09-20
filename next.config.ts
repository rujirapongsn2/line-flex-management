import type { NextConfig } from "next";
import { ensureAuthEnv } from "./lib/auth";

// Load or create session secret so Edge middleware can verify cookies.
try {
  ensureAuthEnv();
} catch (err) {
  console.warn("[next.config] ensureAuthEnv:", err);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
