import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizSession } from '../drizzle/schema';
import type { BirthChart } from './astrology';

const store = vi.hoisted(() => ({ getDelivery: vi.fn(), claimReport: vi.fn(), saveReport: vi.fn(), releaseReport: vi.fn(), claimEmail: vi.fn(), finishEmail: vi.fn() }));
vi.mock('./reportStore', async importOriginal => ({ ...await importOriginal<typeof import('./reportStore')>(), ...store }));
import { authorizeOrder, durableReport, safeDeliverEmail } from './reportDelivery';
import { hashRecoveryCode } from './reportStore';
const order = { id: 7, status: 'paid', guestSessionHash: 'owner', email: 'customer@example.test', expiresAt: new Date(Date.now() + 86400000) } as QuizSession;
const generated = { report: '測試報告內容'.repeat(250), chart: { birth: { place: '台灣・新北市・板橋區' } } as BirthChart };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('RESEND_API_KEY', ''); vi.stubEnv('REPORT_FROM_EMAIL', '');
  store.claimReport.mockResolvedValue(true); store.claimEmail.mockResolvedValue(true);
  store.releaseReport.mockResolvedValue(undefined); store.finishEmail.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('paid report delivery', () => {
  it('rejects unknown, other-owner and expired orders; accepts high entropy recovery code', () => {
    expect(() => authorizeOrder(undefined, 'owner')).toThrow();
    expect(() => authorizeOrder(order, 'other')).toThrow();
    expect(() => authorizeOrder(order, 'other', 'wrong', hashRecoveryCode('7.secret'))).toThrow();
    expect(authorizeOrder(order, 'other', '7.secret', hashRecoveryCode('7.secret'))).toBe(order);
    expect(() => authorizeOrder({...order, expiresAt: new Date(0)}, 'owner')).toThrow('90 天');
  });
  it('never generates or returns a report for unpaid orders', async () => {
    const generate = vi.fn();
    await expect(durableReport({...order, status: 'pending'}, generate)).rejects.toThrow('付款');
    expect(generate).not.toHaveBeenCalled(); expect(store.getDelivery).not.toHaveBeenCalled();
  });
  it('returns the identical saved report without another model request', async () => {
    store.getDelivery.mockResolvedValue({report: generated.report, chart: JSON.stringify(generated.chart)});
    const generate = vi.fn();
    expect(await durableReport(order, generate)).toEqual(generated);
    expect(generate).not.toHaveBeenCalled(); expect(store.claimReport).not.toHaveBeenCalled();
  });
  it('waits for durable save before reporting success', async () => {
    const calls: string[] = [];
    store.saveReport.mockImplementation(async () => { calls.push('saved'); });
    const result = await durableReport(order, async () => { calls.push('generated'); return generated; });
    calls.push('returned');
    expect(calls).toEqual(['generated', 'saved', 'returned']); expect(result).toEqual(generated);
  });
  it('does not report success if storage fails; releases its lease', async () => {
    store.saveReport.mockRejectedValue(new Error('db unavailable'));
    await expect(durableReport(order, async () => generated)).rejects.toThrow();
    expect(store.releaseReport).toHaveBeenCalledOnce();
  });
  it('does not issue duplicate model requests when another worker holds the lease', async () => {
    store.claimReport.mockResolvedValue(false);
    const generate = vi.fn();
    await expect(durableReport(order, generate)).rejects.toThrow('5 分鐘');
    expect(generate).not.toHaveBeenCalled(); expect(store.releaseReport).not.toHaveBeenCalled();
  });
  it('reuses a report completed while the request was claiming its lease', async () => {
    store.getDelivery.mockResolvedValueOnce(undefined).mockResolvedValueOnce({report: generated.report, chart: JSON.stringify(generated.chart)});
    store.claimReport.mockResolvedValue(false);
    expect(await durableReport(order, vi.fn())).toEqual(generated);
  });
  it('releases failed generation for a later retry, rejects incomplete content', async () => {
    await expect(durableReport(order, async () => { throw new Error('model timeout'); })).rejects.toThrow('請勿重複付款');
    await expect(durableReport(order, async () => ({...generated, report: 'too short'}))).rejects.toThrow('請勿重複付款');
    expect(store.releaseReport).toHaveBeenCalledTimes(2);
    expect(store.saveReport).not.toHaveBeenCalled();
    expect(await durableReport(order, async () => generated)).toEqual(generated);
  });
  it('does not send mail without configuration', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(await safeDeliverEmail(order)).toBe('not_configured'); expect(fetch).not.toHaveBeenCalled();
  });
  it('mail failure leaves the saved report intact and can be retried', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-only'); vi.stubEnv('REPORT_FROM_EMAIL', 'reports@example.test');
    store.getDelivery.mockResolvedValue({report: generated.report, emailState: 'not_sent'});
    const fetch = vi.fn().mockResolvedValueOnce({ok: false}).mockResolvedValueOnce({ok: true, json: async () => ({id: 'mail-1'})}); vi.stubGlobal('fetch', fetch);
    expect(await safeDeliverEmail(order)).toBe('failed');
    expect(await safeDeliverEmail(order)).toBe('submitted');
    expect(store.saveReport).not.toHaveBeenCalled(); expect(store.finishEmail.mock.calls[0][2]).toBe('failed');
    expect(store.finishEmail.mock.calls[1][2]).toBe('submitted');
    const request = JSON.parse(fetch.mock.calls[1][1].body);
    expect(request.to).toEqual(['customer@example.test']); expect(request.text).toContain(generated.report);
  });
  it('does not resend mail already accepted by provider', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-only'); vi.stubEnv('REPORT_FROM_EMAIL', 'reports@example.test');
    store.getDelivery.mockResolvedValue({report: generated.report, emailState: 'submitted'});
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(await safeDeliverEmail(order)).toBe('submitted'); expect(fetch).not.toHaveBeenCalled();
  });
});
