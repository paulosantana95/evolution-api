import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Replica of RouterBroker.dataValidate instance merge (abstract.router.ts 34-38).
 * We do not import RouterBroker: that file's import graph boots the whole app
 * (circular RouterBroker init) and is not needed to reproduce #2435.
 */
function mergeInstanceLikeRc2(pathInstanceName: string, query: Record<string, unknown>) {
  const instance: Record<string, unknown> = { instanceName: pathInstanceName };
  if (query && Object.keys(query).length > 0) {
    Object.assign(instance, query);
  }
  return instance;
}

test('isolation (#2435): dataValidate overwrites path instanceName with ?instanceName=', () => {
  const seen = mergeInstanceLikeRc2('instance-A', { instanceName: 'instance-B' });
  assert.equal(seen.instanceName, 'instance-B');
});

test('isolation (#2435): dataValidate also copies instanceId from the query string', () => {
  const seen = mergeInstanceLikeRc2('instance-A', { instanceId: 'victim-id' });
  assert.equal(seen.instanceId, 'victim-id');
  assert.equal(seen.instanceName, 'instance-A');
});

test('isolation (#2435): auth.guard only reads req.params, never req.query (source contract)', () => {
  const guardSrc = readFileSync('src/api/guards/auth.guard.ts', 'utf8');
  assert.match(guardSrc, /const param = req\.params as unknown as InstanceDto/);
  assert.equal(guardSrc.includes('req.query'), false);
  assert.match(guardSrc, /if \(instance\.token === key\)/);

  const routerSrc = readFileSync('src/api/abstract/abstract.router.ts', 'utf8');
  assert.match(routerSrc, /Object\.assign\(instance, request\.query\)/);
  // The develop fix (PR #2549) is NOT in rc2.
  assert.equal(routerSrc.includes('sanitizeUntrustedInput'), false);
  assert.equal(routerSrc.includes('PROTECTED_INSTANCE_FIELDS'), false);
});

test('isolation (#2435): connectionState uses the (possibly overwritten) instanceName', () => {
  const controllerSrc = readFileSync('src/api/controllers/instance.controller.ts', 'utf8');
  assert.match(controllerSrc, /public async connectionState\(\{ instanceName \}: InstanceDto\)/);
  assert.match(controllerSrc, /this\.waMonitor\.waInstances\[instanceName\]/);
});
