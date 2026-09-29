const members = [
  { id: '01', name: 'SURESH BHANDARI', role: 'Data Research & Validation', program: 'Master of IT', contribution: 'Public dataset research, source documentation and data validation.', tone: 'blue', photo: '/assets/team-member-1-v3.jpeg' },
  { id: '02', name: 'SIHAO CUI', role: 'Frontend Engineering', program: 'Master of IT', contribution: 'React interface development, responsive layouts and offline-ready features.', tone: 'red', photo: '/assets/team-member-2.jpeg' },
  { id: '03', name: 'KEKE CHEN', role: 'Geospatial Data & Analytics', program: 'Master of IT', contribution: 'Leaflet mapping, GeoJSON processing and community resilience analysis.', tone: 'green', photo: '/assets/team-member-3.jpg' },
  { id: '04', name: 'Aiden XIE', role: 'Product Design & User Experience', program: 'Master of IT', contribution: 'Product structure, user experience and decision-support report design.', tone: 'orange', photo: '/assets/team-member-4.jpeg' },
] as const;

const principles = [
  { icon: '▤', title: 'Evidence-led', copy: 'We use trusted public datasets and clearly label exercise assumptions.', tone: 'blue' },
  { icon: '●●●', title: 'Community focused', copy: 'We design around remote communities, local context and practical needs.', tone: 'red' },
  { icon: '✓', title: 'Built for preparedness', copy: 'We turn complex information into clearer decisions before disruption.', tone: 'green' },
] as const;

export function AboutPage() {
  return <section className="about-page" aria-labelledby="about-team-title">
    <div className="dashboard-visual-strip" aria-label="RemoteReady NT focus areas">
      <StripTile icon="◒" label="Cyclones and severe weather" tone="storm" />
      <StripTile icon="✈" label="Access and supply" tone="access" />
      <StripTile icon="◉" label="Communications" tone="comms" />
      <StripTile icon="✦" label="Stronger, safer communities" tone="water" />
    </div>

    <header className="about-section-heading">
      <span>OUR TEAM</span>
      <h2 id="about-team-title">Meet the RemoteReady NT team</h2>
    </header>
    <p className="about-introduction">We are four students who created RemoteReady NT for the <strong>CDU IT Code Fair Data Innovation Challenge.</strong><br />Our project combines public data, interactive mapping and decision support for emergency connectivity and preparedness across remote Northern Territory communities.</p>

    <div className="about-team-grid">
      {members.map((member) => <article className={`about-member-card ${member.tone}`} key={member.id}>
        <div className={`member-avatar ${member.photo ? 'has-photo' : ''}`} aria-hidden="true">{member.photo ? <img alt="" src={member.photo} /> : <span />}</div>
        <div className="member-content"><div className="member-identity"><small>TEAM {member.id}</small><h3>{member.name}</h3><strong>{member.role}</strong></div><dl><div><dt><DetailIcon kind="program" />Program</dt><dd>{member.program}</dd></div><div><dt><DetailIcon kind="contribution" />Contribution</dt><dd>{member.contribution}</dd></div></dl></div>
      </article>)}
    </div>

    <section className="about-working" aria-labelledby="working-title"><h2 id="working-title">How we worked</h2><div>{principles.map((item) => <article className={item.tone} key={item.title}><span aria-hidden="true">{item.icon}</span><div><h3>{item.title}</h3><p>{item.copy}</p></div></article>)}</div></section>

    <section className="about-facts" aria-label="Project facts"><Fact value="4" label="team members" /><Fact value="8" label="public data sources" /><Fact value="64" label="remote communities" /><Fact value="1" label="shared goal" /></section>
    <footer className="dashboard-footer"><span><strong>RemoteReady NT</strong><small>Emergency connectivity and preparedness</small></span><span>CDU IT Code Fair · Data Innovation Challenge</span></footer>
  </section>;
}

function StripTile({ icon, label, tone }: { icon: string; label: string; tone: string }) {
  return <div className={`strip-tile ${tone}`}><span aria-hidden="true">{icon}</span><strong>{label}</strong></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function DetailIcon({ kind }: { kind: 'program' | 'contribution' }) {
  if (kind === 'program') return <svg aria-hidden="true" className="member-detail-icon" viewBox="0 0 24 24"><path d="m3 8 9-4 9 4-9 4-9-4Z" /><path d="M6.5 10v5.2c2.8 2.1 8.2 2.1 11 0V10M21 8v6" /></svg>;
  return <svg aria-hidden="true" className="member-detail-icon" viewBox="0 0 24 24"><path d="M6 3.5h9l3 3V20.5H6z" /><path d="M15 3.5v3h3M9 11h6M9 14.5h6M9 18h4" /></svg>;
}
