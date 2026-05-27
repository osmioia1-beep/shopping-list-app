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

// Auth middleware for all API routes
app.use("/api", authenticateToken);

// User creation endpoint (must be AFTER auth middleware — user must be logged in)
// This is called after Supabase signup to create the user in our database
app.post("/api/users", async (req, res) => {
  try {
    const { id, email } = req.body;
    if (!id || !email) {
      return res.status(400).json({ error: "id and email are required" });
    }
    const result = await pool.query(
      "INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = $2 RETURNING *",
      [id, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error("User creation error:", e);
    res.status(500).json({ error: "Failed to create user" });
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
