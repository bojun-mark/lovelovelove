import { useEffect, useRef, useState } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { trpc } from '@/lib/trpc';

export type OpenOrder = inferRouterOutputs<AppRouter>['starLove']['openOrder'];
export const readRecovery = (id: number) => { try { return localStorage.getItem(`starlovelab-recovery-${id}`) ?? ''; } catch { return ''; } };
export const rememberRecovery = (id: number, code: string) => { try { localStorage.setItem(`starlovelab-recovery-${id}`, code); } catch { /* Download remains available. */ } };
export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const emailMessage = (state: string) => ({
  not_configured: '目前未啟用自動寄信，請在本頁閱讀或下載；日後可從「我的訂單與報告」找回。',
  submitted: '報告已交給寄信服務，尚不代表已送達收件匣；若未收到，請查看垃圾郵件或直接在這裡閱讀。',
  failed: '寄信暫時失敗，但已保存的報告不受影響。你可以直接閱讀或稍後重試寄信。',
  waiting: '寄信正在處理或剛剛嘗試過，請稍後再查詢。',
  not_sent: '報告尚未寄出，可使用下方按鈕嘗試寄信。',
  not_ready: '請先完成報告生成。',
}[state] ?? '報告會顯示在本頁，請先保存訂單取回碼。');

export function RecoveryReceipt({ id, code }: { id: number; code: string }) {
  return <div className="order-receipt">
    <strong>訂單 #{id} · 私人報告取回碼</strong>
    <p>換手機、清除瀏覽器資料或沒收到信時，可憑此碼找回報告。請自行保存，勿分享給他人。</p>
    <input aria-label="私人報告取回碼" readOnly value={code} onFocus={e => e.currentTarget.select()} />
    <button type="button" className="report-action-button" onClick={() => downloadText(`StarLoveLab-訂單-${id}-取回碼.txt`,
      `StarLoveLab 訂單 #${id}\n私人取回碼：${code}\n網站：${window.location.origin}\n在「我的訂單與報告」輸入取回碼。查詢期限為訂單建立後 90 天。請勿公開此碼。\n此檔案不代表已付款；付款狀態以網站驗證為準。`)}>下載取回碼備份</button>
  </div>;
}
export function OrderCenter({ onOpen, onClose }: { onOpen: (result: OpenOrder, code: string) => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [sample, setSample] = useState<(inferRouterOutputs<AppRouter>['starLove']['sampleReport'] & { code: string }) | null>(null);
  const sampleRequest = trpc.starLove.sampleReport.useMutation();
  const busy = sampleRequest.isPending;
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sample || error) resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }, [sample, error]);
  async function createSample() {
    if (!sample) return;
    setError('');
    try {
      const result = await sampleRequest.mutateAsync({ sessionId: sample.sessionId, recoveryCode: sample.code || undefined, create: true });
      setSample({ ...result, code: sample.code });
    } catch (e) { setError(e instanceof Error ? e.message : '範例保存失敗，請稍後重試。'); }
  }
  const orders = trpc.starLove.myOrders.useQuery(undefined, { refetchOnWindowFocus: false, retry: false });
  const open = trpc.starLove.openOrder.useMutation();
  async function load(id: number, recoveryCode = '') {
    setError('');
    try {
      setSample(null);
      const preview = await sampleRequest.mutateAsync({ sessionId: id, recoveryCode: recoveryCode || undefined });
      if (preview.available) {
        if (recoveryCode) rememberRecovery(id, recoveryCode);
        setSample({ ...preview, code: recoveryCode });
        return;
      }
      const result = await open.mutateAsync({ sessionId: id, recoveryCode: recoveryCode || undefined });
      if (recoveryCode) rememberRecovery(id, recoveryCode);
      onOpen(result, recoveryCode);
    } catch (e) { setError(e instanceof Error ? e.message : '查詢暫時失敗，請稍後再試，請勿重複付款。'); }
  }
  return <section className="order-center" aria-label="我的訂單與報告">
    <h2>我的訂單與報告</h2>
    <p>沒收到信也能在這裡查看。查詢期限為訂單建立後 90 天；已付款的報告重試不需再次付款。</p>
    <form onSubmit={e => { e.preventDefault(); const value = code.trim(); if (!/^\d+\.[A-Za-z0-9_-]{43}$/.test(value)) { setError('請貼上完整的私人取回碼。'); return; } void load(Number(value.split('.')[0]), value); }}>
      <label className="field"><span>換裝置？輸入私人取回碼</span><input aria-label="輸入私人取回碼" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" /></label>
      <button className="report-action-button" disabled={open.isPending || busy}>查詢報告</button>
    </form>
    <h3>這個瀏覽器的訂單</h3>
    {orders.isLoading && <p>正在讀取訂單…</p>}
    {orders.error && <p role="alert">目前無法讀取訂單，請稍後再試。請勿重複付款。</p>}
    {orders.data?.length === 0 && <p>這個瀏覽器沒有可查詢的訂單。若曾使用其他装置，請輸入取回碼。</p>}
    {orders.data?.map(o => <div className="order-row" key={o.id}>
      <div><strong>#{o.id} · {o.plan} · NT$ {o.amount}</strong><p>{o.testPaid ? '測試付款已驗證（未實際扣款）' : o.status === 'paid' ? o.reportReady ? '已付款 · 報告已保存' : '已付款 · 等待生成或可重試' : '付款尚待確認'} · {new Date(o.createdAt).toLocaleDateString('zh-TW')}</p></div>
      <button className="report-action-button" disabled={open.isPending || busy} onClick={() => void load(o.id, readRecovery(o.id))}>{o.testPaid ? '查看測試結果' : o.status === 'paid' ? '查看報告' : '查詢付款狀態'}</button>
    </div>)}
    {(open.isPending || busy) && <p role="status">正在查詢或保存，請稍候…</p>}
    <div ref={resultRef} aria-live="polite">
    {sample?.available && <section aria-label="範例報告測試" className="order-receipt">
      <h3>訂單 #{sample.sessionId} · 測試付款已驗證</h3>
      <p>範例報告測試：不會扣款、不呼叫 AI、不寄信。這不代表正式報告已完成。</p>
      {sample.report ? <>
        <p>範例已保存 · {sample.createdAt && new Date(sample.createdAt).toLocaleString('zh-TW')}</p>
        <div style={{ whiteSpace: 'pre-wrap' }}>{sample.report}</div>
        <button className="report-action-button" onClick={() => downloadText('StarLoveLab-範例報告.txt', sample.report!)}>下載範例報告</button>
        <p>請重新整理後查詢同一筆訂單；再用無痕視窗輸入這筆訂單原有的取回碼，確認內容與保存時間一致。</p>
      </> : <button className="report-action-button" disabled={busy} onClick={() => void createSample()}>產生並保存範例報告（不使用 AI）</button>}
    </section>}
    {error && <p role="alert">{error}</p>}
    </div>
    <div className="report-actions"><button className="report-action-button" disabled={orders.isFetching} onClick={() => void orders.refetch()}>重新查詢</button><button className="report-action-button" onClick={onClose}>關閉訂單查詢</button></div>
  </section>;
}
