import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CircleAlert, Download, Heart, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useStudio } from '@/hooks/use-studio';
import { useObjectUrl } from '@/hooks/use-object-url';
import { type Asset, type EditState, DEFAULT_EDIT, downloadAsset, formatBytes, saveBlob } from '@/lib/studio';

function EditSlider({ label, value, min, max, display, onChange }: { label: string; value: number; min: number; max: number; display: string; onChange: (value: number) => void }) {
  const id = `range-${label.toLowerCase()}`;
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}<span className="tiny-mono">{display}</span></label>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} data-testid={id} />
    </div>
  );
}

function gradeFilter(grading: string, canvas: boolean) {
  if (grading === 'Warm') return canvas ? 'sepia(0.19) saturate(1.08)' : 'sepia(.19) saturate(1.08)';
  if (grading === 'Cool') return 'hue-rotate(11deg) saturate(.9)';
  if (grading === 'Mono') return 'grayscale(1)';
  return '';
}

async function renderEdited(src: string, edit: EditState) {
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
  context.filter = `brightness(${brightness}%) contrast(${edit.contrast}%) blur(${edit.blur}px) ${gradeFilter(edit.grading, true)}`;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.filter = 'none';
  if (edit.sharpening > 0) {
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = data.data;
    const copy = new Uint8ClampedArray(pixels);
    const strength = (edit.sharpening / 100) * 0.35;
    for (let y = 1; y < canvas.height - 1; y += 1) {
      for (let x = 1; x < canvas.width - 1; x += 1) {
        const index = (y * canvas.width + x) * 4;
        for (let c = 0; c < 3; c += 1) {
          const n = copy[index - 4 + c] + copy[index + 4 + c] + copy[index - canvas.width * 4 + c] + copy[index + canvas.width * 4 + c];
          pixels[index + c] = Math.max(0, Math.min(255, copy[index + c] * (1 + strength * 4) - n * strength));
        }
      }
    }
    context.putImageData(data, 0, 0);
  }
  if (edit.grain > 0) {
    const grain = document.createElement('canvas');
    grain.width = Math.min(512, canvas.width);
    grain.height = Math.min(512, canvas.height);
    const gctx = grain.getContext('2d');
    if (gctx) {
      const data = gctx.createImageData(grain.width, grain.height);
      for (let i = 0; i < data.data.length; i += 4) {
        const v = Math.random() * 255;
        data.data[i] = v; data.data[i + 1] = v; data.data[i + 2] = v; data.data[i + 3] = edit.grain * 0.65;
      }
      gctx.putImageData(data, 0, 0);
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
    context.fillText('PIXELSTUDIO', canvas.width - canvas.width * 0.025, canvas.height - canvas.height * 0.025);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not export the edited image.'))), 'image/png'));
  return { blob, width: canvas.width, height: canvas.height };
}

export function AssetDetail({ asset, onClose, onOpenAsset }: { asset: Asset; onClose: () => void; onOpenAsset: (id: string) => void }) {
  const { assets, toggleFavorite, deleteAssets, refresh, notify } = useStudio();
  const src = useObjectUrl(asset.blob);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState>(DEFAULT_EDIT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const parent = asset.parentId ? assets.find((item) => item.id === asset.parentId) : undefined;
  const set = (patch: Partial<EditState>) => setEdit((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true); setError('');
    try {
      const out = await renderEdited(src, edit);
      const edited: Asset = { ...asset, id: crypto.randomUUID(), blob: out.blob, bytes: out.blob.size, createdAt: Date.now(), width: out.width, height: out.height, kind: 'edited', favorite: false, parentId: asset.id, edits: { ...edit } };
      await saveBlob(edited, out.blob);
      await refresh();
      notify('Edited copy saved. The original image is untouched.');
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The edited copy could not be saved.';
      setError(message);
      notify(message, 'error');
    } finally { setSaving(false); }
  };

  const previewStyle = editing ? {
    filter: `brightness(${Math.pow(2, edit.exposure / 100)}) contrast(${edit.contrast + edit.sharpening * 0.08}%) blur(${edit.blur}px) ${gradeFilter(edit.grading, false)}`,
  } : undefined;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="detail-modal-backdrop" />
        <Dialog.Content className="detail-modal" data-testid="dialog-asset-detail" aria-describedby="detail-desc">
          <div className="detail-image">
            <div className="edit-preview-wrap">
              {src && <img src={src} alt={asset.prompt} style={previewStyle} data-testid="img-detail-preview" />}
              {editing && edit.grain > 0 && <div className="preview-grain" style={{ opacity: edit.grain / 350 }} />}
              {editing && edit.watermark && <span className="preview-watermark">PIXELSTUDIO</span>}
            </div>
          </div>
          <div className="detail-info">
            <div className="detail-head">
              <div>
                <div className="eyebrow">{asset.kind} image / {formatBytes(asset.bytes)}</div>
                <Dialog.Title asChild><h2>Image details</h2></Dialog.Title>
              </div>
              <Dialog.Close asChild><button type="button" className="icon-button" aria-label="Close details" data-testid="button-close-detail"><X size={16} /></button></Dialog.Close>
            </div>
            <Dialog.Description id="detail-desc" className="sr-only">Metadata, download, favorite, delete and non-destructive editing for this image. Press Escape to close.</Dialog.Description>
            <div className="detail-prompt" data-testid="text-detail-prompt">{asset.prompt}</div>
            <div className="detail-facts">
              <div className="detail-fact"><span>Resolution</span><strong>{asset.width} x {asset.height}</strong></div>
              <div className="detail-fact"><span>Created</span><strong>{new Date(asset.createdAt).toLocaleString()}</strong></div>
              <div className="detail-fact"><span>Model</span><strong>{asset.model}</strong></div>
              <div className="detail-fact"><span>Steps / seed</span><strong>{asset.steps} / {asset.seed ?? 'not reported'}</strong></div>
            </div>
            {asset.parentId && (
              <div className="detail-prompt lineage">
                Edited copy of an earlier image.{' '}
                {parent ? <button type="button" className="link-button" onClick={() => onOpenAsset(parent.id)} data-testid="button-open-original">Open original</button> : 'The original was deleted.'}
              </div>
            )}
            {asset.edits && <div className="detail-prompt">Saved adjustments: {Object.entries(asset.edits).map(([key, value]) => `${key} ${String(value)}`).join(' / ')}</div>}
            {editing && (
              <div className="edit-controls">
                <EditSlider label="Exposure" value={edit.exposure} min={-100} max={100} display={`${edit.exposure > 0 ? '+' : ''}${edit.exposure}`} onChange={(v) => set({ exposure: v })} />
                <EditSlider label="Contrast" value={edit.contrast} min={50} max={160} display={`${edit.contrast}%`} onChange={(v) => set({ contrast: v })} />
                <EditSlider label="Sharpening" value={edit.sharpening} min={0} max={100} display={`${edit.sharpening}%`} onChange={(v) => set({ sharpening: v })} />
                <EditSlider label="Grain" value={edit.grain} min={0} max={100} display={`${edit.grain}%`} onChange={(v) => set({ grain: v })} />
                <EditSlider label="Blur" value={edit.blur} min={0} max={8} display={`${edit.blur}px`} onChange={(v) => set({ blur: v })} />
                <div className="control-row">
                  <div><label className="mini-label" htmlFor="edit-grade">Color grade</label>
                    <select id="edit-grade" className="select-field" value={edit.grading} onChange={(event) => set({ grading: event.target.value })} data-testid="select-edit-grade"><option>Neutral</option><option>Warm</option><option>Cool</option><option>Mono</option></select></div>
                  <div><label className="mini-label" htmlFor="edit-scale">Output size</label>
                    <select id="edit-scale" className="select-field" value={edit.scale} onChange={(event) => set({ scale: Number(event.target.value) })} data-testid="select-edit-scale"><option value={50}>50% scale</option><option value={100}>Original size</option><option value={150}>150% scale</option><option value={200}>200% (up to 2K)</option></select></div>
                </div>
                <label className="checkline"><input type="checkbox" checked={edit.watermark} onChange={(event) => set({ watermark: event.target.checked })} data-testid="checkbox-watermark" />Add PixelStudio watermark</label>
                <div className="control-row between">
                  <p className="field-note">Preview is live. Saving renders a new copy.</p>
                  <button type="button" className="quiet-button" onClick={() => setEdit(DEFAULT_EDIT)} data-testid="button-reset-edits"><RotateCcw size={13} />Reset</button>
                </div>
              </div>
            )}
            {error && <div className="error-banner" role="alert" data-testid="status-edit-error"><CircleAlert size={16} /><span>{error}</span></div>}
            <div className="toolbar-left detail-actions">
              <button type="button" className="secondary-button" onClick={() => downloadAsset(asset)} data-testid="button-download-detail"><Download size={14} />Download</button>
              <button type="button" className="secondary-button" aria-pressed={asset.favorite} onClick={() => void toggleFavorite(asset)} data-testid="button-favorite-detail"><Heart size={14} fill={asset.favorite ? 'currentColor' : 'none'} />{asset.favorite ? 'Favorited' : 'Favorite'}</button>
              <button type="button" className="secondary-button" aria-pressed={editing} onClick={() => setEditing((value) => !value)} data-testid="button-edit-image"><SlidersHorizontal size={14} />{editing ? 'Hide edits' : 'Edit image'}</button>
            </div>
            {editing && <button type="button" className="primary-button" onClick={() => void save()} disabled={saving} data-testid="button-save-edited">{saving ? 'Rendering copy...' : 'Save edited copy'}</button>}
            <button type="button" className="danger-button wide" onClick={() => void deleteAssets([asset.id]).then((ok) => { if (ok) onClose(); })} data-testid="button-delete-detail"><Trash2 size={14} />Delete image</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
