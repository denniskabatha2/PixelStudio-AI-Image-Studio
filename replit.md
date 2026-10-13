# PixelStudio

A private AI image studio for the user's local Atomic Agent diffusion models.

## Run & Operate

- Managed Replit preview: `artifacts/pixelstudio: web`.
- Local clone: `pnpm install --frozen-lockfile`, then `pnpm dev`.
- Local production build/preview: `pnpm build:studio`, then `pnpm preview:studio`.
- Focused type check: `pnpm --filter @workspace/pixelstudio run typecheck`.
- Focused automated checks: `pnpm test:studio`.
- See `README.md` for prerequisites, exact setup and troubleshooting.
- The image workflow requires no database, authentication, cloud keys, or API-server workflow.

## Stack and Layout

- pnpm workspace, React 19, Vite 7, TypeScript; browser-local IndexedDB assets and localStorage settings.
- `artifacts/pixelstudio/src/components`: creation, gallery, asset editor, settings, app shell.
- `artifacts/pixelstudio/src/hooks`: shared studio state and object URL lifecycle.
- `artifacts/pixelstudio/src/lib`: storage/settings, Atomic transport, UI helpers.
- `artifacts/pixelstudio/server`: local-only Vite bridge middleware.
- `artifacts/pixelstudio/tests`: client contract, bridge, and portable startup tests.
- Other API/database workspace packages remain scaffold services, not part of the local image workflow.

## Architecture Decisions

- Local Vite development and preview servers provide same-origin forwarding to Atomic Agent. It is deliberately disabled in Replit; a hosted machine cannot connect to the user's loopback endpoint.
- Local forwarding accepts loopback/private IPv4 destinations and same-origin requests only. Do not turn it into a public unauthenticated proxy.
- Preserve the existing IndexedDB database/schema and user assets. Downloads and edited copies do not modify originals.
- Progress stages are illustrative estimates, not telemetry from the Atomic service.

## User Requirements

- Substantially professional, enterprise-quality UI retaining the requested dark obsidian/glass cyan-violet identity.
- Clone-and-run local use against `http://127.0.0.1:1337/v1/images/generations`.
- Corrected model presets: `Qwen-Image-2.1-Turbo` at 14 steps; `Krea 2 Turbo` at 8 steps. Keep IDs editable for the user's exact Atomic setup.

## Gotchas

- Settings migrations change only exact older built-in model names, never arbitrary custom IDs.
- Changing browser origin/port creates a separate browser-local gallery. Assets are not synced between Replit and localhost.
- Local defaults must remain portable; do not reintroduce mandatory Replit env vars, Unix-only install scripts, or Linux-only native package exclusions.
- Test fixtures verify application transport, not real diffusion-model rendering.
