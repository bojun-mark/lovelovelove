import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getOrCreateGuestSession } from "./guestSession";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  guestSessionHash: string;
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  const guestSession = getOrCreateGuestSession(opts.req, opts.res);
  return {
    req: opts.req,
    res: opts.res,
    user: null,
    guestSessionHash: guestSession.hash,
  };
}
