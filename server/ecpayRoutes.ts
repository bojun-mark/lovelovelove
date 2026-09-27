import type { Express } from 'express';
import { getOrCreateGuestSession } from './_core/guestSession';
import { getQuizSession } from './db';
import { checkoutFields, checkoutHtml, verifyMac, type Fields } from './ecpay';
import { getEcpay, checkEnvironment, acceptPayment } from './ecpayStore';
import { assertReportAccessLimit } from './reportAccessLimit';

export function registerEcpay(app: Express) {
  app.get('/api/ecpay/checkout/:tradeNo', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'none'; form-action https://payment.ecpay.com.tw https://payment-stage.ecpay.com.tw; frame-ancestors 'none'");
    try {
      assertReportAccessLimit(req);
      const guest = getOrCreateGuestSession(req, res);
      const payment = await getEcpay(req.params.tradeNo);
      const order = payment && await getQuizSession(payment.sessionId);
      if (!payment || !order || order.guestSessionHash !== guest.hash || order.expiresAt <= new Date()) return res.status(404).send('找不到有效的付款訂單');
      checkEnvironment(payment);
      if (order.status !== 'pending' || payment.paid) return res.status(409).send('此訂單已處理，請返回網站「我的訂單與報告」查詢。');
      res.type('html').send(checkoutHtml(checkoutFields(payment.tradeNo, order.amount, `StarLoveLab ${order.plan}`)));
    } catch { res.status(503).send('付款設定尚未完成或暫時無法使用，請返回網站稍後再試。'); }
  });
  app.post('/api/ecpay/notify', async (req, res) => {
    res.type('text/plain');
    try {
      const fields = req.body as Fields;
      if (!fields || Object.values(fields).some(value => typeof value !== 'string') || !verifyMac(fields)) return res.status(400).send('0|Invalid signature');
      const payment = await getEcpay(fields.MerchantTradeNo);
      if (!payment) return res.status(400).send('0|Unknown order');
      await acceptPayment(payment, fields, 'notification');
      return res.send('1|OK');
    } catch { return res.status(503).send('0|Retry later'); }
  });
}
