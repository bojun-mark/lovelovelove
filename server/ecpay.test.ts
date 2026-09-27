import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { checkMac, verifyMac, validatePayment, checkoutFields, checkoutHtml, requireSandbox, queryTrade, paymentConfig } from "./ecpay";
beforeEach(() => vi.stubEnv('ECPAY_MODE', 'stage'));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const signed = (values: Record<string, string>) => ({ ...values, CheckMacValue: checkMac(values) });
const order = { ecpayTradeNo: "SL123", amount: 99 };
const result = { MerchantID: "3002607", MerchantTradeNo: "SL123", TradeAmt: "99", RtnCode: "1", TradeStatus: "1", SimulatePaid: "0" };
describe("ECPay sandbox", () => {
  it('uses live endpoint only with complete private live configuration', () => {
    vi.stubEnv('ECPAY_MODE', 'live');
    vi.stubEnv('ECPAY_MERCHANT_ID', ''); expect(paymentConfig).toThrow();
    vi.stubEnv('ECPAY_MERCHANT_ID', '1234567'); vi.stubEnv('ECPAY_HASH_KEY', 'private-test-key'); vi.stubEnv('ECPAY_HASH_IV', 'private-test-iv');
    expect(paymentConfig().base).toBe('https://payment.ecpay.com.tw');
    const fields = checkoutFields('SL123', 199, 'Test');
    expect(fields.MerchantID).toBe('1234567'); expect(verifyMac(fields)).toBe(true);
    expect(verifyMac(signed(result))).toBe(false);
    expect(checkoutHtml(fields)).not.toContain('payment-stage.ecpay.com.tw');
    vi.stubEnv('ECPAY_MERCHANT_ID', '3002607'); expect(paymentConfig).toThrow();
  });
  it('accepts signed query results without notification-only SimulatePaid', () => {
    const {SimulatePaid, ...query} = result;
    expect(validatePayment(signed(query), order, 'query')).toBe(true);
    expect(validatePayment(signed(query), order, 'notification')).toBe(false);
  });
  it("matches the published AIO SHA256 reference vector", () => {
    expect(checkMac({ TradeDesc: "促銷方案", PaymentType: "aio", MerchantTradeDate: "2023/03/12 15:30:23", MerchantTradeNo: "ecpay20230312153023", MerchantID: "3002607", ReturnURL: "https://www.ecpay.com.tw/receive.php", ItemName: "Apple iphone 15", TotalAmount: "30000", ChoosePayment: "ALL", EncryptType: "1" })).toBe("6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840");
  });
  it("rejects tampering and malformed signatures", () => {
    expect(verifyMac({ ...signed(result), TradeAmt: "1" })).toBe(false);
    expect(verifyMac({ ...result, CheckMacValue: "x" })).toBe(false);
  });
  it("requires exact merchant, order and amount even with a valid signature", () => {
    for (const change of [{ MerchantID: "other" }, { MerchantTradeNo: "other" }, { TradeAmt: "299" }]) expect(() => validatePayment(signed({ ...result, ...change }), order, "notification")).toThrow();
  });
  it("never fulfils simulated or failed notifications", () => {
    expect(validatePayment(signed({ ...result, SimulatePaid: "1" }), order, "notification")).toBe(false);
    expect(validatePayment(signed({ ...result, RtnCode: "0" }), order, "notification")).toBe(false);
    expect(validatePayment(signed(result), order, "query")).toBe(true);
  });
  it("fails closed unless explicitly configured for stage", () => {
    vi.stubEnv("ECPAY_MODE", "live"); expect(requireSandbox).toThrow();
    vi.stubEnv("ECPAY_MODE", ""); expect(requireSandbox).toThrow();
  });
  it("uses Taipei trade dates, integer TWD amounts, and sandbox endpoint", () => {
    vi.stubEnv("ECPAY_MODE", "stage");
    const fields = checkoutFields("SL123", 99, '<script>&test', new Date("2026-09-17T18:00:00Z"));
    expect(fields.MerchantTradeDate).toBe("2026/09/18 02:00:00");
    expect(fields.TotalAmount).toBe("99"); expect(verifyMac(fields)).toBe(true);
    expect(checkoutHtml(fields)).toContain("payment-stage.ecpay.com.tw");
    expect(checkoutHtml(fields)).not.toContain("<script>");
    expect(fields.ClientBackURL).toContain("session_id=SL123");
  });
  it("rejects duplicate response parameters", async () => {
    vi.stubEnv("ECPAY_MODE", "stage");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("TradeAmt=99&TradeAmt=299")));
    await expect(queryTrade("SL123")).rejects.toThrow("重複");
  });
});
