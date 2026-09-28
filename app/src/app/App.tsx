import { useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { PwaUpdateNotice } from '../components/PwaUpdateNotice';
import { DashboardPage } from '../pages/DashboardPage';
import { DataSourcesPage } from '../pages/DataSourcesPage';
import { PreparednessPage } from '../pages/PreparednessPage';
import { isView, type View } from './view';

function initialView(): View {
  const hash = window.location.hash.replace('#', '');
  return isView(hash) ? hash : 'dashboard';
}

export function App() {
  const [activeView, setActiveView] = useState<View>(initialView);

  useEffect(() => {
    window.history.replaceState(null, '', `#${activeView}`);
  }, [activeView]);

  return (
    <>
      <AppShell activeView={activeView} onViewChange={setActiveView}>
        {activeView === 'dashboard' && <DashboardPage onNavigate={setActiveView} />}
        {activeView === 'preparedness' && <PreparednessPage />}
        {activeView === 'sources' && <DataSourcesPage />}
      </AppShell>
      <PwaUpdateNotice />
    </>
  );
}
