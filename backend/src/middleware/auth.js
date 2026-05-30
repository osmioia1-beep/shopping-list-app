import jwt from 'jsonwebtoken';
import { createPublicKey } from 'crypto';
import { pool } from '../db/database.js';
import https from 'https';
import http from 'http';

let cachedPublicKey = null;
let cacheExpiry = 0;
const CACHE_DURATION = 3600000; // 1 hour

function fetchJWKS() {
  return new Promise((resolve, reject) => {
    if (cachedPublicKey && Date.now() < cacheExpiry) {
      resolve(cachedPublicKey);
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      reject(new Error('SUPABASE_URL not set'));
      return;
    }

    const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
    const client = jwksUrl.startsWith('https') ? https : http;

    client.get(jwksUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jwks = JSON.parse(data);
          const key = jwks.keys?.[0];
          if (!key) {
            reject(new Error('No keys found in JWKS'));
            return;
          }
          // Convert JWK to PEM
          const keyObject = createPublicKey({ key, format: 'jwk' });
          const publicKey = keyObject.export({ format: 'pem', type: 'spki' });
          cachedPublicKey = publicKey;
          cacheExpiry = Date.now() + CACHE_DURATION;
          resolve(publicKey);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

const FALLBACK_SECRET = process.env.SUPABASE_JWT_SECRET;

// Middleware to authenticate Supabase JWT tokens
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Try JWKS (ES256) verification first
  fetchJWKS()
    .then(publicKey => {
      try {
        const decoded = jwt.verify(token, publicKey, { algorithms: ['ES256', 'RS256'] });
        req.user = {
          id: decoded.sub,
          email: decoded.email,
          role: decoded.role,
          ...decoded
        };
        console.log("[auth] JWT verified, user:", decoded.sub, "email:", decoded.email);
        return next();
      } catch (verifyErr) {
        throw verifyErr;
      }
    })
    .catch(jwksErr => {
      console.log('JWKS verification failed:', jwksErr.message);

      // Fallback: try HS256 with SUPABASE_JWT_SECRET
      if (FALLBACK_SECRET) {
        try {
          const decoded = jwt.verify(token, FALLBACK_SECRET);
          req.user = {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
            ...decoded
          };
          return next();
        } catch (hsErr) {
          console.log('HS256 fallback also failed:', hsErr.message);
        }
      }

      console.error('All JWT verification methods failed');
      return res.status(403).json({ error: 'Invalid or expired token' });
    });
}

// Middleware to check if user owns or has access to a list
export function authorizeListAccess(requireOwner = false) {
  return async (req, res, next) => {
    try {
      const { listId } = req.params;
      const userId = req.user.id;
      console.log("[authorizeListAccess] listId:", listId, "userId:", userId, "requireOwner:", requireOwner);

      // Check list_members table for explicit membership
      const { rows } = await pool.query(
        `SELECT role FROM list_members WHERE list_id = $1 AND user_id = $2`,
        [listId, userId]
      );

      if (rows.length > 0) {
        console.log("[authorizeListAccess] Found in list_members, role:", rows[0].role);
        if (requireOwner && rows[0].role !== 'owner') {
          console.log("[authorizeListAccess] REJECTED: requires owner but role is", rows[0].role);
          return res.status(403).json({ error: 'Owner access required' });
        }
        req.listRole = rows[0].role;
        return next();
      }

      // Fallback: check if user is the owner via lists.owner_id
      console.log("[authorizeListAccess] Not in list_members, checking lists.owner_id fallback");
      const { rows: ownerRows } = await pool.query(
        `SELECT id FROM lists WHERE id = $1 AND owner_id = $2`,
        [listId, userId]
      );

      if (ownerRows.length > 0) {
        console.log("[authorizeListAccess] Found as owner via lists.owner_id");
        req.listRole = 'owner';
        return next();
      }

      console.log("[authorizeListAccess] REJECTED: user has no access to this list");
      return res.status(403).json({ error: 'Access denied to this list' });
    } catch (err) {
      console.error('[authorizeListAccess] Error:', err);
      return res.status(500).json({ error: 'Authorization failed' });
    }
  };
}
