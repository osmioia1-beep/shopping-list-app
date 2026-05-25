import pg from "pg";
import { URL } from "url";
import dns from "dns/promises";
const { Pool } = pg;

async function createPool() {
  const dbUrl = new URL(process.env.DATABASE_URL || "");
  
  console.log("DATABASE_URL is set:", !!process.env.DATABASE_URL);
  console.log("Original hostname:", dbUrl.hostname);

  // Try Supavisor pooler hostname for eu-west-1
  // Pooler format: aws-0-{region}.pooler.supabase.com
  const poolerHost = "aws-0-eu-west-1.pooler.supabase.com";
  
  // Resolve pooler hostname to IPv4
  let resolvedHost = poolerHost;
  try {
    const addresses = await dns.resolve4(poolerHost);
    if (addresses.length > 0) {
      resolvedHost = addresses[0];
      console.log(`Pooler DNS resolved ${poolerHost} -> ${resolvedHost}`);
    }
  } catch (e) {
    console.log("Pooler DNS resolution failed, using hostname as-is:", e.message);
  }

  // Build connection string with pooler host and port 6543
  // Note: pooler requires project ref in username: postgres.[project-ref]
  const projectRef = "lfatskduuzwdqoomtphh";
  const poolerUser = `postgres.${projectRef}`;
  const connectionString = `postgresql://${poolerUser}:${dbUrl.password}@${resolvedHost}:6543/postgres`;
  
  console.log("Connecting via pooler to:", `postgresql://${poolerUser}:****@${resolvedHost}:6543/postgres`);

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  
  return pool;
}

// Initialize pool and database
let pool;

async function initDb() {
  console.log("Starting initDb...");
  pool = await createPool();
  console.log("Pool created, testing connection...");

  try {
    const result = await pool.query("SELECT NOW()");
    console.log("PostgreSQL connected, server time:", result.rows[0].now);
  } catch (err) {
    console.error("PostgreSQL connection error:", err.code, err.message);
    throw err;
  }

  // Create tables
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS lists (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        purchased BOOLEAN NOT NULL DEFAULT false,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS purchase_history (
        id SERIAL PRIMARY KEY,
        list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        purchased_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_items_list_id ON items(list_id);
      CREATE INDEX IF NOT EXISTS idx_items_purchased ON items(purchased);
      CREATE INDEX IF NOT EXISTS idx_history_list_id ON purchase_history(list_id);
      CREATE INDEX IF NOT EXISTS idx_history_name ON purchase_history(name);
    `);

    const result = await client.query("SELECT COUNT(*) as count FROM lists");
    if (parseInt(result.rows[0].count) === 0) {
      await client.query("INSERT INTO lists (name) VALUES ($1)", ["Minha Lista"]);
    }

    console.log("Database initialized");
  } finally {
    client.release();
  }
}

const dbPromise = initDb();

export { pool, dbPromise };
