import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { PwaUpdateNotice } from '../components/PwaUpdateNotice';
import { DashboardPage } from '../pages/DashboardPage';
import { DataSourcesPage } from '../pages/DataSourcesPage';
import { PreparednessPage } from '../pages/PreparednessPage';
import { AboutPage } from '../pages/AboutPage';
import { isView, type View } from './view';

function initialView(): View {
  const hash = window.location.hash.replace('#', '');
  return isView(hash) ? hash : 'dashboard';
}

export function App() {
  const [activeView, setActiveView] = useState<View>(initialView);
  const [exportDashboardReport, setExportDashboardReport] = useState<(() => void) | undefined>();

  useEffect(() => {
    window.history.replaceState(null, '', `#${activeView}`);
  }, [activeView]);

  const registerDashboardExport = useCallback((handler?: () => void) => {
    setExportDashboardReport(() => handler);
  }, []);

  return (
    <>
      <AppShell activeView={activeView} onViewChange={setActiveView} onExportReport={exportDashboardReport}>
        <div className="app-view" hidden={activeView !== 'dashboard'}>
          <DashboardPage onNavigate={setActiveView} onRegisterExport={registerDashboardExport} />
        </div>
        {activeView === 'preparedness' && <PreparednessPage />}
        {activeView === 'sources' && <DataSourcesPage />}
        {activeView === 'about' && <AboutPage />}
      </AppShell>
      <PwaUpdateNotice />
    </>
  );
}
