import type { QuizSession } from '../drizzle/schema';
import { calculateBirthChart } from './astrology';
import { invokeLLM } from './_core/llm';
import { buildReportMessages, reportSpec } from './reportPrompt';

export async function generatePaidReport(session: QuizSession) {
  const chart = await calculateBirthChart({ year: session.birthYear, month: session.birthMonth, day: session.birthDay, time: session.birthTime === '未提供' ? undefined : session.birthTime, place: session.birthPlace });
  const spec = reportSpec(session.amount);
  const response = await invokeLLM({ model: 'gpt-4.1-mini', maxTokens: spec.maxTokens, messages: buildReportMessages(session, chart) });
  const content = response.choices?.[0]?.message?.content;
  if (response.choices?.[0]?.finish_reason === 'length' || typeof content !== 'string' || content.trim().length < spec.minLength) throw new Error('AI 報告內容不足，請稍後重試');
  return { report: content.trim(), chart };
}
