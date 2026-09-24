import { z } from "zod";
import { resolveBirthMoment } from "../shared/birthplaces";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { attachStripeCheckoutSession, createQuizSession, getQuizSession, getQuizSessionByStripeId, markQuizSessionPaid } from "./db";
import { generatePaidReport } from './reportGenerator';
import { authorizeOrder, durableReport, safeDeliverEmail, emailConfigured } from './reportDelivery';
import { getDelivery, issueRecoveryCode, listOrders } from './reportStore';
import { assertReportAccessLimit } from './reportAccessLimit';
import { assertAnonymousRateLimit } from "./_core/anonymousRateLimit";
import { ENV } from "./_core/env";
import Stripe from "stripe";
import { calculateBirthChart, type BirthChart } from "./astrology";

const quizInput = z.object({ nickname: z.string().min(1), year: z.string().min(4), month: z.string().min(1), day: z.string().min(1), time: z.string().optional(), place: z.string().min(1), email: z.string().email(), colors: z.array(z.string()).length(2), answers: z.array(z.number()).length(10), category: z.string().min(1), subQuestion: z.string().min(1), plan: z.string().min(1), amount: z.number().int().positive() });
const reportInput = z.object({ sessionId: z.number().int().positive(), recoveryCode: z.string().max(100).optional() });
const verifyInput = z.object({ sessionId: z.string().min(1) });
const checkoutInput = quizInput.extend({ planId: z.enum(["basic", "plus", "full"]) });
export const planPrices = { basic: 99, plus: 199, full: 299 } as const;
const stripe = ENV.stripeSecretKey ? new Stripe(ENV.stripeSecretKey) : null;

function serializeSession(session: NonNullable<Awaited<ReturnType<typeof getQuizSession>>>) {
  return {
    id: session.id, nickname: session.nickname, year: session.birthYear, month: session.birthMonth, day: session.birthDay,
    time: session.birthTime === "未提供" ? "" : session.birthTime, place: session.birthPlace, email: session.email,
    colors: JSON.parse(session.colors) as string[], answers: JSON.parse(session.answers) as number[], category: session.category,
    subQuestion: session.subQuestion, plan: session.plan, amount: session.amount, status: session.status,
  };
}

export const appRouter = router({
  system: systemRouter,
  starLove: router({
    deliveryStatus: publicProcedure.query(() => ({ emailConfigured: emailConfigured() })),
    myOrders: publicProcedure.query(async ({ ctx }) => {
      assertReportAccessLimit(ctx.req);
      return listOrders(ctx.guestSessionHash);
    }),
    openOrder: publicProcedure.input(reportInput).mutation(async ({ input, ctx }) => {
      assertReportAccessLimit(ctx.req);
      const delivery = await getDelivery(input.sessionId);
      let session = authorizeOrder(await getQuizSession(input.sessionId), ctx.guestSessionHash, input.recoveryCode, delivery?.recoveryHash);
      // Covers a closed checkout tab or a delayed/missed webhook without another charge.
      if (session.status !== 'paid' && session.stripeCheckoutSessionId && stripe) {
        const checkout = await stripe.checkout.sessions.retrieve(session.stripeCheckoutSessionId);
        if (checkout.payment_status === 'paid') {
          if (checkout.currency !== 'twd' || checkout.amount_total !== session.amount ||
              String(session.id) !== (checkout.metadata?.quizSessionId ?? checkout.client_reference_id)) throw new Error('付款金額或訂單驗證失敗');
          session = await markQuizSessionPaid(checkout.id) ?? session;
        }
      }
      if (session.status !== 'paid') throw new Error('此訂單尚未確認付款成功。若已扣款，請稍後再查詢，請勿重複付款。');
      return { session: serializeSession(session), report: delivery?.report ?? '',
        chart: delivery?.chart ? JSON.parse(delivery.chart) as BirthChart : null,
        emailState: emailConfigured() ? delivery?.emailState ?? 'not_sent' : 'not_configured',
        expiresAt: session.expiresAt.toISOString() };
    }),
    recoveryCode: publicProcedure.input(z.object({ sessionId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      assertAnonymousRateLimit(ctx.req, ctx.guestSessionHash);
      const session = authorizeOrder(await getQuizSession(input.sessionId), ctx.guestSessionHash);
      return { code: await issueRecoveryCode(session.id) };
    }),
    retryEmail: publicProcedure.input(reportInput).mutation(async ({ input, ctx }) => {
      assertAnonymousRateLimit(ctx.req, ctx.guestSessionHash);
      const delivery = await getDelivery(input.sessionId);
      const session = authorizeOrder(await getQuizSession(input.sessionId), ctx.guestSessionHash, input.recoveryCode, delivery?.recoveryHash);
      if (session.status !== 'paid') throw new Error('付款尚未驗證');
      return { emailState: await safeDeliverEmail(session) };
    }),
    createCheckout: publicProcedure.input(checkoutInput).mutation(async ({ input, ctx }) => {
      assertAnonymousRateLimit(ctx.req, ctx.guestSessionHash);
      resolveBirthMoment(input);
      if (!stripe) throw new Error("付款服務尚未設定，請稍後再試");
      const amount = planPrices[input.planId];
      const id = await createQuizSession({ nickname: input.nickname, birthYear: input.year, birthMonth: input.month, birthDay: input.day, birthTime: input.time || "未提供", birthPlace: input.place, email: input.email, colors: JSON.stringify(input.colors), answers: JSON.stringify(input.answers), category: input.category, subQuestion: input.subQuestion, plan: input.plan, amount, status: "pending", guestSessionHash: ctx.guestSessionHash, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), consentAt: new Date() });
      if (!id) throw new Error("無法建立付款訂單");
      const recoveryCode = await issueRecoveryCode(id);
      const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment", customer_email: input.email,
        line_items: [{ price_data: { currency: "twd", product_data: { name: `StarLoveLab｜${input.plan}` }, unit_amount: amount }, quantity: 1 }],
        metadata: { quizSessionId: String(id), guestSessionHash: ctx.guestSessionHash, planId: input.planId }, client_reference_id: String(id),
        success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?payment=cancelled&session_id=${id}`,
      });
      await attachStripeCheckoutSession(id, checkout.id);
      return { success: true, checkoutUrl: checkout.url, sessionId: id, recoveryCode } as const;
    }),
    verifyPayment: publicProcedure.input(verifyInput).mutation(async ({ input, ctx }) => {
      assertAnonymousRateLimit(ctx.req, ctx.guestSessionHash);
      if (!stripe) throw new Error("付款服務尚未設定，請稍後再試");
      const checkout = await stripe.checkout.sessions.retrieve(input.sessionId);
      const sessionId = Number(checkout.metadata?.quizSessionId ?? checkout.client_reference_id ?? 0);
      if (!Number.isInteger(sessionId) || sessionId <= 0) throw new Error("找不到對應的測驗訂單");
      const quiz = await getQuizSession(sessionId);
      if (!quiz || quiz.stripeCheckoutSessionId !== checkout.id) throw new Error("付款訂單驗證失敗");
      if (quiz.guestSessionHash !== ctx.guestSessionHash) throw new Error("付款訂單與目前工作階段不符");
      if (checkout.currency !== "twd" || checkout.amount_total !== quiz.amount) throw new Error("付款金額驗證失敗");
      if (checkout.payment_status !== "paid") throw new Error("付款尚未完成，請確認 Stripe 付款狀態");
      const paid = quiz.status === "paid" ? quiz : await markQuizSessionPaid(checkout.id);
      if (!paid) throw new Error("付款已成功，但暫時無法讀取訂單資料，請稍後重試");
      authorizeOrder(paid, ctx.guestSessionHash);
      const delivery = await getDelivery(paid.id);
      const chart = delivery?.chart ? JSON.parse(delivery.chart) as BirthChart : null;
      return { success: true, session: serializeSession(paid), chart } as const;
    }),
    saveSession: publicProcedure.input(quizInput).mutation(async ({ input, ctx }) => {
      assertAnonymousRateLimit(ctx.req, ctx.guestSessionHash);
      resolveBirthMoment(input);
      const id = await createQuizSession({ nickname: input.nickname, birthYear: input.year, birthMonth: input.month, birthDay: input.day, birthTime: input.time || "未提供", birthPlace: input.place, email: input.email, colors: JSON.stringify(input.colors), answers: JSON.stringify(input.answers), category: input.category, subQuestion: input.subQuestion, plan: input.plan, amount: input.amount, status: "pending", guestSessionHash: ctx.guestSessionHash, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), consentAt: new Date() });
      return { success: true, id } as const;
    }),
    generateReport: publicProcedure.input(reportInput).mutation(async ({ input, ctx }) => {
      assertReportAccessLimit(ctx.req);
      const delivery = await getDelivery(input.sessionId);
      const session = authorizeOrder(await getQuizSession(input.sessionId), ctx.guestSessionHash, input.recoveryCode, delivery?.recoveryHash);
      if (session.status !== "paid") throw new Error("付款尚未驗證，無法生成付費報告");
      if (!delivery?.report) assertAnonymousRateLimit(ctx.req, ctx.guestSessionHash);
      const result = await durableReport(session, () => generatePaidReport(session));
      return { success: true, ...result, emailState: await safeDeliverEmail(session) } as const;

    }),
  }),
});
export type AppRouter = typeof appRouter;
