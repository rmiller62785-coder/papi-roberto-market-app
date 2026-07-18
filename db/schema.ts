import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const libraryPlans = sqliteTable("library_plans", {
  date: text("date").primaryKey(),
  signal: text("signal", { enum: ["LONG", "SHORT", "WAIT"] }).notNull(),
  openRangeLow: real("open_range_low").notNull(),
  openRangeHigh: real("open_range_high").notNull(),
  entry: real("entry"),
  stop: real("stop"),
  target: real("target"),
  expectedMove: real("expected_move").notNull(),
  confidence: real("confidence").notNull(),
  rationale: text("rationale").notNull(),
  actualOpen: real("actual_open"),
  firstMinuteClose: real("first_minute_close"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
