import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertQuizSession, InsertUser, quizSessions, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
export async function getDb() { if (!_db && process.env.DATABASE_URL) { try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; } } return _db; }
export async function upsertUser(user: InsertUser): Promise<void> { if (!user.openId) throw new Error("User openId is required for upsert"); const db = await getDb(); if (!db) return; const values: InsertUser = { openId: user.openId }; const updateSet: Record<string, unknown> = {}; (["name", "email", "loginMethod"] as const).forEach((field) => { if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; } }); values.lastSignedIn = user.lastSignedIn ?? new Date(); updateSet.lastSignedIn = values.lastSignedIn; if (user.role) { values.role = user.role; updateSet.role = user.role; } else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; } await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet }); }
export async function getUserByOpenId(openId: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return result[0]; }
export async function createQuizSession(session: InsertQuizSession) { const db = await getDb(); if (!db) return null; const result = await db.insert(quizSessions).values(session); return result[0]?.insertId ?? null; }
export async function attachStripeCheckoutSession(id: number, stripeCheckoutSessionId: string) { const db = await getDb(); if (!db) return; await db.update(quizSessions).set({ stripeCheckoutSessionId }).where(eq(quizSessions.id, id)); }
export async function markQuizSessionPaid(stripeCheckoutSessionId: string) { const db = await getDb(); if (!db) return; await db.update(quizSessions).set({ status: "paid" }).where(eq(quizSessions.stripeCheckoutSessionId, stripeCheckoutSessionId)); return getQuizSessionByStripeId(stripeCheckoutSessionId); }
export async function getQuizSession(id: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(quizSessions).where(eq(quizSessions.id, id)).limit(1); return result[0]; }

export async function getQuizSessionByStripeId(stripeCheckoutSessionId: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(quizSessions).where(eq(quizSessions.stripeCheckoutSessionId, stripeCheckoutSessionId)).limit(1); return result[0]; }
