import type { PropsWithChildren } from 'react';
import type { View } from '../../app/view';

type AppShellProps = PropsWithChildren<{
  activeView: View;
  onViewChange: (view: View) => void;
  onExportReport?: () => void;
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

export function AppShell({ activeView, children, onViewChange, onExportReport }: AppShellProps) {
  return (
    <div className={`app-shell ${activeView === 'dashboard' ? 'dashboard-shell' : ''}`}>
      <header className={`app-header portal-header ${activeView}-header`}>
        <div className="app-header-top dashboard-container">
          <div className="brand" aria-label="RemoteReady NT">
            <span className="brand-mark"><img src="/assets/remoteready-nt-icon.png" alt="" /></span>
            <span><strong>RemoteReady NT</strong><small>Emergency connectivity and preparedness</small></span>
          </div>
          <h1 className="dashboard-page-title">{pageTitles[activeView]}</h1>
          <nav className="primary-nav" aria-label="Primary navigation">
            {navigation.map(({ view, label }) => (
              <button aria-current={activeView === view ? 'page' : undefined} className={activeView === view ? 'active' : undefined} key={view} onClick={() => onViewChange(view)} type="button">{label}</button>
            ))}
          </nav>
          <div className="header-utilities">
            {activeView === 'dashboard' && <button className="header-export-button" onClick={onExportReport} type="button"><span aria-hidden="true">↓</span> Export report</button>}
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
