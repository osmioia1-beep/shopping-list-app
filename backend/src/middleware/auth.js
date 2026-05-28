import jwt from 'jsonwebtoken';
import { pool } from '../db/database.js';

// Middleware to authenticate Supabase JWT tokens
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Use the JWT secret from environment (set on Render dashboard or loaded via dotenv)
  const secret = process.env.SUPABASE_JWT_SECRET;

  if (!secret || secret === 'undefined') {
    console.error('SUPABASE_JWT_SECRET is not set! process.env keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    return res.status(500).json({ error: 'Server configuration error: JWT secret missing' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    // Supabase JWT payload uses 'sub' for user id
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      ...decoded
    };
    next();
  } catch (err) {
    console.error('JWT verify failed:', err.message, '| Token prefix:', token.substring(0, 20) + '...');
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Optional: Middleware to check if user owns or has access to a list
export function authorizeListAccess(requireOwner = false) {
  return async (req, res, next) => {
    try {
      const { listId } = req.params;
      const userId = req.user.id;

      const { rows } = await pool.query(
        `SELECT role FROM list_members WHERE list_id = $1 AND user_id = $2`,
        [listId, userId]
      );

      if (rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this list' });
      }

      if (requireOwner && rows[0].role !== 'owner') {
        return res.status(403).json({ error: 'Owner access required' });
      }

      req.listRole = rows[0].role;
      next();
    } catch (err) {
      console.error('Authorization error:', err);
      return res.status(500).json({ error: 'Authorization failed' });
    }
  };
}
