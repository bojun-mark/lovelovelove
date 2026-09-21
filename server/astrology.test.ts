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
  it('does not invent ascendant or houses when time is missing', async () => {
    const chart = await calculateBirthChart({ year:'1980', month:'1', day:'1', place:'馬來西亞・吉隆坡' });
    expect(chart.ascendant).toBeUndefined();
    expect(chart.houses).toEqual([]);
    expect(chart.birth.utcDateTime).toBe('1980-01-01T04:30:00.000Z');
  });
});
