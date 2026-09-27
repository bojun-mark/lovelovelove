import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest';
const db = vi.hoisted(() => ({getDatabasePool: vi.fn(), getQuizSession: vi.fn()}));
vi.mock('./db', () => db);
import {acceptPayment, checkEnvironment, type Payment} from './ecpayStore';
import {checkMac, paymentConfig} from './ecpay';
const connection = {beginTransaction: vi.fn(), execute: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn()};
const payment = {sessionId: 1, tradeNo: 'SL123', environment: 'stage', merchantId: '3002607', paid: 0} as Payment;
function signed(override = {}) {
  const config = paymentConfig();
  const fields = {MerchantID: config.merchantId, MerchantTradeNo: 'SL123', TradeAmt: '99', RtnCode: '1', SimulatePaid: '0', ...override};
  return {...fields, CheckMacValue: checkMac(fields, config.hashKey, config.hashIV)};
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('ECPAY_MODE', 'stage');
  db.getDatabasePool.mockResolvedValue({getConnection: async () => connection});
  db.getQuizSession.mockResolvedValue({id: 1, amount: 99});
});
afterEach(() => vi.unstubAllEnvs());
describe('payment recording', () => {
  it('sandbox callbacks never unlock paid reports', async () => {
    expect(await acceptPayment(payment, signed(), 'notification')).toBe(true);
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[0][0]).toContain('ecpay_orders');
  });
  it('rejects environment, merchant, amount and signature mismatch', async () => {
    expect(() => checkEnvironment({...payment, environment: 'live'})).toThrow();
    expect(() => checkEnvironment({...payment, merchantId: 'wrong'})).toThrow();
    await expect(acceptPayment(payment, signed({TradeAmt:'1'}), 'notification')).rejects.toThrow();
    await expect(acceptPayment(payment, {...signed(), CheckMacValue:'x'}, 'notification')).rejects.toThrow();
    expect(connection.execute).not.toHaveBeenCalled();
  });
  it('does not record simulated or failed payments', async () => {
    expect(await acceptPayment(payment, signed({SimulatePaid:'1'}), 'notification')).toBe(false);
    expect(await acceptPayment(payment, signed({RtnCode:'0'}), 'notification')).toBe(false);
    expect(connection.execute).not.toHaveBeenCalled();
  });
  it('commits live payment and report entitlement in one transaction; retries are idempotent', async () => {
    vi.stubEnv('ECPAY_MODE', 'live'); vi.stubEnv('ECPAY_MERCHANT_ID', '1234567');
    vi.stubEnv('ECPAY_HASH_KEY', 'test-private-key'); vi.stubEnv('ECPAY_HASH_IV', 'test-private-iv');
    const live = {...payment, environment:'live', merchantId:'1234567'};
    await acceptPayment(live, signed(), 'notification');
    await acceptPayment(live, signed(), 'notification');
    expect(connection.commit).toHaveBeenCalledTimes(2);
    expect(connection.execute.mock.calls[1][0]).toContain("status = 'pending'");
    connection.execute.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(acceptPayment(live, signed(), 'notification')).rejects.toThrow();
    expect(connection.rollback).toHaveBeenCalledTimes(1); expect(connection.release).toHaveBeenCalledTimes(3);
  });
});
