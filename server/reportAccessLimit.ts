import type { Request } from 'express';
const buckets = new Map<string, { count: number; until: number }>();
export function assertReportAccessLimit(req: Request) {
  const now = Date.now(), key = req.ip || 'unknown';
  const bucket = buckets.get(key);
  if (!bucket || bucket.until <= now) { buckets.set(key, {count: 1, until: now + 10 * 60 * 1000}); return; }
  if (bucket.count >= 120) throw new Error('查詢次數過多，請稍後再試。已付款訂單不需重新付款。');
  bucket.count++;
}
const cleanup = setInterval(() => { const now = Date.now(); buckets.forEach((b, key) => { if (b.until <= now) buckets.delete(key); }); }, 600000);
cleanup.unref();
