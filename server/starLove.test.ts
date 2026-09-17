import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = { user: null, guestSessionHash: "test-guest-session-hash", req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;

describe("starLove.saveSession", () => {
  it("accepts a complete quiz payload and returns a successful result", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.starLove.saveSession({
      nickname: "小星", year: "1994", month: "7", day: "15", time: "21:30", place: "台北市", email: "star@example.com",
      colors: ["深邃宇宙紫", "耀眼曙光金"], answers: [0, 1, 0, 2, 1, 0, 1, 2, 0, 1], category: "事業與財富", subQuestion: "今年財運突破點在哪裡？", plan: "進階解惑版", amount: 199,
    });
    expect(result.success).toBe(true);
  });

  it("rejects incomplete color selections", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.starLove.saveSession({
      nickname: "小星", year: "1994", month: "7", day: "15", time: "21:30", place: "台北市", email: "star@example.com",
      colors: ["深邃宇宙紫"], answers: [0, 1, 0, 2, 1, 0, 1, 2, 0, 1], category: "事業與財富", subQuestion: "今年財運突破點在哪裡？", plan: "進階解惑版", amount: 199,
    })).rejects.toThrow();
  });

  it("rejects AI report requests without all ten state answers", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.starLove.generateReport({
      nickname: "小星", colors: ["深邃宇宙紫", "耀眼曙光金"], states: [], category: "事業與財富", subQuestion: "今年財運突破點在哪裡？", plan: "進階解惑版",
    })).rejects.toThrow();
  });
});
