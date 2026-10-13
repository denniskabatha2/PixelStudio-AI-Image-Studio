import { Route, Router, Switch } from 'wouter';
import { StudioProvider } from '@/hooks/use-studio';
import { Shell } from '@/components/shell';
import { StudioPage } from '@/components/studio-page';
import { GalleryPage } from '@/components/gallery-page';
import { SettingsPage } from '@/components/settings-page';
import { NotFoundPage } from '@/components/not-found-page';

function App() {
  return (
    <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <StudioProvider>
        <Shell>
          <Switch>
            <Route path="/" component={StudioPage} />
            <Route path="/gallery" component={GalleryPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route component={NotFoundPage} />
          </Switch>
        </Shell>
      </StudioProvider>
    </Router>
  );
}

export default App;
