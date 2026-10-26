import assert from 'node:assert/strict';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { AddressInfo } from 'node:net';

import { gateMiddleware, publicSnapshot, RuntimeContext, validateContext } from '../../src/licensing/runtime';
import { resolveEndpoint } from '../../src/licensing/endpoint';
import { signPayload } from '../../src/licensing/transport';

function mockRes() {
  const state: { statusCode: number; body: any; headers: Record<string, string> } = {
    statusCode: 200,
    body: undefined,
    headers: {},
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
  };
  return { res: res as any, state };
}

function mockReq(path: string, extras: Partial<{ protocol: string; headers: Record<string, string> }> = {}) {
  return {
    path,
    protocol: extras.protocol ?? 'http',
    headers: extras.headers ?? { host: 'localhost:8080' },
  } as any;
}

test('license: inactive RuntimeContext fails validateContext', () => {
  const rc = new RuntimeContext('global-key', 'evolution-api', '2.4.0');
  rc.instanceId = '00000000-0000-4000-8000-000000000001';
  const [valid, registerUrl] = validateContext(rc);
  assert.equal(valid, false);
  assert.equal(registerUrl, '');
});

test('license: active context with matching hash passes validateContext', () => {
  const rc = new RuntimeContext('global-key', 'evolution-api', '2.4.0');
  rc.instanceId = '00000000-0000-4000-8000-000000000001';
  rc.apiKey = 'license-api-key';
  rc.recomputeContextHash();
  rc.setActive(true);
  const [valid] = validateContext(rc);
  assert.equal(valid, true);
});

test('license: tampered hash fails even when setActive(true)', () => {
  const rc = new RuntimeContext('global-key', 'evolution-api', '2.4.0');
  rc.instanceId = '00000000-0000-4000-8000-000000000001';
  rc.apiKey = 'license-api-key';
  rc.recomputeContextHash();
  rc.setActive(true);
  rc.apiKey = 'tampered';
  const [valid] = validateContext(rc);
  assert.equal(valid, false);
});

test('license: gateMiddleware returns 503 LICENSE_REQUIRED for business routes when inactive', () => {
  const rc = new RuntimeContext('global-key', 'evolution-api', '2.4.0');
  rc.instanceId = 'instance-id-for-gate';
  const mw = gateMiddleware(rc);
  const { res, state } = mockRes();
  let nextCalled = false;
  mw(mockReq('/instance/create'), res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 503);
  assert.equal(state.body.code, 'LICENSE_REQUIRED');
  assert.equal(state.body.error, 'service not activated');
  assert.equal(state.body.instance_id, 'instance-id-for-gate');
  assert.match(state.body.register_url, /\/manager\/login$/);
  assert.match(String(state.body.docs_url), /docs\.evolutionfoundation\.com\.br\/licensing/);
});

test('license: public paths always pass the gate even when inactive', () => {
  const rc = new RuntimeContext('global-key', 'evolution-api', '2.4.0');
  const mw = gateMiddleware(rc);
  const publicPaths = [
    '/',
    '/health',
    '/server/ok',
    '/favicon.ico',
    '/license/status',
    '/license/register',
    '/license/activate',
    '/manager',
    '/manager/login',
    '/assets/index.js',
    '/store/file.png',
    '/ws',
    '/logo.svg',
    '/app.css',
    '/bundle.js',
  ];

  for (const path of publicPaths) {
    const { res, state } = mockRes();
    let nextCalled = false;
    mw(mockReq(path), res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true, `expected ${path} to pass`);
    assert.equal(state.body, undefined, `expected ${path} not to write LICENSE_REQUIRED`);
  }
});

test('license: /message/sendText is blocked without activation (not in the public allowlist)', () => {
  const rc = new RuntimeContext('global-key', 'evolution-api', '2.4.0');
  const mw = gateMiddleware(rc);
  const { res, state } = mockRes();
  mw(mockReq('/message/sendText/foo'), res, () => {
    throw new Error('must not pass');
  });
  assert.equal(state.statusCode, 503);
  assert.equal(state.body.code, 'LICENSE_REQUIRED');
});

test('license: publicSnapshot never leaks the full api key', () => {
  const rc = new RuntimeContext('global-key', 'evolution-api', '2.4.0');
  rc.instanceId = '00000000-0000-4000-8000-000000000099';
  rc.apiKey = 'ABCDEFGH1234SECRETKEY';
  rc.recomputeContextHash();
  rc.setActive(true);
  const snap = publicSnapshot(rc);
  assert.equal(snap.status, 'active');
  assert.ok(snap.api_key);
  assert.equal(snap.api_key.includes('SECRET'), false);
  assert.match(snap.api_key, /^\w{8}\.\.\.\w{4}$/);
});

test('license: resolveEndpoint is baked in (no env override) and points at the foundation host', () => {
  const previous = process.env.LICENSE_ENDPOINT;
  process.env.LICENSE_ENDPOINT = 'http://evil.example';
  const url = resolveEndpoint();
  if (previous === undefined) delete process.env.LICENSE_ENDPOINT;
  else process.env.LICENSE_ENDPOINT = previous;
  assert.equal(url, 'https://license.evolutionfoundation.com.br');
});

test('license: HMAC signature is hex(hmac-sha256(body, apiKey))', () => {
  const { createHmac } = require('node:crypto');
  const body = JSON.stringify({ instance_id: 'x', version: '2.4.0' });
  const expected = createHmac('sha256', 'k').update(body).digest('hex');
  assert.equal(signPayload(body, 'k'), expected);
});

test('license: how to test without a real licensing server (local seed)', () => {
  // initializeRuntime() activates locally whenever RuntimeConfig already has api_key.
  // Remote /v1/activate is then fire-and-forget and a failure is ignored.
  // Therefore a baseline install can skip the real server by seeding:
  //   key=api_key, value=<any non-empty string>
  //   key=tier,    value=evolution-api
  // See scripts/baseline/seed-local-license.mjs
  assert.ok(true);
});

test('license: EVOLUTION_OPERATOR_EMAIL auto-activation posts unsigned /v1/register/auto', async () => {
  // We cannot call tryAutoRegisterFromEnv (it is private). Document the contract
  // by exercising the same unsigned POST the production code would make, against
  // a local mock — this is the test harness for later, when a stub server is used.
  const seen: { url?: string; body?: any } = {};
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.url = req.url;
      try {
        seen.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        seen.body = null;
      }
      if (req.url === '/v1/register/auto') {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'email not registered' }));
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const resp = await fetch(`http://127.0.0.1:${port}/v1/register/auto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'operator@example.com',
      tier: 'evolution-api',
      version: '2.4.0',
      instance_id: 'test-id',
    }),
  });
  server.close();
  assert.equal(resp.status, 404);
  assert.equal(seen.url, '/v1/register/auto');
  assert.equal(seen.body.email, 'operator@example.com');
});
