import { useState } from 'react';
import { Link } from 'wouter';
import { Aperture, CircleAlert, Download, ExternalLink, Images, Minus, Plus, ScanLine, Sparkles, WandSparkles } from 'lucide-react';
import { useStudio, SIMULATED_STAGES } from '@/hooks/use-studio';
import { useObjectUrl } from '@/hooks/use-object-url';
import { downloadAsset, formatBytes, type Asset } from '@/lib/studio';
import { connectionMode } from '@/lib/atomic';
import { ENHANCE_SUFFIX, RATIO_OPTIONS, STYLE_PROMPTS, activeSteps, clampInt, glare } from '@/lib/ui-helpers';

function RecentThumb({ asset, current, onPick }: { asset: Asset; current: boolean; onPick: () => void }) {
  const src = useObjectUrl(asset.blob);
  return (
    <button type="button" className={`recent-thumb ${current ? 'on' : ''}`} onClick={onPick} aria-pressed={current} aria-label={`Preview image: ${asset.prompt.slice(0, 60)}`} data-testid={`button-recent-${asset.id}`}>
      {src && <img src={src} alt="" />}
    </button>
  );
}

export function StudioPage() {
  const { settings, updateSettings, generate, working, progress, minimized, setMinimized, generationError, clearGenerationError, assets, notify } = useStudio();
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [ratio, setRatio] = useState('1:1');
  const [width, setWidth] = useState('1024');
  const [height, setHeight] = useState('1024');
  const [count, setCount] = useState(1);
  const [enhanced, setEnhanced] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const latest = assets.find((asset) => asset.id === pickedId) ?? assets[0];
  const latestUrl = useObjectUrl(latest?.blob);
  const steps = activeSteps(settings);
  const w = clampInt(Number(width), 64, 2048, 1024);
  const h = clampInt(Number(height), 64, 2048, 1024);
  const showProgress = working && !minimized;

  const chooseRatio = (choice: (typeof RATIO_OPTIONS)[number]) => {
    setRatio(choice.label); setWidth(String(choice.width)); setHeight(String(choice.height));
  };
  const enhancePrompt = () => {
    if (!prompt.trim()) { notify('Write a subject or scene first, then enhance the prompt.', 'error'); return; }
    if (enhanced) {
      setPrompt((value) => (value.endsWith(ENHANCE_SUFFIX) ? `${value.slice(0, -ENHANCE_SUFFIX.length)}.` : value));
      setEnhanced(false);
      return;
    }
    setPrompt((value) => `${value.trim().replace(/[.,\s]+$/, '')}${ENHANCE_SUFFIX}`);
    setEnhanced(true);
  };
  const chooseStyle = (name: string, suffix: string) => {
    setSelectedStyle(name);
    setPrompt((value) => (value.trim() ? `${value.trim().replace(/[.,\s]+$/, '')}, ${suffix}` : suffix));
  };
  const submit = async () => {
    setWidth(String(w)); setHeight(String(h));
    const ok = await generate({ prompt, width: w, height: h, count });
    if (ok) setPickedId(null);
  };

  return (
    <div className="work-area studio-area">
      <div className="studio-grid">
        <section className="panel control-panel" onPointerMove={glare} aria-label="Generation controls">
          <div className="control-scroll">
            <div className="panel-title"><h2>Prompt</h2><span className="tiny-mono">{prompt.length} chars</span></div>
            <label className="sr-only" htmlFor="prompt-input">Image prompt</label>
            <textarea
              className="text-field" id="prompt-input" data-testid="input-prompt" value={prompt}
              placeholder="Describe subject, setting, light and lens. Example: a greenhouse after rain, glass panes catching low apricot light."
              onChange={(event) => { setPrompt(event.target.value); setEnhanced(false); }}
              onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !working) void submit(); }}
            />
            <div className="control-row between">
              <button className="secondary-button" type="button" onClick={enhancePrompt} aria-pressed={enhanced} data-testid="button-enhance-prompt"><Sparkles size={14} />{enhanced ? 'Undo enhancement' : 'Enhance prompt'}</button>
              <span className="field-note">Ctrl/Cmd + Enter renders</span>
            </div>

            <div className="field-label"><span>Treatments</span><span className="field-note">{STYLE_PROMPTS.length} directions, appended to prompt</span></div>
            <div className="style-grid">
              {STYLE_PROMPTS.map(([name, suffix]) => (
                <button type="button" key={name} className={`style-chip ${selectedStyle === name ? 'selected' : ''}`} aria-pressed={selectedStyle === name} title={suffix} onClick={() => chooseStyle(name, suffix)} data-testid={`button-style-${name.toLowerCase().replaceAll(' ', '-')}`}>{name}</button>
              ))}
            </div>

            <div className="field-label"><span>Model</span><Link href="/settings" className="field-link">Edit presets <ExternalLink size={10} /></Link></div>
            <div className="control-row">
              <div>
                <label className="mini-label" htmlFor="active-model">Preset</label>
                <select id="active-model" className="select-field" value={settings.activeModel || settings.model} onChange={(event) => { const err = updateSettings({ ...settings, activeModel: event.target.value }); if (err) notify(`Preset changed but could not be persisted: ${err}`, 'error'); }} data-testid="select-active-model">
                  <option value={settings.model}>{settings.model}</option>
                  {settings.secondModel !== settings.model && <option value={settings.secondModel}>{settings.secondModel}</option>}
                </select>
              </div>
              <div><span className="mini-label">Steps</span><div className="select-field static" data-testid="text-active-steps">{steps} steps</div></div>
            </div>

            <div className="field-label"><span>Frame</span><span className="field-note">max 2048 px per side</span></div>
            <div className="ratio-row" role="group" aria-label="Aspect ratio">
              {RATIO_OPTIONS.map((item) => (
                <button type="button" key={item.label} className={`ratio-button ${ratio === item.label ? 'selected' : ''}`} aria-pressed={ratio === item.label} onClick={() => chooseRatio(item)} data-testid={`button-ratio-${item.label}`}>{item.label}</button>
              ))}
            </div>
            {ratio === '21:0' && <p className="field-note hint">Legacy 21:0 label kept for compatibility. It renders a 2048 x 128 strip.</p>}
            <div className="dimensions">
              <label className="mini-label" htmlFor="dim-w">W</label>
              <input id="dim-w" className="number-field" type="number" min={64} max={2048} step={64} value={width} onChange={(event) => { setWidth(event.target.value); setRatio('custom'); }} onBlur={() => setWidth(String(w))} aria-label="Image width" data-testid="input-width" />
              <span aria-hidden="true">x</span>
              <label className="mini-label" htmlFor="dim-h">H</label>
              <input id="dim-h" className="number-field" type="number" min={64} max={2048} step={64} value={height} onChange={(event) => { setHeight(event.target.value); setRatio('custom'); }} onBlur={() => setHeight(String(h))} aria-label="Image height" data-testid="input-height" />
              <span className="field-note">{ratio === 'custom' ? 'custom' : ratio}</span>
            </div>

            <div className="field-label"><span>Batch</span><span className="field-note">images per request</span></div>
            <div className="stepper">
              <button type="button" onClick={() => setCount((value) => Math.max(1, value - 1))} disabled={count <= 1} aria-label="Fewer images" data-testid="button-count-minus"><Minus size={13} /></button>
              <output aria-label="Image count" data-testid="text-count">{count}</output>
              <button type="button" onClick={() => setCount((value) => Math.min(4, value + 1))} disabled={count >= 4} aria-label="More images" data-testid="button-count-plus"><Plus size={13} /></button>
            </div>
          </div>
          <div className="control-footer">
            {generationError && (
              <div className="error-banner" role="alert" data-testid="status-generation-error">
                <CircleAlert size={16} />
                <span><strong>Render did not finish.</strong><br />{generationError}<br />
                  <button type="button" className="quiet-button" onClick={clearGenerationError} data-testid="button-dismiss-error">Dismiss and try again</button></span>
              </div>
            )}
            <button type="button" className="primary-button" onClick={() => void submit()} disabled={working} data-testid="button-generate">
              <WandSparkles size={16} />{working ? 'Rendering...' : `Generate ${count > 1 ? `${count} images` : 'image'}`}
              <span className="dims-tag">{w} x {h}</span>
            </button>
            <div className="target-line tiny-mono" title={settings.endpoint}>{connectionMode()} / {settings.endpoint}</div>
          </div>
        </section>

        <section className="panel preview-panel" onPointerMove={glare} aria-label="Preview">
          <div className="preview-head">
            <h2>Preview</h2>
            <span className="tiny-mono">{latest && !showProgress ? `${latest.width} x ${latest.height} px` : showProgress ? 'Render in progress' : 'No image yet'}</span>
          </div>
          {working && minimized && (
            <div className="bg-banner" role="status"><Aperture size={14} className="spin-icon" />A render is running in the background. Use the floating tracker to reopen it.</div>
          )}
          {showProgress ? (
            <div className="generation-visualizer" data-testid="panel-progress">
              <div className="neural-field" aria-hidden="true">
                {Array.from({ length: 38 }, (_, index) => (
                  <span className="neural-node" key={index} style={{ left: `${(index * 37 + 11) % 97}%`, top: `${(index * 53 + 7) % 91}%`, animationDelay: `${(index % 9) * -0.28}s` }} />
                ))}
              </div>
              <div className="generation-stage-copy">
                <div className="render-orbit"><Aperture size={27} /><span /></div>
                <div className="tiny-mono">{progress?.elapsed ?? 0}s elapsed, request sent to your endpoint</div>
                <h3>{progress?.stage ?? SIMULATED_STAGES[0]}</h3>
                <p className="stage-honest">Estimated stage {(progress?.stageIndex ?? 0) + 1} of {SIMULATED_STAGES.length}. Atomic Agent does not report progress, so stages and timing are simulated estimates.</p>
                <p>{progress && progress.elapsed < progress.estimateSeconds ? `Rough estimate: about ${progress.estimateSeconds - progress.elapsed}s left` : 'Taking longer than estimated; the request is still open.'}</p>
                <div className="render-progress-track" role="progressbar" aria-label="Estimated render progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(95, Math.round(((progress?.elapsed ?? 0) / (progress?.estimateSeconds ?? 60)) * 100))}>
                  <span style={{ transform: `scaleX(${Math.min(0.95, (progress?.elapsed ?? 0) / (progress?.estimateSeconds ?? 60))})` }} />
                </div>
                <button type="button" className="secondary-button" onClick={() => setMinimized(true)} data-testid="button-minimize-progress"><Minus size={14} />Continue in background</button>
              </div>
            </div>
          ) : latest && latestUrl ? (
            <div className="generated-preview">
              <img src={latestUrl} alt={latest.prompt} data-testid="img-latest-generation" />
              <div className="preview-actions">
                <button type="button" onClick={() => downloadAsset(latest)} aria-label="Download previewed image" title="Download" data-testid="button-download-latest"><Download size={15} /></button>
              </div>
              <div className="preview-bottom"><span>{latest.model} / {latest.steps} steps{latest.seed !== undefined ? ` / seed ${latest.seed}` : ''}</span><span>{formatBytes(latest.bytes)} / saved locally</span></div>
            </div>
          ) : (
            <div className="preview-empty">
              <div className="empty-inner">
                <div className="empty-art"><ScanLine size={40} strokeWidth={1.2} /></div>
                <h3>No images yet</h3>
                <p>Write a prompt and press Generate. PixelStudio sends it to the Atomic Agent endpoint in Settings, then stores each returned image in this browser only. Nothing appears here until your model returns a real image.</p>
                <Link href="/settings" className="secondary-button" data-testid="link-empty-settings">Review endpoint</Link>
              </div>
            </div>
          )}
          {assets.length > 0 && (
            <div className="recent-strip">
              <span className="mini-label"><Images size={11} /> Recent</span>
              <div className="recent-list">
                {assets.slice(0, 8).map((asset) => <RecentThumb key={asset.id} asset={asset} current={latest?.id === asset.id} onPick={() => setPickedId(asset.id)} />)}
              </div>
              <Link href="/gallery" className="field-link">Open gallery</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
