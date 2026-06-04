import jwt from 'jsonwebtoken';
import { createPublicKey } from 'crypto';
import { pool } from '../db/database.js';
import https from 'https';
import http from 'http';

let cachedPublicKey = null;
let cacheExpiry = 0;
const CACHE_DURATION = 3600000; // 1 hour

function fetchJWKS(kid) {
  return new Promise((resolve, reject) => {
    // If we have a cached key and it matches the requested kid (or no kid specified), use it
    if (cachedPublicKey && Date.now() < cacheExpiry && (!kid || cachedPublicKey.kid === kid)) {
      resolve(cachedPublicKey.pem);
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      reject(new Error('SUPABASE_URL not set'));
      return;
    }

    const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
    const client = jwksUrl.startsWith('https') ? https : http;

    const req = client.get(jwksUrl, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectClient = res.headers.location.startsWith('https') ? https : http;
        redirectClient.get(res.headers.location, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => processJWKS(data, kid, resolve, reject));
        }).on('error', reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => processJWKS(data, kid, resolve, reject));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('JWKS fetch timeout'));
    });
  });
}

function processJWKS(data, kid, resolve, reject) {
  try {
    const jwks = JSON.parse(data);
    const keys = jwks.keys || [];
    if (keys.length === 0) {
      reject(new Error('No keys found in JWKS'));
      return;
    }
    // Find the key matching the token's kid, or fall back to first key
    const key = kid ? keys.find(k => k.kid === kid) || keys[0] : keys[0];
    // Convert JWK to PEM
    const keyObject = createPublicKey({ key, format: 'jwk' });
    const publicKey = keyObject.export({ format: 'pem', type: 'spki' });
    cachedPublicKey = { kid: key.kid, pem: publicKey };
    cacheExpiry = Date.now() + CACHE_DURATION;
    resolve(publicKey);
  } catch (e) {
    reject(e);
  }
}

const FALLBACK_SECRET = process.env.SUPABASE_JWT_SECRET;

// Debug info attached to request for logging
let lastJWKSStatus = { status: 'unknown', error: null, timestamp: 0 };

// Middleware to authenticate Supabase JWT tokens
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Extract kid from token header (without verifying) to find the right JWK
  let tokenKid = null;
  try {
    const headerB64 = token.split('.')[0];
    const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());
    tokenKid = header.kid;
  } catch (e) {
    console.error('Failed to parse token header:', e.message);
  }

  // Try JWKS (ES256) verification first
  fetchJWKS(tokenKid)
    .then(publicKey => {
      lastJWKSStatus = { status: 'ok', error: null, timestamp: Date.now() };
      try {
        const decoded = jwt.verify(token, publicKey, {
          algorithms: ['ES256', 'RS256'],
          audience: 'authenticated',
          issuer: `${process.env.SUPABASE_URL}/auth/v1`
        });
        req.user = {
          id: decoded.sub,
          email: decoded.email,
          role: decoded.role,
          ...decoded
        };
        return next();
      } catch (verifyErr) {
        // JWKS worked but token itself is invalid
        console.error('ES256 token verify failed:', verifyErr.message, '| Token prefix:', token.substring(0, 20) + '...');
        return res.status(403).json({ error: 'Invalid or expired token', debug: 'ES256 verify: ' + verifyErr.message });
      }
    })
    .catch(jwksErr => {
      lastJWKSStatus = { status: 'error', error: jwksErr.message, timestamp: Date.now() };
      console.error('JWKS fetch/verify failed:', jwksErr.message);

      // Fallback: try HS256 with SUPABASE_JWT_SECRET
      if (FALLBACK_SECRET) {
        try {
          const decoded = jwt.verify(token, FALLBACK_SECRET, { algorithms: ['HS256'] });
          req.user = {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
            ...decoded
          };
          console.log('HS256 fallback succeeded (JWKS was down)');
          return next();
        } catch (hsErr) {
          console.error('HS256 fallback also failed:', hsErr.message);
        }
      }

      console.error('All JWT verification methods failed');
      return res.status(403).json({
        error: 'Invalid or expired token',
        debug: 'JWKS: ' + jwksErr.message + ' | HS256: failed'
      });
    });
}

export function getLastJWKSStatus() { return lastJWKSStatus; }

// Middleware to check if user owns or has access to a list
export function authorizeListAccess(requireOwner = false) {
  return async (req, res, next) => {
    try {
      const listId = req.params.listId || req.params.id;
      const userId = req.user.id;

      // Check list_members table for explicit membership
      const { rows } = await pool.query(
        `SELECT role FROM list_members WHERE list_id = $1 AND user_id = $2`,
        [listId, userId]
      );

      if (rows.length > 0) {
        if (requireOwner && rows[0].role !== 'owner') {
          return res.status(403).json({ error: 'Owner access required' });
        }
        req.listRole = rows[0].role;
        return next();
      }

      // Fallback: check if user is the owner via lists.owner_id
      const { rows: ownerRows } = await pool.query(
        `SELECT id FROM lists WHERE id = $1 AND owner_id = $2`,
        [listId, userId]
      );

      if (ownerRows.length > 0) {
        req.listRole = 'owner';
        return next();
      }

      return res.status(403).json({ error: 'Access denied to this list' });
    } catch (err) {
      console.error('Authorization error:', err);
      return res.status(500).json({ error: 'Authorization failed' });
    }
  };
}
