import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { parse } from "cookie";
import type { CookieOptions } from "express";

export const GUEST_SESSION_COOKIE = "starlovelab_guest_session";
const GUEST_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,}$/;

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const values = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto?.split(",") ?? [];
  return values.some(value => value.trim().toLowerCase() === "https");
}

export function hashGuestSession(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function guestCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    maxAge: GUEST_SESSION_MAX_AGE_MS,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}

export function getOrCreateGuestSession(req: Request, res: Response) {
  const rawCookie = typeof req.headers.cookie === "string" ? parse(req.headers.cookie) : {};
  const existing = rawCookie[GUEST_SESSION_COOKIE];
  if (existing && TOKEN_PATTERN.test(existing)) {
    return { token: existing, hash: hashGuestSession(existing), created: false };
  }

  const token = randomBytes(32).toString("base64url");
  res.cookie(GUEST_SESSION_COOKIE, token, guestCookieOptions(req));
  return { token, hash: hashGuestSession(token), created: true };
}

export function clearGuestSession(req: Request, res: Response) {
  res.clearCookie(GUEST_SESSION_COOKIE, guestCookieOptions(req));
}
