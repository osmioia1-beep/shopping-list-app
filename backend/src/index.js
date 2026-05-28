import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { pool, dbPromise } from "./db/database.js";
import { authenticateToken, authorizeListAccess } from "./middleware/auth.js";
import listsRouter from "./routes/lists.js";
import itemsRouter from "./routes/items.js";
import historyRouter from "./routes/history.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Debug endpoint — BEFORE auth middleware (remove after fixing)
app.get("/api/debug/env", (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const secret = process.env.SUPABASE_JWT_SECRET;

  const info = {
    hasJwtSecret: !!secret,
    jwtSecretLength: secret ? secret.length : 0,
    hasDbUrl: !!process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    hasAuthHeader: !!authHeader,
    tokenPrefix: token ? token.substring(0, 30) + '...' : null,
  };

  // If a token is provided, try to decode and verify it
  if (token) {
    try {
      const decoded = jwt.decode(token);
      info.decodedHeader = decoded ? { sub: decoded.sub, email: decoded.email, exp: decoded.exp, role: decoded.role } : null;

      if (secret && decoded) {
        try {
          const verified = jwt.verify(token, secret);
          info.verifyResult = 'SUCCESS';
          info.verifiedSub = verified.sub;
        } catch (verifyErr) {
          info.verifyResult = 'FAILED: ' + verifyErr.message;
        }
      }
    } catch (decodeErr) {
      info.decodeError = decodeErr.message;
    }
  }

  res.json(info);
});

// Auth middleware for all API routes
app.use("/api", authenticateToken);

// Get current user profile — auto-creates user in our DB on first login
// Also claims ownership of any legacy lists (owned by placeholder legacy user)
app.get("/api/users/me", async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    // Upsert: create if not exists, return existing otherwise
    const result = await pool.query(
      `INSERT INTO users (id, email) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET email = $2, updated_at = NOW()
       RETURNING *`,
      [userId, userEmail]
    );

    // Claim legacy lists: transfer ownership from legacy placeholder to this user
    await pool.query(
      `UPDATE lists SET owner_id = $1 WHERE owner_id = '00000000-0000-0000-0000-000000000000'`,
      [userId]
    );
    // Update list_members for claimed lists
    await pool.query(
      `UPDATE list_members SET user_id = $1, role = 'owner'
       WHERE user_id = '00000000-0000-0000-0000-000000000000'
       AND list_id IN (SELECT id FROM lists WHERE owner_id = $1)`,
      [userId]
    );

    res.json(result.rows[0]);
  } catch (e) {
    console.error("Get/create user error:", e);
    res.status(500).json({ error: "Failed to get user profile" });
  }
});

// API routes
app.use("/api/lists", listsRouter);
app.use("/api/lists/:listId/items", itemsRouter);
app.use("/api/lists", historyRouter);

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.resolve(__dirname, "..", "..", "frontend", "dist");
  console.log("Serving frontend from:", frontendPath);
  app.use(express.static(frontendPath));

  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(frontendPath, "index.html"));
    }
  });
}

app.listen(PORT, async () => {
  await dbPromise;
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
