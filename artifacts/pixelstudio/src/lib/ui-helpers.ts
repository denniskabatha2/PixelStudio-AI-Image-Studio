import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Settings } from './studio';

export const STYLE_PROMPTS: [string, string][] = [
  ['Macro Lens Transformation', 'extreme macro lens, razor-thin focus plane, tactile micro-detail, soft falloff'],
  ['Anamorphic Cinematic Flare', 'anamorphic lens, horizontal amber lens flare, cinematic widescreen composition'],
  ['Volumetric Golden Hour Haze', 'low golden-hour sun, atmospheric volumetric haze, luminous dust in the air'],
  ['Moody Neo-Noir', 'neo-noir lighting, deep shadow, wet reflections, restrained crimson practical lights'],
  ['High-Speed Panning Blur', 'high-speed panning motion, directional background streaks, crisp moving subject'],
  ['Portra 400 Film', 'Portra 400 color response, gentle halation, fine film grain, warm natural skin tones'],
  ['Arctic Blue Hour', 'blue-hour ambience, cool cyan shadows, crisp air, delicate specular highlights'],
  ['Editorial Softbox', 'large diffused softbox, premium editorial art direction, elegant tonal transitions'],
  ['Hard Flash Snapshot', 'direct on-camera flash, crisp hard shadows, candid fashion editorial energy'],
  ['Rembrandt Portrait', 'Rembrandt key light, sculpted chiaroscuro, quiet intimate portrait framing'],
  ['Dreamlike Diffusion', 'subtle diffusion filter, bloom around highlights, delicate atmospheric softness'],
  ['Desert Heat Mirage', 'low desert sun, heat shimmer, sun-bleached palette, expansive negative space'],
  ['Rain-Soaked Tokyo', 'rain-slick Tokyo side street, reflected signage, layered night atmosphere'],
  ['Monochrome Silver Gelatin', 'silver gelatin monochrome, rich blacks, luminous midtones, archival print texture'],
  ['Prismatic Glass', 'prismatic glass refraction, split spectral highlights, controlled abstract color'],
  ['Studio Gradient Sweep', 'seamless studio sweep, precise product lighting, sculptural shadow design'],
  ['Faded 1970s Cinema', '1970s cinema color grade, muted ochre, lifted blacks, gentle film weave'],
  ['Underwater Caustics', 'underwater caustic light patterns, suspended particles, cool cinematic depth'],
  ['Dutch Angle Tension', 'subtle Dutch angle, dynamic asymmetrical framing, taut cinematic tension'],
  ['Painterly Light Trails', 'long-exposure light trails, painterly movement, still subject in a flowing scene'],
];

export const RATIO_OPTIONS = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '16:9', width: 1536, height: 864 },
  { label: '9:16', width: 864, height: 1536 },
  { label: '4:3', width: 1360, height: 1024 },
  { label: '21:0', width: 2048, height: 128 },
];

export const ENHANCE_SUFFIX = ', photographed with a 50mm prime lens, carefully composed with a clear focal hierarchy, directional cinematic key light, tactile surface detail, and a refined filmic color grade.';

export function activeSteps(settings: Settings) {
  return settings.activeModel === settings.secondModel ? settings.secondSteps : settings.steps;
}

export function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function glare(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType === 'touch') return;
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--pointer-x', `${event.clientX - bounds.left}px`);
  event.currentTarget.style.setProperty('--pointer-y', `${event.clientY - bounds.top}px`);
}
