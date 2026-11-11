import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mock, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const keyId = 'permissions-test';
const listId = '12';
const item = { id: 7, name: 'Apple', quantity: 1, purchased: false };
const readRoutes = ['/items', '/history', '/stats'];
const writeRoutes = [
  ['POST', '/items', 201],
  ['PUT', '/items/7', 200],
  ['PATCH', '/items/7/toggle', 200],
  ['DELETE', '/items/7', 200],
  ['POST', '/history', 201],
];

async function query(sql, params) {
  const statement = sql.trim();
  if (statement.startsWith('SELECT role FROM list_members')) {
    assert.equal(params[0], listId);
    const role = ['owner', 'editor', 'viewer'].includes(params[1]) ? params[1] : null;
    return { rows: role ? [{ role }] : [] };
  }
  if (statement.startsWith('SELECT id FROM lists')) {
    return { rows: params[1] === 'legacy-owner' ? [{ id: listId }] : [] };
  }
  if (/^(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/.test(statement)) {
    return { rows: [item] };
  }
  throw new Error('Unexpected query: ' + statement);
}

async function listen(server, t) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

test('list routes enforce membership and write roles through HTTP', async t => {
  mock.module('../src/db/database.js', { namedExports: { pool: { query } } });
  const jwks = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: keyId }] }));
  });
  const supabaseUrl = await listen(jwks, t);
  process.env.SUPABASE_URL = supabaseUrl;
  t.after(() => {
    delete process.env.SUPABASE_URL;
    mock.restoreAll();
  });

  const { authenticateToken } = await import('../src/middleware/auth.js');
  const { default: itemsRouter } = await import('../src/routes/items.js');
  const { default: historyRouter } = await import('../src/routes/history.js');
  const app = express();
  app.use(express.json());
  app.use('/api', authenticateToken);
  app.use('/api/lists/:listId/items', itemsRouter);
  app.use('/api/lists/:listId', historyRouter);
  const origin = await listen(createServer(app), t);

  for (const role of ['owner', 'legacy-owner', 'editor', 'viewer', 'outsider', 'anonymous']) {
    await t.test(role, async () => {
      const token = role === 'anonymous' ? null : jwt.sign({}, privateKey, {
        algorithm: 'ES256', keyid: keyId, subject: role,
        audience: 'authenticated', issuer: supabaseUrl + '/auth/v1',
      });
      const request = async (method, route) => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        const response = await fetch(origin + '/api/lists/' + listId + route, {
          method, headers,
          body: method === 'GET' ? undefined : JSON.stringify(item),
          signal: AbortSignal.timeout(5000),
        });
        await response.arrayBuffer();
        return response.status;
      };
      const denied = role === 'anonymous' ? 401 : 403;
      const canRead = !['anonymous', 'outsider'].includes(role);
      const canWrite = ['owner', 'legacy-owner', 'editor'].includes(role);
      for (const route of readRoutes) {
        assert.equal(await request('GET', route), canRead ? 200 : denied, 'GET ' + route);
      }
      for (const [method, route, success] of writeRoutes) {
        assert.equal(await request(method, route), canWrite ? success : denied, method + ' ' + route);
      }
    });
  }
});
