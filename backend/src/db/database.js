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

  // Parse the connection string to get the hostname
  const dbUrl = new URL(connectionString);
  const originalHost = dbUrl.hostname;

  // Resolve hostname to IPv4 (Render's network may not support IPv6)
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

  // Rebuild connection string with resolved IPv4 address
  dbUrl.hostname = resolvedHost;
  const resolvedConnectionString = dbUrl.toString();

  console.log("Connecting to database via:", resolvedHost);

  const pool = new Pool({
    connectionString: resolvedConnectionString,
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

  // Migrate database schema
  const client = await pool.connect();
  try {
    // Step 1: Create new tables (users first, since lists references it)
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
        -- Add owner_id to lists if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lists' AND column_name='owner_id') THEN
          ALTER TABLE lists ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        -- Add created_by to items if missing
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

    // Step 4: Backfill legacy data — create a legacy user and assign existing lists to it
    const listResult = await client.query("SELECT COUNT(*) as count FROM lists WHERE owner_id IS NULL");
    if (parseInt(listResult.rows[0].count) > 0) {
      // Create legacy user
      await client.query(`
        INSERT INTO users (id, email, name)
        VALUES ('00000000-0000-0000-0000-000000000000', 'legacy@local', 'Legacy User')
        ON CONFLICT (id) DO NOTHING;
      `);
      // Assign orphan lists to legacy user
      await client.query(`
        UPDATE lists SET owner_id = '00000000-0000-0000-0000-000000000000' WHERE owner_id IS NULL;
      `);
      // Create list_members entries for legacy user
      await client.query(`
        INSERT INTO list_members (list_id, user_id, role)
        SELECT id, '00000000-0000-0000-0000-000000000000', 'owner'
        FROM lists
        ON CONFLICT DO NOTHING;
      `);
      console.log("Backfilled legacy lists with owner_id");
    }

    // Step 5: Now that schema is ready, set up RLS
    // Enable RLS on all tables
    await client.query(`
      ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
      ALTER TABLE items ENABLE ROW LEVEL SECURITY;
      ALTER TABLE purchase_history ENABLE ROW LEVEL SECURITY;
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE list_members ENABLE ROW LEVEL SECURITY;
    `);

    // Drop existing policies first (idempotent) then recreate
    await client.query(`
      DROP POLICY IF EXISTS "Users can view lists they own or are members of" ON lists;
      DROP POLICY IF EXISTS "Users can insert lists as owner" ON lists;
      DROP POLICY IF EXISTS "Users can update lists they own" ON lists;
      DROP POLICY IF EXISTS "Users can delete lists they own" ON lists;
      DROP POLICY IF EXISTS "Users can view items in lists they own or are members of" ON items;
      DROP POLICY IF EXISTS "Users can insert items in lists they own or can edit" ON items;
      DROP POLICY IF EXISTS "Users can update items in lists they own or can edit" ON items;
      DROP POLICY IF EXISTS "Users can delete items in lists they own or can edit" ON items;
      DROP POLICY IF EXISTS "Users can view purchase history in lists they own or are members of" ON purchase_history;
      DROP POLICY IF EXISTS "Users can insert purchase history in lists they own or can edit" ON purchase_history;
      DROP POLICY IF EXISTS "Users can view their own data" ON users;
      DROP POLICY IF EXISTS "Users can update their own data" ON users;
      DROP POLICY IF EXISTS "Users can view list members for lists they own or are members of" ON list_members;
      DROP POLICY IF EXISTS "Users can insert list members as owner" ON list_members;
      DROP POLICY IF EXISTS "Users can update list members as owner" ON list_members;
      DROP POLICY IF EXISTS "Users can delete list members as owner" ON list_members;
    `);

    // Create policies
    await client.query(`
      CREATE POLICY "Users can view lists they own or are members of" ON lists
        FOR SELECT
        USING (
          owner_id = auth.uid() OR
          EXISTS (SELECT 1 FROM list_members WHERE list_id = lists.id AND user_id = auth.uid())
        );

      CREATE POLICY "Users can insert lists as owner" ON lists
        FOR INSERT WITH CHECK (owner_id = auth.uid());

      CREATE POLICY "Users can update lists they own" ON lists
        FOR UPDATE USING (owner_id = auth.uid());

      CREATE POLICY "Users can delete lists they own" ON lists
        FOR DELETE USING (owner_id = auth.uid());

      CREATE POLICY "Users can view items in lists they own or are members of" ON items
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM lists WHERE lists.id = items.list_id AND (
              lists.owner_id = auth.uid() OR
              EXISTS (SELECT 1 FROM list_members WHERE list_id = lists.id AND user_id = auth.uid())
            )
          )
        );

      CREATE POLICY "Users can insert items in lists they own or can edit" ON items
        FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM lists WHERE lists.id = items.list_id AND (
              lists.owner_id = auth.uid() OR
              EXISTS (SELECT 1 FROM list_members WHERE list_id = lists.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
            )
          )
        );

      CREATE POLICY "Users can update items in lists they own or can edit" ON items
        FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM lists WHERE lists.id = items.list_id AND (
              lists.owner_id = auth.uid() OR
              EXISTS (SELECT 1 FROM list_members WHERE list_id = lists.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
            )
          )
        );

      CREATE POLICY "Users can delete items in lists they own or can edit" ON items
        FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM lists WHERE lists.id = items.list_id AND (
              lists.owner_id = auth.uid() OR
              EXISTS (SELECT 1 FROM list_members WHERE list_id = lists.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
            )
          )
        );

      CREATE POLICY "Users can view purchase history in lists they own or are members of" ON purchase_history
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM lists WHERE lists.id = purchase_history.list_id AND (
              lists.owner_id = auth.uid() OR
              EXISTS (SELECT 1 FROM list_members WHERE list_id = lists.id AND user_id = auth.uid())
            )
          )
        );

      CREATE POLICY "Users can insert purchase history in lists they own or can edit" ON purchase_history
        FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM lists WHERE lists.id = purchase_history.list_id AND (
              lists.owner_id = auth.uid() OR
              EXISTS (SELECT 1 FROM list_members WHERE list_id = lists.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
            )
          )
        );

      CREATE POLICY "Users can view their own data" ON users
        FOR SELECT USING (auth.uid() = id);

      CREATE POLICY "Users can update their own data" ON users
        FOR UPDATE USING (auth.uid() = id);

      CREATE POLICY "Users can view list members for lists they own or are members of" ON list_members
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM lists WHERE lists.id = list_members.list_id AND (
              lists.owner_id = auth.uid() OR
              EXISTS (SELECT 1 FROM list_members lm2 WHERE lm2.list_id = list_members.list_id AND lm2.user_id = auth.uid())
            )
          )
        );

      CREATE POLICY "Users can insert list members as owner" ON list_members
        FOR INSERT
        WITH CHECK (
          EXISTS (SELECT 1 FROM lists WHERE lists.id = list_members.list_id AND lists.owner_id = auth.uid())
        );

      CREATE POLICY "Users can update list members as owner" ON list_members
        FOR UPDATE
        USING (
          EXISTS (SELECT 1 FROM lists WHERE lists.id = list_members.list_id AND lists.owner_id = auth.uid())
        );

      CREATE POLICY "Users can delete list members as owner" ON list_members
        FOR DELETE
        USING (
          EXISTS (SELECT 1 FROM lists WHERE lists.id = list_members.list_id AND lists.owner_id = auth.uid())
        );
    `);

    // Step 6: Enable Realtime
    await client.query(`
      ALTER TABLE lists REPLICA IDENTITY FULL;
      ALTER TABLE items REPLICA IDENTITY FULL;
      ALTER TABLE purchase_history REPLICA IDENTITY FULL;
      ALTER TABLE users REPLICA IDENTITY FULL;
      ALTER TABLE list_members REPLICA IDENTITY FULL;
    `);

    console.log("Database initialized with auth tables and RLS");
  } finally {
    client.release();
  }
}

// Keep the existing dbPromise initialization
const dbPromise = initDb();

export { pool, dbPromise };