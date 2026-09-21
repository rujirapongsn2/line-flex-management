import type { PrismaClient } from "@prisma/client";

export type CreateCheckinInput = {
  userId: string;
  displayName?: string | null;
  lat: number;
  lng: number;
  accuracy?: number | null;
};

/** Simple in-process rate limit: max N check-ins per user per window. */
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

export function allowCheckinRate(userId: string): boolean {
  const now = Date.now();
  const prev = (hits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= MAX_PER_WINDOW) {
    hits.set(userId, prev);
    return false;
  }
  prev.push(now);
  hits.set(userId, prev);
  return true;
}

export function isValidLineUserId(userId: string): boolean {
  return /^U[0-9a-fA-F]{32}$/.test(userId);
}

export function isValidCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export async function createCheckin(
  prisma: PrismaClient,
  input: CreateCheckinInput
) {
  return prisma.checkIn.create({
    data: {
      userId: input.userId,
      displayName: input.displayName || "",
      lat: input.lat,
      lng: input.lng,
      accuracy:
        input.accuracy != null && Number.isFinite(input.accuracy)
          ? input.accuracy
          : null,
    },
  });
}
