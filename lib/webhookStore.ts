import { ensureDbReady } from "./db";

export type WebhookUserEntry = {
  userId: string;
  displayHint: string;
  at: string;
};

const MAX_ENTRIES = 50;

/** Persist recent userIds from webhook events (SQLite). */
export async function recordWebhookUser(
  userId: string,
  displayHint = ""
): Promise<void> {
  const id = (userId || "").trim();
  if (!id) return;

  try {
    const prisma = await ensureDbReady();
    const existing = await prisma.webhookUser.findUnique({
      where: { userId: id },
    });
    await prisma.webhookUser.upsert({
      where: { userId: id },
      create: {
        userId: id,
        displayHint: displayHint || "",
      },
      update: {
        displayHint: displayHint || existing?.displayHint || "",
        lastSeenAt: new Date(),
      },
    });

    // Cap table size — delete oldest beyond MAX_ENTRIES
    const count = await prisma.webhookUser.count();
    if (count > MAX_ENTRIES) {
      const oldest = await prisma.webhookUser.findMany({
        orderBy: { lastSeenAt: "asc" },
        take: count - MAX_ENTRIES,
        select: { userId: true },
      });
      if (oldest.length > 0) {
        await prisma.webhookUser.deleteMany({
          where: { userId: { in: oldest.map((u) => u.userId) } },
        });
      }
    }
  } catch (err) {
    console.warn("[webhookStore] record failed", err);
  }
}

export async function listWebhookUsers(): Promise<WebhookUserEntry[]> {
  try {
    const prisma = await ensureDbReady();
    const rows = await prisma.webhookUser.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: MAX_ENTRIES,
    });
    return rows.map((r) => ({
      userId: r.userId,
      displayHint: r.displayHint,
      at: r.lastSeenAt.toISOString(),
    }));
  } catch (err) {
    console.warn("[webhookStore] list failed", err);
    return [];
  }
}
