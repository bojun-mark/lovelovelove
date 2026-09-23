import { birthplaces as legacyBirthplaces } from './birthplaces-data';
import { taiwanDistricts } from './taiwan-districts-data';
export type Birthplace = { id: string; region: string; name: string; latitude: number; longitude: number; timeZone: string; aliases: string[]; county?: string; district?: string };
export const birthplaces: Birthplace[] = [...taiwanDistricts, ...legacyBirthplaces.filter(c => c.region !== 'TW')];
export const taiwanCounties = Array.from(new Set(taiwanDistricts.map(c => c.county)));
export const birthRegions = [
  { code: 'TW', name: '台灣' }, { code: 'HK', name: '香港' },
  { code: 'MO', name: '澳門' }, { code: 'CN', name: '中國大陸' },
  { code: 'SG', name: '新加坡' }, { code: 'MY', name: '馬來西亞' },
];
export const birthplaceLabel = (city: Birthplace) => `${birthRegions.find(r => r.code === city.region)!.name}・${city.name}`;
const normalize = (value: string) => value.trim().replaceAll('臺', '台').toLowerCase();
/** Accept canonical labels and unambiguous legacy names, never guess a location. */
export function resolveBirthplace(value: string): Birthplace | undefined {
  const canonical = birthplaces.find(city => birthplaceLabel(city) === value);
  if (canonical) return canonical;
  // Keep saved pre-district labels tied to their original coordinates.
  const legacy = legacyBirthplaces.find(city => normalize(birthplaceLabel(city)) === normalize(value));
  if (legacy) return legacy;
  const normalized = birthplaces.find(city => normalize(birthplaceLabel(city)) === normalize(value));
  if (normalized) return normalized;
  const choices = [...birthplaces, ...legacyBirthplaces.filter(c => c.region === 'TW')];
  const matches = choices.filter(city => [city.name, ...city.aliases].some(name => normalize(name) === normalize(value)));
  return matches.length === 1 ? matches[0] : undefined;
}

export type BirthInput = { year: string; month: string; day: string; time?: string; place: string };
/** Resolve wall-clock time using IANA historical offsets supplied by the runtime. */
export function resolveBirthMoment(input: BirthInput) {
  const city = resolveBirthplace(input.place);
  if (!city) throw new Error('請從出生地選單選擇已支援的城市或地區');
  if (!/^\d{4}$/.test(input.year) || !/^\d{1,2}$/.test(input.month) || !/^\d{1,2}$/.test(input.day)) throw new Error('請填寫有效的出生日期');
  const y = Number(input.year), m = Number(input.month), d = Number(input.day);
  const hasTime = !!input.time;
  if (hasTime && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(input.time!)) throw new Error('請填寫有效的出生時間');
  const [hour, minute] = hasTime ? input.time!.split(':').map(Number) : [12, 0];
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  const date = new Date(wall);
  if (y < 1900 || y > new Date().getUTCFullYear() || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw new Error('請填寫有效的出生日期（1900 年起）');
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: city.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const localStamp = (stamp: number) => {
    const p = Object.fromEntries(format.formatToParts(new Date(stamp)).map(p => [p.type, p.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  };
  // Offsets on both sides of nearby transitions; candidate round-trips detect gaps/folds.
  const offsets = new Set<number>();
  for (let h = -48; h <= 48; h += 6) {
    const stamp = wall + h * 3600000;
    offsets.add(localStamp(stamp) - stamp);
  }
  const candidates = Array.from(offsets).map(offset => wall - offset).filter(stamp => localStamp(stamp) === wall);
  if (!candidates.length) throw new Error('這個出生時間落在當地調整時鐘的跳時區間，請確認出生紀錄');
  if (candidates.length > 1) throw new Error('這個出生時間因夏令時間結束而出現兩次，需要確認時間；若不確定，可留空出生時間');
  const utcDate = new Date(candidates[0]);
  if (utcDate.getTime() > Date.now()) throw new Error('出生日期不能在未來');
  return { city, utcDate, hasTime };
}
