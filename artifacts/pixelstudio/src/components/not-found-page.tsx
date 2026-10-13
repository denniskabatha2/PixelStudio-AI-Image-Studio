import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="work-area">
      <div className="page-heading">
        <div>
          <div className="eyebrow">404 / route not found</div>
          <h1>That page is not part of this studio.</h1>
          <p className="heading-copy">PixelStudio has three views: Create, Gallery and Settings. Your library and settings are untouched.</p>
        </div>
        <Link className="secondary-button" href="/" data-testid="link-return-studio"><ArrowLeft size={14} />Back to the studio</Link>
      </div>
    </div>
  );
}
