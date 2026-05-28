import pg from "pg";
import dotenv from "dotenv";
import dns from "dns/promises";
dotenv.config();

const { Pool } = pg;

async function createPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set in .env!");
    process.exit(1);
  }

  const dbUrl = new URL(connectionString);
  const originalHost = dbUrl.hostname;

  let resolvedHost = originalHost;
  try {
    const addresses = await dns.resolve4(originalHost);
    if (addresses.length > 0) {
      resolvedHost = addresses[0];
      console.log(`DNS resolved ${originalHost} -> ${resolvedHost}`);
    }
  } catch (e) {
    console.log("IPv4 DNS resolution failed, using hostname as-is:", e.message);
  }

  dbUrl.hostname = resolvedHost;
  const resolvedConnectionString = dbUrl.toString();

  console.log("Connecting to database via:", resolvedHost);

  const pool = new Pool({
    connectionString: resolvedConnectionString,
    ssl: { rejectUnauthorized: false },
  });

  return pool;
}

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

  const client = await pool.connect();
  try {
    // Step 1: Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Step 2: Add missing columns to existing tables (idempotent)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lists' AND column_name='owner_id') THEN
          ALTER TABLE lists ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='created_by') THEN
          ALTER TABLE items ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Step 3: Create list_members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS list_members (
        id SERIAL PRIMARY KEY,
        list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')) DEFAULT 'editor',
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(list_id, user_id)
      );
    `);

    // Step 3b: Create invite tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS list_invites (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')) DEFAULT 'editor',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
        used_at TIMESTAMPTZ,
        used_by UUID REFERENCES users(id)
      );
    `);

    // Step 4: Backfill legacy data
    const listResult = await client.query("SELECT COUNT(*) as count FROM lists WHERE owner_id IS NULL");
    if (parseInt(listResult.rows[0].count) > 0) {
      await client.query(`
        INSERT INTO users (id, email, name)
        VALUES ('00000000-0000-0000-0000-000000000000', 'legacy@local', 'Legacy User')
        ON CONFLICT (id) DO NOTHING;
      `);
      await client.query(`
        UPDATE lists SET owner_id = '00000000-0000-0000-0000-000000000000' WHERE owner_id IS NULL;
      `);
      await client.query(`
        INSERT INTO list_members (list_id, user_id, role)
        SELECT id, '00000000-0000-0000-0000-000000000000', 'owner'
        FROM lists
        ON CONFLICT DO NOTHING;
      `);
      console.log("Backfilled legacy lists with owner_id");
    }

    // Step 5: Disable RLS — our auth is handled by backend middleware, not Supabase PostgREST
    // RLS with auth.uid() only works when Supabase PostgREST forwards the JWT to Postgres
    // Since we use pg directly, auth.uid() always returns NULL and blocks everything
    await client.query(`
      ALTER TABLE lists DISABLE ROW LEVEL SECURITY;
      ALTER TABLE items DISABLE ROW LEVEL SECURITY;
      ALTER TABLE purchase_history DISABLE ROW LEVEL SECURITY;
      ALTER TABLE users DISABLE ROW LEVEL SECURITY;
      ALTER TABLE list_members DISABLE ROW LEVEL SECURITY;
    `);

    // Step 6: Enable Realtime (needed for Supabase Realtime features)
    await client.query(`
      ALTER TABLE lists REPLICA IDENTITY FULL;
      ALTER TABLE items REPLICA IDENTITY FULL;
      ALTER TABLE purchase_history REPLICA IDENTITY FULL;
      ALTER TABLE users REPLICA IDENTITY FULL;
      ALTER TABLE list_members REPLICA IDENTITY FULL;
    `);

    console.log("Database initialized with auth tables (RLS disabled — backend handles auth)");
  } finally {
    client.release();
  }
}

const dbPromise = initDb();

export { pool, dbPromise };
