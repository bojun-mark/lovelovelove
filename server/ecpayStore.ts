import type { RowDataPacket } from 'mysql2';
import { getDatabasePool, getQuizSession } from './db';
import { paymentConfig, queryTrade, validatePayment, type Fields } from './ecpay';
export type Payment = RowDataPacket & { sessionId: number; tradeNo: string; environment: string; merchantId: string; paid: number };
export async function attachEcpay(id: number, tradeNo: string) {
  const config = paymentConfig();
  const pool = await getDatabasePool();
  await pool.execute('INSERT INTO ecpay_orders (sessionId, tradeNo, environment, merchantId) VALUES (?, ?, ?, ?)', [id, tradeNo, config.mode, config.merchantId]);
}
export async function getEcpay(id: number | string) {
  const pool = await getDatabasePool();
  const column = typeof id === 'number' ? 'sessionId' : 'tradeNo';
  const [rows] = await pool.execute<Payment[]>(`SELECT * FROM ecpay_orders WHERE ${column} = ?`, [id]);
  return rows[0];
}
export function checkEnvironment(payment: Payment) {
  const config = paymentConfig();
  if (payment.environment !== config.mode || payment.merchantId !== config.merchantId) throw new Error('此訂單的付款環境或商店設定不同，請聯絡商店確認，請勿重複付款。');
}
export async function acceptPayment(payment: Payment, fields: Fields, kind: 'notification' | 'query') {
  checkEnvironment(payment);
  const order = await getQuizSession(payment.sessionId);
  if (!order) throw new Error('找不到付款訂單');
  if (!validatePayment(fields, {ecpayTradeNo: payment.tradeNo, amount: order.amount}, kind)) return false;
  const pool = await getDatabasePool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE ecpay_orders SET paid = 1 WHERE sessionId = ?', [payment.sessionId]);
    // Public sandbox credentials must never unlock real reports or consume model credit.
    if (payment.environment === 'live') await connection.execute("UPDATE quiz_sessions SET status = 'paid' WHERE id = ? AND status = 'pending'", [payment.sessionId]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  return true;
}
export async function reconcileEcpay(payment: Payment) {
  checkEnvironment(payment);
  const confirmed = !!payment.paid || await acceptPayment(payment, await queryTrade(payment.tradeNo), 'query');
  if (confirmed && payment.environment === 'stage') throw new Error('綠界測試付款驗證成功；不會實際扣款，也不會生成付費 AI 報告。');
  return getQuizSession(payment.sessionId);
}
