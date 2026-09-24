import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getDatabasePool } from './db';

export type Delivery = RowDataPacket & {
  sessionId: number; recoveryHash: string | null; report: string | null; chart: string | null;
  leaseToken: string | null; leaseUntil: Date | null; attempts: number; lastAttempt: Date | null;
  emailState: string; emailLease: string | null; emailLeaseUntil: Date | null;
  emailAttempts: number; emailAttemptAt: Date | null;
};
export const hashRecoveryCode = (code: string) => createHash('sha256').update(code).digest('hex');
export function matchesRecoveryCode(code: string | undefined, hash: string | null | undefined) {
  return !!code && !!hash && /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(Buffer.from(hashRecoveryCode(code), 'hex'), Buffer.from(hash, 'hex'));
}
export async function ensureDelivery(id: number) {
  const pool = await getDatabasePool();
  await pool.execute('INSERT IGNORE INTO report_deliveries (sessionId) VALUES (?)', [id]);
}
export async function getDelivery(id: number): Promise<Delivery | undefined> {
  const pool = await getDatabasePool();
  const [rows] = await pool.execute<Delivery[]>('SELECT * FROM report_deliveries WHERE sessionId = ?', [id]);
  return rows[0];
}
export async function issueRecoveryCode(id: number) {
  await ensureDelivery(id);
  const code = `${id}.${randomBytes(32).toString('base64url')}`;
  const pool = await getDatabasePool();
  await pool.execute('UPDATE report_deliveries SET recoveryHash = ? WHERE sessionId = ?', [hashRecoveryCode(code), id]);
  return code;
}
// Atomic database lease coordinates different browser tabs and server instances.
// Lease is longer than the 120-second model request timeout. A crashed process can be retried.
export async function claimReport(id: number, token: string) {
  await ensureDelivery(id);
  const pool = await getDatabasePool();
  const [result] = await pool.execute<ResultSetHeader>(`UPDATE report_deliveries
    SET leaseToken = ?, leaseUntil = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE),
        attempts = attempts + 1, lastAttempt = UTC_TIMESTAMP()
    WHERE sessionId = ? AND report IS NULL
      AND (leaseUntil IS NULL OR leaseUntil < UTC_TIMESTAMP())
      AND (lastAttempt IS NULL OR lastAttempt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 SECOND))`, [token, id]);
  return result.affectedRows === 1;
}
export async function saveReport(id: number, token: string, report: string, chart: unknown) {
  const pool = await getDatabasePool();
  const [result] = await pool.execute<ResultSetHeader>(`UPDATE report_deliveries
    SET report = ?, chart = ?, leaseToken = NULL, leaseUntil = NULL
    WHERE sessionId = ? AND leaseToken = ? AND report IS NULL`, [report, JSON.stringify(chart), id, token]);
  if (result.affectedRows !== 1) throw new Error('報告儲存尚未確認，請稍後從「我的訂單與報告」查詢；請勿重複付款。');
}
export async function releaseReport(id: number, token: string) {
  const pool = await getDatabasePool();
  await pool.execute('UPDATE report_deliveries SET leaseToken = NULL, leaseUntil = NULL WHERE sessionId = ? AND leaseToken = ?', [id, token]);
}
export async function listOrders(guestHash: string) {
  const pool = await getDatabasePool();
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT q.id, q.plan, q.amount, q.status, q.createdAt, q.expiresAt,
    (d.report IS NOT NULL) AS reportReady FROM quiz_sessions q LEFT JOIN report_deliveries d ON d.sessionId = q.id
    WHERE q.guestSessionHash = ? AND q.expiresAt > UTC_TIMESTAMP() ORDER BY q.id DESC LIMIT 100`, [guestHash]);
  return rows.map(r => ({ id: Number(r.id), plan: String(r.plan), amount: Number(r.amount), status: String(r.status),
    reportReady: !!r.reportReady, createdAt: new Date(r.createdAt).toISOString(), expiresAt: new Date(r.expiresAt).toISOString() }));
}
export async function claimEmail(id: number, token: string) {
  const pool = await getDatabasePool();
  const [result] = await pool.execute<ResultSetHeader>(`UPDATE report_deliveries
    SET emailLease = ?, emailLeaseUntil = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 MINUTE),
      emailAttempts = emailAttempts + 1, emailAttemptAt = UTC_TIMESTAMP()
    WHERE sessionId = ? AND report IS NOT NULL AND emailState <> 'submitted'
      AND (emailLeaseUntil IS NULL OR emailLeaseUntil < UTC_TIMESTAMP())
      AND (emailAttemptAt IS NULL OR emailAttemptAt < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE))`, [token, id]);
  return result.affectedRows === 1;
}
export async function finishEmail(id: number, token: string, state: 'submitted' | 'failed') {
  const pool = await getDatabasePool();
  await pool.execute('UPDATE report_deliveries SET emailState = ?, emailLease = NULL, emailLeaseUntil = NULL WHERE sessionId = ? AND emailLease = ?', [state, id, token]);
}
