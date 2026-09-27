import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Public sandbox credentials published by ECPay; never used for production.
export const sandbox = { merchantId: "3002607", hashKey: "pwFHCqoQZGmho4w6", hashIV: "EkRm7iFT261dpevs" };
export function paymentConfig() {
  const mode = process.env.ECPAY_MODE;
  if (mode === 'stage') return { ...sandbox, mode, base: 'https://payment-stage.ecpay.com.tw' } as const;
  const merchantId = process.env.ECPAY_MERCHANT_ID?.trim();
  const hashKey = process.env.ECPAY_HASH_KEY?.trim();
  const hashIV = process.env.ECPAY_HASH_IV?.trim();
  if (mode !== 'live' || !merchantId || !/^\d{7,10}$/.test(merchantId) || merchantId === sandbox.merchantId || !hashKey || !hashIV || hashKey === sandbox.hashKey || hashIV === sandbox.hashIV)
    throw new Error('綠界付款尚未設定完成，請稍後再試');
  return { mode, merchantId, hashKey, hashIV, base: 'https://payment.ecpay.com.tw' } as const;
}
export type Fields = Record<string, string>;
export function checkMac(fields: Fields, key = sandbox.hashKey, iv = sandbox.hashIV) {
  const sorted = Object.keys(fields).filter(k => k !== "CheckMacValue").sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);
  const raw = `HashKey=${key}&${sorted.map(k => `${k}=${fields[k]}`).join("&")}&HashIV=${iv}`;
  const encoded = encodeURIComponent(raw).replace(/%20/g, "+").replace(/'/g, "%27").replace(/~/g, "%7E").toLowerCase();
  return createHash("sha256").update(encoded).digest("hex").toUpperCase();
}
export function verifyMac(fields: Fields, config = paymentConfig()) {
  const mac = fields.CheckMacValue;
  return typeof mac === "string" && /^[A-Fa-f0-9]{64}$/.test(mac) && timingSafeEqual(Buffer.from(mac.toUpperCase()), Buffer.from(checkMac(fields, config.hashKey, config.hashIV)));
}
export function requireSandbox() {
  if (process.env.ECPAY_MODE !== "stage") throw new Error("綠界測試付款尚未啟用；正式收款仍在準備中");
}
export function siteOrigin() {
  const origin = new URL(process.env.PUBLIC_SITE_URL || "https://lovelovelove.onrender.com");
  if (origin.protocol !== "https:" || origin.username || origin.password) throw new Error("網站網址必須為 HTTPS");
  return origin.origin;
}
export const newTradeNo = () => `SL${randomBytes(9).toString("hex")}`;
export function checkoutFields(tradeNo: string, amount: number, itemName: string, date = new Date()): Fields {
  const config = paymentConfig();
  if (!/^[a-zA-Z0-9]{1,20}$/.test(tradeNo) || !Number.isSafeInteger(amount) || amount <= 0) throw new Error("付款訂單格式錯誤");
  const taipei = new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace(/-/g, "/").replace("T", " ");
  const fields: Fields = { MerchantID: config.merchantId, MerchantTradeNo: tradeNo, MerchantTradeDate: taipei,
    PaymentType: "aio", TotalAmount: String(amount), TradeDesc: "StarLoveLab personal report",
    ItemName: itemName.replace(/[<>#&]/g, " ").slice(0, 200), ChoosePayment: "Credit", EncryptType: "1",
    ReturnURL: `${siteOrigin()}/api/ecpay/notify`, ClientBackURL: `${siteOrigin()}/?payment=success&session_id=${tradeNo}` };
  return { ...fields, CheckMacValue: checkMac(fields, config.hashKey, config.hashIV) };
}
export function validatePayment(fields: Fields, order: { ecpayTradeNo: string | null; amount: number }, kind: "notification" | "query") {
  if (!verifyMac(fields)) throw new Error("付款檢查碼驗證失敗");
  if (fields.MerchantID !== paymentConfig().merchantId || fields.MerchantTradeNo !== order.ecpayTradeNo || !/^\d+$/.test(fields.TradeAmt) || Number(fields.TradeAmt) !== order.amount) throw new Error("付款訂單或金額不符");
  if (fields.SimulatePaid === "1" || (kind === 'notification' && fields.SimulatePaid !== "0")) return false;
  return (kind === "notification" ? fields.RtnCode : fields.TradeStatus) === "1";
}
export async function queryTrade(tradeNo: string): Promise<Fields> {
  const config = paymentConfig();
  const fields = { MerchantID: config.merchantId, MerchantTradeNo: tradeNo, TimeStamp: String(Math.floor(Date.now() / 1000)) };
  const response = await fetch(`${config.base}/Cashier/QueryTradeInfo/V5`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...fields, CheckMacValue: checkMac(fields, config.hashKey, config.hashIV) }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("綠界查詢暫時無法使用，請稍後再試");
  const params = new URLSearchParams(await response.text());
  const result: Fields = {};
  params.forEach((value, key) => { if (key in result) throw new Error("重複付款參數"); result[key] = value; });
  return result;
}
export function checkoutHtml(fields: Fields) {
  const config = paymentConfig();
  const title = config.mode === 'stage' ? '綠界測試付款，不會實際扣款' : '前往綠界安全付款';
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body><h1>${title}</h1><p>${config.mode === 'stage' ? '僅使用官方測試卡，勿填真實信用卡。測試付款不會生成付費 AI 報告。' : '請在綠界頁面核對商店名稱與付款金額。'}</p><p>訂單 ${escape(fields.MerchantTradeNo)} · NT$ ${escape(fields.TotalAmount)}</p><form method="POST" action="${config.base}/Cashier/AioCheckOut/V5">${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`).join("")}<button type="submit">${title}</button></form></body></html>`;
}
