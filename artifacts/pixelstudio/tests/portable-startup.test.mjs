import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { once } from 'node:events';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const vite = fileURLToPath(new URL('../../bin/vite.js', import.meta.resolve('vite')));
const localEnv = { ...process.env };
delete localEnv.PORT;
delete localEnv.BASE_PATH;
delete localEnv.REPL_ID;
localEnv.NODE_ENV = 'production';

async function unusedPort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}

function start(args) {
  const child = spawn(process.execPath, [vite, ...args, '--config', 'vite.config.ts'], { cwd, env: localEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return { child, output: () => output };
}

async function waitFor(origin, processInfo) {
  for (let i = 0; i < 100; i++) {
    if (processInfo.child.exitCode !== null) throw new Error(processInfo.output());
    try {
      const res = await fetch(origin);
      if (res.ok) return await res.text();
    } catch { /* Wait for the ephemeral test server to start. */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Local server did not start: ${processInfo.output()}`);
}

async function stop(info) {
  if (info.child.exitCode === null) {
    const done = once(info.child, 'exit');
    info.child.kill('SIGTERM');
    await done;
  }
}

test('local development and production preview start without Replit env and forward Atomic requests', { timeout: 90000 }, async () => {
  const fixture = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ b64_json: 'fixture', seed: data.steps }] }));
  });
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  const target = `http://127.0.0.1:${fixture.address().port}/v1/images/generations`;
  let running;
  try {
    const build = start(['build']);
    const [code] = await once(build.child, 'exit');
    assert.equal(code, 0, build.output());
    for (const command of ['dev', 'preview']) {
      const port = await unusedPort();
      running = start([command, '--port', String(port)]);
      const origin = `http://127.0.0.1:${port}`;
      const html = await waitFor(origin, running);
      assert.match(html, /PixelStudio/);
      assert.equal((await fetch(`${origin}/gallery`)).status, 200);
      const check = await fetch(`${origin}/__atomic/test?target=${encodeURIComponent(target)}`);
      assert.equal(check.status, 204, await check.text());
      const generated = await fetch(`${origin}/__atomic/generate?target=${encodeURIComponent(target)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'Qwen-Image-2.1-Turbo', steps: 14, width: 1024, height: 1024, n: 1, prompt: 'portable fixture' }),
      });
      assert.equal(generated.status, 200);
      assert.equal((await generated.json()).data[0].seed, 14);
      await stop(running);
      running = undefined;
    }
  } finally {
    if (running) await stop(running);
    await new Promise((r) => fixture.close(r));
  }
});
