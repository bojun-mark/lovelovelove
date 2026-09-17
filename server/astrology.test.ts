import { describe, expect, it } from "vitest";
import { calculateBirthChart } from "./astrology";

describe("birth chart calculation", () => {
  it("produces zodiac positions and ascendant when birth time is supplied", async () => {
    // This test requires the Manus/Google Maps proxy in a live environment.
    if (!process.env.BUILT_IN_FORGE_API_URL || !process.env.BUILT_IN_FORGE_API_KEY) return;
    const chart = await calculateBirthChart({ year: "1994", month: "7", day: "15", time: "21:30", place: "台北市" });
    expect(chart.planets["太陽"].sign).toBeTruthy();
    expect(chart.planets["月亮"].sign).toBeTruthy();
    expect(chart.ascendant?.sign).toBeTruthy();
    expect(chart.houses).toHaveLength(12);
  });
});
