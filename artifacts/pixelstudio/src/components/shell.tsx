import { type ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Aperture, CircleAlert, Check, ChevronRight, Database, Images, LoaderCircle, Radio, Settings2, WandSparkles, X } from 'lucide-react';
import { useStudio } from '@/hooks/use-studio';
import { formatBytes } from '@/lib/studio';

const NAV = [
  { href: '/', label: 'Create', icon: WandSparkles, testid: 'link-studio', hint: 'Generate' },
  { href: '/gallery', label: 'Gallery', icon: Images, testid: 'link-gallery', hint: 'Archive' },
  { href: '/settings', label: 'Settings', icon: Settings2, testid: 'link-settings', hint: 'Endpoint' },
];

export function Shell({ children }: { children: ReactNode }) {
  const [path, setLocation] = useLocation();
  const { settings, assets, connection, runConnectionTest, working, progress, minimized, setMinimized, toasts, dismissToast } = useStudio();
  const title = path === '/gallery' ? 'Gallery' : path === '/settings' ? 'Settings' : path === '/' ? 'Create' : 'Not found';
  useEffect(() => {
    const description = title === 'Gallery'
      ? 'Search, organize, and non-destructively refine your private image archive.'
      : title === 'Settings'
        ? 'Configure your local Atomic Agent connection and Qwen/Krea model presets.'
        : title === 'Create'
          ? 'Generate private AI images with your local Qwen and Krea models in PixelStudio.'
          : 'This page is not part of the PixelStudio image workspace.';
    document.title = `${title} · PixelStudio`;
    for (const key of ['description', 'og:description', 'twitter:description']) {
      document.querySelector(`meta[${key.startsWith('og:') ? 'property' : 'name'}="${key}"]`)?.setAttribute('content', description);
    }
    for (const key of ['og:title', 'twitter:title']) {
      document.querySelector(`meta[${key.startsWith('og:') ? 'property' : 'name'}="${key}"]`)?.setAttribute('content', document.title);
    }
  }, [title]);
  const current = connection && connection.endpoint === settings.endpoint.trim() ? connection : null;
  const state = current?.state ?? 'idle';
  const pillLabel = state === 'ok' ? 'Reachable' : state === 'failed' ? 'Check failed' : state === 'checking' ? 'Checking' : 'Not verified';
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  const showFloating = working && progress && (minimized || path !== '/');

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar">
        <Link href="/" className="brand" data-testid="link-brand" aria-label="PixelStudio home">
          <span className="brand-mark"><Aperture size={19} /></span>
          <span><span className="brand-name">PixelStudio</span><span className="brand-sub">Atomic Agent client</span></span>
        </Link>
        <div className="nav-label">Workspace</div>
        <nav className="nav-stack" aria-label="Primary">
          {NAV.map(({ href, label, icon: Icon, testid, hint }) => (
            <Link key={href} href={href} className={`nav-link ${path === href ? 'active' : ''}`} aria-current={path === href ? 'page' : undefined} data-testid={testid}>
              <Icon size={16} /><span>{label}</span><em>{hint}</em>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-card">
            <div className="side-row"><Database size={13} /><span>Private library</span></div>
            <strong data-testid="text-library-count">{assets.length} {assets.length === 1 ? 'image' : 'images'}</strong>
            <span className="tiny-mono">{formatBytes(total)} in IndexedDB on this device</span>
          </div>
        </div>
      </aside>
      <main className="shell-main" id="main" tabIndex={-1}>
        <header className="topbar">
          <div className="crumb"><span>PixelStudio</span><ChevronRight size={12} /><strong>{title}</strong></div>
          <div className="topbar-right">
            <span className="model-chip" title="Active model preset"><Radio size={12} />{settings.activeModel || settings.model}</span>
            <button type="button" className="endpoint-indicator" data-state={state} onClick={() => void runConnectionTest(settings.endpoint)} disabled={state === 'checking'} aria-label={`Atomic Agent endpoint ${settings.endpoint}: ${pillLabel}. Activate to check connection.`} title={current?.message || 'Click to check the connection'} data-testid="button-topbar-check">
              <span className="state-dot" />
              <span className="endpoint-text">{settings.endpoint}</span>
              <b data-testid="status-topbar-connection">{pillLabel}</b>
            </button>
          </div>
        </header>
        {children}
      </main>
      {showFloating && progress && (
        <button type="button" className="floating-progress" onClick={() => { setMinimized(false); setLocation('/'); }} data-testid="button-expand-progress">
          <strong><LoaderCircle size={13} className="spin-icon" />Rendering, {progress.elapsed}s elapsed</strong>
          <span>{progress.stage} (simulated stage) - open progress</span>
        </button>
      )}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast ${toast.kind}`} key={toast.id} data-testid={`status-toast-${toast.id}`}>
            {toast.kind === 'error' ? <CircleAlert size={15} /> : <Check size={15} />}
            <span>{toast.message}</span>
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification"><X size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
