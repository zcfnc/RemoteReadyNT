import { PageHero } from '../components/layout/PageHero';
import { useEffect, useMemo, useState } from 'react';
import type { View } from '../app/view';
import { loadChecklist, saveChecklist } from '../services/storage';
import { downloadDecisionSupportReport } from '../services/decisionReport';
import { dataService } from '../services/dataService';
import { deriveIndicativeRecords } from '../features/dashboard/useDashboardData';
import { priorityResults } from '../features/dashboard/dashboard';

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

type PreparednessProps = { onNavigate?: (view: View) => void };

export function PreparednessPage({ onNavigate }: PreparednessProps) {
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecklist);
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

  const generateReport = async () => {
    try {
      const [connectivity, originalScenario, resilienceSimulation] = await Promise.all([
        dataService.loadConnectivity(), dataService.loadExerciseScenario(), dataService.loadResilienceSimulation(),
      ]);
      const scenario = deriveIndicativeRecords(connectivity, originalScenario);
      const priorities = priorityResults(connectivity, scenario.communities);
      if (priorities.length !== connectivity.features.filter((item) => item.properties.kind === 'community').length) {
        throw new Error('Community priority data are incomplete.');
      }
      await downloadDecisionSupportReport({
        stage: 'Preparedness planning',
        scenario,
        priorities,
        resilienceSimulation,
      });
      setNotice('All-communities decision-support report downloaded as a PDF.');
    } catch {
      setNotice('Report unavailable: community planning data could not be loaded. Please try again when the data are available.');
    }
  };

  const showLocation = () => {
    if (!navigator.geolocation) { setNotice('Location is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(() => setNotice('Your current location is available to the map.'), () => setNotice('Location access was not available.'));
  };

  return <section className="inner-page" aria-labelledby="preparedness-title">
    <h1 className="visually-hidden" id="preparedness-title">Preparedness</h1>
    <PageHero kicker="COMMUNITY PREPAREDNESS" title="Eight checks before an outage" titleId="checklist-title" status={`${complete} of ${checklist.length} complete`} />
    <div className="preparedness preparedness-redesign dashboard-container inner-page-content">
    <section className="preparedness-section" id="community-checklist" aria-labelledby="checklist-title">
      <div className="preparedness-workspace">
        <section className="readiness-checklist-panel">
          <div className="panel-title-row"><h3>Community readiness checklist</h3><strong>{percentage}% complete</strong></div>
          <div className="preparedness-progress" aria-label={`${percentage}% complete`}><i style={{ width: `${percentage}%` }} /></div>
          <div className="preparedness-check-items">{checklist.map(([key, title, copy], index) => <label className="preparedness-check-item" key={key}><input checked={Boolean(checks[key])} onChange={() => toggle(key)} type="checkbox" /><span className="check-item-icon" aria-hidden="true">{['⌂', '♧', 'ϟ', '◉', '♙', '✈', '+', '▤'][index]}</span><span className="check-item-copy"><strong>{title}</strong><small>{copy}</small></span></label>)}</div>
        </section>
        <aside className="offline-readiness-panel">
          <div className="network-status"><i aria-hidden="true" />{network ? 'Online — network available' : 'Offline — no network detected'}</div>
          <h3>Decision-support report</h3><p>Generate an all-communities PDF with modelled review priorities, planning capability and data limitations. Your device checklist is not included.</p>
          <div className="offline-contents"><strong>Included in this report:</strong><span>◒ <b>Exercise scenario and stage</b></span><span>⌂ <b>Community priorities and resources</b></span><span>▤ <b>Planning capability overview</b></span><span>▦ <b>Data and verification notes</b></span></div>
          <button className="offline-save-button" onClick={() => void generateReport()} type="button"><span aria-hidden="true">▤</span> Download decision-support report</button>
          <div className="offline-meta"><span>Format:</span><strong>PDF</strong><span>Data status:</span><strong>Simulated planning data</strong></div>
          <p className="offline-warning"><span aria-hidden="true">▲</span> This report supports planning only. Verify current conditions locally.</p>
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
    </div>
  </section>;
}

function FieldTool({ icon, title, copy, label, onClick }: { icon: string; title: string; copy: string; label: string; onClick: () => void }) { return <article className="field-tool-card"><span className="field-tool-icon" aria-hidden="true">{icon}</span><h3>{title}</h3><p>{copy}</p><button onClick={onClick} type="button">{label}</button></article>; }
