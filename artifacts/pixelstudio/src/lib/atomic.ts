import type { Settings } from './studio';

export type GenerationInput = { prompt: string; width: number; height: number; count: number };
export type GeneratedImage = { blob: Blob; seed?: string | number; width: number; height: number };

export function usesLocalBridge() {
  return import.meta.env?.PIXELSTUDIO_LOCAL_BRIDGE !== false
    && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

export function connectionMode() {
  return usesLocalBridge() ? 'Local bridge · no CORS required' : 'Browser direct · CORS required';
}

export function validateEndpoint(endpoint: string) {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error('Enter a complete http:// or https:// Atomic Agent endpoint URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS endpoint without credentials in the URL.');
  }
  return url;
}

function targetUrl(endpoint: string, kind: 'generate' | 'test' | 'image') {
  validateEndpoint(endpoint);
  return usesLocalBridge()
    ? `${import.meta.env?.BASE_URL ?? '/'}__atomic/${kind}?target=${encodeURIComponent(endpoint)}`
    : endpoint;
}

async function checkedFetch(endpoint: string, kind: 'generate' | 'test' | 'image', init?: RequestInit) {
  try {
    return await fetch(targetUrl(endpoint, kind), init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw new Error('The connection check timed out. Confirm Atomic Agent is running on the configured port.');
    throw new Error(usesLocalBridge()
      ? 'Could not reach the local connection bridge. Start PixelStudio with pnpm dev and confirm Atomic Agent is running.'
      : 'The browser could not reach Atomic Agent. Confirm it is running on this computer and allows this browser origin (CORS/local-network permissions). Clone and run PixelStudio locally to use the CORS-free bridge.');
  }
}

async function responseError(response: Response) {
  const detail = (await response.text()).slice(0, 700);
  throw new Error(`Atomic Agent returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
}

export async function testConnection(endpoint: string): Promise<string> {
  const response = await checkedFetch(endpoint, 'test', {
    method: usesLocalBridge() ? 'GET' : 'OPTIONS',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok && response.status !== 405) await responseError(response);
  return `Atomic Agent is reachable (HTTP ${response.status}) via ${connectionMode().toLowerCase()}. This is a connection check, not a model render; generate an image to verify the model identifier and response.`;
}

function decodeBase64(value: string) {
  const raw = value.replace(/^data:image\/[^;]+;base64,/, '').replace(/\s/g, '');
  try { return new Blob([Uint8Array.from(atob(raw), (character) => character.charCodeAt(0))]); }
  catch { throw new Error('Atomic Agent returned invalid image base64. Check its image response format.'); }
}

async function inspectImage(blob: Blob): Promise<GeneratedImage> {
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  let mime = '';
  if (header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71) mime = 'image/png';
  else if (header[0] === 255 && header[1] === 216) mime = 'image/jpeg';
  else if (String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP') mime = 'image/webp';
  else if (String.fromCharCode(...header.slice(0, 3)) === 'GIF') mime = 'image/gif';
  if (!mime) throw new Error('Atomic Agent returned bytes that are not a supported PNG, JPEG, WebP, or GIF image.');
  const typed = new Blob([blob], { type: mime });
  try {
    const bitmap = await createImageBitmap(typed);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return { blob: typed, ...dimensions };
  } catch { throw new Error('Atomic Agent returned a damaged or unreadable image. No invalid image was saved.'); }
}

export async function generateImages(settings: Settings, input: GenerationInput): Promise<GeneratedImage[]> {
  if (!input.prompt.trim()) throw new Error('Add a prompt before starting a render.');
  if (![input.width, input.height, input.count].every(Number.isInteger)
    || input.width < 64 || input.height < 64 || input.width > 2048 || input.height > 2048 || input.count < 1 || input.count > 4) {
    throw new Error('Use whole-number dimensions from 64 to 2048 pixels and a batch of 1–4 images.');
  }
  const response = await checkedFetch(settings.endpoint, 'generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: input.prompt.trim(), model: settings.activeModel || settings.model,
      steps: settings.activeModel === settings.secondModel ? settings.secondSteps : settings.steps,
      width: input.width, height: input.height, n: input.count,
    }),
  });
  if (!response.ok) await responseError(response);
  if (response.headers.get('content-type')?.startsWith('image/')) {
    return [await inspectImage(await response.blob())];
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Atomic Agent returned an unsupported response. Expected image JSON or image bytes, not HTML or plain text.'); }
  const rows = Array.isArray(result?.data) && result.data.length ? result.data : [result];
  const images: GeneratedImage[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const base64 = row.b64_json || row.base64 || row.image;
    const url = row.url || row.image_url || row.imageUrl;
    let blob: Blob | undefined;
    if (typeof base64 === 'string') blob = decodeBase64(base64);
    else if (typeof url === 'string') {
      if (url.startsWith('data:image/')) blob = decodeBase64(url);
      else {
        const absolute = new URL(url, settings.endpoint).href;
        const imageResponse = await checkedFetch(absolute, 'image');
        if (!imageResponse.ok) await responseError(imageResponse);
        blob = await imageResponse.blob();
      }
    }
    if (blob) images.push({ ...await inspectImage(blob), seed: row.seed ?? result.seed });
  }
  if (!images.length) throw new Error('Atomic Agent responded without a supported image. Expected data[].b64_json, data[].url, a top-level image URL/base64, or image bytes.');
  return images;
}
