import { describe, expect, it } from "vitest";
import { calculateBirthChart } from "./astrology";

describe("birth chart calculation", () => {
  it("produces zodiac positions and ascendant when birth time is supplied", async () => {
    const chart = await calculateBirthChart({ year: "1994", month: "7", day: "15", time: "21:30", place: "台北市" });
    expect(chart.planets["太陽"].sign).toBeTruthy();
    expect(chart.planets["月亮"].sign).toBeTruthy();
    expect(chart.ascendant?.sign).toBeTruthy();
    expect(chart.houses).toHaveLength(12);
    expect(chart.birth.utcDateTime).toBe('1994-07-15T13:30:00.000Z');
    expect(chart.birth.timeZone).toBe('Asia/Taipei');
  });
  it('selects the eastern horizon and whole-sign houses against an independent ephemeris reference', async () => {
    // Swiss Ephemeris/Moshier reference: 1992-04-14 00:41 UTC, Banqiao city center.
    const chart = await calculateBirthChart({ year: '1992', month: '4', day: '14', time: '08:41', place: '新北市・板橋區' });
    expect(chart.ascendant?.sign).toBe('雙子座');
    expect(Math.abs(chart.ascendant!.absoluteLongitude - 76.6012)).toBeLessThan(0.1);
    expect(chart.houses[9]).toEqual({ house: 10, sign: '雙魚座' });
    expect(chart.planets['冥王星']).toBeUndefined();
  });
  it('does not invent ascendant or houses when time is missing', async () => {
    const chart = await calculateBirthChart({ year:'1980', month:'1', day:'1', place:'馬來西亞・吉隆坡' });
    expect(chart.ascendant).toBeUndefined();
    expect(chart.houses).toEqual([]);
    expect(chart.birth.utcDateTime).toBe('1980-01-01T04:30:00.000Z');
  });
});
