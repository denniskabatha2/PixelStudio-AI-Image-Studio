import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import {
  Aperture,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  ExternalLink,
  Eye,
  FileImage,
  Heart,
  Images,
  LoaderCircle,
  Minus,
  Plus,
  ScanLine,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';

type Asset = {
  id: string;
  blob: Blob;
  prompt: string;
  createdAt: number;
  width: number;
  height: number;
  bytes: number;
  seed?: string | number;
  model: string;
  steps: number;
  favorite: boolean;
  kind: 'generated' | 'edited';
  edits?: Record<string, number | string | boolean>;
  parentId?: string;
};

type Settings = {
  endpoint: string;
  model: string;
  steps: number;
  secondModel: string;
  secondSteps: number;
  activeModel: string;
};

type EditState = {
  exposure: number;
  contrast: number;
  sharpening: number;
  grading: string;
  grain: number;
  blur: number;
  watermark: boolean;
  scale: number;
};

const DEFAULT_SETTINGS: Settings = {
  endpoint: 'http://127.0.0.1:1337/v1/images/generations',
  model: 'Qwen Image 2.2 Turbo',
  steps: 14,
  secondModel: 'Kreaturbo2 12B',
  secondSteps: 8,
  activeModel: 'Qwen Image 2.2 Turbo',
};

const STYLE_PROMPTS = [
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

const RATIO_OPTIONS = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '16:9', width: 1536, height: 864 },
  { label: '9:16', width: 864, height: 1536 },
  { label: '4:3', width: 1360, height: 1024 },
  { label: '21:0', width: 2048, height: 128 },
];

const DEFAULT_EDIT: EditState = {
  exposure: 0,
  contrast: 100,
  sharpening: 0,
  grading: 'Neutral',
  grain: 0,
  blur: 0,
  watermark: false,
  scale: 100,
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pixelstudio-assets', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeAsset(asset: Asset) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('assets', 'readwrite');
    tx.objectStore('assets').put(asset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readAssets(): Promise<Asset[]> {
  const db = await openDatabase();
  const assets = await new Promise<Asset[]>((resolve, reject) => {
    const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
    request.onsuccess = () => resolve(request.result as Asset[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return assets.sort((a, b) => b.createdAt - a.createdAt);
}

async function removeAssets(ids: string[]) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('assets', 'readwrite');
    ids.forEach((id) => tx.objectStore('assets').delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function saveBlob(asset: Asset, blob: Blob) {
  await storeAsset({ ...asset, blob, bytes: blob.size, createdAt: Date.now() });
}

function readSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('pixelstudio-settings') || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateGlarePosition(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType === 'touch') return;
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--pointer-x', `${event.clientX - bounds.left}px`);
  event.currentTarget.style.setProperty('--pointer-y', `${event.clientY - bounds.top}px`);
}

function objectUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}

function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAssets(await readAssets());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read your local image library.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { assets, loading, error, refresh, setAssets };
}

function App() {
  const [settings, setSettings] = useState<Settings>(readSettings);
  const { assets, loading: assetsLoading, refresh, setAssets } = useAssets();
  const [path] = useLocation();
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [progress, setProgress] = useState<{ stage: string; elapsed: number; estimateSeconds: number } | null>(null);
  const [progressMinimized, setProgressMinimized] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [working, setWorking] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const estimateSecondsRef = useRef(60);

  useEffect(() => {
    localStorage.setItem('pixelstudio-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!working) return;
    const stages = [
      'Preparing your prompt',
      'De-noising latent space...',
      'Calculating volumetric lighting maps...',
      'Applying fine surface detail...',
      'Upscaling to 2K resolution...',
    ];
    let elapsed = 0;
    timerRef.current = window.setInterval(() => {
      elapsed += 1;
      const stageIndex = elapsed < 10 ? 0 : elapsed < 45 ? 1 : elapsed < 120 ? 2 : elapsed < 360 ? 3 : 4;
      setProgress({ stage: stages[stageIndex], elapsed, estimateSeconds: estimateSecondsRef.current });
    }, 1000);
    return () => window.clearInterval(timerRef.current);
  }, [working]);

  const notify = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3500);
  }, []);

  const generate = useCallback(async (input: { prompt: string; width: number; height: number; count: number }) => {
    if (!input.prompt.trim()) {
      setGenerationError('Add a prompt before starting a render.');
      return;
    }
    estimateSecondsRef.current = Math.max(input.width, input.height) >= 1536 ? 960 : 60;
    setWorking(true);
    setProgress({ stage: 'Preparing your prompt', elapsed: 0, estimateSeconds: estimateSecondsRef.current });
    setProgressMinimized(false);
    setGenerationError('');
    try {
      const response = await fetch(settings.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: input.prompt,
          model: settings.activeModel || settings.model,
          steps: settings.activeModel === settings.secondModel ? settings.secondSteps : settings.steps,
          width: input.width,
          height: input.height,
          n: input.count,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Endpoint returned ${response.status}${message ? `: ${message.slice(0, 500)}` : ''}`);
      }
      const result = await response.json();
      let results: { blob: Blob; seed?: string | number }[] = [];
      const rows = Array.isArray(result.data) ? result.data : [];
      for (const row of rows) {
        if (typeof row.b64_json === 'string') {
          const raw = row.b64_json.replace(/^data:image\/[^;]+;base64,/, '');
          const bytes = Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
          results.push({ blob: new Blob([bytes], { type: 'image/png' }), seed: row.seed });
        } else if (typeof row.url === 'string') {
          const imageResponse = await fetch(row.url);
          if (!imageResponse.ok) throw new Error(`Image URL returned ${imageResponse.status}.`);
          results.push({ blob: await imageResponse.blob(), seed: row.seed });
        }
      }
      const topUrl = result.url || result.image_url || result.imageUrl;
      const topB64 = result.b64_json || result.image || result.base64;
      if (!results.length && typeof topUrl === 'string') {
        const imageResponse = await fetch(topUrl);
        if (!imageResponse.ok) throw new Error(`Image URL returned ${imageResponse.status}.`);
        results.push({ blob: await imageResponse.blob(), seed: result.seed });
      } else if (!results.length && typeof topB64 === 'string') {
        const raw = topB64.replace(/^data:image\/[^;]+;base64,/, '');
        const bytes = Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
        results.push({ blob: new Blob([bytes], { type: 'image/png' }), seed: result.seed });
      }
      if (!results.length) {
        throw new Error('The endpoint responded, but no supported image was found. Expected data[].b64_json, data[].url, or a top-level image URL/base64 result.');
      }
      const newAssets: Asset[] = [];
      for (const image of results) {
        const asset: Asset = {
          id: crypto.randomUUID(),
          blob: image.blob,
          prompt: input.prompt,
          createdAt: Date.now(),
          width: input.width,
          height: input.height,
          bytes: image.blob.size,
          seed: image.seed,
          model: settings.activeModel || settings.model,
          steps: settings.activeModel === settings.secondModel ? settings.secondSteps : settings.steps,
          favorite: false,
          kind: 'generated',
        };
        await storeAsset(asset);
        newAssets.push(asset);
      }
      setAssets((current) => [...newAssets, ...current]);
      notify(`${newAssets.length} ${newAssets.length === 1 ? 'image' : 'images'} ready and saved locally.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Image generation failed.';
      setGenerationError(`${message}${message.includes('fetch') ? ' Check the local endpoint and its browser CORS settings.' : ''}`);
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }, [notify, setAssets, settings]);

  const toggleFavorite = useCallback(async (asset: Asset) => {
    const updated = { ...asset, favorite: !asset.favorite };
    await storeAsset(updated);
    setAssets((current) => current.map((item) => item.id === asset.id ? updated : item));
  }, [setAssets]);

  const downloadAsset = useCallback((asset: Asset) => {
    const url = objectUrl(asset.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pixelstudio-${asset.id.slice(0, 8)}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const deleteAssets = useCallback(async (ids: string[]) => {
    if (!ids.length || !window.confirm(`Permanently delete ${ids.length} selected ${ids.length === 1 ? 'image' : 'images'} from this browser?`)) return;
    await removeAssets(ids);
    setAssets((current) => current.filter((asset) => !ids.includes(asset.id)));
    notify(`${ids.length} image${ids.length === 1 ? '' : 's'} deleted.`);
  }, [notify, setAssets]);

  const currentTitle = path === '/gallery' ? 'Your gallery' : path === '/settings' ? 'Studio settings' : 'Image studio';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" data-testid="link-brand">
          <span className="brand-mark"><Aperture size={20} /></span>
          <span><span className="brand-name">PixelStudio</span><span className="brand-sub">Local image suite</span></span>
        </Link>
        <div className="nav-label">Workspace</div>
        <nav className="nav-stack">
          <Link href="/" className={`nav-link ${path === '/' ? 'active' : ''}`} data-testid="link-studio"><WandSparkles size={17} />Create</Link>
          <Link href="/gallery" className={`nav-link ${path === '/gallery' ? 'active' : ''}`} data-testid="link-gallery"><Images size={17} />Gallery</Link>
          <Link href="/settings" className={`nav-link ${path === '/settings' ? 'active' : ''}`} data-testid="link-settings"><Settings2 size={17} />Settings</Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge"><span className="local-dot" />Local library · IndexedDB</div>
        </div>
      </aside>
      <main className="shell-main">
        <header className="topbar">
          <div className="crumb"><span>PIXELSTUDIO</span><ChevronRight size={12} /><strong>{currentTitle}</strong></div>
          <div className="topbar-right">
            <span className="endpoint-indicator"><span className="local-dot" />{settings.endpoint}</span>
          </div>
        </header>
        <Switch>
          <Route path="/">
            <StudioPage
              settings={settings}
              onSettingsChange={setSettings}
              onGenerate={generate}
              busy={working}
              progress={progress}
              onMinimizeProgress={() => setProgressMinimized(true)}
              error={generationError}
              onClearError={() => setGenerationError('')}
              latest={assets[0]}
              onDownload={downloadAsset}
              onNotify={notify}
            />
          </Route>
          <Route path="/gallery">
            <GalleryPage assets={assets} loading={assetsLoading} onToggleFavorite={toggleFavorite} onDelete={deleteAssets} onDownload={downloadAsset} onRefresh={refresh} onNotify={notify} />
          </Route>
          <Route path="/settings">
            <SettingsPage settings={settings} onChange={setSettings} onNotify={notify} />
          </Route>
          <Route>
            <NotFoundPage />
          </Route>
        </Switch>
      </main>
      {working && progress && progressMinimized && (
        <button className="floating-progress" onClick={() => setProgressMinimized(false)} data-testid="button-expand-progress">
          <strong><LoaderCircle size={13} className="spin-icon" /> Rendering · {progress.elapsed}s elapsed</strong>
          <span>{progress.stage} · click to expand</span>
        </button>
      )}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => <div className="toast" key={toast.id} data-testid={`status-toast-${toast.id}`}><Check size={15} />{toast.message}</div>)}
      </div>
    </div>
  );
}

function StudioPage({ settings, onSettingsChange, onGenerate, busy, progress, onMinimizeProgress, error, onClearError, latest, onDownload, onNotify }: {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onGenerate: (input: { prompt: string; width: number; height: number; count: number }) => Promise<void>;
  busy: boolean;
  progress: { stage: string; elapsed: number; estimateSeconds: number } | null;
  onMinimizeProgress: () => void;
  error: string;
  onClearError: () => void;
  latest?: Asset;
  onDownload: (asset: Asset) => void;
  onNotify: (message: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [ratio, setRatio] = useState('1:1');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [count, setCount] = useState(1);
  const [enhanced, setEnhanced] = useState(false);
  const latestUrl = useMemo(() => latest ? objectUrl(latest.blob) : '', [latest]);
  useEffect(() => () => { if (latestUrl) URL.revokeObjectURL(latestUrl); }, [latestUrl]);

  const chooseRatio = (choice: typeof RATIO_OPTIONS[number]) => {
    setRatio(choice.label);
    setWidth(choice.width);
    setHeight(choice.height);
  };

  const enhancePrompt = () => {
    if (!prompt.trim()) {
      onNotify('Write a subject or scene first, then enhance the prompt.');
      return;
    }
    if (enhanced) {
      setPrompt((value) => value.replace(/, photographed with a 50mm prime lens, carefully composed with a clear focal hierarchy, directional cinematic key light, tactile surface detail, and a refined filmic color grade\.$/, '.'));
      setEnhanced(false);
      return;
    }
    setPrompt((value) => `${value.trim().replace(/[.,\s]+$/, '')}, photographed with a 50mm prime lens, carefully composed with a clear focal hierarchy, directional cinematic key light, tactile surface detail, and a refined filmic color grade.`);
    setEnhanced(true);
  };

  const chooseStyle = (name: string, suffix: string) => {
    setSelectedStyle(name);
    setPrompt((value) => value.trim() ? `${value.trim().replace(/[.,\s]+$/, '')}, ${suffix}` : suffix);
  };

  return (
    <div className="work-area">
      <div className="page-heading">
        <div>
          <div className="eyebrow">A private space for making images</div>
          <h1>Make the image<br />you can almost see.</h1>
          <p className="heading-copy">Direct your local model, shape a frame, then refine the final image without changing the original.</p>
        </div>
        <div className="tiny-mono">LOCAL MODELS · YOUR FILES STAY HERE</div>
      </div>
      <div className="studio-grid">
        <section className="panel control-panel" onPointerMove={updateGlarePosition}>
          <div className="panel-title"><h2>01 / Describe the frame</h2><span className="tiny-mono">PROMPT</span></div>
          <label className="field-label" htmlFor="prompt-input">Image prompt<span className="field-note">Specificity rewards you</span></label>
          <textarea
            className="text-field"
            id="prompt-input"
            placeholder="A quiet greenhouse after rain, glass panes catching the last apricot light…"
            value={prompt}
            onChange={(event) => { setPrompt(event.target.value); setEnhanced(false); }}
            data-testid="input-prompt"
          />
          <div className="control-row" style={{ marginTop: 8 }}>
            <button className="secondary-button" type="button" onClick={enhancePrompt} data-testid="button-enhance-prompt"><Sparkles size={14} />{enhanced ? 'Undo enhancement' : 'Enhance prompt'}</button>
            <span className="field-note" style={{ alignSelf: 'center', textAlign: 'right' }}>Camera · lens · light · texture</span>
          </div>
          <div className="field-label">Cinematic treatments<span className="field-note">20 quick directions</span></div>
          <div className="style-grid">
            {STYLE_PROMPTS.map(([name, suffix]) => (
              <button key={name} className={`style-chip ${selectedStyle === name ? 'selected' : ''}`} onClick={() => chooseStyle(name, suffix)} data-testid={`button-style-${name.toLowerCase().replaceAll(' ', '-')}`}>{name}</button>
            ))}
          </div>
          <div className="field-label">Model and steps<Link href="/settings" className="field-note">EDIT PRESETS <ExternalLink size={10} /></Link></div>
          <div className="control-row">
            <div><div className="tiny-mono" style={{ marginBottom: 5 }}>ACTIVE MODEL</div><select className="select-field" value={settings.activeModel || settings.model} onChange={(event) => onSettingsChange({ ...settings, activeModel: event.target.value })} data-testid="select-active-model"><option value={settings.model}>{settings.model}</option>{settings.secondModel !== settings.model && <option value={settings.secondModel}>{settings.secondModel}</option>}</select></div>
            <div><div className="tiny-mono" style={{ marginBottom: 5 }}>STEPS</div><div className="select-field">{settings.activeModel === settings.secondModel ? settings.secondSteps : settings.steps} steps</div></div>
          </div>
          <div className="field-label">Frame shape</div>
          <div className="ratio-row">
            {RATIO_OPTIONS.map((item) => <button key={item.label} className={`ratio-button ${ratio === item.label ? 'selected' : ''}`} onClick={() => chooseRatio(item)} data-testid={`button-ratio-${item.label}`}>{item.label}</button>)}
          </div>
          <div className="dimensions">
            <span className="tiny-mono">CUSTOM</span>
            <input className="number-field" type="number" min="64" max="2048" step="64" value={width} onChange={(event) => { setWidth(Math.min(2048, Math.max(64, Number(event.target.value)))); setRatio('custom'); }} aria-label="Image width" data-testid="input-width" />
            <span>×</span>
            <input className="number-field" type="number" min="64" max="2048" step="64" value={height} onChange={(event) => { setHeight(Math.min(2048, Math.max(64, Number(event.target.value)))); setRatio('custom'); }} aria-label="Image height" data-testid="input-height" />
            <span className="field-note">max 2K</span>
          </div>
          <div className="field-label">Variations <span className="field-note">One request, multiple frames</span></div>
          <div className="stepper"><button onClick={() => setCount((value) => Math.max(1, value - 1))} aria-label="Fewer variations" data-testid="button-count-minus"><Minus size={13} /></button><output>{count}</output><button onClick={() => setCount((value) => Math.min(4, value + 1))} aria-label="More variations" data-testid="button-count-plus"><Plus size={13} /></button></div>
          <button className="primary-button" onClick={() => void onGenerate({ prompt, width, height, count })} disabled={busy} data-testid="button-generate"><WandSparkles size={16} />{busy ? 'Rendering locally…' : 'Generate image'}<span style={{ marginLeft: 'auto', font: '10px var(--app-font-mono)', opacity: .8 }}>{width} × {height}</span></button>
          {error && <div className="error-banner" role="alert" data-testid="status-generation-error"><CircleAlert size={16} /><span><strong>Render didn’t finish.</strong><br />{error}<br /><button className="quiet-button" onClick={onClearError} data-testid="button-dismiss-error">Dismiss and try again</button></span></div>}
        </section>
        <section className="panel preview-panel" onPointerMove={updateGlarePosition}>
          <div className="preview-head"><h2>02 / Image preview</h2><span className="tiny-mono">{latest ? `${latest.width} × ${latest.height} PX` : 'AWAITING FIRST FRAME'}</span></div>
          {busy ? (
            <div className="generation-visualizer">
              <div className="neural-field" aria-hidden="true">
                {Array.from({ length: 38 }, (_, index) => (
                  <span
                    className="neural-node"
                    key={index}
                    style={{
                      left: `${(index * 37 + 11) % 97}%`,
                      top: `${(index * 53 + 7) % 91}%`,
                      animationDelay: `${(index % 9) * -0.28}s`,
                    }}
                  />
                ))}
              </div>
              <div className="generation-stage-copy">
                <div className="render-orbit"><Aperture size={29} /><span /></div>
                <div className="tiny-mono">LOCAL RENDER · {progress?.elapsed ?? 0}S ELAPSED</div>
                <h3>{progress?.stage ?? 'Preparing your prompt'}</h3>
                <p>{progress && progress.elapsed < progress.estimateSeconds ? `About ${progress.estimateSeconds - progress.elapsed} seconds remaining` : 'The render is still running; timing can vary by model.'}</p>
                <div className="render-progress-track"><span /></div>
                <button className="secondary-button" onClick={onMinimizeProgress} data-testid="button-minimize-progress"><Minus size={14} />Continue in background</button>
              </div>
            </div>
          ) : latest && latestUrl ? (
            <div className="generated-preview">
              <img src={latestUrl} alt={latest.prompt} data-testid="img-latest-generation" />
              <div className="preview-actions">
                <button onClick={() => onDownload(latest)} aria-label="Download latest image" data-testid="button-download-latest"><Download size={15} /></button>
              </div>
              <div className="preview-bottom"><span>{latest.model} · {latest.steps} steps</span><span>{formatBytes(latest.bytes)} · SAVED LOCALLY</span></div>
            </div>
          ) : (
            <div className="preview-empty">
              <div className="empty-inner">
                <div className="empty-art"><ScanLine size={43} strokeWidth={1.2} /></div>
                <h3>Your next frame starts here.</h3>
                <p>Choose a subject, find its light, and send it to your local model. Finished images appear here and are saved in your browser.</p>
                <div className="tiny-mono">NO CLOUD UPLOADS · NO FILE LIMIT SURPRISES</div>
              </div>
            </div>
          )}
        </section>
      </div>
      <div className="tiny-mono" style={{ marginTop: 18 }}>REQUEST TARGET · {settings.endpoint}</div>
    </div>
  );
}

function GalleryPage({ assets, loading, onToggleFavorite, onDelete, onDownload, onRefresh, onNotify }: {
  assets: Asset[];
  loading: boolean;
  onToggleFavorite: (asset: Asset) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  onDownload: (asset: Asset) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<Asset | null>(null);
  const visibleAssets = useMemo(() => assets.filter((asset) => {
    const matchesFilter = filter === 'all' || (filter === 'favorites' ? asset.favorite : asset.kind === filter);
    return matchesFilter && asset.prompt.toLowerCase().includes(search.toLowerCase());
  }), [assets, filter, search]);
  const downloadSelected = () => {
    const selectedAssets = assets.filter((asset) => selected.includes(asset.id));
    selectedAssets.forEach((asset, index) => window.setTimeout(() => onDownload(asset), index * 250));
    onNotify(`Preparing ${selectedAssets.length} file${selectedAssets.length === 1 ? '' : 's'} for download.`);
  };
  const toggleFavorite = async (asset: Asset) => {
    const current = assets.find((item) => item.id === asset.id) || asset;
    await onToggleFavorite(current);
    setActive((selectedAsset) => selectedAsset?.id === current.id ? { ...current, favorite: !current.favorite } : selectedAsset);
  };
  return (
    <div className="work-area">
      <div className="page-heading">
        <div><div className="eyebrow">Your local image archive</div><h1>Every frame, kept.</h1><p className="heading-copy">Generated and refined images live in this browser, not in a remote account.</p></div>
        <div className="tiny-mono">{assets.length} ASSET{assets.length === 1 ? '' : 'S'} · {formatBytes(assets.reduce((sum, asset) => sum + asset.bytes, 0))}</div>
      </div>
      <div className="gallery-toolbar">
        <div className="toolbar-left">
          <div className="search-wrap"><Search size={15} /><input className="text-field search-input" placeholder="Search prompts…" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-gallery-search" /></div>
          <select className="select-field filter-select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter assets" data-testid="select-gallery-filter">
            <option value="all">All images</option><option value="generated">Generated</option><option value="edited">Edited copies</option><option value="favorites">Favorites</option>
          </select>
        </div>
        <div className="toolbar-right">
          {selected.length > 0 && <><span className="tiny-mono">{selected.length} SELECTED</span><button className="secondary-button" onClick={downloadSelected} data-testid="button-batch-download"><ArrowDownToLine size={14} />Download</button><button className="danger-button" onClick={() => void onDelete(selected)} data-testid="button-batch-delete"><Trash2 size={14} />Delete</button></>}
          <button className="secondary-button" onClick={() => void onRefresh()} data-testid="button-refresh-gallery"><SlidersHorizontal size={14} />Refresh</button>
        </div>
      </div>
      <div className="asset-grid">
        {loading ? (
          Array.from({ length: 8 }, (_, index) => <div className="asset-card" key={index}><div className="asset-image" style={{ background: 'linear-gradient(100deg,#edf2f1 25%,#f7f9f8 38%,#edf2f1 63%)', backgroundSize: '400% 100%' }} /><div className="asset-meta"><div className="asset-prompt">Loading local archive…</div></div></div>)
        ) : visibleAssets.length ? visibleAssets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            selected={selected.includes(asset.id)}
            onSelect={() => setSelected((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])}
            onFavorite={() => void toggleFavorite(asset)}
            onOpen={() => setActive(asset)}
          />
        )) : (
          <div className="gallery-empty">
            <div><FileImage size={29} color="#50ad9e" /><h3>{assets.length ? 'No matching frames.' : 'Your archive is ready.'}</h3><p>{assets.length ? 'Try another search or filter.' : 'The images you generate will settle here, safely stored in this browser.'}</p></div>
          </div>
        )}
      </div>
      {active && <AssetDetail asset={assets.find((asset) => asset.id === active.id) || active} onClose={() => setActive(null)} onDownload={onDownload} onFavorite={toggleFavorite} onDelete={onDelete} onNotify={onNotify} onSaved={onRefresh} />}
    </div>
  );
}

function AssetCard({ asset, selected, onSelect, onFavorite, onOpen }: {
  asset: Asset;
  selected: boolean;
  onSelect: () => void;
  onFavorite: () => void;
  onOpen: () => void;
}) {
  const src = useMemo(() => objectUrl(asset.blob), [asset.blob]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  return (
    <article className={`asset-card ${selected ? 'selected' : ''}`} onClick={onOpen} onPointerMove={updateGlarePosition} data-testid={`card-asset-${asset.id}`}>
      <img className="asset-image" src={src} alt={asset.prompt} data-testid={`img-asset-${asset.id}`} />
      <button className="card-select" onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={selected ? 'Deselect image' : 'Select image'} data-testid={`button-select-${asset.id}`}>{selected && <Check size={14} />}</button>
      <button className={`card-favorite ${asset.favorite ? 'on' : ''}`} onClick={(event) => { event.stopPropagation(); onFavorite(); }} aria-label={asset.favorite ? 'Remove favorite' : 'Favorite image'} data-testid={`button-favorite-${asset.id}`}><Heart size={14} fill={asset.favorite ? 'currentColor' : 'none'} /></button>
      <div className="asset-meta">
        <div className="asset-prompt">{asset.prompt}</div>
        <div className="asset-foot"><span>{asset.kind.toUpperCase()} · {asset.width} × {asset.height}</span><span>{new Date(asset.createdAt).toLocaleDateString()}</span></div>
      </div>
    </article>
  );
}

function AssetDetail({ asset, onClose, onDownload, onFavorite, onDelete, onNotify, onSaved }: {
  asset: Asset;
  onClose: () => void;
  onDownload: (asset: Asset) => void;
  onFavorite: (asset: Asset) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  onNotify: (message: string) => void;
  onSaved: () => Promise<void>;
}) {
  const src = useMemo(() => objectUrl(asset.blob), [asset.blob]);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState>(DEFAULT_EDIT);
  const [saving, setSaving] = useState(false);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  const saveEdited = async () => {
    setSaving(true);
    try {
      const image = new Image();
      image.src = src;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not load this image for editing.')); });
      const scale = Math.min(edit.scale / 100, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
      const brightness = Math.pow(2, edit.exposure / 100) * 100;
      const gradingFilter = edit.grading === 'Warm' ? 'sepia(0.19) saturate(1.08)' : edit.grading === 'Cool' ? 'hue-rotate(11deg) saturate(.9)' : edit.grading === 'Mono' ? 'grayscale(1)' : '';
      context.filter = `brightness(${brightness}%) contrast(${edit.contrast}%) blur(${edit.blur}px) ${gradingFilter}`;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.filter = 'none';
      if (edit.sharpening > 0) {
        const amount = edit.sharpening / 100;
        const original = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = original.data;
        const copy = new Uint8ClampedArray(pixels);
        const strength = amount * 0.35;
        for (let y = 1; y < canvas.height - 1; y += 1) {
          for (let x = 1; x < canvas.width - 1; x += 1) {
            const index = (y * canvas.width + x) * 4;
            for (let channel = 0; channel < 3; channel += 1) {
              const neighbors = copy[index - 4 + channel] + copy[index + 4 + channel] + copy[index - canvas.width * 4 + channel] + copy[index + canvas.width * 4 + channel];
              pixels[index + channel] = Math.max(0, Math.min(255, copy[index + channel] * (1 + strength * 4) - neighbors * strength));
            }
          }
        }
        context.putImageData(original, 0, 0);
      }
      if (edit.grain > 0) {
        const grain = document.createElement('canvas');
        grain.width = Math.min(512, canvas.width);
        grain.height = Math.min(512, canvas.height);
        const grainContext = grain.getContext('2d');
        if (grainContext) {
          const data = grainContext.createImageData(grain.width, grain.height);
          for (let i = 0; i < data.data.length; i += 4) {
            const value = Math.random() * 255;
            data.data[i] = value;
            data.data[i + 1] = value;
            data.data[i + 2] = value;
            data.data[i + 3] = edit.grain * 0.65;
          }
          grainContext.putImageData(data, 0, 0);
          context.globalAlpha = 0.17;
          context.globalCompositeOperation = 'soft-light';
          context.drawImage(grain, 0, 0, canvas.width, canvas.height);
          context.globalAlpha = 1;
          context.globalCompositeOperation = 'source-over';
        }
      }
      if (edit.watermark) {
        context.fillStyle = 'rgba(255,255,255,.78)';
        context.font = `${Math.max(12, canvas.width * 0.018)}px DM Sans, sans-serif`;
        context.textAlign = 'right';
        context.fillText('PIXELSTUDIO', canvas.width - canvas.width * .025, canvas.height - canvas.height * .025);
      }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not export the edited image.')), 'image/png'));
      const edited: Asset = {
        ...asset,
        id: crypto.randomUUID(),
        blob,
        bytes: blob.size,
        createdAt: Date.now(),
        width: canvas.width,
        height: canvas.height,
        kind: 'edited',
        favorite: false,
        parentId: asset.id,
        edits: { ...edit },
      };
      await saveBlob(edited, blob);
      await onSaved();
      onNotify('Edited copy saved. Your original frame is untouched.');
      onClose();
    } catch (cause) {
      onNotify(cause instanceof Error ? cause.message : 'The edited copy could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  const previewStyle = {
    filter: `brightness(${Math.pow(2, edit.exposure / 100)}) contrast(${edit.contrast + edit.sharpening * 0.08}%) blur(${edit.blur}px) ${edit.grading === 'Warm' ? 'sepia(.19) saturate(1.08)' : edit.grading === 'Cool' ? 'hue-rotate(11deg) saturate(.9)' : edit.grading === 'Mono' ? 'grayscale(1)' : ''}`,
  };
  return (
    <div className="detail-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="detail-modal" role="dialog" aria-modal="true" aria-label="Image details">
        <div className="detail-image">
          <div className="edit-preview-wrap">
            <img src={src} alt={asset.prompt} style={editing ? previewStyle : undefined} data-testid="img-detail-preview" />
            {editing && edit.grain > 0 && <div className="preview-grain" style={{ opacity: edit.grain / 350 }} />}
            {editing && edit.watermark && <span className="preview-watermark">PIXELSTUDIO</span>}
          </div>
        </div>
        <div className="detail-info">
          <button className="detail-close" onClick={onClose} aria-label="Close details" data-testid="button-close-detail"><X size={17} /></button>
          <div className="eyebrow">{asset.kind} frame · {formatBytes(asset.bytes)}</div>
          <h2>Frame details</h2>
          <div className="detail-prompt">{asset.prompt}</div>
          <div className="detail-facts">
            <div className="detail-fact"><span>Resolution</span><strong>{asset.width} × {asset.height}</strong></div>
            <div className="detail-fact"><span>Created</span><strong>{new Date(asset.createdAt).toLocaleString()}</strong></div>
            <div className="detail-fact"><span>Model</span><strong>{asset.model}</strong></div>
            <div className="detail-fact"><span>Steps / seed</span><strong>{asset.steps} / {asset.seed ?? '—'}</strong></div>
          </div>
          {asset.edits && <div className="detail-prompt" style={{ marginBottom: 12 }}>Saved adjustments: {Object.entries(asset.edits).map(([key, value]) => `${key} ${value}`).join(' · ')}</div>}
          {editing && <div className="edit-controls" style={{ padding: '5px 0' }}>
            <EditSlider label="Exposure" value={edit.exposure} min={-100} max={100} display={`${edit.exposure > 0 ? '+' : ''}${edit.exposure}`} onChange={(value) => setEdit((current) => ({ ...current, exposure: value }))} />
            <EditSlider label="Contrast" value={edit.contrast} min={50} max={160} display={`${edit.contrast}%`} onChange={(value) => setEdit((current) => ({ ...current, contrast: value }))} />
            <EditSlider label="Sharpening" value={edit.sharpening} min={0} max={100} display={`${edit.sharpening}%`} onChange={(value) => setEdit((current) => ({ ...current, sharpening: value }))} />
            <EditSlider label="Grain" value={edit.grain} min={0} max={100} display={`${edit.grain}%`} onChange={(value) => setEdit((current) => ({ ...current, grain: value }))} />
            <EditSlider label="Blur" value={edit.blur} min={0} max={8} display={`${edit.blur}px`} onChange={(value) => setEdit((current) => ({ ...current, blur: value }))} />
            <label className="field-label">Color grade<select className="select-field" value={edit.grading} onChange={(event) => setEdit((current) => ({ ...current, grading: event.target.value }))} data-testid="select-edit-grade"><option>Neutral</option><option>Warm</option><option>Cool</option><option>Mono</option></select></label>
            <label className="field-label">Output resolution<select className="select-field" value={edit.scale} onChange={(event) => setEdit((current) => ({ ...current, scale: Number(event.target.value) }))} data-testid="select-edit-scale"><option value={50}>50% scale</option><option value={100}>Original size</option><option value={150}>150% scale</option><option value={200}>200% · up to 2K</option></select></label>
            <label className="checkline"><input type="checkbox" checked={edit.watermark} onChange={(event) => setEdit((current) => ({ ...current, watermark: event.target.checked }))} data-testid="checkbox-watermark" />Add PixelStudio watermark</label>
            <p className="field-note">Adjustments preview non-destructively. Save creates a new rendered copy.</p>
          </div>}
          <div className="toolbar-left" style={{ marginTop: 17 }}>
            <button className="secondary-button" onClick={() => onDownload(asset)} data-testid="button-download-detail"><Download size={14} />Download</button>
            <button className="secondary-button" onClick={() => void onFavorite(asset)} data-testid="button-favorite-detail"><Heart size={14} fill={asset.favorite ? 'currentColor' : 'none'} />{asset.favorite ? 'Favorited' : 'Favorite'}</button>
            <button className="secondary-button" onClick={() => setEditing((value) => !value)} data-testid="button-edit-image"><SlidersHorizontal size={14} />{editing ? 'Hide edits' : 'Edit image'}</button>
          </div>
          {editing && <button className="primary-button" style={{ marginTop: 12 }} onClick={() => void saveEdited()} disabled={saving} data-testid="button-save-edited">{saving ? 'Rendering copy…' : 'Save edited copy'}</button>}
          <button className="danger-button" style={{ marginTop: 12 }} onClick={() => void onDelete([asset.id]).then(() => onClose())} data-testid="button-delete-detail"><Trash2 size={14} />Delete image</button>
        </div>
      </div>
    </div>
  );
}

function EditSlider({ label, value, min, max, display, onChange }: { label: string; value: number; min: number; max: number; display: string; onChange: (value: number) => void }) {
  return <div className="slider-row"><label>{label}<span className="tiny-mono">{display}</span></label><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={label} data-testid={`range-${label.toLowerCase()}`} /></div>;
}

function SettingsPage({ settings, onChange, onNotify }: { settings: Settings; onChange: (settings: Settings) => void; onNotify: (message: string) => void }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [endpoint, setEndpoint] = useState(settings.endpoint);
  const [model, setModel] = useState(settings.model);
  const [steps, setSteps] = useState(settings.steps);
  const [secondModel, setSecondModel] = useState(settings.secondModel);
  const [secondSteps, setSecondSteps] = useState(settings.secondSteps);

  const saveSettings = () => {
    if (!endpoint.trim()) {
      setTestResult('Enter an endpoint URL before saving.');
      return;
    }
    const nextModel = model.trim() || DEFAULT_SETTINGS.model;
    const nextSecondModel = secondModel.trim() || DEFAULT_SETTINGS.secondModel;
    const activeModel = settings.activeModel === settings.model ? nextModel : settings.activeModel === settings.secondModel ? nextSecondModel : settings.activeModel;
    onChange({ ...settings, endpoint: endpoint.trim(), model: nextModel, steps: Math.max(1, Math.min(100, steps)), secondModel: nextSecondModel, secondSteps: Math.max(1, Math.min(100, secondSteps)), activeModel });
    onNotify('Studio settings saved on this browser.');
  };
  const testConnection = async () => {
    setTesting(true);
    setTestResult('');
    try {
      const response = await fetch(endpoint, { method: 'OPTIONS' });
      setTestResult(`The endpoint is reachable and returned HTTP ${response.status}. Run a small generation to confirm its image response format.`);
    } catch (cause) {
      setTestResult(`Could not reach the endpoint from this browser. ${cause instanceof Error ? cause.message : 'Network or CORS error.'} Confirm the local service is running and permits browser requests.`);
    } finally {
      setTesting(false);
    }
  };
  return (
    <div className="work-area">
      <div className="page-heading"><div><div className="eyebrow">Connection and model presets</div><h1>Your studio, your stack.</h1><p className="heading-copy">Connect PixelStudio directly to the local Atomic Agent image endpoint. Nothing is routed through a hosted service.</p></div></div>
      <div className="settings-layout">
        <section>
          <div className="panel settings-card" onPointerMove={updateGlarePosition}>
            <h2>Local generation endpoint</h2><p>Exact browser request target. Your local service must accept cross-origin browser requests (CORS).</p>
            <label className="field-label" htmlFor="endpoint-input">Image generations URL</label>
            <input className="text-field" id="endpoint-input" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} spellCheck={false} data-testid="input-endpoint" />
            <div className="toolbar-left" style={{ marginTop: 12 }}>
              <button className="secondary-button" onClick={() => void testConnection()} disabled={testing} data-testid="button-test-connection">{testing ? <LoaderCircle size={14} className="spin-icon" /> : <Eye size={14} />}{testing ? 'Testing…' : 'Test connection'}</button>
              <button className="primary-button" style={{ width: 'auto', minHeight: 36, marginTop: 0, padding: '0 14px' }} onClick={saveSettings} data-testid="button-save-settings">Save endpoint</button>
            </div>
            {testResult && <div className="test-result" role="status" data-testid="status-connection-test">{testResult}</div>}
          </div>
          <div className="panel settings-card" onPointerMove={updateGlarePosition}>
            <h2>Model presets</h2><p>These values are sent as the model and steps fields in each OpenAI-style request.</p>
            <div className="setting-models">
              <div className="model-row">
                <div><strong>Primary preset</strong><span>DEFAULT · QWEN IMAGE 2.2 TURBO</span></div>
                <div><div className="tiny-mono" style={{ marginBottom: 5 }}>STEPS</div><input className="number-field" type="number" min="1" max="100" value={steps} onChange={(event) => setSteps(Number(event.target.value))} data-testid="input-primary-steps" /></div>
                <input className="text-field" value={model} onChange={(event) => setModel(event.target.value)} aria-label="Primary model name" data-testid="input-primary-model" />
                <span className="tiny-mono">Qwen Image 2.2 Turbo · default 14 steps</span>
              </div>
              <div className="model-row">
                <div><strong>Alternate preset</strong><span>SECONDARY · KREATURBO2 12B</span></div>
                <div><div className="tiny-mono" style={{ marginBottom: 5 }}>STEPS</div><input className="number-field" type="number" min="1" max="100" value={secondSteps} onChange={(event) => setSecondSteps(Number(event.target.value))} data-testid="input-alternate-steps" /></div>
                <input className="text-field" value={secondModel} onChange={(event) => setSecondModel(event.target.value)} aria-label="Alternate model name" data-testid="input-alternate-model" />
                <span className="tiny-mono">Kreaturbo2 12B · default 8 steps</span>
              </div>
            </div>
            <button className="primary-button" style={{ maxWidth: 190 }} onClick={saveSettings} data-testid="button-save-presets">Save presets</button>
          </div>
        </section>
        <aside>
          <div className="connection-card" onPointerMove={updateGlarePosition}>
            <div className="eyebrow" style={{ color: '#81cfc0' }}>Browser direct · no server</div>
            <h3>Keep control of the whole pipeline.</h3>
            <p>PixelStudio sends prompt, model, steps, width, height, and image count straight from your browser. Images and metadata are persisted as blobs in IndexedDB.</p>
            <div className="connection-state"><span className="local-dot" />Configured target</div>
            <div className="test-result" style={{ overflowWrap: 'anywhere' }} data-testid="text-active-endpoint">{settings.endpoint}</div>
          </div>
          <div className="panel settings-card" style={{ marginTop: 16 }} onPointerMove={updateGlarePosition}>
            <h2>Response formats</h2><p>Accepted from your endpoint:</p>
            <div className="tiny-mono" style={{ lineHeight: 2.1 }}>data[].b64_json<br />data[].url<br />top-level image URL / base64</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return <div className="work-area"><div className="page-heading"><div><div className="eyebrow">Nothing rendered here</div><h1>That frame is out of bounds.</h1><p className="heading-copy">The page you’re looking for isn’t part of this studio.</p></div><Link className="secondary-button" href="/" data-testid="link-return-studio"><ArrowLeft size={14} />Back to the studio</Link></div></div>;
}

export default App;
