import { PrismaClient } from "@prisma/client";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  __linedevPrisma?: PrismaClient;
  __linedevMigrated?: Promise<void>;
};

function resolveDatabaseUrl(): string {
  const fromEnv = (process.env.DATABASE_URL || "").trim();
  if (fromEnv) return fromEnv;
  const dbPath = path.join(process.cwd(), "data", "linedev.db");
  // Prisma SQLite URLs need three slashes for absolute paths on Unix
  return `file:${dbPath}`;
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__linedevPrisma) {
    process.env.DATABASE_URL = resolveDatabaseUrl();
    globalForPrisma.__linedevPrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.__linedevPrisma;
}

/** Ensure schema + JSON→SQLite migration once per process. */
export async function ensureDbReady(): Promise<PrismaClient> {
  const prisma = getPrisma();
  if (!globalForPrisma.__linedevMigrated) {
    globalForPrisma.__linedevMigrated = (async () => {
      const { ensureMigrated } = await import("./migrate");
      await ensureMigrated(prisma);
    })().catch((err) => {
      globalForPrisma.__linedevMigrated = undefined;
      throw err;
    });
  }
  await globalForPrisma.__linedevMigrated;
  return prisma;
}
