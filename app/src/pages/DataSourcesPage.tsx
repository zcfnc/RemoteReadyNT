import { PageHero } from '../components/layout/PageHero';
import type { SourceLog, SourceRecord } from '../types/data';
import { useSourceData } from '../features/sources/useSourceData';


const dataUseCards = [
  { icon: '⌖', title: 'Published locations', copy: 'Community, facility and communications locations come from listed public datasets and support situational awareness.' },
  { icon: '◷', title: 'Historical context', copy: 'Historical weather, cyclone and connectivity records help identify risks and inform exercise planning.' },
  { icon: '⌁', title: 'Modelled exercise', copy: 'Published data is combined with scenario assumptions to explore possible service outages and support needs.' },
  { icon: '▤', title: 'Verify locally', copy: 'Network, access and service conditions must be confirmed with local organisations and community contacts.' },
];

const importedDatasets = [
  {
    id: 'stand-sky-muster',
    title: 'STAND Sky Muster satellite deployments',
    provider: 'Department of Infrastructure, Transport, Regional Development, Communications, Sport and the Arts',
    description: 'Mapped public Sky Muster satellite deployments intended to provide an additional communications option at selected emergency-service and evacuation sites.',
    records: '1,255 mapped features',
    category: 'Emergency satellite locations',
    fileName: 'stand_sky_muster_deployments.geojson',
    sourceDate: '18 Sept 2026',
    license: 'License to verify from source metadata',
    limitation: 'Illustrative only. The publisher warns that listed sites may not be available during an emergency; this does not prove community-wide access or a tested independent route.',
    url: 'https://spatial.infrastructure.gov.au/server/rest/services/Strengthening_Telecommunications_Against_Natural_Disasters/MapServer',
    icon: 'stand',
  },
  {
    id: 'mnhp-stage-1',
    title: 'MNHP Stage 1 funded base stations',
    provider: 'Department of Infrastructure, Transport, Regional Development, Communications, Sport and the Arts',
    description: 'National base-station locations funded for resilience upgrades under the Mobile Network Hardening Program (MNHP). Stage 1 includes a program target of at least 12 hours of battery backup at the funded sites.',
    records: 'Funded base-station locations',
    category: 'Backup power upgrade program',
    fileName: 'mnhp_round_1_stage_1_funded_base_stations.kml',
    sourceDate: '18 Sept 2026',
    license: 'CC BY-SA 4.0',
    limitation: 'Funding/upgrade records do not confirm present operation, current battery runtime, maintenance or a community-level test.',
    url: 'https://data.gov.au/data/en/dataset/mobile-network-hardening-program-mnhp-round-1',
    icon: 'mnhp',
  },
  {
    id: 'mnhp-stage-2',
    title: 'MNHP Stage 2 funded base stations',
    provider: 'Department of Infrastructure, Transport, Regional Development, Communications, Sport and the Arts',
    description: 'National base-station locations funded for resilience upgrades, including backup power, generators, batteries and transmission resilience.',
    records: 'Funded base-station locations',
    category: 'Network resilience upgrades',
    fileName: 'mnhp_round_1_stage_2_funded_base_stations.kml',
    sourceDate: '18 Sept 2026',
    license: 'CC BY-SA 4.0',
    limitation: 'A funded upgrade does not confirm current operation, prove an independent end-to-end route or show that failover was tested for a community.',
    url: 'https://data.gov.au/data/en/dataset/mobile-network-hardening-program-mnhp-round-1',
    icon: 'mnhp',
  },
];

export function DataSourcesPage() {
  const { sourceLog, optionalWarnings, error } = useSourceData();
  if (error) return <section className="page page-sources"><div className="sources-error"><h1>Source catalogue unavailable</h1><p>{error}</p></div></section>;

  const sources = Object.values(sourceLog?.sources ?? {}).sort((left, right) => sourceSortOrder(left) - sourceSortOrder(right));
  const available = sources.filter((source) => source.status === 'ok').length;
  const totalSources = sources.length;

  return <section className="inner-page" aria-labelledby="sources-title">
    <h2 className="visually-hidden" id="sources-title">Data sources and freshness</h2>
    <PageHero kicker="DATA CATALOGUE" title="Imported and reference datasets" titleId="source-catalogue-title" status={sourceLog ? `${available} of ${totalSources} automated sources available · ${importedDatasets.length} local imports` : `${importedDatasets.length} local imports · Loading source status`} />
    <div className="sources-page sources-redesign dashboard-container inner-page-content">
    {optionalWarnings.length > 0 && <p className="source-warning">{optionalWarnings.join(' ')} Core public data remains available.</p>}

    <section className="source-catalogue-redesign" id="source-catalogue" aria-labelledby="source-catalogue-title">
      <div className="source-record-grid">
        {sources.map((source) => <SourceRecordCard key={`${source.title}-${source.url}`} log={sourceLog} source={source} />)}
        {importedDatasets.map((dataset) => <ImportedDatasetCard key={dataset.id} dataset={dataset} />)}
      </div>
    </section>

    <section className="source-methodology" id="data-methodology" aria-labelledby="data-methodology-title">
      <header className="source-section-heading"><div><span>HOW THE DATA IS USED</span><h2 id="data-methodology-title">From source data to preparedness information</h2></div></header>
      <div className="source-method-grid">
        {dataUseCards.map((card) => <article key={card.title}><span aria-hidden="true">{card.icon}</span><h3>{card.title}</h3><p>{card.copy}</p></article>)}
      </div>
      <p className="source-boundary-warning" id="data-boundaries"><span aria-hidden="true">▲</span><strong>Published location data does not confirm current service availability. Exercise priorities are simulated and must be verified locally.</strong></p>
    </section>

    <footer className="dashboard-footer source-footer"><div className="dashboard-container dashboard-footer-inner"><span><strong>RemoteReady NT</strong><small>Emergency communications and preparedness</small></span><span>Prototype only · Verify emergency information locally</span></div></footer>
    </div>
  </section>;
}

function SourceRecordCard({ log, source }: { log?: SourceLog; source: SourceRecord }) {
  const isAvailable = source.status === 'ok';
  const records = sourceRecordLabel(source, log);
  const sourceType = sourceCategory(source);
  return <article className={`source-record ${isAvailable ? 'available' : 'unavailable'}`}>
    <div className="source-record-main">
      <SourceGlyph source={source} />
      <div className="source-record-heading">
        <h3>{sourceDisplayTitle(source)}</h3>
        <p>{sourceDisplayProvider(source)}</p>
      </div>
      <small>{sourceDescription(source)}</small>
      <b>{records}<i />{sourceType}</b>
    </div>
    <div className="source-record-status">
      <strong>
        <span aria-hidden="true">{isAvailable ? '✓' : '△'}</span>
        {isAvailable ? 'AVAILABLE AT REFRESH' : 'CACHED / SOURCE UNAVAILABLE'}
      </strong>
      <div className="source-record-updated">
        <span>Last updated</span>
        <time dateTime={log?.last_attempt}>{formatDate(log?.last_attempt)}</time>
      </div>
      {!isAvailable && source.error && <span>{source.error}</span>}
      {source.url && <a href={source.url} rel="noreferrer" target="_blank">Open official source →</a>}
    </div>
  </article>;
}

function ImportedDatasetCard({ dataset }: { dataset: typeof importedDatasets[number] }) {
  return <article className="source-record available imported">
    <div className="source-record-main">
      <ImportedDatasetGlyph icon={dataset.icon} />
      <div className="source-record-heading">
        <h3>{dataset.title}</h3>
        <p>{dataset.provider}</p>
      </div>
      <small>{dataset.description}</small>
      <b>{dataset.records}<i />{dataset.category}</b>
    </div>
    <div className="source-record-status">
      <strong><span aria-hidden="true">✓</span>AVAILABLE AT REFRESH</strong>
      <div className="source-record-updated">
        <span>Last updated</span>
        <span>{dataset.sourceDate}</span>
      </div>
      <a href={dataset.url} rel="noreferrer" target="_blank">Open official source →</a>
    </div>
  </article>;
}

function ImportedDatasetGlyph({ icon }: { icon: string }) {
  if (icon === 'stand') return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 20h18M7 20l3-7m7 7-3-7m-4 0h4m-2 0V4m-4 2a6 6 0 0 1 8 0M6 3a10 10 0 0 1 12 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg></span>;
  return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M9 7V5h6v2m-3 3-2 3h3l-1 3 3-4h-3l1-2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7"/></svg></span>;
}

function sourceRecordLabel(source: SourceRecord, log?: SourceLog) {
  if (source.records) return `${source.records.toLocaleString('en-AU')} records`;
  const title = source.title?.toLowerCase() ?? '';
  if (title.includes('small cell')) return `${log?.counts?.small_cells ?? '—'} records`;
  if (title.includes('remote community mobile')) return `${log?.counts?.communities ?? '—'} records`;
  if (!source.status || source.status === 'unavailable') return 'Source unavailable at refresh';
  return 'Reference source';
}

function sourceSortOrder(source: SourceRecord) {
  const title = source.title?.toLowerCase() ?? '';
  if (source.status === 'unavailable') return 90;
  if (title.includes('remote community mobile')) return 10;
  if (title.includes('small cell')) return 20;
  if (title.includes('essential service')) return 30;
  if (title.includes('cyclone')) return 40;
  if (title.includes('first nations')) return 50;
  if (title.includes('census')) return 60;
  return 70;
}

function sourceDisplayTitle(source: SourceRecord) {
  const title = source.title?.toLowerCase() ?? '';
  if (title.includes('remote community mobile')) return 'NT Remote Communities Mobile Coverage';
  if (title.includes('small cell')) return 'NT Small Cell Coverage';
  if (title.includes('essential service')) return 'OpenStreetMap Essential Facilities';
  if (title.includes('cyclone')) return 'Bureau of Meteorology Tropical Cyclone Database';
  if (title.includes('first nations')) return 'First Nations Digital Inclusion';
  if (title.includes('census')) return 'ABS Census DataPacks';
  if (title.includes('mobile infrastructure')) return 'ACCC Mobile Infrastructure Report 2025';
  if (title.includes('mobile coverage')) return 'NT Mobile Coverage';
  return source.title ?? 'Public data source';
}

function sourceDisplayProvider(source: SourceRecord) {
  const title = source.title?.toLowerCase() ?? '';
  if (title.includes('remote community mobile')) return 'Department of Infrastructure, Planning and Logistics (NT)';
  if (title.includes('small cell')) return 'Northern Territory Government Open Data';
  if (title.includes('essential service')) return 'OpenStreetMap Community';
  if (title.includes('cyclone')) return 'Bureau of Meteorology';
  if (title.includes('first nations')) return 'Australian Government';
  if (title.includes('census')) return 'Australian Bureau of Statistics';
  if (title.includes('mobile infrastructure')) return 'Australian Competition and Consumer Commission';
  return source.provider ?? 'Source provider';
}

function sourceCategory(source: SourceRecord) {
  const title = source.title?.toLowerCase() ?? '';
  if (source.status === 'unavailable') return 'Report and data tables';
  if (title.includes('remote community mobile')) return 'Community coverage locations';
  if (title.includes('small cell')) return 'Small cell locations';
  if (title.includes('essential service')) return 'Facilities and services';
  if (title.includes('cyclone')) return 'Cyclone events';
  if (title.includes('first nations')) return 'Communities and programs';
  if (title.includes('census')) return 'Community statistics';
  return 'Mobile sites and coverage areas';
}

function sourceDescription(source: SourceRecord) {
  const title = source.title?.toLowerCase() ?? '';
  if (title.includes('small cell')) return 'Published small-cell and remote communications site locations in the Northern Territory.';
  if (title.includes('remote community')) return 'Mobile coverage information for remote NT communities used for preparedness planning and exercise scenarios.';
  if (title.includes('facility') || title.includes('essential service')) return 'Community-maintained locations for health, education and community services across the NT.';
  if (title.includes('cyclone')) return 'Historical tropical cyclone tracks and reference information for the Australian region.';
  if (title.includes('inclusion')) return 'Digital inclusion policy and connectivity context for First Nations communities.';
  if (title.includes('census')) return 'Census data resources supporting community and population context.';
  if (title.includes('infrastructure report')) return 'National mobile infrastructure, competition and regional coverage report reference.';
  if (title.includes('mobile coverage')) return 'Published mobile network coverage areas and site references across the Northern Territory.';
  return 'Published source reference used to support connectivity and preparedness information.';
}

function SourceGlyph({ source }: { source: SourceRecord }) {
  const title = source.title?.toLowerCase() ?? '';
  const common = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.7 };
  if (title.includes('remote community mobile')) return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path {...common} d="m2.5 11 4.5-3.5 4.5 3.5v7H2.5Z" /><path {...common} d="M5.3 18v-4.2h3.4V18M17 19v-7.4M14.5 19h5" /><circle {...common} cx="17" cy="9.5" r="1.3" /><path {...common} d="M13.8 6.5a4.5 4.5 0 0 0 0 6M20.2 6.5a4.5 4.5 0 0 1 0 6" /></svg></span>;
  if (title.includes('small cell')) return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path {...common} d="M12 20V9M9 20h6M10 9V5h4v4Z" /><circle {...common} cx="12" cy="7" r=".8" /><path {...common} d="M7.7 4.2a4.8 4.8 0 0 0 0 5.6M16.3 4.2a4.8 4.8 0 0 1 0 5.6M5.2 2a8 8 0 0 0 0 10" /></svg></span>;
  if (title.includes('mobile coverage')) return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path {...common} d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2Z" /><path {...common} d="M9 3v15M15 6v15" /><circle {...common} cx="16.8" cy="9.3" r="1" /><path {...common} d="M14.8 7.2a3 3 0 0 0 0 4.2M18.8 7.2a3 3 0 0 1 0 4.2" /></svg></span>;
  if (title.includes('cyclone')) return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path {...common} d="M7.5 18.5h9a4 4 0 0 0 .7-7.94A5.8 5.8 0 0 0 6.1 9.3 4.6 4.6 0 0 0 7.5 18.5Z" /></svg></span>;
  if (title.includes('essential service')) return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path {...common} d="m3 5 5-2 8 3 5-2v15l-5 2-8-3-5 2Z" /><path {...common} d="M8 3v15M16 6v15" /></svg></span>;
  if (title.includes('first nations')) return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle {...common} cx="9" cy="8" r="3" /><circle {...common} cx="17" cy="9" r="2.4" /><path {...common} d="M3.5 20v-3.2A4.8 4.8 0 0 1 8.3 12h1.4a4.8 4.8 0 0 1 4.8 4.8V20M14.8 13.3h1.7a4 4 0 0 1 4 4V20" /></svg></span>;
  if (title.includes('census')) return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path {...common} d="M4 20V12h4v8M10 20V7h4v13M16 20V3h4v17M3 20h18" /></svg></span>;
  if (title.includes('report')) return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path {...common} d="M5 3h10l4 4v14H5Z" /><path {...common} d="M15 3v5h5M8 12h8M8 16h8" /></svg></span>;
  return <span className="source-record-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path {...common} d="M12 21V8M8.5 21h7M9.5 15h5M10.7 8h2.6l2.2 7h-7Z" /><path {...common} d="M7 5.5a7 7 0 0 0 0 7M17 5.5a7 7 0 0 1 0 7M4.5 3a10.5 10.5 0 0 0 0 12M19.5 3a10.5 10.5 0 0 1 0 12" /></svg></span>;
}

function formatDate(value?: string) {
  if (!value) return 'Loading';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
