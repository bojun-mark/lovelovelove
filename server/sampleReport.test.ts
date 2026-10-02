import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), payment: vi.fn(), delivery: vi.fn(), execute: vi.fn() }));
vi.mock('./db', () => ({ getQuizSession: mocks.session, getDatabasePool: async () => ({ execute: mocks.execute }) }));
vi.mock('./ecpayStore', () => ({ getEcpay: mocks.payment }));
vi.mock('./reportStore', async original => ({ ...await original<typeof import('./reportStore')>(), getDelivery: mocks.delivery }));
import { sampleReport } from './sampleReport';
import { hashRecoveryCode } from './reportStore';
const code = '2.' + 'a'.repeat(43);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ECPAY_MODE', 'stage'); vi.stubEnv('REPORT_SAMPLE_SESSION_ID', '2');
  mocks.session.mockResolvedValue({ id: 2, status: 'pending', guestSessionHash: 'owner', expiresAt: new Date(Date.now() + 86400000) });
  mocks.delivery.mockResolvedValue({ recoveryHash: hashRecoveryCode(code) });
  mocks.payment.mockResolvedValue({ environment: 'stage', merchantId: '3002607', paid: 1 });
  mocks.execute.mockResolvedValue([[{ report: 'saved sample', createdAt: new Date('2026-01-01') }]]);
});
afterEach(() => vi.unstubAllEnvs());
it('rejects live mode even with the allowlisted order', async () => {
  vi.stubEnv('ECPAY_MODE', 'live');
  await expect(sampleReport({ sessionId: 2, create: true }, 'owner')).rejects.toThrow('未開放');
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('denies another browser and incorrect recovery code before sample access', async () => {
  await expect(sampleReport({ sessionId: 2, create: true }, 'other')).rejects.toThrow('無法讀取');
  await expect(sampleReport({ sessionId: 2, recoveryCode: 'wrong' }, 'other')).rejects.toThrow('無法讀取');
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('allows recovery in a new browser and reads without generating', async () => {
  expect((await sampleReport({ sessionId: 2, recoveryCode: code }, 'other')).report).toBe('saved sample');
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(mocks.execute.mock.calls[0][0]).toMatch(/^SELECT/);
});
it('rejects expired orders', async () => {
  mocks.session.mockResolvedValue({ guestSessionHash: 'owner', expiresAt: new Date(0) });
  await expect(sampleReport({ sessionId: 2, create: true }, 'owner')).rejects.toThrow('90 天');
  expect(mocks.execute).not.toHaveBeenCalled();
});
it.each(['live', '', 'stage'])('fails closed when disabled or not allowlisted (%s)', async mode => {
  vi.stubEnv('ECPAY_MODE', mode); vi.stubEnv('REPORT_SAMPLE_SESSION_ID', '');
  await expect(sampleReport({ sessionId: 2, create: true }, 'owner')).rejects.toThrow('未開放');
  expect(mocks.execute).not.toHaveBeenCalled();
});
it.each([{ environment: 'live', merchantId: '3002607', paid: 1 }, { environment: 'stage', merchantId: 'wrong', paid: 1 }, { environment: 'stage', merchantId: '3002607', paid: 0 }])('rejects unverified or non-sandbox payment', async payment => {
  mocks.payment.mockResolvedValue(payment);
  await expect(sampleReport({ sessionId: 2, create: true }, 'owner')).rejects.toThrow('未開放');
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('uses insert-if-absent and returns persisted content without modifying paid/report tables', async () => {
  const result = await sampleReport({ sessionId: 2, create: true }, 'owner');
  expect(result.report).toBe('saved sample');
  expect(mocks.execute.mock.calls[0][0]).toMatch(/^INSERT IGNORE INTO sample_reports/);
  expect(mocks.execute.mock.calls.every(([sql]) => !/UPDATE|quiz_sessions|report_deliveries/.test(sql))).toBe(true);
});
