import { env } from "cloudflare:workers";

let schemaReady: Promise<void> | null = null;

export function getD1() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

export async function ensureOpsSchema() {
  if (schemaReady) return schemaReady;
  const db = getD1();
  schemaReady = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ops_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_email TEXT NOT NULL,
      record_type TEXT NOT NULL,
      title TEXT NOT NULL,
      client TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      value REAL NOT NULL DEFAULT 0,
      link TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS ops_items_owner_idx ON ops_items (owner_email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ops_items_owner_type_idx ON ops_items (owner_email, record_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ops_items_owner_due_idx ON ops_items (owner_email, due_date)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS site_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name TEXT NOT NULL,
      path TEXT NOT NULL,
      props TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS site_events_name_idx ON site_events (event_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS site_events_created_idx ON site_events (created_at)"),
  ]).then(() => undefined).catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}
