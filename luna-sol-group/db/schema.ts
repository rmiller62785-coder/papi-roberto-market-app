import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const opsItems = sqliteTable("ops_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  recordType: text("record_type").notNull(),
  title: text("title").notNull(),
  client: text("client").notNull().default(""),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("medium"),
  dueDate: text("due_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
  value: real("value").notNull().default(0),
  link: text("link").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ops_items_owner_idx").on(table.ownerEmail),
  index("ops_items_owner_type_idx").on(table.ownerEmail, table.recordType),
  index("ops_items_owner_due_idx").on(table.ownerEmail, table.dueDate),
]);
