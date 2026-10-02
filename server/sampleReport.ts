import type { RowDataPacket } from 'mysql2';
import { getDatabasePool, getQuizSession } from './db';
import { getEcpay } from './ecpayStore';
import { sandbox } from './ecpay';
import { getDelivery } from './reportStore';
import { authorizeOrder } from './reportDelivery';

// Explicit server allowlist, plus the existing owner/recovery check. Never grants paid access.
export async function sampleReport(input: { sessionId: number; recoveryCode?: string; create?: boolean }, guestHash: string) {
  const delivery = await getDelivery(input.sessionId);
  const session = authorizeOrder(await getQuizSession(input.sessionId), guestHash, input.recoveryCode, delivery?.recoveryHash);
  const payment = await getEcpay(session.id);
  const allowed = process.env.ECPAY_MODE === 'stage' &&
    process.env.REPORT_SAMPLE_SESSION_ID?.trim() === String(session.id) &&
    payment?.environment === 'stage' && payment.merchantId === sandbox.merchantId && payment.paid === 1;
  if (!allowed) {
    if (input.create) throw new Error('此訂單未開放範例報告測試。');
    return { available: false as const, sessionId: session.id, report: null, createdAt: null };
  }
  const pool = await getDatabasePool();
  if (input.create) {
    const report = `StarLoveLab 範例報告｜訂單 #${session.id}\n\n這是固定範例文字，不是 AI 生成，也不是你的個人分析。\n\n一、保存測試\n這份內容保存在資料庫。重新整理後應能看到相同內容與保存時間。\n\n二、取回測試\n關閉頁面後，可從「我的訂單與報告」重新開啟。換成無痕視窗時，必須輸入這筆訂單的私人取回碼。\n\n三、測試範圍\n這次只驗證範例資料的保存、存取權限與重新取回；沒有實際扣款、沒有呼叫 AI，也沒有寄信。正式 AI 報告的生成與交付仍需另外驗證。`;
    // A primary key makes retries/concurrent requests preserve the first saved sample.
    await pool.execute('INSERT IGNORE INTO sample_reports (sessionId, report) VALUES (?, ?)', [session.id, report]);
  }
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT report, createdAt FROM sample_reports WHERE sessionId = ?', [session.id]);
  if (input.create && !rows[0]) throw new Error('範例報告尚未確認保存，請稍後重試。');
  return { available: true as const, sessionId: session.id, report: rows[0] ? String(rows[0].report) : null,
    createdAt: rows[0] ? new Date(rows[0].createdAt).toISOString() : null };
}
