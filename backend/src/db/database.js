import pg from "pg";
import { URL } from "url";
import dns from "dns/promises";
const { Pool } = pg;

async function createPool() {
  const dbUrl = new URL(process.env.DATABASE_URL || "");

  // Resolve hostname to IPv4 address to avoid IPv6 ENETUNREACH on Render
  let host = dbUrl.hostname;
  try {
    const addresses = await dns.resolve4(dbUrl.hostname);
    host = addresses[0];
    console.log(`Resolved ${dbUrl.hostname} -> ${host}`);
  } catch (e) {
    console.warn(`Could not resolve ${dbUrl.hostname} to IPv4, using hostname as-is`);
  }

  return new Pool({
    host,
    port: parseInt(dbUrl.port) || 5432,
    user: dbUrl.username,
    password: dbUrl.password,
    database: dbUrl.pathname.replace(/^\//, ""),
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
}

// Initialize pool and database
let pool;

async function initDb() {
  pool = await createPool();

  // Test connection
  try {
    await pool.query("SELECT NOW()");
    console.log("PostgreSQL connected");
  } catch (err) {
    console.error("PostgreSQL connection error:", err.message);
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

      CREATE INDEX IF NOT EXISTS idx_items_list_id ON items(list_id);
      CREATE INDEX IF NOT EXISTS idx_items_purchased ON items(purchased);
    `);

    // Insert default list if none exists
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
