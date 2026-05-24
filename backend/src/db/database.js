import pg from "pg";
import { URL } from "url";
const { Pool } = pg;

// Parse connection string and force IPv4
const dbUrl = new URL(process.env.DATABASE_URL || "");
const poolConfig = {
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port) || 5432,
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.replace(/^\//, ""),
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  // Force IPv4 — Render free tier doesn't support IPv6
  family: 4,
};

const pool = new Pool(poolConfig);

// Test connection
pool.query("SELECT NOW()").then(() => {
  console.log("PostgreSQL connected");
}).catch((err) => {
  console.error("PostgreSQL connection error:", err.message);
});

// Initialize tables
async function initDb() {
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

initDb();

export { pool };
