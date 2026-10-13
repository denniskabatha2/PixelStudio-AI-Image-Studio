import { useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, RotateCcw, Save, Activity } from 'lucide-react';
import { useStudio } from '@/hooks/use-studio';
import { DEFAULT_SETTINGS } from '@/lib/studio';
import { connectionMode, usesLocalBridge, validateEndpoint } from '@/lib/atomic';
import { clampInt, glare } from '@/lib/ui-helpers';

type Errors = Partial<Record<'endpoint' | 'model' | 'secondModel' | 'steps' | 'secondSteps', string>>;

export function SettingsPage() {
  const { settings, updateSettings, notify, connection, runConnectionTest } = useStudio();
  const [endpoint, setEndpoint] = useState(settings.endpoint);
  const [model, setModel] = useState(settings.model);
  const [steps, setSteps] = useState(String(settings.steps));
  const [secondModel, setSecondModel] = useState(settings.secondModel);
  const [secondSteps, setSecondSteps] = useState(String(settings.secondSteps));
  const [errors, setErrors] = useState<Errors>({});

  const draftTarget = endpoint.trim();
  const result = connection && connection.endpoint === draftTarget ? connection : null;
  const savedState = connection && connection.endpoint === settings.endpoint.trim() ? connection.state : 'idle';
  const dirty = draftTarget !== settings.endpoint || model.trim() !== settings.model || secondModel.trim() !== settings.secondModel
    || Number(steps) !== settings.steps || Number(secondSteps) !== settings.secondSteps;

  const validate = () => {
    const next: Errors = {};
    try { validateEndpoint(draftTarget); } catch (cause) { next.endpoint = cause instanceof Error ? cause.message : 'Invalid endpoint.'; }
    if (!model.trim()) next.model = 'Primary model identifier is required.';
    if (!secondModel.trim()) next.secondModel = 'Alternate model identifier is required.';
    if (!steps.trim() || !Number.isFinite(Number(steps))) next.steps = 'Enter a number from 1 to 100.';
    if (!secondSteps.trim() || !Number.isFinite(Number(secondSteps))) next.secondSteps = 'Enter a number from 1 to 100.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = () => {
    if (!validate()) { notify('Settings were not saved. Fix the highlighted fields.', 'error'); return; }
    const nextModel = model.trim();
    const nextSecond = secondModel.trim();
    const nextSteps = clampInt(Number(steps), 1, 100, DEFAULT_SETTINGS.steps);
    const nextSecondSteps = clampInt(Number(secondSteps), 1, 100, DEFAULT_SETTINGS.secondSteps);
    const activeModel = settings.activeModel === settings.model ? nextModel : settings.activeModel === settings.secondModel ? nextSecond : settings.activeModel;
    const err = updateSettings({ ...settings, endpoint: draftTarget, model: nextModel, steps: nextSteps, secondModel: nextSecond, secondSteps: nextSecondSteps, activeModel });
    setEndpoint(draftTarget); setModel(nextModel); setSecondModel(nextSecond); setSteps(String(nextSteps)); setSecondSteps(String(nextSecondSteps));
    if (err) notify(`Applied for this session but the browser refused to persist settings: ${err}`, 'error');
    else notify(nextSteps !== Number(steps) || nextSecondSteps !== Number(secondSteps) ? 'Settings saved. Steps were rounded or clamped to 1-100.' : 'Studio settings saved on this browser.');
  };

  const test = () => {
    try { validateEndpoint(draftTarget); setErrors((current) => ({ ...current, endpoint: undefined })); }
    catch (cause) { setErrors((current) => ({ ...current, endpoint: cause instanceof Error ? cause.message : 'Invalid endpoint.' })); }
    void runConnectionTest(draftTarget);
  };

  const reset = () => {
    setEndpoint(DEFAULT_SETTINGS.endpoint); setModel(DEFAULT_SETTINGS.model); setSteps(String(DEFAULT_SETTINGS.steps));
    setSecondModel(DEFAULT_SETTINGS.secondModel); setSecondSteps(String(DEFAULT_SETTINGS.secondSteps)); setErrors({});
  };

  const fieldError = (key: keyof Errors) => errors[key] ? <p className="field-error" role="alert" id={`err-${key}`}><CircleAlert size={12} />{errors[key]}</p> : null;

  return (
    <div className="work-area">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Connection and presets</div>
          <h1>Settings</h1>
          <p className="heading-copy">Point PixelStudio at your Atomic Agent image endpoint and tune the two model presets used for Qwen and Krea. Everything is saved in this browser.</p>
        </div>
        {dirty && <span className="dirty-tag" data-testid="status-unsaved">Unsaved changes</span>}
      </div>
      <div className="settings-layout">
        <section>
          <div className="panel settings-card" onPointerMove={glare}>
            <h2>Atomic Agent endpoint</h2>
            <p>The image generations URL requests are sent to. Mode: <strong>{connectionMode()}</strong>.</p>
            <label className="field-label" htmlFor="endpoint-input">Image generations URL</label>
            <input className="text-field" id="endpoint-input" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} spellCheck={false} aria-invalid={!!errors.endpoint} aria-describedby={errors.endpoint ? 'err-endpoint' : undefined} data-testid="input-endpoint" />
            {fieldError('endpoint')}
            <div className="toolbar-left spaced">
              <button type="button" className="secondary-button" onClick={test} disabled={result?.state === 'checking'} data-testid="button-test-connection">
                {result?.state === 'checking' ? <LoaderCircle size={14} className="spin-icon" /> : <Activity size={14} />}{result?.state === 'checking' ? 'Checking...' : 'Test connection'}
              </button>
            </div>
            {result && (
              <div className={`test-result ${result.state}`} role="status" data-state={result.state} data-testid="status-connection-test">
                {result.state === 'ok' ? <CircleCheck size={15} /> : result.state === 'failed' ? <CircleAlert size={15} /> : <LoaderCircle size={15} className="spin-icon" />}
                <span>{result.message}</span>
              </div>
            )}
          </div>

          <div className="panel settings-card" onPointerMove={glare}>
            <h2>Model presets</h2>
            <p>Each preset is sent as the model and steps fields of the request. Identifiers must match what your agent exposes. Steps are rounded and clamped to 1-100.</p>
            <div className="setting-models">
              {[
                { title: 'Primary preset', hint: 'Qwen family, default 14 steps', name: model, setName: setModel, st: steps, setSt: setSteps, nameKey: 'model' as const, stepKey: 'steps' as const, ids: ['input-primary-model', 'input-primary-steps'], label: 'Primary' },
                { title: 'Alternate preset', hint: 'Krea family, default 8 steps', name: secondModel, setName: setSecondModel, st: secondSteps, setSt: setSecondSteps, nameKey: 'secondModel' as const, stepKey: 'secondSteps' as const, ids: ['input-alternate-model', 'input-alternate-steps'], label: 'Alternate' },
              ].map((row) => (
                <div className="model-row" key={row.title}>
                  <div className="model-row-head"><strong>{row.title}</strong><span>{row.hint}</span></div>
                  <div>
                    <label className="mini-label" htmlFor={row.ids[0]}>Model identifier</label>
                    <input id={row.ids[0]} className="text-field" value={row.name} onChange={(event) => row.setName(event.target.value)} spellCheck={false} aria-label={`${row.label} model name`} aria-invalid={!!errors[row.nameKey]} data-testid={row.ids[0]} />
                    {fieldError(row.nameKey)}
                  </div>
                  <div>
                    <label className="mini-label" htmlFor={row.ids[1]}>Steps</label>
                    <input id={row.ids[1]} className="number-field" type="number" min={1} max={100} value={row.st} onChange={(event) => row.setSt(event.target.value)} aria-invalid={!!errors[row.stepKey]} data-testid={row.ids[1]} />
                    {fieldError(row.stepKey)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="save-bar">
            <button type="button" className="quiet-button" onClick={reset} data-testid="button-reset-settings"><RotateCcw size={13} />Restore defaults</button>
            <div className="toolbar-left">
              <button type="button" className="secondary-button" onClick={save} data-testid="button-save-presets"><Save size={14} />Save presets</button>
              <button type="button" className="primary-button inline" onClick={save} data-testid="button-save-settings"><Save size={14} />Save endpoint</button>
            </div>
          </div>
        </section>
        <aside>
          <div className="connection-card" onPointerMove={glare}>
            <div className="eyebrow">{usesLocalBridge() ? 'Local bridge' : 'Browser direct'}</div>
            <h3>Configured target</h3>
            <div className="test-result neutral" style={{ overflowWrap: 'anywhere' }} data-testid="text-active-endpoint">{settings.endpoint}</div>
            <div className="connection-state" data-state={savedState} data-testid="status-connection-state">
              <span className="state-dot" />
              {savedState === 'ok' ? 'Reachable at last check' : savedState === 'failed' ? 'Last check failed' : savedState === 'checking' ? 'Checking now' : 'Not verified. Run a connection test.'}
            </div>
            <p>{usesLocalBridge()
              ? 'Requests go through the local development bridge, so Atomic Agent does not need CORS headers.'
              : 'Requests go straight from the browser, so Atomic Agent must allow this origin (CORS). Run PixelStudio locally to use the bridge.'}</p>
          </div>
          <div className="panel settings-card" onPointerMove={glare}>
            <h2>What the check proves</h2>
            <p>A connection test only confirms the endpoint answers. It does not render an image or validate model names; generate once to confirm those.</p>
            <h2>Accepted responses</h2>
            <div className="tiny-mono code-list">data[].b64_json<br />data[].url<br />top-level URL or base64<br />raw image bytes</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
