import { useEffect, useMemo, useState } from 'react';
import { loadChecklist, loadOfflinePackDate, saveChecklist, saveOfflinePackDate } from '../services/storage';

const checklist = [
  ['local-map', 'Download the local map and community pack', 'Keep locations and emergency information available offline.'],
  ['contacts', 'Confirm emergency contacts', 'Print or save clinic, police, council and provider contacts.'],
  ['power', 'Test backup power', 'Check generator fuel, batteries and charging cables.'],
  ['backup-comms', 'Test satellite or radio backup', 'Complete a test call and record where equipment is stored.'],
  ['meeting-point', 'Confirm the community meeting point', 'Make sure the location is accessible during wet weather.'],
  ['access', 'Review road and air access', 'Identify alternatives if the normal route is closed.'],
  ['health', 'Prepare essential health information', 'Store medicine, patient transport and clinic procedures safely.'],
  ['drill', 'Run a no-signal drill', 'Test the local response plan before coverage disappears.'],
] as const;

const offlineAssets = ['/', '/data/connectivity.geojson', '/data/facilities.geojson', '/data/download_log.json', '/data/tc-lam-track.geojson', '/data/lam-exercise-scenario.json'];

export function PreparednessPage() {
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecklist);
  const [savedAt, setSavedAt] = useState<string | undefined>(loadOfflinePackDate);
  const [network, setNetwork] = useState(navigator.onLine);
  const [notice, setNotice] = useState<string>();
  const complete = useMemo(() => Object.values(checks).filter(Boolean).length, [checks]);

  useEffect(() => {
    const update = () => setNetwork(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const toggle = (key: string) => setChecks((current) => { const next = { ...current, [key]: !current[key] }; saveChecklist(next); return next; });
  const savePack = async () => {
    if (!('caches' in window)) { setNotice('Offline storage is not available in this browser.'); return; }
    try {
      const cache = await window.caches.open('remoteready-react-offline-v1');
      await cache.addAll(offlineAssets);
      const now = new Date().toISOString(); saveOfflinePackDate(now); setSavedAt(now); setNotice('Emergency data pack saved on this device.');
    } catch { setNotice('The offline pack could not be saved. Check the connection and try again.'); }
  };
  return <section className="preparedness" aria-labelledby="preparedness-title">
    <header className="readiness-hero"><div><p className="eyebrow">OFFLINE READINESS</p><h1 id="preparedness-title">Prepare before coverage disappears</h1><p>Save the information your community needs, confirm backup communications and test the plan while the network is available.</p></div><strong>{Math.round((complete / checklist.length) * 100)}%<small>prepared</small></strong></header>
    <div className="preparedness-grid"><section className="checklist-card"><div className="card-heading"><div><p className="eyebrow">COMMUNITY CHECKLIST</p><h2>Eight checks before an outage</h2></div><b>{complete} of {checklist.length}</b></div><div className="progress"><i style={{ width: `${(complete / checklist.length) * 100}%` }} /></div>{checklist.map(([key, title, copy]) => <label className="check-item" key={key}><input checked={Boolean(checks[key])} onChange={() => toggle(key)} type="checkbox" /><span><strong>{title}</strong><small>{copy}</small></span></label>)}</section>
      <aside className="offline-column"><section className="offline-card"><div className="offline-state"><span>↓</span><div><small>THIS DEVICE</small><strong>{network ? 'Online' : 'Offline'} · {savedAt ? `pack saved ${new Date(savedAt).toLocaleDateString('en-AU')}` : 'pack not saved'}</strong></div></div><h2>NT emergency data pack</h2><p>Store community connectivity, essential service locations, the scenario guide and this checklist on this device.</p><ul><li>Community and small-cell locations</li><li>Essential service locations</li><li>Preparedness checklist</li><li>Data source notes</li></ul><button onClick={() => void savePack()} type="button">Save for offline use</button><small>{savedAt ? 'Operational data was saved through the browser cache. Map tiles remain dependent on previously viewed areas.' : 'The basemap needs a connection; save the operational data before entering a low-coverage area.'}</small>{notice && <p className="offline-notice">{notice}</p>}</section><section className="field-tools"><p className="eyebrow">FIELD TOOLS</p><h2>Fast access when conditions change</h2><button type="button">My location</button><button type="button">Risk map</button></section></aside></div>
  </section>;
}
