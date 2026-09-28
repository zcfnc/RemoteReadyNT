import { useEffect, useMemo, useState } from 'react';
import type { View } from '../app/view';
import { loadChecklist, loadOfflinePackDate, saveChecklist, saveOfflinePackDate } from '../services/storage';

const checklist = [
  ['local-map', 'Download the local map and community pack', 'Save key maps, facility locations and reference information to this device.'],
  ['contacts', 'Confirm emergency contacts', 'Check local and regional contact details are current.'],
  ['power', 'Test backup power', 'Ensure power and battery systems work and you have spares.'],
  ['backup-comms', 'Test satellite or radio backup', 'Check alternative communications and where equipment is stored.'],
  ['meeting-point', 'Confirm the community meeting point', 'Verify the nominated safe meeting point for your community.'],
  ['access', 'Review road and air access', 'Understand access routes and any seasonal restrictions.'],
  ['health', 'Prepare essential health information', 'Keep key medical information and prescriptions available.'],
  ['drill', 'Run a no-signal drill', 'Practise response steps when there is no network coverage.'],
] as const;

const offlineAssets = ['/', '/data/connectivity.geojson', '/data/facilities.geojson', '/data/download_log.json', '/data/tc-lam-track.geojson', '/data/lam-exercise-scenario.json'];

type PreparednessProps = { onNavigate?: (view: View) => void };

export function PreparednessPage({ onNavigate }: PreparednessProps) {
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecklist);
  const [savedAt, setSavedAt] = useState<string | undefined>(loadOfflinePackDate);
  const [network, setNetwork] = useState(navigator.onLine);
  const [notice, setNotice] = useState<string>();
  const complete = useMemo(() => checklist.filter(([key]) => checks[key]).length, [checks]);
  const percentage = Math.round((complete / checklist.length) * 100);

  useEffect(() => {
    const update = () => setNetwork(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  const toggle = (key: string) => setChecks((current) => {
    const next = { ...current, [key]: !current[key] }; saveChecklist(next); return next;
  });

  const savePack = async () => {
    if (!('caches' in window)) { setNotice('Offline storage is not available in this browser.'); return; }
    try {
      const cache = await window.caches.open('remoteready-react-offline-v1');
      await cache.addAll(offlineAssets);
      const now = new Date().toISOString(); saveOfflinePackDate(now); setSavedAt(now); setNotice('Emergency data pack saved on this device.');
    } catch { setNotice('The offline pack could not be saved. Check the connection and try again.'); }
  };

  const showLocation = () => {
    if (!navigator.geolocation) { setNotice('Location is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(() => setNotice('Your current location is available to the map.'), () => setNotice('Location access was not available.'));
  };

  return <section className="preparedness preparedness-redesign" aria-labelledby="preparedness-title">
    <h1 className="visually-hidden" id="preparedness-title">Preparedness</h1>
    <div className="dashboard-visual-strip" aria-label="RemoteReady NT focus areas">
      <StripTile icon="⌂" label="Remote communities" tone="sand" /><StripTile icon="◒" label="Cyclones and severe weather" tone="storm" /><StripTile icon="✈" label="Access and supply" tone="access" /><StripTile icon="◉" label="Communications" tone="comms" /><StripTile icon="✦" label="Stronger, safer communities" tone="water" />
    </div>
    <div className="dashboard-status-grid" aria-label="Preparedness summary">
      <StatusTile icon="☑" value={`${complete} / ${checklist.length}`} label="Checks complete" note={`${checklist.length - complete} actions remaining`} tone="red" />
      <StatusTile icon="▥" value={network ? 'Online' : 'Offline'} label="Device status" note={network ? 'Network available' : 'No network detected'} tone="blue" />
      <StatusTile icon="↓" value={savedAt ? 'Saved' : 'Not saved'} label="Offline pack" note={savedAt ? 'Available on this device' : 'Save before travel'} tone="orange" />
      <StatusTile icon="◇" value={`${percentage}%`} label="Preparedness" note="Checklist progress" tone="green" />
    </div>
    <section className="quick-actions preparedness-actions" aria-label="Preparedness quick actions">
      <ActionButton icon="↓" label="Save offline pack" onClick={() => void savePack()} /><ActionButton icon="▤" label="Community checklist" onClick={() => document.getElementById('community-checklist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} /><ActionButton icon="⌖" label="My location" onClick={showLocation} /><ActionButton icon="▱" label="Risk map" onClick={() => onNavigate?.('dashboard')} />
    </section>
    <section className="preparedness-section" id="community-checklist" aria-labelledby="checklist-title">
      <header className="preparedness-section-heading"><div><span>COMMUNITY PREPAREDNESS</span><h2 id="checklist-title">Eight checks before an outage</h2></div><p>{complete} of {checklist.length} complete</p></header>
      <div className="preparedness-workspace">
        <section className="readiness-checklist-panel">
          <div className="panel-title-row"><h3>Community readiness checklist</h3><strong>{percentage}% complete</strong></div>
          <div className="preparedness-progress" aria-label={`${percentage}% complete`}><i style={{ width: `${percentage}%` }} /></div>
          <div className="preparedness-check-items">{checklist.map(([key, title, copy], index) => <label className="preparedness-check-item" key={key}><input checked={Boolean(checks[key])} onChange={() => toggle(key)} type="checkbox" /><span className="check-item-icon" aria-hidden="true">{['⌂', '♧', 'ϟ', '◉', '♙', '✈', '+', '▤'][index]}</span><span className="check-item-copy"><strong>{title}</strong><small>{copy}</small></span></label>)}</div>
        </section>
        <aside className="offline-readiness-panel">
          <div className="network-status"><i aria-hidden="true" />{network ? 'Online — network available' : 'Offline — no network detected'}</div>
          <h3>NT emergency data pack</h3><p>Key maps, facility information and essential records can be kept on this device for offline use when connectivity is unavailable.</p>
          <div className="offline-contents"><strong>Included in this pack:</strong><span>⌂ <b>Community locations</b></span><span>▦ <b>Essential facilities</b></span><span>◒ <b>TC Lam exercise track</b></span><span>▤ <b>Download log</b></span></div>
          <button className="offline-save-button" onClick={() => void savePack()} type="button"><span aria-hidden="true">↓</span> Save for offline use</button>
          <div className="offline-meta"><span>Last saved:</span><strong>{savedAt ? new Date(savedAt).toLocaleDateString('en-AU') : 'Not yet saved'}</strong><span>Map tiles:</span><strong>Require connectivity</strong></div>
          <p className="offline-warning"><span aria-hidden="true">▲</span> Save the pack before travelling outside reliable coverage.</p>
          {notice && <p className="offline-notice" role="status">{notice}</p>}
        </aside>
      </div>
    </section>
    <section className="preparedness-section field-tools-section" aria-labelledby="field-tools-title">
      <header className="preparedness-section-heading"><div><span>FIELD TOOLS</span><h2 id="field-tools-title">Fast access when conditions change</h2></div></header>
      <div className="field-tools-grid"><FieldTool icon="⌖" title="My location" copy="Use this device to find your current position." label="Open tool →" onClick={showLocation} /><FieldTool icon="▱" title="Risk map" copy="Review communities, facilities and cyclone context." label="Open tool →" onClick={() => onNavigate?.('dashboard')} /><FieldTool icon="☎" title="Emergency contacts" copy="Confirm local and regional contact details." label="Review steps →" onClick={() => setNotice('Confirm local and regional contact details.')} /><FieldTool icon="◉" title="No-signal drill" copy="Practise the steps to follow when communications fail." label="Review steps →" onClick={() => document.getElementById('community-checklist')?.scrollIntoView({ behavior: 'smooth' })} /></div>
    </section>
    <p className="preparedness-boundary-warning"><span aria-hidden="true">▲</span><strong>Preparedness information supports planning only. Confirm current conditions and emergency advice with local authorities.</strong></p>
    <footer className="dashboard-footer preparedness-footer"><span><strong>RemoteReady NT</strong><small>Emergency communications and preparedness</small></span><span>Prototype only · Verify emergency information locally</span></footer>
  </section>;
}

function StripTile({ icon, label, tone }: { icon: string; label: string; tone: string }) { return <div className={`strip-tile ${tone}`}><span aria-hidden="true">{icon}</span><strong>{label}</strong></div>; }
function StatusTile({ icon, label, note, tone, value }: { icon: string; label: string; note: string; tone: string; value: string }) { return <article className={`status-tile ${tone}`}><span aria-hidden="true">{icon}</span><strong>{value}</strong><div><b>{label}</b><small>{note}</small></div></article>; }
function ActionButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) { return <button className="quick-action" onClick={onClick} type="button"><span aria-hidden="true">{icon}</span><strong>{label}</strong></button>; }
function FieldTool({ icon, title, copy, label, onClick }: { icon: string; title: string; copy: string; label: string; onClick: () => void }) { return <article className="field-tool-card"><span className="field-tool-icon" aria-hidden="true">{icon}</span><h3>{title}</h3><p>{copy}</p><button onClick={onClick} type="button">{label}</button></article>; }
