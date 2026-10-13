import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { generateImages, testConnection, connectionMode } from '../src/lib/atomic.ts';
import { DEFAULT_SETTINGS, readSettings } from '../src/lib/studio.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let saved = '{}';
beforeEach(() => {
  globalThis.window = { location: { hostname: 'localhost' } };
  globalThis.localStorage = { getItem: () => saved };
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  saved = '{}';
});

test('correct defaults and exact legacy-name migration preserve custom settings', () => {
  assert.equal(readSettings().model, 'Qwen-Image-2.1-Turbo');
  assert.equal(readSettings().secondModel, 'Krea 2 Turbo');
  saved = JSON.stringify({ model: 'Qwen Image 2.2 Turbo', activeModel: 'Kreaturbo2 12B', secondModel: 'Kreaturbo2 12B', steps: 19 });
  assert.deepEqual(readSettings(), { ...DEFAULT_SETTINGS, activeModel: 'Krea 2 Turbo', steps: 19 });
  saved = JSON.stringify({ model: 'my-custom-qwen', activeModel: 'my-custom-qwen', secondModel: 'my-custom-krea', endpoint: 'http://localhost:9999/generate', steps: 25 });
  assert.equal(readSettings().model, 'my-custom-qwen');
  assert.equal(readSettings().steps, 25);
  assert.equal(readSettings().endpoint, 'http://localhost:9999/generate');
});

test('malformed settings recover and invalid step values are bounded', () => {
  saved = 'bad json';
  assert.deepEqual(readSettings(), DEFAULT_SETTINGS);
  saved = JSON.stringify({ steps: -8, secondSteps: 999, model: null });
  assert.equal(readSettings().steps, 1);
  assert.equal(readSettings().secondSteps, 100);
  assert.equal(readSettings().model, DEFAULT_SETTINGS.model);
});

test('generation sends corrected model/steps and records actual image dimensions', async () => {
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return Response.json({ data: [{ b64_json: png, seed: 42 }] });
  };
  const images = await generateImages({ ...DEFAULT_SETTINGS, activeModel: 'Krea 2 Turbo' }, { prompt: 'Test scene', width: 1024, height: 1024, count: 2 });
  assert.match(request.url, /^\/__atomic\/generate\?target=/);
  assert.deepEqual(request.body, { prompt: 'Test scene', model: 'Krea 2 Turbo', steps: 8, width: 1024, height: 1024, n: 2 });
  assert.equal(images[0].blob.type, 'image/png');
  assert.equal(images[0].width, 1);
  assert.equal(images[0].height, 1);
  assert.equal(images[0].seed, 42);
});

test('relative returned URLs are resolved against Atomic and fetched through bridge', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return calls.length === 1 ? Response.json({ data: [{ url: '/output/frame.png' }] }) : new Response(Buffer.from(png, 'base64'));
  };
  await generateImages(DEFAULT_SETTINGS, { prompt: 'URL fixture', width: 64, height: 64, count: 1 });
  assert.match(calls[1], /__atomic\/image\?/);
  assert.equal(new URL(calls[1], 'http://localhost').searchParams.get('target'), 'http://127.0.0.1:1337/output/frame.png');
});

test('unsupported responses, invalid images, failed HTTP and invalid inputs fail explicitly', async () => {
  const input = { prompt: 'fixture', width: 64, height: 64, count: 1 };
  globalThis.fetch = async () => Response.json({ data: [] });
  await assert.rejects(generateImages(DEFAULT_SETTINGS, input), /without a supported image/);
  globalThis.fetch = async () => Response.json({ b64_json: Buffer.from('not an image').toString('base64') });
  await assert.rejects(generateImages(DEFAULT_SETTINGS, input), /not a supported/);
  globalThis.fetch = async () => new Response('Model missing', { status: 422 });
  await assert.rejects(generateImages(DEFAULT_SETTINGS, input), /422: Model missing/);
  await assert.rejects(generateImages(DEFAULT_SETTINGS, { ...input, width: 4096 }), /dimensions/);
});

test('connection check is honest about reachability vs model rendering', async () => {
  globalThis.fetch = async () => new Response(null, { status: 405 });
  assert.match(await testConnection(DEFAULT_SETTINGS.endpoint), /not a model render/);
  globalThis.fetch = async () => new Response('Offline', { status: 502 });
  await assert.rejects(testConnection(DEFAULT_SETTINGS.endpoint), /502/);
  globalThis.window.location.hostname = 'studio.example.com';
  assert.match(connectionMode(), /CORS required/);
});
