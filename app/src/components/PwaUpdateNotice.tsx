import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function PwaUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateServiceWorker = useRef<((reloadPage?: boolean) => Promise<void>) | undefined>(undefined);

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() { setUpdateAvailable(true); },
      onOfflineReady() { setOfflineReady(true); },
    });
    updateServiceWorker.current = update;
  }, []);

  if (!updateAvailable && !offlineReady) return null;
  return <aside className="pwa-notice" role="status">
    <span>{updateAvailable ? 'A new version is available.' : 'This app is ready for offline use.'}</span>
    {updateAvailable && <button onClick={() => void updateServiceWorker.current?.(true)} type="button">Refresh</button>}
    {!updateAvailable && <button onClick={() => setOfflineReady(false)} type="button">Dismiss</button>}
  </aside>;
}
