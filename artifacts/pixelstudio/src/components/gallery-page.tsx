import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowDownToLine, Check, CircleAlert, FileImage, Heart, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useStudio } from '@/hooks/use-studio';
import { useObjectUrl } from '@/hooks/use-object-url';
import { downloadAsset, formatBytes, type Asset } from '@/lib/studio';
import { glare } from '@/lib/ui-helpers';
import { AssetDetail } from './asset-detail';

function AssetCard({ asset, selected, onSelect, onFavorite, onOpen }: { asset: Asset; selected: boolean; onSelect: () => void; onFavorite: () => void; onOpen: () => void }) {
  const src = useObjectUrl(asset.blob);
  return (
    <article className={`asset-card ${selected ? 'selected' : ''}`} onPointerMove={glare} data-testid={`card-asset-${asset.id}`}>
      <div className="asset-image-wrap" style={{ aspectRatio: `${Math.max(asset.width, 1)} / ${Math.max(asset.height, 1)}` }}>
        {src ? <img className="asset-image" src={src} alt={asset.prompt} loading="lazy" data-testid={`img-asset-${asset.id}`} /> : <div className="skeleton" />}
      </div>
      <button type="button" className="card-open" onClick={onOpen} aria-label={`Open details: ${asset.prompt.slice(0, 80)}`} data-testid={`button-open-${asset.id}`} />
      <button type="button" className="card-select" onClick={onSelect} aria-pressed={selected} aria-label={selected ? 'Deselect image' : 'Select image'} data-testid={`button-select-${asset.id}`}>{selected && <Check size={14} />}</button>
      <button type="button" className={`card-favorite ${asset.favorite ? 'on' : ''}`} onClick={onFavorite} aria-pressed={asset.favorite} aria-label={asset.favorite ? 'Remove favorite' : 'Favorite image'} data-testid={`button-favorite-${asset.id}`}><Heart size={14} fill={asset.favorite ? 'currentColor' : 'none'} /></button>
      <div className="asset-meta">
        <div className="asset-prompt">{asset.prompt}</div>
        <div className="asset-foot"><span className={`kind-tag ${asset.kind}`}>{asset.kind}</span><span>{asset.width} x {asset.height}</span><span>{new Date(asset.createdAt).toLocaleDateString()}</span></div>
      </div>
    </article>
  );
}

export function GalleryPage() {
  const { assets, assetsLoading, assetsError, refresh, toggleFavorite, deleteAssets, notify } = useStudio();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = assets.filter((asset) => {
      const okFilter = filter === 'all' || (filter === 'favorites' ? asset.favorite : asset.kind === filter);
      return okFilter && (!term || asset.prompt.toLowerCase().includes(term) || asset.model.toLowerCase().includes(term));
    });
    if (sort === 'oldest') list.sort((a, b) => a.createdAt - b.createdAt);
    else if (sort === 'largest') list.sort((a, b) => b.bytes - a.bytes);
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [assets, filter, search, sort]);

  const active = activeId ? assets.find((asset) => asset.id === activeId) : undefined;
  const liveSelected = selected.filter((id) => assets.some((asset) => asset.id === id));
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  const toggleSelect = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const allVisibleSelected = visible.length > 0 && visible.every((asset) => liveSelected.includes(asset.id));

  const downloadSelected = () => {
    const picks = assets.filter((asset) => liveSelected.includes(asset.id));
    picks.forEach((asset, index) => window.setTimeout(() => downloadAsset(asset), index * 250));
    notify(`Preparing ${picks.length} file${picks.length === 1 ? '' : 's'} for download. Your browser may ask to allow multiple downloads.`);
  };
  const deleteSelected = async () => {
    const ok = await deleteAssets(liveSelected);
    if (ok) setSelected([]);
  };

  return (
    <div className="work-area">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Local archive</div>
          <h1>Gallery</h1>
          <p className="heading-copy">Generated images and edited copies, stored as blobs in this browser. Open any image for metadata and non-destructive edits.</p>
        </div>
        <div className="stat-row">
          <div className="stat"><span>Images</span><strong data-testid="text-asset-count">{assets.length}</strong></div>
          <div className="stat"><span>Size</span><strong>{formatBytes(total)}</strong></div>
          <div className="stat"><span>Favorites</span><strong>{assets.filter((asset) => asset.favorite).length}</strong></div>
        </div>
      </div>

      <div className="gallery-toolbar">
        <div className="toolbar-left">
          <div className="search-wrap">
            <Search size={15} aria-hidden="true" />
            <input className="text-field search-input" type="search" placeholder="Search prompts or models" aria-label="Search prompts and models" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-gallery-search" />
          </div>
          <select className="select-field filter-select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter assets" data-testid="select-gallery-filter">
            <option value="all">All images</option><option value="generated">Generated</option><option value="edited">Edited copies</option><option value="favorites">Favorites</option>
          </select>
          <select className="select-field filter-select" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort assets" data-testid="select-gallery-sort">
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="largest">Largest file</option>
          </select>
        </div>
        <div className="toolbar-right">
          {visible.length > 0 && (
            <button type="button" className="quiet-button" onClick={() => setSelected(allVisibleSelected ? [] : visible.map((asset) => asset.id))} data-testid="button-select-all">{allVisibleSelected ? 'Clear selection' : `Select ${visible.length} shown`}</button>
          )}
          <button type="button" className="secondary-button" onClick={() => void refresh()} data-testid="button-refresh-gallery"><RefreshCw size={14} />Refresh</button>
        </div>
      </div>

      {liveSelected.length > 0 && (
        <div className="selection-bar" role="region" aria-label="Selection actions">
          <span data-testid="text-selected-count">{liveSelected.length} selected</span>
          <div className="toolbar-left">
            <button type="button" className="secondary-button" onClick={downloadSelected} data-testid="button-batch-download"><ArrowDownToLine size={14} />Download</button>
            <button type="button" className="danger-button" onClick={() => void deleteSelected()} data-testid="button-batch-delete"><Trash2 size={14} />Delete</button>
            <button type="button" className="quiet-button" onClick={() => setSelected([])} aria-label="Clear selection" data-testid="button-clear-selection"><X size={14} /></button>
          </div>
        </div>
      )}

      {assetsError && (
        <div className="error-banner wide" role="alert" data-testid="status-gallery-error">
          <CircleAlert size={16} />
          <span><strong>The local library could not be read.</strong><br />{assetsError} Private browsing or blocked site storage can cause this.<br />
            <button type="button" className="quiet-button" onClick={() => void refresh()} data-testid="button-retry-gallery">Retry</button></span>
        </div>
      )}

      <div className="asset-grid" aria-busy={assetsLoading}>
        {assetsLoading ? (
          Array.from({ length: 8 }, (_, index) => (
            <div className="asset-card skeleton-card" key={index} aria-hidden="true"><div className="skeleton" style={{ height: 150 + (index % 3) * 50 }} /><div className="asset-meta"><div className="skeleton line" /><div className="skeleton line short" /></div></div>
          ))
        ) : visible.length ? visible.map((asset) => (
          <AssetCard key={asset.id} asset={asset} selected={liveSelected.includes(asset.id)} onSelect={() => toggleSelect(asset.id)} onFavorite={() => void toggleFavorite(asset)} onOpen={() => setActiveId(asset.id)} />
        )) : !assetsError && (
          <div className="gallery-empty" data-testid="status-gallery-empty">
            <div>
              <FileImage size={28} />
              <h3>{assets.length ? 'No images match these filters' : 'No images saved yet'}</h3>
              <p>{assets.length
                ? 'Clear the search or choose All images to see the whole archive.'
                : 'Images appear here after a successful render on the Create page. They are stored only in this browser, and nothing is uploaded.'}</p>
              {assets.length > 0
                ? <button type="button" className="secondary-button" onClick={() => { setSearch(''); setFilter('all'); }} data-testid="button-reset-filters">Reset filters</button>
                : <Link href="/" className="secondary-button" data-testid="link-gallery-create">Go to Create</Link>}
            </div>
          </div>
        )}
      </div>
      {active && <AssetDetail asset={active} onClose={() => setActiveId(null)} onOpenAsset={(id) => setActiveId(id)} />}
    </div>
  );
}
