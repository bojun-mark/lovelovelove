import { describe, expect, it } from "vitest";
import { planPrices } from "./routers";

describe("Stripe plan pricing", () => {
  it("keeps checkout amounts server-controlled", () => {
    expect(planPrices).toEqual({ basic: 99, plus: 199, full: 299 });
  });
});
