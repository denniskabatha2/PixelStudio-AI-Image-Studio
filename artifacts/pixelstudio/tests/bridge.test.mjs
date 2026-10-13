import assert from 'node:assert/strict';
import http from 'node:http';
import { test, before, after } from 'node:test';
import { createAtomicMiddleware, validateLocalTarget } from '../server/atomic-bridge.mjs';

let upstream, bridge, endpoint, origin;
let lastRequest;
before(async () => {
  upstream = http.createServer(async (req, res) => {
    lastRequest = { method: req.method, url: req.url, body: '' };
    for await (const chunk of req) lastRequest.body += chunk;
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.url === '/output.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end('fixture'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ b64_json: 'fixture' }] }));
  });
  bridge = http.createServer((req, res) => createAtomicMiddleware('/')(req, res, () => { res.writeHead(404); res.end(); }));
  await Promise.all([new Promise((r) => upstream.listen(0, '127.0.0.1', r)), new Promise((r) => bridge.listen(0, '127.0.0.1', r))]);
  endpoint = `http://127.0.0.1:${upstream.address().port}/v1/images/generations`;
  origin = `http://127.0.0.1:${bridge.address().port}`;
});
after(async () => {
  await Promise.all([new Promise((r) => upstream.close(r)), new Promise((r) => bridge.close(r))]);
});
const route = (kind, target = endpoint) => `${origin}/__atomic/${kind}?target=${encodeURIComponent(target)}`;

test('local bridge forwards JSON without changing model request fields', async () => {
  const body = { model: 'Qwen-Image-2.1-Turbo', steps: 14, prompt: 'Bridge test', width: 1024, height: 1024, n: 1 };
  const res = await fetch(route('generate'), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(lastRequest.body), body);
  assert.equal(lastRequest.url, '/v1/images/generations');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('connection checks and returned image URLs use same-origin forwarding', async () => {
  assert.equal((await fetch(route('test'))).status, 204);
  assert.equal(lastRequest.method, 'OPTIONS');
  const res = await fetch(route('image', new URL('/output.png', endpoint).href));
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(await res.text(), 'fixture');
});

test('offline service returns a clear 502 error', async () => {
  const closed = http.createServer();
  await new Promise((r) => closed.listen(0, '127.0.0.1', r));
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  const res = await fetch(route('test', `http://127.0.0.1:${port}/v1/images/generations`));
  assert.equal(res.status, 502);
  assert.match(await res.text(), /offline or unreachable/);
});

test('bridge rejects public targets, wrong origins, methods and malformed JSON', async () => {
  assert.equal((await fetch(route('test', 'https://example.com/'))).status, 400);
  assert.equal((await fetch(route('test'), { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(route('generate'))).status, 405);
  assert.equal((await fetch(route('generate'), { method: 'POST', body: 'bad json' })).status, 400);
  assert.throws(() => validateLocalTarget('http://169.254.169.254/latest/'), /private LAN/);
  assert.throws(() => validateLocalTarget('http://user:password@localhost/'), /credentials/);
  assert.equal(validateLocalTarget('http://192.168.1.10:1337/').hostname, '192.168.1.10');
});
