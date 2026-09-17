import type { Request } from "express";

const buckets = new Map<string, { startedAt: number; count: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 12;

function requestKey(req: Request, guestSessionHash: string) {
  return `${req.ip || "unknown"}:${guestSessionHash}`;
}

export function assertAnonymousRateLimit(req: Request, guestSessionHash: string) {
  const now = Date.now();
  const key = requestKey(req, guestSessionHash);
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    throw new Error("操作次數過於頻繁，請稍後再試");
  }
  bucket.count += 1;
}

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  buckets.forEach((bucket, key) => { if (bucket.startedAt < cutoff) buckets.delete(key); });
}, WINDOW_MS);
cleanupTimer.unref();
