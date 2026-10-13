import { z } from 'zod';

export const states = [
  '時間不夠用，生活卻像一池死水', '面對重大決定時，經常反覆內耗', '付出與得到的回饋總是不成正比', '夜深人靜時，會莫名感到焦慮', '人際關係讓你逐漸感到無力', '在維持現狀與勇敢改變之間拉扯', '你的才華好像被目前環境埋沒', '對未來有方向，卻又不安而迷茫', '常常因為別人的眼光壓抑真正的自己', '此刻最渴望的是財富突破或情感歸屬',
];
// Append only: existing orders use indices 0–2.
export const answerLabels = ['非常貼近我現在的狀態', '偶爾會有這種感覺', '還不太確定', '不符合我現在的狀態'];
export type FollowupQuestion = { label: string; options?: string[]; placeholder?: string };
export function followupQuestions(category: string, question: string): FollowupQuestion[] {
  if (category === '事業與財富' && question.includes('副業')) return [
    { label: '別人通常會找你幫什麼忙？請選最接近的一項', options: ['整理資料與規劃', '寫作與表達', '設計與創作', '解釋與教學', '協調與溝通', '動手製作或操作', '還不知道／其他（可在下方補充）'] },
    { label: '想到開始副業，哪件事最容易讓你停下來？', options: ['不知道自己有什麼能賣', '有想法，但怕做出來沒人要', '不敢推銷或談錢', '沒有時間與力氣', '已經開始，但成果不如預期', '其他（可在下方補充）'] },
    { label: '每週能投入多少時間？比較喜歡獨立完成，還是與人互動？', placeholder: '例如：每週約 3 小時，偏好獨立完成；還不知道也可以直說。' },
  ];
  if (category === '感情與人際') return [
    { label: '你想談的是哪一種關係？', options: ['伴侶關係', '曖昧或尚未確定的關係', '已分開的關係', '家人或朋友', '職場人際', '目前沒有特定對象'] },
    { label: '目前最讓你困擾的互動是什麼？', options: ['總是我主動，對方回應很少', '容易衝突，說不清需求', '怕失去對方，不敢拒絕', '不知道對方的意思', '不知道如何開始或建立關係', '其他（可在下方補充）'] },
    { label: '你最希望關係有什麼改變？有什麼界線是你不想再退讓的？', placeholder: '一兩句即可，不確定的部分也可以寫出來。' },
  ];
  if (category === '事業與財富') return [
    { label: '目前的工作或收入狀況最接近哪一種？', options: ['受僱，有穩定收入', '接案或自營，收入不固定', '正在找工作或準備轉職', '仍在學習或尚未就業', '同時有多種工作', '其他（可在下方補充）'] },
    { label: '這個問題最讓你為難的是什麼？', options: ['收入與付出不成比例', '不知道能力適合放在哪裡', '害怕改變後失去穩定', '時間或精力已經不足', '缺乏發展空間或認同', '其他（可在下方補充）'] },
    { label: '你有哪些相關經驗？目前必須保留的條件是什麼？', placeholder: '例如：做過哪些工作，需要穩定收入，或每週只能騰出幾小時。不必填精確金額。' },
  ];
  return [
    { label: '你最想改變的是哪個部分？', options: ['工作或學習方向', '生活方式與自主性', '人際或情感關係', '認識自己的能力', '有多個選項，不知道選哪個', '還說不清楚'] },
    { label: '目前阻礙你往前的主要原因是什麼？', options: ['不知道真正想要什麼', '擔心選錯或失敗', '在意別人的期待', '時間、收入或照顧責任限制', '試過一些方式，但沒有進展', '其他（可在下方補充）'] },
    { label: '你正在考慮哪些選擇？接下來三個月有哪些現實限制？', placeholder: '一兩句即可；如果還沒有方向，寫下你最想保留或改變的事。' },
  ];
}
export const reportContextSchema = z.object({
  version: z.literal(1),
  priorityState: z.number().int().min(0).max(10), // 10 = none/unsure
  followups: z.tuple([z.string().trim().min(1).max(300), z.string().trim().min(1).max(300), z.string().trim().min(1).max(300)]),
  recentExample: z.string().trim().max(800).default(''),
}).strict();
export type ReportContext = z.infer<typeof reportContextSchema>;
export function contextMatches(context: ReportContext, category: string, question: string) {
  return followupQuestions(category, question).every((q, i) => !q.options || q.options.includes(context.followups[i]));
}
export function readReportContext(raw?: string | null): ReportContext | null {
  if (!raw) return null;
  try { const parsed = reportContextSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; } catch { return null; }
}
