# PixelStudio

A private, professional image workspace for **Atomic Agent**: generate with local Qwen/Krea models, refine images non-destructively, and organize your browser-local archive.

## Clone and run locally

Prerequisites:
- **Node.js 22.12 or newer** (Node.js 24 recommended).
- **pnpm 10**. If it is not installed, run `npm install -g pnpm@10.26.1`.
- Atomic Agent running on the **same machine**, with the image generation API enabled.

Clone this repository, open a terminal in its root, then:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173**. There is no `.env` file to create, and the image studio does not require a Replit account, database, cloud credentials, or the separate API-server package to run.

By default PixelStudio uses:

| Preset | Model field sent to Atomic Agent | Steps |
| --- | --- | --- |
| Qwen | `Qwen-Image-2.1-Turbo` | 14 |
| Krea | `Krea 2 Turbo` | 8 |

Endpoint: **http://127.0.0.1:1337/v1/images/generations**

Open **Settings** to change the endpoint, model identifiers, or steps, then save. Select the active preset in the studio. These are the user-provided model names, not verified universal Atomic Agent IDs: if your service uses another ID, enter that exact ID. Existing custom presets are retained; the two old built-in names are migrated automatically.

Start Atomic Agent separately, load the selected model, and use **Test connection** in Settings. This checks reachability without generating an image. A successful connection check does not prove a model is loaded; run a small generation to confirm.

## How the local connection works

When running on loopback, PixelStudio's local Vite server forwards generation, connection checks, and local returned image URLs to Atomic Agent. This same-origin connection does **not require browser CORS configuration**. Atomic Agent stays on your computer; requests are not sent through Replit.

The bridge supports literal `localhost`, loopback, and private LAN IPv4 targets (`10.*`, `172.16–31.*`, `192.168.*`). It rejects public destinations, URL credentials, and cross-site browser requests. The local UI server binds to `127.0.0.1` by default; do not expose it to an untrusted network.

Generation sends JSON with `prompt`, `model`, `steps`, `width`, `height`, and `n`. Supported responses:
- OpenAI-style `data[].b64_json` or `data[].url`.
- Top-level `b64_json`, `base64`, `image`, `url`, `image_url`, or `imageUrl`.
- Raw PNG, JPEG, WebP, or GIF response bytes.

URLs may be relative to the configured Atomic endpoint. Local image URLs use the same bridge. Invalid or unreadable image bytes are rejected before saving. Requests can remain open for long renders (up to 30 minutes of inactivity); progress stages and timing in the UI are illustrative estimates, not model telemetry.

## Local production build and preview

```sh
pnpm build:studio
pnpm preview:studio
```

Then open **http://127.0.0.1:5173**. Local production preview includes the Atomic bridge. Rebuild locally before previewing output built in a hosted environment. Serving the built files with an arbitrary static server will **not** provide the bridge.

For a different port, use `pnpm --filter @workspace/pixelstudio run dev --port 5174`. Managed Replit workflows still supply `PORT` and `BASE_PATH`; local defaults are port `5173` and base `/`.

## Hosted Replit preview

The managed preview remains supported. Its browser sends requests directly to your computer's Atomic Agent endpoint. A hosted server cannot access your computer via `127.0.0.1`; the local bridge is intentionally disabled in Replit.

Hosted browser-direct access may require Atomic Agent CORS configuration, browser local-network permission, and compatible HTTPS/loopback policies. If it is blocked, use the clone-and-run workflow above instead of exposing Atomic Agent publicly.

## Storage and exports

Images and metadata are stored in the existing **IndexedDB** archive; settings use localStorage. No gallery migration or asset deletion is required for this upgrade.

Storage belongs to each **browser origin**. A hosted preview gallery does not automatically appear in the localhost gallery, and changing the port changes the origin. Download important images before clearing browser data or changing computers. The editor creates a new rendered copy and preserves the original; output is capped at 2048 pixels on the longest side.

## Checks

```sh
pnpm test:studio
pnpm --filter @workspace/pixelstudio run typecheck
pnpm build:studio
```

The automated tests use controlled compatible image fixtures to verify local forwarding and client parsing; they are **not diffusion-model renders**. Actual Qwen/Krea generation requires your running Atomic Agent service.

## Troubleshooting

- **Offline / HTTP 502:** Start Atomic Agent, verify port `1337`, and confirm the endpoint in Settings.
- **HTTP 400/404/422:** Check the model ID and API request contract. PixelStudio displays the returned error rather than reporting a successful render.
- **HTTP 401/403:** The endpoint requires authorization or denies access. This setup does not supply authentication credentials; configure an appropriate trusted local endpoint.
- **Connection check HTTP 405:** The server is reachable but does not accept OPTIONS. Generate a small image to validate the actual image route.
- **No supported image / unreadable image:** Compare the response to the supported formats above. HTML error pages are not image responses.
- **Model still loading / timeout:** Check Atomic Agent's logs and GPU memory. Use a smaller frame or a lower batch count; estimated UI stages do not indicate actual server progress.
- **Port already occupied:** Stop the conflicting process or use the artifact's `--port` argument.
- **White/blank page:** Reload the browser and inspect its console. Start via `pnpm dev` or `pnpm preview:studio`, not by opening `index.html` as a file.
- **Assets missing:** Use the same browser and origin/port as before. Browser-local data is not a cloud account or file-system gallery.

## Repository

The studio lives in `artifacts/pixelstudio`. Other workspace packages are scaffold services; they are not needed for the local image workflow. Use studio-specific commands above instead of the workspace-wide build when you only need PixelStudio.
