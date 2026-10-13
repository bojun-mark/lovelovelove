import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest';
const db = vi.hoisted(() => ({createQuizSession:vi.fn(),getQuizSession:vi.fn(),getQuizSessionByStripeId:vi.fn(),markQuizSessionPaid:vi.fn(),attachStripeCheckoutSession:vi.fn()}));
const payments = vi.hoisted(() => ({getEcpay:vi.fn(),attachEcpay:vi.fn(),reconcileEcpay:vi.fn()}));
vi.mock('./db', () => db);
vi.mock('./ecpayStore', () => payments);
vi.mock('./reportStore', async original => ({...await original<typeof import('./reportStore')>(),getDelivery:vi.fn().mockResolvedValue(undefined),issueRecoveryCode:vi.fn().mockResolvedValue('7.private'),listOrders:vi.fn()}));
vi.mock('./_core/anonymousRateLimit', () => ({assertAnonymousRateLimit:vi.fn()}));
import {appRouter} from './routers';
const context = {user:null,guestSessionHash:'owner',req:{ip:'test'},res:{}} as any;
const order = {id:7,guestSessionHash:'owner',expiresAt:new Date(Date.now()+86400000),status:'pending',colors:'[]',answers:'[]',birthTime:'未提供'};
beforeEach(() => {vi.clearAllMocks();vi.stubEnv('ECPAY_MODE','stage');db.getQuizSession.mockResolvedValue(order);payments.getEcpay.mockResolvedValue({sessionId:7,environment:'stage'});payments.reconcileEcpay.mockResolvedValue(order);});
afterEach(() => vi.unstubAllEnvs());
describe('ECPay router boundary', () => {
  it('return URL cannot mark an unpaid order paid', async () => {
    await expect(appRouter.createCaller(context).starLove.verifyPayment({sessionId:'SL123456789012345678'})).rejects.toThrow('尚未確認');
    expect(db.markQuizSessionPaid).not.toHaveBeenCalled();
  });
  it('rejects other browser and expired order before contacting payment service', async () => {
    db.getQuizSession.mockResolvedValue({...order,guestSessionHash:'other'});
    await expect(appRouter.createCaller(context).starLove.verifyPayment({sessionId:'SL123456789012345678'})).rejects.toThrow('無法讀取');
    db.getQuizSession.mockResolvedValue({...order,expiresAt:new Date(0)});
    await expect(appRouter.createCaller(context).starLove.verifyPayment({sessionId:'SL123456789012345678'})).rejects.toThrow('90 天');
    expect(payments.reconcileEcpay).not.toHaveBeenCalled();
  });
  it('creates ECPay with server price and retains recovery receipt', async () => {
    db.createQuizSession.mockResolvedValue(7);
    const result = await appRouter.createCaller(context).starLove.createCheckout({nickname:'測試',year:'1994',month:'7',day:'15',place:'台北',email:'reader@example.test',colors:['a','b'],answers:Array(10).fill(0),category:'測試',subQuestion:'測試',plan:'基礎啟示版',planId:'basic',amount:1});
    expect(db.createQuizSession.mock.calls[0][0].amount).toBe(99);
    expect(result.recoveryCode).toBe('7.private');expect(result.checkoutUrl).toMatch(/^\/api\/ecpay\/checkout\/SL[a-f0-9]{18}$/);
  });
  it('saves full followups with the order and rejects a category mismatch before saving', async () => {
    db.createQuizSession.mockResolvedValue(7);
    const reportContext = {version:1 as const, priorityState:8, followups:['整理資料與規劃','沒有時間與力氣','每週兩小時'] as [string,string,string],recentExample:'整理過活動名單'};
    const input = {nickname:'測試',year:'1994',month:'7',day:'15',place:'台北',email:'reader@example.test',colors:['a','b'],answers:Array(10).fill(3),category:'事業與財富',subQuestion:'我的能力適合發展哪一種副業？',plan:'假的完整版',planId:'basic' as const,amount:299,reportContext};
    await appRouter.createCaller(context).starLove.createCheckout(input);
    expect(JSON.parse(db.createQuizSession.mock.calls[0][0].reportContext)).toEqual(reportContext);
    expect(db.createQuizSession.mock.calls[0][0].plan).toBe('基礎啟示版');
    db.createQuizSession.mockClear();
    await expect(appRouter.createCaller(context).starLove.createCheckout({...input,category:'感情與人際'})).rejects.toThrow('追問');
    expect(db.createQuizSession).not.toHaveBeenCalled();
    await expect(appRouter.createCaller(context).starLove.createCheckout({...input,answers:Array(10).fill(4)})).rejects.toThrow();
    expect(db.createQuizSession).not.toHaveBeenCalled();
  });

});
