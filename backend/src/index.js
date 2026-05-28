import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
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
  res.json({
    hasJwtSecret: !!process.env.SUPABASE_JWT_SECRET,
    jwtSecretLength: process.env.SUPABASE_JWT_SECRET ? process.env.SUPABASE_JWT_SECRET.length : 0,
    hasDbUrl: !!process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT
  });
});

// Auth middleware for all API routes
app.use("/api", authenticateToken);

// Get current user profile — auto-creates user in our DB on first login
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
