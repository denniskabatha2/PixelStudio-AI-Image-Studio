export type Asset = {
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

export type Settings = {
  endpoint: string;
  model: string;
  steps: number;
  secondModel: string;
  secondSteps: number;
  activeModel: string;
};

export type EditState = {
  exposure: number;
  contrast: number;
  sharpening: number;
  grading: string;
  grain: number;
  blur: number;
  watermark: boolean;
  scale: number;
};

export const DEFAULT_SETTINGS: Settings = {
  endpoint: 'http://127.0.0.1:1337/v1/images/generations',
  model: 'Qwen-Image-2.1-Turbo',
  steps: 14,
  secondModel: 'Krea 2 Turbo',
  secondSteps: 8,
  activeModel: 'Qwen-Image-2.1-Turbo',
};

export const DEFAULT_EDIT: EditState = {
  exposure: 0, contrast: 100, sharpening: 0, grading: 'Neutral',
  grain: 0, blur: 0, watermark: false, scale: 100,
};

export function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('pixelstudio-settings') || '{}');
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    const replacements: Record<string, string> = {
      'Qwen Image 2.2 Turbo': DEFAULT_SETTINGS.model,
      'Kreaturbo2 12B': DEFAULT_SETTINGS.secondModel,
    };
    for (const key of ['model', 'secondModel', 'activeModel'] as const) {
      settings[key] = replacements[settings[key]] ?? settings[key];
      if (typeof settings[key] !== 'string' || !settings[key].trim()) settings[key] = DEFAULT_SETTINGS[key];
    }
    if (typeof settings.endpoint !== 'string' || !settings.endpoint.trim()) settings.endpoint = DEFAULT_SETTINGS.endpoint;
    for (const key of ['steps', 'secondSteps'] as const) {
      settings[key] = Number.isFinite(settings[key])
        ? Math.min(100, Math.max(1, Math.round(settings[key]))) : DEFAULT_SETTINGS[key];
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pixelstudio-assets', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeAsset(asset: Asset) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      tx.objectStore('assets').put(asset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Saving was interrupted.'));
    });
  } finally { db.close(); }
}

export async function readAssets(): Promise<Asset[]> {
  const db = await openDatabase();
  try {
    const assets = await new Promise<Asset[]>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result as Asset[]);
      request.onerror = () => reject(request.error);
    });
    return assets.sort((a, b) => b.createdAt - a.createdAt);
  } finally { db.close(); }
}

export async function removeAssets(ids: string[]) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      ids.forEach((id) => tx.objectStore('assets').delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Deletion was interrupted.'));
    });
  } finally { db.close(); }
}

export async function saveBlob(asset: Asset, blob: Blob) {
  await storeAsset({ ...asset, blob, bytes: blob.size });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function objectUrl(blob: Blob) { return URL.createObjectURL(blob); }

export function downloadAsset(asset: Asset) {
  const extension = ({ 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[asset.blob.type] || 'png';
  const url = objectUrl(asset.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pixelstudio-${asset.id.slice(0, 8)}.${extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
