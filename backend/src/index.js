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

// ===== INVITE ENDPOINTS =====

// Accept invite — public endpoint (no auth required, token is the auth)
app.post("/api/lists/accept-invite/:token", async (req, res) => {
  try {
    const { token } = req.params;

    // Find the invite
    const inviteResult = await pool.query(
      `SELECT * FROM list_invites WHERE token = $1`,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: "Convite não encontrado" });
    }

    const invite = inviteResult.rows[0];

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: "Este convite expirou" });
    }

    // Check if already used
    if (invite.used_at) {
      return res.status(409).json({ error: "Este convite já foi utilizado" });
    }

    // Get the user from the session (they need to be logged in)
    // We need to extract the JWT from the Authorization header manually
    const authHeader = req.headers['authorization'];
    const jwtToken = authHeader && authHeader.split(' ')[1];

    if (!jwtToken) {
      return res.status(401).json({ error: "Precisas de estar logado para aceitar o convite" });
    }

    // Verify JWT
    const { createPublicKey } = await import('crypto');
    const https = (await import('https'));
    const jwt = (await import('jsonwebtoken'));

    let userId, userEmail;
    try {
      // Fetch JWKS to verify
      const supabaseUrl = process.env.SUPABASE_URL;
      const jwksData = await new Promise((resolve, reject) => {
        https.get(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      const key = jwksData.keys?.[0];
      const keyObject = createPublicKey({ key, format: 'jwk' });
      const publicKey = keyObject.export({ format: 'pem', type: 'spki' });
      const decoded = jwt.verify(jwtToken, publicKey, { algorithms: ['ES256', 'RS256'] });
      userId = decoded.sub;
      userEmail = decoded.email;
    } catch (jwtErr) {
      return res.status(403).json({ error: "Token inválido" });
    }

    // Ensure user exists in our DB
    await pool.query(
      `INSERT INTO users (id, email) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET email = $2, updated_at = NOW()`,
      [userId, userEmail]
    );

    // Check if user is already a member
    const existingMember = await pool.query(
      `SELECT id FROM list_members WHERE list_id = $1 AND user_id = $2`,
      [invite.list_id, userId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(409).json({ error: "Já és membro desta lista" });
    }

    // Add user as member
    await pool.query(
      `INSERT INTO list_members (list_id, user_id, role) VALUES ($1, $2, $3)`,
      [invite.list_id, userId, invite.role]
    );

    // Mark invite as used
    await pool.query(
      `UPDATE list_invites SET used_at = NOW(), used_by = $1 WHERE token = $2`,
      [userId, token]
    );

    // Get list name for the response
    const listResult = await pool.query(`SELECT name FROM lists WHERE id = $1`, [invite.list_id]);

    res.json({
      success: true,
      message: `Foste adicionado à lista "${listResult.rows[0]?.name || 'lista'}" como ${invite.role}`,
      listId: invite.list_id,
      role: invite.role
    });
  } catch (e) {
    console.error("Accept invite error:", e);
    res.status(500).json({ error: "Erro ao aceitar convite" });
  }
});

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
