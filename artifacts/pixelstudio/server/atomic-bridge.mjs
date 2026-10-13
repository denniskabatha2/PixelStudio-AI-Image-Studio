import http from 'node:http';
import https from 'node:https';

// This bridge is enabled only on a user's local Vite server, never in Replit.
// Restrict it to literal loopback/LAN addresses to prevent public-network SSRF.
export function validateLocalTarget(value) {
  const target = new URL(value);
  const host = target.hostname;
  const octets = host.split('.').map(Number);
  const ipv4 = octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
  const privateAddress = ipv4 && (octets[0] === 127 || octets[0] === 10
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
  if (!['http:', 'https:'].includes(target.protocol)
    || target.username || target.password
    || !(host === 'localhost' || host === '[::1]' || privateAddress)) {
    throw new Error('The local bridge accepts HTTP(S) loopback or private LAN IP addresses only, without URL credentials.');
  }
  return target;
}

function fail(res, status, message) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: message }));
}

export function createAtomicMiddleware(base = '/') {
  const prefix = `${base.replace(/\/?$/, '/')}__atomic/`;
  return async (req, res, next) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    if (!requestUrl.pathname.startsWith(prefix)) return next();
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers['sec-fetch-site'] === 'cross-site') return fail(res, 403, 'Cross-site access to the local bridge is blocked.');
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return fail(res, 403, 'Only the PixelStudio browser origin may use this local bridge.');
      } catch { return fail(res, 403, 'Invalid browser origin.'); }
    }
    const action = requestUrl.pathname.slice(prefix.length);
    if (!['generate', 'test', 'image'].includes(action)) return fail(res, 404, 'Unknown Atomic Agent bridge operation.');
    if (req.method !== (action === 'generate' ? 'POST' : 'GET')) return fail(res, 405, 'Unsupported method for this bridge operation.');
    let target;
    try { target = validateLocalTarget(requestUrl.searchParams.get('target') || ''); }
    catch (cause) { return fail(res, 400, cause.message || 'Invalid Atomic Agent endpoint.'); }
    let body;
    if (action === 'generate') {
      const chunks = [];
      let size = 0;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 256 * 1024) return fail(res, 413, 'Generation request exceeds 256 KB.');
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
        JSON.parse(body.toString('utf8'));
      } catch { return fail(res, 400, 'Expected a valid JSON generation request.'); }
    }
    const client = target.protocol === 'https:' ? https : http;
    const upstream = client.request(target, {
      method: action === 'generate' ? 'POST' : action === 'test' ? 'OPTIONS' : 'GET',
      headers: body
        ? { 'Content-Type': 'application/json', 'Content-Length': body.length, Accept: 'application/json, image/*' }
        : { Accept: action === 'image' ? 'image/*' : '*/*' },
    }, (response) => {
      if (res.destroyed) { response.destroy(); return; }
      res.writeHead(response.statusCode || 502, {
        'Content-Type': response.headers['content-type'] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    upstream.setTimeout(action === 'test' ? 8000 : 30 * 60 * 1000, () => {
      fail(res, 504, 'Atomic Agent timed out. Confirm it is running and check its model logs.');
      upstream.destroy();
    });
    upstream.on('error', () => {
      fail(res, 502, 'Atomic Agent is offline or unreachable. Start it and verify the configured host and port.');
    });
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy();
    });
    upstream.end(body);
  };
}

export function atomicBridgePlugin(base = '/') {
  return {
    name: 'pixelstudio-local-atomic-bridge',
    configureServer(server) { server.middlewares.use(createAtomicMiddleware(base)); },
    configurePreviewServer(server) { server.middlewares.use(createAtomicMiddleware(base)); },
  };
}
