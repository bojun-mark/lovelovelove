import type { QuizSession } from '../drizzle/schema';
import { calculateBirthChart } from './astrology';
import { invokeLLM } from './_core/llm';
export async function generatePaidReport(session: QuizSession) {
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

return { report: content.trim(), chart };
}
