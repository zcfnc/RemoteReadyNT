import { useSourceData } from '../features/sources/useSourceData';

export function DataSourcesPage() {
  const { sourceLog, facilities, optionalWarnings, error } = useSourceData();
  if (error) return <section className="page page-sources"><div className="sources-error"><h1>Source catalogue unavailable</h1><p>{error}</p></div></section>;
  const sources = Object.values(sourceLog?.sources ?? {});
  const available = sources.filter((source) => source.status === 'ok').length;
  const displayedFacilities = facilities?.features.filter((item) => item.properties.name && !item.properties.name.startsWith('Unnamed') && item.properties.kind !== 'shelter').length;
  const downloadLog = () => {
    if (!sourceLog) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(sourceLog, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'remoteready-nt-source-log.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="sources-page" aria-labelledby="sources-title">
    <header className="sources-hero"><div><p className="eyebrow">TRANSPARENT BY DESIGN</p><h1 id="sources-title">Data sources and freshness</h1><p>Every map layer identifies where it came from, when it was refreshed and how it is used in this exercise.</p></div><button disabled={!sourceLog} onClick={downloadLog} type="button">Download source log</button></header>
    {optionalWarnings.length > 0 && <p className="source-warning">{optionalWarnings.join(' ')} Core public data remains available.</p>}
    <div className="source-content"><section className="source-metrics"><Metric label="LAST REFRESH ATTEMPT" value={sourceLog?.last_attempt ?? 'Loading'} /><Metric label="CONNECTIVITY LOCATIONS" value={String(sourceLog?.counts?.connectivity ?? '—')} /><Metric label="DISPLAYED FACILITIES" value={displayedFacilities === undefined ? 'Loading' : String(displayedFacilities)} /><Metric label="SOURCE STATUS" value={sourceLog ? `${available} of ${sources.length} available` : 'Loading'} /></section>
      <section className="source-catalogue"><div><p className="eyebrow">CATALOGUE</p><h2>Imported and reference datasets</h2></div><p>“Available” means the source responded during the latest refresh; it does not certify data as current.</p><div className="source-grid">{sources.map((source) => <article className={source.status === 'ok' ? 'source-card' : 'source-card unavailable'} key={`${source.title}-${source.url}`}><div><h3>{source.title ?? 'Public data source'}</h3><p>{source.provider ?? 'Source provider'}{source.records ? ` · ${source.records.toLocaleString()} imported records` : ''}</p></div><span>{source.type ?? 'reference'}</span><small>{source.status === 'ok' ? '● AVAILABLE AT REFRESH' : '● USING CACHED OR DEMO DATA'}</small>{source.url ? <a href={source.url} rel="noreferrer" target="_blank">Open official source ↗</a> : <span />}</article>)}</div></section>
      <section className="method-card"><p className="eyebrow">DATA BOUNDARIES</p><h2>How this exercise uses information</h2><div><p><strong>Published location data</strong> Community, small-cell and facility locations come from listed public datasets. Location does not confirm current service.</p><p><strong>Historical context</strong> TC Lam provides historical context, not a current forecast.</p><p><strong>Scenario input</strong> Exposure, redundancy, access and resources are simulated exercise assumptions.</p><p><strong>Safety boundary</strong> Network, road, facility and personnel conditions remain not confirmed and must be verified locally.</p></div></section>
    </div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article><small>{label}</small><strong>{value}</strong></article>; }
