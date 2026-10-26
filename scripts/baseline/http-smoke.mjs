#!/usr/bin/env node
/**
 * HTTP smoke against a running Evolution API (2.4.0-rc2).
 * Does NOT connect WhatsApp / generate QR.
 *
 * Env:
 *   BASE_URL                 default http://127.0.0.1:8080
 *   AUTHENTICATION_API_KEY   global key
 *   BASELINE_RESULTS         path to write JSON results
 */
const base = (process.env.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const globalKey = process.env.AUTHENTICATION_API_KEY || 'baseline-global-key-rc2';

const results = [];

async function call(name, method, path, { headers = {}, body, expect } = {}) {
  const url = `${base}${path}`;
  const started = Date.now();
  let status = 0;
  let json = null;
  let text = '';
  let error = null;
  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = resp.status;
    text = await resp.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  } catch (err) {
    error = err.message;
  }
  const row = {
    name,
    method,
    path,
    status,
    ms: Date.now() - started,
    json,
    text: text.slice(0, 500),
    error,
    expect,
    pass: expect ? expect({ status, json, text, error }) : !error,
  };
  results.push(row);
  const mark = row.pass ? 'PASS' : 'FAIL';
  console.log(`${mark} ${name} → ${status} ${error || ''}`.trim());
  return row;
}

function is503License(r) {
  return r.status === 503 && r.json?.code === 'LICENSE_REQUIRED';
}

const licenseStatus = await call('GET /license/status (public)', 'GET', '/license/status', {
  expect: (r) => r.status === 200 && (r.json?.status === 'active' || r.json?.status === 'inactive'),
});

const licenseActive = licenseStatus.json?.status === 'active';

await call('GET / (root)', 'GET', '/', {
  expect: (r) => (licenseActive ? r.status === 200 && r.json?.version : is503License(r)),
});

await call('GET /health if present', 'GET', '/health', {
  expect: (r) => r.status === 200 || r.status === 404 || is503License(r),
});

await call('POST /instance/create without apikey', 'POST', '/instance/create', {
  body: { instanceName: 'should-fail', integration: 'WHATSAPP-BAILEYS', qrcode: false },
  expect: (r) => r.status === 401 || r.status === 403 || is503License(r),
});

if (!licenseActive) {
  await call('POST /instance/create with global key (blocked by license)', 'POST', '/instance/create', {
    headers: { apikey: globalKey },
    body: { instanceName: 'blocked-by-license', integration: 'WHATSAPP-BAILEYS', qrcode: false },
    expect: is503License,
  });
  await call('POST /message/sendText (blocked by license)', 'POST', '/message/sendText/nope', {
    headers: { apikey: globalKey },
    body: { number: '5511999999999', text: 'x' },
    expect: is503License,
  });
} else {
  const tokenA = 'BASELINE-TOKEN-A';
  const tokenB = 'BASELINE-TOKEN-B';
  const nameA = `baseline-a-${Date.now()}`;
  const nameB = `baseline-b-${Date.now()}`;

  const createdA = await call('create instance A', 'POST', '/instance/create', {
    headers: { apikey: globalKey },
    body: { instanceName: nameA, integration: 'WHATSAPP-BAILEYS', token: tokenA, qrcode: false },
    expect: (r) => r.status === 201 || r.status === 200,
  });
  const createdB = await call('create instance B', 'POST', '/instance/create', {
    headers: { apikey: globalKey },
    body: { instanceName: nameB, integration: 'WHATSAPP-BAILEYS', token: tokenB, qrcode: false },
    expect: (r) => r.status === 201 || r.status === 200,
  });

  await call('connectionState A with token A', 'GET', `/instance/connectionState/${nameA}`, {
    headers: { apikey: tokenA },
    expect: (r) => r.status === 200 && r.json?.instance?.instanceName === nameA,
  });

  const bypass = await call(
    'ISOLATION BYPASS: connectionState A?instanceName=B with token A',
    'GET',
    `/instance/connectionState/${nameA}?instanceName=${encodeURIComponent(nameB)}`,
    {
      headers: { apikey: tokenA },
      expect: (r) => r.status === 200,
    },
  );
  const leaked = bypass.json?.instance?.instanceName === nameB;
  bypass.reproducedCrossInstanceBypass = leaked;
  bypass.notes = leaked
    ? 'REPRODUCED #2435: token A operated instance B via query override'
    : 'Query override did not change instanceName (unexpected on rc2, or already patched)';
  console.log(`  instanceName returned: ${bypass.json?.instance?.instanceName} (expected B=${nameB} on rc2)`);

  await call('token A cannot use path B (auth should 401)', 'GET', `/instance/connectionState/${nameB}`, {
    headers: { apikey: tokenA },
    expect: (r) => r.status === 401 || r.status === 403,
  });

  await call('sendText without WhatsApp (no QR)', 'POST', `/message/sendText/${nameA}`, {
    headers: { apikey: tokenA },
    body: { number: '5511999999999', text: 'baseline-no-whatsapp' },
    expect: (r) => r.status >= 400 && r.status !== 503,
  });

  await call('sendText nested textMessage shape', 'POST', `/message/sendText/${nameA}`, {
    headers: { apikey: tokenA },
    body: { number: '5511999999999', textMessage: { text: 'hello' } },
    expect: (r) => r.status === 400,
  });

  await call('sendButtons PIX without WhatsApp', 'POST', `/message/sendButtons/${nameA}`, {
    headers: { apikey: tokenA },
    body: {
      number: '5511999999999',
      title: 'PIX teste',
      buttons: [{ type: 'pix', currency: 'BRL', name: 'Loja', keyType: 'random', key: 'abc' }],
    },
    expect: (r) => r.status >= 400 && r.status !== 503,
  });

  await call('getCatalog without WhatsApp', 'POST', `/business/getCatalog/${nameA}`, {
    headers: { apikey: tokenA },
    body: { number: '5511999999999', limit: 5 },
    expect: (r) => r.status >= 400 || r.json?.isBusiness === false,
  });

  await call('register is public and already-active', 'GET', '/license/register', {
    expect: (r) => r.status === 200 && (r.json?.status === 'active' || r.json?.status === 'pending'),
  });

  console.log(
    JSON.stringify(
      {
        createdA: createdA.status,
        createdB: createdB.status,
        isolationBypassReproduced: leaked,
      },
      null,
      2,
    ),
  );
}

const out = process.env.BASELINE_RESULTS || 'docs/baseline/http-smoke-results.json';
const fs = await import('node:fs');
fs.mkdirSync('docs/baseline', { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      base,
      licenseActive,
      licenseStatus: licenseStatus.json,
      at: new Date().toISOString(),
      results,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
    },
    null,
    2,
  ),
);
console.log(`wrote ${out} (${results.filter((r) => r.pass).length}/${results.length} pass)`);

const failed = results.filter((r) => !r.pass);
if (failed.length) {
  console.error('failed cases:', failed.map((f) => f.name).join(', '));
  process.exitCode = 1;
}
