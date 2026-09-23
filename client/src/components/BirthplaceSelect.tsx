import { useEffect, useState } from 'react';
import { birthplaces, birthRegions, birthplaceLabel, resolveBirthplace } from '@shared/birthplaces';

const topRegions = [
  { code: 'TW', name: '台灣' }, { code: 'CN', name: '中國' },
  { code: 'SG', name: '新加坡' }, { code: 'MY', name: '馬來西亞' },
];
const isChinaRegion = (code: string) => ['CN', 'HK', 'MO'].includes(code);
const topRegion = (code: string) => isChinaRegion(code) ? 'CN' : code;

export function BirthplaceSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = resolveBirthplace(value);
  const [region, setRegion] = useState(topRegion(selected?.region ?? ''));
  const [chinaRegion, setChinaRegion] = useState(selected && isChinaRegion(selected.region) ? selected.region : '');
  useEffect(() => {
    if (selected) {
      setRegion(topRegion(selected.region));
      setChinaRegion(isChinaRegion(selected.region) ? selected.region : '');
    }
  }, [selected?.region]);
  const locationRegion = region === 'CN' ? chinaRegion : region;
  return <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
    <select style={{ appearance: 'auto' }} aria-label="出生地區" required value={region} onChange={e => { setRegion(e.target.value); setChinaRegion(''); onChange(''); }}>
      <option value="">選擇出生地區</option>
      {topRegions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
    </select>
    {region === 'CN' && <select style={{ appearance: 'auto' }} aria-label="中國出生區域" required value={chinaRegion} onChange={e => { setChinaRegion(e.target.value); onChange(''); }}>
      <option value="">選擇中國大陸／香港／澳門</option>
      {birthRegions.filter(r => isChinaRegion(r.code)).map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
    </select>}
    <select style={{ appearance: 'auto' }} aria-label="出生城市或地區" required disabled={!locationRegion} value={selected && selected.region === locationRegion ? birthplaceLabel(selected) : ''} onChange={e => onChange(e.target.value)}>
      <option value="">{locationRegion ? '選擇出生城市／地區' : '請先選擇出生地區'}</option>
      {birthplaces.filter(c => c.region === locationRegion).map(c => <option key={c.id} value={birthplaceLabel(c)}>{c.name}</option>)}
    </select>
    <small className="optional-hint">請選實際出生地，使用該城市中心的近似座標。找不到出生城市時，請先聯絡我們確認，勿選其他城市代替。</small>
    {locationRegion === 'CN' && <small className="optional-hint">中國大陸請填出生紀錄上的北京時間；若記錄使用新疆地方時間，請先確認並換算。</small>}
    <small className="optional-hint">地點資料：<a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>（<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>），已篩選並整理中文名稱。</small>
  </div>;
}
