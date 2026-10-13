import { followupQuestions, states } from '@shared/reportQuestions';
import './report-followups.css';

export type FollowupDraft = { priorityState: string; followups: [string, string, string]; recentExample: string };
export const emptyFollowups = (): FollowupDraft => ({ priorityState: '', followups: ['', '', ''], recentExample: '' });
export function ReportFollowups({ category, question, value, onChange }: {
  category: string; question: string; value: FollowupDraft; onChange: (next: FollowupDraft) => void;
}) {
  const update = (index: number, answer: string) => {
    const followups: [string, string, string] = [...value.followups];
    followups[index] = answer;
    onChange({ ...value, followups });
  };
  return <div id="report-followups" tabIndex={-1} className="report-followups">
    <h2>再靠近你的處境一點</h2>
    <p>選出最在意的狀態，再回答三個小問題，讓建議能貼近你的生活。</p>
    <label>剛才十項狀態，哪一項最困擾你？<select required value={value.priorityState} onChange={e => onChange({ ...value, priorityState: e.target.value })}>
      <option value="" disabled>請選擇</option>{states.map((state, i) => <option key={state} value={i}>{state}</option>)}<option value="10">沒有特別困擾／還不確定</option>
    </select></label>
    {followupQuestions(category, question).map((q, i) => <label key={q.label}>{i + 1}. {q.label}
      {q.options ? <select required value={value.followups[i]} onChange={e => update(i, e.target.value)}><option value="" disabled>請選擇</option>{q.options.map(option => <option key={option}>{option}</option>)}</select>
        : <textarea required rows={3} maxLength={300} value={value.followups[i]} onChange={e => update(i, e.target.value)} placeholder={q.placeholder} />}
    </label>)}
    <label>最近發生哪一件事，讓你特別想問這個問題？（選填）
      <textarea rows={4} maxLength={800} value={value.recentExample} onChange={e => onChange({ ...value, recentExample: e.target.value })} placeholder="一兩句就好，也可以補充上面選項沒有提到的事。請避免填寫他人的姓名或聯絡資料。" />
    </label><small>{value.recentExample.length} / 800 字；留白也可以繼續。</small>
  </div>;
}
