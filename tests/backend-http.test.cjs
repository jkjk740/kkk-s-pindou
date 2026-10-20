const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, work } = require('./backend-helpers.cjs');

function event(request, overrides = {}) {
  return Object.assign({
    httpMethod: 'POST', path: '/bead-island', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request), isBase64Encoded: false, queryStringParameters: {}
  }, overrides);
}

function handler(harness) {
  return require('../uniCloud-alipay/cloudfunctions/bead-island/lib/http.js').createHttpHandler(harness.api);
}

function envelope(response) {
  assert.equal(response.mpserverlessComposedResponse, true);
  assert.equal(response.isBase64Encoded, false);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.equal(response.headers['cache-control'], 'no-store');
  return JSON.parse(response.body);
}

test('URLized POST works with JSON, mixed-case headers and bearer scheme, and base64 bodies', async () => {
  const harness = fixture();
  const handle = handler(harness);
  const loginResponse = await handle(event({ action: 'auth.login', payload: { code: 'alice' } }));
  assert.equal(loginResponse.statusCode, 200);
  const login = envelope(loginResponse).data;
  const request = { action: 'works.save', payload: { work: work(), baseRevision: 0 } };
  const response = await handle(event(request, {
    headers: { 'cOnTeNt-TyPe': 'Application/JSON; charset=UTF-8', AUTHORIZATION: `bEaReR ${login.token}` },
    body: Buffer.from(JSON.stringify(request)).toString('base64'), isBase64Encoded: true
  }));
  assert.equal(response.statusCode, 200);
  assert.equal(envelope(response).data.work.id, 'cat-1');
  for (const flag of [false, 'false', true, 'true']) {
    const body = JSON.stringify({ action: 'works.list', payload: {} });
    const listed = await handle(event({}, {
      body: flag === true || flag === 'true' ? Buffer.from(body).toString('base64') : body,
      isBase64Encoded: flag,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${login.token}`, 'content-length': String(Buffer.byteLength(body)) }
    }));
    assert.equal(envelope(listed).ok, true);
  }
});

test('transport refuses other methods, direct invocations, query parameters and unsupported content types', async () => {
  const handle = handler(fixture());
  for (const httpMethod of ['GET', 'PUT', 'DELETE', 'OPTIONS', undefined, 123]) {
    const result = await handle(event({}, { httpMethod }));
    assert.equal(result.statusCode, 405);
    assert.equal(envelope(result).error.code, 'METHOD_NOT_ALLOWED');
  }
  for (const headers of [{}, { 'content-type': 'text/plain' }, { 'content-type': 'application/x-www-form-urlencoded' },
    { 'content-type': 'application/json', 'content-encoding': 'gzip' }]) {
    const result = await handle(event({}, { headers }));
    assert.equal(result.statusCode, 415);
    assert.equal(envelope(result).error.code, 'UNSUPPORTED_MEDIA_TYPE');
  }
  for (const queryStringParameters of [{ action: 'works.list' }, 'a=1', []]) {
    assert.equal(envelope(await handle(event({}, { queryStringParameters }))).error.code, 'INVALID_REQUEST');
  }
  assert.equal(envelope(await handle({ action: 'auth.login', payload: { code: 'alice' } })).error.code, 'METHOD_NOT_ALLOWED');
});

test('malformed bodies, invalid base64, invalid UTF-8 and bad payload shapes are sanitized', async () => {
  const handle = handler(fixture());
  for (const body of ['', '{', 'null', '[]', '"string"', '{"action":"auth.login","payload":null}', { action: 'auth.login' }]) {
    const response = await handle(event({}, { body }));
    assert.equal(response.statusCode, 400);
    assert.equal(envelope(response).error.code, 'INVALID_REQUEST');
    assert.doesNotMatch(JSON.stringify(response), /SyntaxError|Unexpected|stack/);
  }
  for (const body of ['!!!!', 'e30=extra', 'e3=0', Buffer.from([0xff, 0xfe]).toString('base64')]) {
    assert.equal(envelope(await handle(event({}, { body, isBase64Encoded: true }))).error.code, 'INVALID_REQUEST');
  }
  assert.equal(envelope(await handle(event({}, { isBase64Encoded: 'yes' }))).error.code, 'INVALID_REQUEST');
});

test('decoded body limits apply before JSON parsing, independent of declared content length', async () => {
  const handle = handler(fixture());
  const oversized = JSON.stringify({ action: 'auth.login', payload: { code: '字'.repeat(24000) } });
  for (const isBase64Encoded of [false, true]) {
    const response = await handle(event({}, {
      body: isBase64Encoded ? Buffer.from(oversized).toString('base64') : oversized,
      isBase64Encoded, headers: { 'content-type': 'application/json', 'content-length': '1' }
    }));
    assert.equal(response.statusCode, 413);
    assert.equal(envelope(response).error.code, 'PAYLOAD_TOO_LARGE');
  }
  for (const declared of ['-1', '12x', '65537', '1']) {
    const result = envelope(await handle(event({}, { headers: { 'content-type': 'application/json', 'content-length': declared } })));
    assert.equal(result.ok, false);
  }
});

test('header ambiguity, injection, arrays and excessive values are rejected', async () => {
  const handle = handler(fixture());
  const login = await fixture().login();
  for (const headers of [null, [], { 'content-type': ['application/json'] },
    { 'content-type': 'application/json', Authorization: `Bearer ${login.token}`, authorization: `Bearer ${login.token}` },
    { 'content-type': 'application/json', authorization: 'Bearer abc\r\nX-Admin: true' },
    { 'content-type': 'application/json', huge: 'x'.repeat(17000) }]) {
    const response = await handle(event({ action: 'works.list', payload: {} }, { headers }));
    assert.equal(envelope(response).error.code, 'INVALID_REQUEST');
  }
  for (const authorization of ['Basic abc', `Bearer ${login.token}, Bearer other`, `Bearer ${login.token} extra`]) {
    const response = await handle(event({ action: 'works.list', payload: {} }, {
      headers: { 'content-type': 'application/json', authorization }
    }));
    assert.equal(response.statusCode, 401);
    assert.equal(envelope(response).error.code, 'UNAUTHORIZED');
  }
});

test('HTTP conflict carries the contract envelope and only the current owner public work', async () => {
  const harness = fixture();
  const handle = handler(harness);
  const { token } = await harness.login();
  const request = event({ action: 'works.save', payload: { work: work(), baseRevision: 0 } }, {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  });
  assert.equal((await handle(request)).statusCode, 200);
  const conflict = await handle(request);
  assert.equal(conflict.statusCode, 409);
  assert.equal(envelope(conflict).error.code, 'CONFLICT');
  assert.equal(envelope(conflict).error.details.work.revision, 1);
  assert.doesNotMatch(conflict.body, /owner|clientId|_id/);
});
