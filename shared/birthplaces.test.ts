import { describe, expect, it } from 'vitest';
import { birthplaces, birthRegions, birthplaceLabel, resolveBirthplace, resolveBirthMoment } from './birthplaces';
const moment = (place: string, year='1994', month='7', day='15', time='21:30') => resolveBirthMoment({place,year,month,day,time});
describe('offline birthplaces', () => {
  it('covers 22 Taiwan counties and 368 districts without ambiguous district aliases', () => {
    const tw = birthplaces.filter(c => c.region === 'TW');
    expect(tw).toHaveLength(368);
    expect(new Set(tw.map(c => c.county)).size).toBe(22);
    expect(tw.filter(c => c.county === '新北市')).toHaveLength(29);
    expect(tw.every(c => c.county && c.district && !c.name.includes('（'))).toBe(true);
    expect(resolveBirthplace('中正區')).toBeUndefined();
    const banqiao = resolveBirthplace('台灣・新北市・板橋區')!;
    const sanxia = resolveBirthplace('台灣・新北市・三峽區')!;
    expect(banqiao.longitude).not.toBe(sanxia.longitude);
    expect(resolveBirthplace('台灣・臺北市・中正區')?.county).toBe('台北市');
    expect(resolveBirthplace('台灣・新北市（板橋）')?.id).toBe('1670029');
  });
  it('resolves every displayed choice and has valid coordinates/timezones', () => {
    expect(new Set(birthplaces.map(c=>c.id)).size).toBe(birthplaces.length);
    for(const r of birthRegions) expect(birthplaces.some(c=>c.region===r.code)).toBe(true);
    for(const c of birthplaces) {
      expect(resolveBirthplace(birthplaceLabel(c))).toBe(c);
      expect(Math.abs(c.latitude)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.longitude)).toBeLessThanOrEqual(180);
      expect(moment(birthplaceLabel(c)).utcDate.toISOString()).toBe('1994-07-15T13:30:00.000Z');
    }
  });
  it('keeps unambiguous legacy Taiwan names and rejects unknown places', () => {
    expect(resolveBirthplace('臺北市')?.id).toBe('1668341');
    expect(resolveBirthplace('台北市')?.id).toBe('1668341');
    expect(resolveBirthplace('台中市')?.id).toBe('1668399');
    expect(()=>moment('火星')).toThrow('請從出生地');
  });
  it('uses historical offsets, not a fixed UTC+8 for all birth dates', () => {
    expect(moment('新加坡・新加坡','1980','1','1','12:00').utcDate.toISOString()).toBe('1980-01-01T04:30:00.000Z');
    expect(moment('馬來西亞・吉隆坡','1980','1','1','12:00').utcDate.toISOString()).toBe('1980-01-01T04:30:00.000Z');
    expect(moment('馬來西亞・古晉','1980','1','1','12:00').utcDate.toISOString()).toBe('1980-01-01T04:00:00.000Z');
    expect(moment('中國大陸・北京','1990','7','15','12:00').utcDate.toISOString()).toBe('1990-07-15T03:00:00.000Z');
    expect(moment('台灣・台北市','1979','7','15','12:00').utcDate.toISOString()).toBe('1979-07-15T03:00:00.000Z');
  });
  it('rejects DST gaps and folds rather than guessing', () => {
    expect(()=>moment('中國大陸・北京','1990','4','15','02:30')).toThrow('跳時');
    expect(()=>moment('中國大陸・北京','1990','9','16','01:30')).toThrow('兩次');
  });
  it('validates dates and allows genuinely missing time', () => {
    expect(()=>moment('台北市','2023','2','29')).toThrow('有效的出生日期');
    expect(()=>moment('台北市','2024','2','29','25:00')).toThrow('有效的出生時間');
    expect(moment('台北市','2024','2','29','')).toMatchObject({hasTime:false});
  });
});
