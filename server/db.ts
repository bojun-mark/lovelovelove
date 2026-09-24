import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { InsertQuizSession, InsertUser, quizSessions, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: MySql2Database | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;
let connecting: Promise<void> | null = null;
async function initializeDatabase() {
  let pool: ReturnType<typeof mysql.createPool> | undefined;
  let stage = "DATABASE_URL format";
  try {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.protocol !== "mysql:" || !url.hostname || !url.username || url.pathname.length < 2) throw new Error("Invalid configuration");
    stage = "read ca.pem";
    const ca = readFileSync(process.env.DATABASE_CA_PATH || "/etc/secrets/ca.pem", "utf8");
    stage = "validate ca.pem";
    const certificate = new X509Certificate(ca);
    if (!certificate.ca) throw new Error("Invalid CA certificate");
    stage = "connect to MySQL";
    pool = mysql.createPool({
      host: url.hostname, port: Number(url.port || 3306),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      timezone: 'Z',
      ssl: { ca, rejectUnauthorized: true, verifyIdentity: true },
      connectionLimit: 3, connectTimeout: 15000,
    });
    await pool.query("SELECT 1");
    console.log("[Database] TLS connection verified");
    stage = "create tables";
    const statements = [
  "CREATE TABLE IF NOT EXISTS `users` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,\n`openId` VARCHAR(64) NOT NULL UNIQUE,\n`name` TEXT,\n`email` VARCHAR(320),\n`loginMethod` VARCHAR(64),\n`role` ENUM('user','admin') NOT NULL DEFAULT 'user',\n`createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n`updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n`lastSignedIn` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS `quiz_sessions` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,\n`guestSessionHash` VARCHAR(64) NOT NULL,\n`nickname` VARCHAR(80) NOT NULL,\n`birthYear` VARCHAR(4) NOT NULL,\n`birthMonth` VARCHAR(2) NOT NULL,\n`birthDay` VARCHAR(2) NOT NULL,\n`birthTime` VARCHAR(8) NOT NULL,\n`birthPlace` VARCHAR(120) NOT NULL,\n`email` VARCHAR(320) NOT NULL,\n`colors` TEXT NOT NULL,\n`answers` TEXT NOT NULL,\n`category` VARCHAR(80) NOT NULL,\n`subQuestion` TEXT NOT NULL,\n`plan` VARCHAR(80) NOT NULL,\n`amount` INT NOT NULL,\n`status` ENUM('pending','paid','failed','expired') NOT NULL DEFAULT 'pending',\n`stripeCheckoutSessionId` VARCHAR(255),\n`createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n`updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n`expiresAt` TIMESTAMP NOT NULL,\n`consentAt` TIMESTAMP NULL DEFAULT NULL,\nINDEX quiz_sessions_guest_session_hash_idx (guestSessionHash),\nINDEX quiz_sessions_expires_at_idx (expiresAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
];
    for (const statement of statements) await pool.query(statement);
    await pool.query(`CREATE TABLE IF NOT EXISTS report_deliveries (
      sessionId INT NOT NULL PRIMARY KEY,
      recoveryHash CHAR(64) NULL,
      report LONGTEXT NULL,
      chart LONGTEXT NULL,
      leaseToken VARCHAR(64) NULL,
      leaseUntil DATETIME NULL,
      attempts INT NOT NULL DEFAULT 0,
      lastAttempt DATETIME NULL,
      emailState VARCHAR(24) NOT NULL DEFAULT 'not_sent',
      emailLease VARCHAR(64) NULL,
      emailLeaseUntil DATETIME NULL,
      emailAttempts INT NOT NULL DEFAULT 0,
      emailAttemptAt DATETIME NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    _pool = pool;
    _db = drizzle(pool);
    console.log("[Database] Tables ready");
  } catch (error) {
    const rawCode = (error as { code?: unknown })?.code;
    const code = typeof rawCode === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(rawCode) ? rawCode : "UNCLASSIFIED";
    console.error("[Database] Failed at: " + stage + "; code=" + code);
    if (pool) await pool.end().catch(() => {});
    throw new Error("[Database] Setup failed. Check DATABASE_URL, ca.pem, and database availability.");
  }
}
export async function getDatabasePool() {
  await getDb();
  if (!_pool) throw new Error('資料庫暫時無法使用，請稍後回來查詢；請勿重複付款。');
  return _pool;
}
export async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!_db) {
    if (!connecting) connecting = initializeDatabase().finally(() => { connecting = null; });
    await connecting;
  }
  return _db;
}
export async function upsertUser(user: InsertUser): Promise<void> { if (!user.openId) throw new Error("User openId is required for upsert"); const db = await getDb(); if (!db) return; const values: InsertUser = { openId: user.openId }; const updateSet: Record<string, unknown> = {}; (["name", "email", "loginMethod"] as const).forEach((field) => { if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; } }); values.lastSignedIn = user.lastSignedIn ?? new Date(); updateSet.lastSignedIn = values.lastSignedIn; if (user.role) { values.role = user.role; updateSet.role = user.role; } else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; } await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet }); }
export async function getUserByOpenId(openId: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return result[0]; }
export async function createQuizSession(session: InsertQuizSession) { const db = await getDb(); if (!db) return null; const result = await db.insert(quizSessions).values(session); return result[0]?.insertId ?? null; }
export async function attachStripeCheckoutSession(id: number, stripeCheckoutSessionId: string) { const db = await getDb(); if (!db) return; await db.update(quizSessions).set({ stripeCheckoutSessionId }).where(eq(quizSessions.id, id)); }
export async function markQuizSessionPaid(stripeCheckoutSessionId: string) { const db = await getDb(); if (!db) return; await db.update(quizSessions).set({ status: "paid" }).where(eq(quizSessions.stripeCheckoutSessionId, stripeCheckoutSessionId)); return getQuizSessionByStripeId(stripeCheckoutSessionId); }
export async function getQuizSession(id: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(quizSessions).where(eq(quizSessions.id, id)).limit(1); return result[0]; }

export async function getQuizSessionByStripeId(stripeCheckoutSessionId: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(quizSessions).where(eq(quizSessions.stripeCheckoutSessionId, stripeCheckoutSessionId)).limit(1); return result[0]; }

