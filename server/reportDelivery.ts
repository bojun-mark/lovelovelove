import { randomBytes } from 'node:crypto';
import type { QuizSession } from '../drizzle/schema';
import type { BirthChart } from './astrology';
import { getDelivery, claimReport, saveReport, releaseReport, claimEmail, finishEmail, matchesRecoveryCode } from './reportStore';

export function authorizeOrder(session: QuizSession | undefined, guestHash: string, code?: string, recoveryHash?: string | null) {
  if (!session || (session.guestSessionHash !== guestHash && !matchesRecoveryCode(code, recoveryHash)))
    throw new Error('無法讀取此訂單，請使用付款時的瀏覽器或正確的報告取回碼。');
  if (new Date(session.expiresAt).getTime() <= Date.now()) throw new Error('此訂單已超過 90 天查詢期限。');
  return session;
}
export async function durableReport(session: QuizSession, generate: () => Promise<{ report: string; chart: BirthChart }>) {
  if (session.status !== 'paid') throw new Error('付款尚未驗證，無法生成付費報告；請先查詢付款狀態。');
  const saved = await getDelivery(session.id);
  if (saved?.report && saved.chart) return { report: saved.report, chart: JSON.parse(saved.chart) as BirthChart };
  const token = randomBytes(24).toString('hex');
  if (!await claimReport(session.id, token)) {
    const ready = await getDelivery(session.id);
    if (ready?.report && ready.chart) return { report: ready.report, chart: JSON.parse(ready.chart) as BirthChart };
    throw new Error('報告正在處理或剛剛重試過，請稍後再查詢；若頁面曾中斷，最多等待 5 分鐘即可重試，不需重新付款。');
  }
  try {
    const result = await generate();
    if (result.report.trim().length < 1000) throw new Error('報告尚未完整，請稍後重試，不需重新付款。');
    await saveReport(session.id, token, result.report, result.chart);
    return result;
  } catch {
    await releaseReport(session.id, token).catch(() => {});
    throw new Error('報告暫時未完成或尚未確認保存。請稍後從「我的訂單與報告」重試，請勿重複付款。');
  }
}
export const emailConfigured = () => !!process.env.RESEND_API_KEY?.trim() && !!process.env.REPORT_FROM_EMAIL?.trim();
export async function deliverEmail(session: QuizSession): Promise<string> {
  if (!emailConfigured()) return 'not_configured';
  const saved = await getDelivery(session.id);
  if (!saved?.report) return 'not_ready';
  if (saved.emailState === 'submitted') return 'submitted';
  const token = randomBytes(24).toString('hex');
  if (!await claimEmail(session.id, token)) return 'waiting';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `starlovelab-report-${session.id}` },
      body: JSON.stringify({ from: process.env.REPORT_FROM_EMAIL!.trim(), to: [session.email],
        subject: `StarLoveLab 訂單 #${session.id}｜你的專屬解答`,
        text: `訂單 #${session.id}\n\n${saved.report}\n\n請保存這封信。亦可使用付款時的瀏覽器，回網站「我的訂單與報告」查看（訂單建立後 90 天內）。` }),
    });
    if (!response.ok) throw new Error('mail_provider_error');
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error('mail_provider_error');
    await finishEmail(session.id, token, 'submitted');
    return 'submitted';
  } catch {
    await finishEmail(session.id, token, 'failed').catch(() => {});
    return 'failed';
  }
}
// Email availability must never hide an already-saved report.
export async function safeDeliverEmail(session: QuizSession) {
  try { return await deliverEmail(session); } catch { return 'failed'; }
}
