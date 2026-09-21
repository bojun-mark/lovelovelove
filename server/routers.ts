import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { attachStripeCheckoutSession, createQuizSession, getQuizSession, getQuizSessionByStripeId, markQuizSessionPaid } from "./db";
import { invokeLLM } from "./_core/llm";
import { assertAnonymousRateLimit } from "./_core/anonymousRateLimit";
import { ENV } from "./_core/env";
import Stripe from "stripe";
import { calculateBirthChart, type BirthChart } from "./astrology";

const quizInput = z.object({ nickname: z.string().min(1), year: z.string().min(4), month: z.string().min(1), day: z.string().min(1), time: z.string().optional(), place: z.string().min(1), email: z.string().email(), colors: z.array(z.string()).length(2), answers: z.array(z.number()).length(10), category: z.string().min(1), subQuestion: z.string().min(1), plan: z.string().min(1), amount: z.number().int().positive() });
const reportInput = z.object({ sessionId: z.number().int().positive() });
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
    createCheckout: publicProcedure.input(checkoutInput).mutation(async ({ input, ctx }) => {
      assertAnonymousRateLimit(ctx.req, ctx.guestSessionHash);
      if (!stripe) throw new Error("付款服務尚未設定，請稍後再試");
      const amount = planPrices[input.planId];
      const id = await createQuizSession({ nickname: input.nickname, birthYear: input.year, birthMonth: input.month, birthDay: input.day, birthTime: input.time || "未提供", birthPlace: input.place, email: input.email, colors: JSON.stringify(input.colors), answers: JSON.stringify(input.answers), category: input.category, subQuestion: input.subQuestion, plan: input.plan, amount, status: "pending", guestSessionHash: ctx.guestSessionHash, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), consentAt: new Date() });
      if (!id) throw new Error("無法建立付款訂單");
      const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment", customer_email: input.email,
        line_items: [{ price_data: { currency: "twd", product_data: { name: `StarLoveLab｜${input.plan}` }, unit_amount: amount }, quantity: 1 }],
        metadata: { quizSessionId: String(id), guestSessionHash: ctx.guestSessionHash, planId: input.planId }, client_reference_id: String(id),
        success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?payment=cancelled&session_id=${id}`,
      });
      await attachStripeCheckoutSession(id, checkout.id);
      return { success: true, checkoutUrl: checkout.url } as const;
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
      const chart = await calculateBirthChart({ year: paid.birthYear, month: paid.birthMonth, day: paid.birthDay, time: paid.birthTime === "未提供" ? undefined : paid.birthTime, place: paid.birthPlace });
      return { success: true, session: serializeSession(paid), chart } as const;
    }),
    saveSession: publicProcedure.input(quizInput).mutation(async ({ input, ctx }) => {
      assertAnonymousRateLimit(ctx.req, ctx.guestSessionHash);
      const id = await createQuizSession({ nickname: input.nickname, birthYear: input.year, birthMonth: input.month, birthDay: input.day, birthTime: input.time || "未提供", birthPlace: input.place, email: input.email, colors: JSON.stringify(input.colors), answers: JSON.stringify(input.answers), category: input.category, subQuestion: input.subQuestion, plan: input.plan, amount: input.amount, status: "pending", guestSessionHash: ctx.guestSessionHash, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), consentAt: new Date() });
      return { success: true, id } as const;
    }),
    generateReport: publicProcedure.input(reportInput).mutation(async ({ input, ctx }) => {
      assertAnonymousRateLimit(ctx.req, ctx.guestSessionHash);
      const session = await getQuizSession(input.sessionId);
      if (!session) throw new Error("找不到分析資料");
      if (session.guestSessionHash !== ctx.guestSessionHash) throw new Error("此分析不屬於目前工作階段");
      if (session.status !== "paid") throw new Error("付款尚未驗證，無法生成付費報告");
      const chart = await calculateBirthChart({ year: session.birthYear, month: session.birthMonth, day: session.birthDay, time: session.birthTime === "未提供" ? undefined : session.birthTime, place: session.birthPlace });
      const planetLines = Object.entries(chart.planets).map(([name, p]) => `${name}：${p.sign} ${p.degree.toFixed(1)}°${p.retrograde ? "（逆行）" : ""}`).join("\n");
      const houseLines = chart.houses.length ? chart.houses.map(h => `${h.house}宮：${h.sign}`).join("、") : "未提供出生時間，無法可靠計算宮位";
      const response = await invokeLLM({
        model: "gpt-4.1-mini", maxTokens: 5000,
        messages: [
          { role: "system", content: "你是 StarLoveLab 穹頂靈魂實驗室的資深占星文字解讀者。請使用提供的出生星圖資料與測驗素材，寫一篇繁體中文、溫暖但具體的私人解讀。不要聲稱占星可以科學預測未來，也不要把解讀寫成不可改變的命運。不要提到模型、提示詞或技術實作。至少 1000 個中文字，使用以下 7 個 Markdown 大標題，每個標題下 1 到 2 個完整段落：## 你的出生星圖、## 你現在站在哪裡、## 你真正卡住的地方、## 這個問題背後的在意、## 從星圖看你的選擇方式、## 接下來七天可以做的事、## 留給你的話。請自然解釋太陽、月亮、上升（若有）、以及與核心問題最相關的行星與宮位。若沒有出生時間，要明確說明上升與宮位無法可靠計算。請明確寫出「這不是替你決定答案」，把判斷權還給讀者。" },
          { role: "user", content: `請為以下已付款的 StarLoveLab 訂單撰寫專屬分析：\n暱稱：${session.nickname}\n出生：${session.birthYear}-${session.birthMonth}-${session.birthDay} ${session.birthTime}\n出生地：${session.birthPlace}\n核心分類：${session.category}\n核心求問：${session.subQuestion}\n方案：${session.plan}\n\n出生星圖：\n${planetLines}\n${chart.ascendant ? `上升：${chart.ascendant.sign} ${chart.ascendant.degree.toFixed(1)}°` : "上升：未計算（缺少出生時間）"}\n宮位：${houseLines}\n\n直覺色彩：${JSON.parse(session.colors).join("、")}\n十大狀態：\n${(JSON.parse(session.answers) as number[]).map((answer, i) => `${i + 1}. ${answer}`).join("\n")}` },
        ],
      });
      const content = response.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length < 1000) throw new Error("AI 報告內容不足，請稍後重試");
      return { success: true, report: content.trim(), chart } as const;
    }),
  }),
});
export type AppRouter = typeof appRouter;
