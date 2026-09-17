import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const quizSessions = mysqlTable("quiz_sessions", {
  id: int("id").autoincrement().primaryKey(),
  guestSessionHash: varchar("guestSessionHash", { length: 64 }).notNull(),
  nickname: varchar("nickname", { length: 80 }).notNull(),
  birthYear: varchar("birthYear", { length: 4 }).notNull(),
  birthMonth: varchar("birthMonth", { length: 2 }).notNull(),
  birthDay: varchar("birthDay", { length: 2 }).notNull(),
  birthTime: varchar("birthTime", { length: 8 }).notNull(),
  birthPlace: varchar("birthPlace", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  colors: text("colors").notNull(),
  answers: text("answers").notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  subQuestion: text("subQuestion").notNull(),
  plan: varchar("plan", { length: 80 }).notNull(),
  amount: int("amount").notNull(),
  status: mysqlEnum("status", ["pending", "paid", "failed", "expired"]).default("pending").notNull(),
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consentAt: timestamp("consentAt"),
}, table => ({
  guestSessionHashIdx: index("quiz_sessions_guest_session_hash_idx").on(table.guestSessionHash),
  expiresAtIdx: index("quiz_sessions_expires_at_idx").on(table.expiresAt),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type QuizSession = typeof quizSessions.$inferSelect;
export type InsertQuizSession = typeof quizSessions.$inferInsert;
