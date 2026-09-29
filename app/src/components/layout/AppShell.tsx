import type { PropsWithChildren } from 'react';
import type { View } from '../../app/view';

type AppShellProps = PropsWithChildren<{
  activeView: View;
  onViewChange: (view: View) => void;
}>;

const navigation: Array<{ view: View; label: string }> = [
  { view: 'dashboard', label: 'Dashboard' },
  { view: 'preparedness', label: 'Preparedness' },
  { view: 'sources', label: 'Data sources' },
  { view: 'about', label: 'About us' },
];

const pageTitles: Record<View, string> = {
  dashboard: 'Disaster Dashboard',
  preparedness: 'Preparedness',
  sources: 'Data Sources',
  about: 'About Us',
};

export function AppShell({ activeView, children, onViewChange }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className={`app-header portal-header ${activeView}-header`}>
        <div className="app-header-top">
          <div className="brand" aria-label="RemoteReady NT">
            <span className="brand-mark"><img src="/assets/remoteready-nt-icon.png" alt="" /></span>
            <span><strong>RemoteReady NT</strong><small>Emergency connectivity and preparedness</small></span>
          </div>
          <h1 className="dashboard-page-title">{pageTitles[activeView]}</h1>
          <div className="header-utilities">
            <div className="system-state" aria-label="Source catalogue status">
              <i aria-hidden="true" />
              <span><strong>Source catalogue refreshed</strong><small>18 Sept 2026, 8:58 pm</small></span>
            </div>
            <button aria-label="About RemoteReady NT" className="help-button" onClick={() => onViewChange('about')} title="About RemoteReady NT" type="button">?</button>
          </div>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map(({ view, label }) => (
            <button
              aria-current={activeView === view ? 'page' : undefined}
              className={activeView === view ? 'active' : undefined}
              key={view}
              onClick={() => onViewChange(view)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
