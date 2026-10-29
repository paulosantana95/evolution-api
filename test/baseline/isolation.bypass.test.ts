import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Replica of RouterBroker.dataValidate instance merge after #2549, including
 * the create-body exception (instanceName must come from the JSON body because
 * POST /instance/create has no :instanceName path param).
 */
const PROTECTED_INSTANCE_FIELDS = ['instanceName', 'instanceId'] as const;

function sanitizeUntrustedInput(source: Record<string, any> | undefined): Record<string, any> {
  if (!source || typeof source !== 'object') return {};
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(source)) {
    if ((PROTECTED_INSTANCE_FIELDS as readonly string[]).includes(key)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function mergeInstanceLikePatched(
  pathInstanceName: string | undefined,
  query: Record<string, unknown>,
  body: Record<string, unknown> = {},
  originalUrl = '/instance/connectionState/instance-A',
) {
  const instance: Record<string, unknown> = {};
  if (pathInstanceName !== undefined) instance.instanceName = pathInstanceName;
  if (query && Object.keys(query).length > 0) {
    Object.assign(instance, sanitizeUntrustedInput(query));
  }
  if (originalUrl.includes('/instance/create')) {
    const { instanceId: _ignored, ...createBody } = body;
    Object.assign(instance, createBody);
  }
  return instance;
}

test('isolation (#2435): query instanceName no longer overrides the path instance', () => {
  const seen = mergeInstanceLikePatched('instance-A', { instanceName: 'instance-B' });
  assert.equal(seen.instanceName, 'instance-A');
});

test('isolation (#2435): query instanceId is ignored', () => {
  const seen = mergeInstanceLikePatched('instance-A', { instanceId: 'victim-id', delay: '1' });
  assert.equal(seen.instanceId, undefined);
  assert.equal(seen.instanceName, 'instance-A');
  assert.equal(seen.delay, '1');
});

test('isolation (#2435): POST /instance/create still reads instanceName from the body', () => {
  const seen = mergeInstanceLikePatched(undefined, {}, { instanceName: 'new-shop', token: 'T' }, '/instance/create');
  assert.equal(seen.instanceName, 'new-shop');
  assert.equal(seen.token, 'T');
});

test('isolation (#2435): POST /instance/create drops client-supplied instanceId', () => {
  const seen = mergeInstanceLikePatched(
    undefined,
    {},
    { instanceName: 'new-shop', instanceId: 'forged-id' },
    '/instance/create',
  );
  assert.equal(seen.instanceName, 'new-shop');
  assert.equal(seen.instanceId, undefined);
});

test('isolation (#2435): source uses sanitizeUntrustedInput on query', () => {
  const guardSrc = readFileSync('src/api/guards/auth.guard.ts', 'utf8');
  assert.match(guardSrc, /const param = req\.params as unknown as InstanceDto/);
  assert.equal(guardSrc.includes('req.query'), false);

  const routerSrc = readFileSync('src/api/abstract/abstract.router.ts', 'utf8');
  assert.match(routerSrc, /sanitizeUntrustedInput/);
  assert.match(routerSrc, /PROTECTED_INSTANCE_FIELDS/);
  assert.match(routerSrc, /Object\.assign\(instance, sanitizeUntrustedInput\(request\.query/);
  assert.equal(routerSrc.includes('Object.assign(instance, request.query)'), false);
});
