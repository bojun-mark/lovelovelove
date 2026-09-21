import { useEffect, useState } from 'react';
import { birthplaces, birthRegions, birthplaceLabel, resolveBirthplace } from '@shared/birthplaces';

export function BirthplaceSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = resolveBirthplace(value);
  const [region, setRegion] = useState(selected?.region ?? '');
  useEffect(() => { if (selected) setRegion(selected.region); }, [selected?.region]);
  return <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
    <select style={{ appearance: 'auto' }} aria-label="出生地區" required value={region} onChange={e => { setRegion(e.target.value); onChange(''); }}>
      <option value="">選擇出生地區</option>
      {birthRegions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
    </select>
    <select style={{ appearance: 'auto' }} aria-label="出生城市或地區" required disabled={!region} value={selected && selected.region === region ? birthplaceLabel(selected) : ''} onChange={e => onChange(e.target.value)}>
      <option value="">{region ? '選擇出生城市／地區' : '請先選擇出生地區'}</option>
      {birthplaces.filter(c => c.region === region).map(c => <option key={c.id} value={birthplaceLabel(c)}>{c.name}</option>)}
    </select>
    <small className="optional-hint">請選實際出生地，使用該城市中心的近似座標。找不到出生城市時，請先聯絡我們確認，勿選其他城市代替。</small>
    {region === 'CN' && <small className="optional-hint">中國大陸請填出生紀錄上的北京時間；若記錄使用新疆地方時間，請先確認並換算。</small>}
    <small className="optional-hint">地點資料：<a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>（<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>），已篩選並整理中文名稱。</small>
  </div>;
}
