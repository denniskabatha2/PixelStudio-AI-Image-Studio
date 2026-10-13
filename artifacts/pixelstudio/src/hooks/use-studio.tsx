import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Asset, type Settings, readAssets, readSettings, removeAssets, storeAsset,
} from '@/lib/studio';
import { generateImages, testConnection, validateEndpoint } from '@/lib/atomic';
import { activeSteps } from '@/lib/ui-helpers';

export type Toast = { id: number; message: string; kind: 'success' | 'error' };
export type Progress = { stageIndex: number; stage: string; elapsed: number; estimateSeconds: number };
export type Connection = { endpoint: string; state: 'checking' | 'ok' | 'failed'; message: string };
export type GenerateInput = { prompt: string; width: number; height: number; count: number };

export const SIMULATED_STAGES = [
  'Preparing request',
  'Denoising',
  'Lighting and tone pass',
  'Surface detail pass',
  'Final resolve',
];

type StudioContextValue = {
  settings: Settings;
  updateSettings: (next: Settings) => string | null;
  assets: Asset[];
  assetsLoading: boolean;
  assetsError: string;
  refresh: () => Promise<void>;
  toggleFavorite: (asset: Asset) => Promise<void>;
  deleteAssets: (ids: string[]) => Promise<boolean>;
  notify: (message: string, kind?: 'success' | 'error') => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  working: boolean;
  progress: Progress | null;
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  generationError: string;
  clearGenerationError: () => void;
  generate: (input: GenerateInput) => Promise<boolean>;
  connection: Connection | null;
  runConnectionTest: (endpoint: string) => Promise<void>;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error('useStudio must be used inside StudioProvider');
  return value;
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const estimateRef = useRef(60);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    setAssetsLoading(true);
    try {
      setAssets(await readAssets());
      setAssetsError('');
    } catch (cause) {
      setAssetsError(cause instanceof Error ? cause.message : 'Could not read the local image library.');
    } finally {
      setAssetsLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, message, kind }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), kind === 'error' ? 7000 : 3800);
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem('pixelstudio-settings', JSON.stringify(next));
      return null;
    } catch (cause) {
      return cause instanceof Error ? cause.message : 'Browser storage rejected the settings.';
    }
  }, []);

  useEffect(() => {
    if (!working) return;
    let elapsed = 0;
    const timer = window.setInterval(() => {
      elapsed += 1;
      const stageIndex = elapsed < 10 ? 0 : elapsed < 45 ? 1 : elapsed < 120 ? 2 : elapsed < 360 ? 3 : 4;
      setProgress({ stageIndex, stage: SIMULATED_STAGES[stageIndex], elapsed, estimateSeconds: estimateRef.current });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [working]);

  const generate = useCallback(async (input: GenerateInput) => {
    if (busyRef.current) return false;
    if (!input.prompt.trim()) {
      setGenerationError('Add a prompt before starting a render.');
      return false;
    }
    busyRef.current = true;
    estimateRef.current = Math.max(input.width, input.height) >= 1536 ? 960 : 60;
    setWorking(true);
    setProgress({ stageIndex: 0, stage: SIMULATED_STAGES[0], elapsed: 0, estimateSeconds: estimateRef.current });
    setMinimized(false);
    setGenerationError('');
    let ok = false;
    try {
      const images = await generateImages(settings, input);
      const model = settings.activeModel || settings.model;
      const steps = activeSteps(settings);
      const saved: Asset[] = [];
      try {
        for (const image of images) {
          const asset: Asset = {
            id: crypto.randomUUID(), blob: image.blob, prompt: input.prompt.trim(), createdAt: Date.now(),
            width: image.width, height: image.height, bytes: image.blob.size, seed: image.seed,
            model, steps, favorite: false, kind: 'generated',
          };
          await storeAsset(asset);
          saved.push(asset);
        }
      } catch (cause) {
        if (saved.length) setAssets((current) => [...saved.slice().reverse(), ...current]);
        throw new Error(`The render finished; ${saved.length} of ${images.length} images were saved. The remaining ${images.length - saved.length} could not be saved to local storage: ${cause instanceof Error ? cause.message : 'unknown storage error'}`);
      }
      setAssets((current) => [...saved.slice().reverse(), ...current]);
      notify(`${saved.length} ${saved.length === 1 ? 'image' : 'images'} saved to the local library.`);
      ok = true;
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : 'Image generation failed.');
    } finally {
      busyRef.current = false;
      setWorking(false);
      setProgress(null);
      setMinimized(false);
    }
    return ok;
  }, [notify, settings]);

  const toggleFavorite = useCallback(async (asset: Asset) => {
    const updated = { ...asset, favorite: !asset.favorite };
    try {
      await storeAsset(updated);
      setAssets((current) => current.map((item) => (item.id === asset.id ? updated : item)));
    } catch (cause) {
      notify(`Could not update favorite: ${cause instanceof Error ? cause.message : 'storage error'}`, 'error');
    }
  }, [notify]);

  const deleteAssets = useCallback(async (ids: string[]) => {
    if (!ids.length) return false;
    if (!window.confirm(`Permanently delete ${ids.length} selected ${ids.length === 1 ? 'image' : 'images'} from this browser? This cannot be undone.`)) return false;
    try {
      await removeAssets(ids);
      setAssets((current) => current.filter((asset) => !ids.includes(asset.id)));
      notify(`${ids.length} ${ids.length === 1 ? 'image' : 'images'} deleted.`);
      return true;
    } catch (cause) {
      notify(`Delete failed, nothing was removed: ${cause instanceof Error ? cause.message : 'storage error'}`, 'error');
      return false;
    }
  }, [notify]);

  const runConnectionTest = useCallback(async (endpoint: string) => {
    const target = endpoint.trim();
    try {
      validateEndpoint(target);
    } catch (cause) {
      setConnection({ endpoint: target, state: 'failed', message: cause instanceof Error ? cause.message : 'Invalid endpoint.' });
      return;
    }
    setConnection({ endpoint: target, state: 'checking', message: 'Checking the endpoint...' });
    try {
      const message = await testConnection(target);
      setConnection({ endpoint: target, state: 'ok', message });
    } catch (cause) {
      setConnection({ endpoint: target, state: 'failed', message: cause instanceof Error ? cause.message : 'Connection check failed.' });
    }
  }, []);

  const value = useMemo<StudioContextValue>(() => ({
    settings, updateSettings, assets, assetsLoading, assetsError, refresh, toggleFavorite, deleteAssets,
    notify, toasts, dismissToast, working, progress, minimized, setMinimized, generationError,
    clearGenerationError: () => setGenerationError(''), generate, connection, runConnectionTest,
  }), [settings, updateSettings, assets, assetsLoading, assetsError, refresh, toggleFavorite, deleteAssets, notify, toasts, dismissToast, working, progress, minimized, generationError, generate, connection, runConnectionTest]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
