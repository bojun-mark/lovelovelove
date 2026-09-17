import { describe, expect, it } from "vitest";
import { getOrCreateGuestSession, GUEST_SESSION_COOKIE } from "./_core/guestSession";

describe("guest session", () => {
  it("creates a random httpOnly cookie without personal data", () => {
    const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const req = { protocol: "https", headers: {} } as any;
    const res = { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as any;
    const session = getOrCreateGuestSession(req, res);
    expect(session.created).toBe(true);
    expect(session.hash).toHaveLength(64);
    expect(cookies[0]?.name).toBe(GUEST_SESSION_COOKIE);
    expect(cookies[0]?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(cookies[0]?.value).not.toContain("@");
  });

  it("reuses a valid existing cookie", () => {
    const token = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
    const req = { protocol: "https", headers: { cookie: `${GUEST_SESSION_COOKIE}=${token}` } } as any;
    const res = { cookie: () => { throw new Error("should not create a cookie") } } as any;
    const session = getOrCreateGuestSession(req, res);
    expect(session.created).toBe(false);
    expect(session.token).toBe(token);
  });
});
