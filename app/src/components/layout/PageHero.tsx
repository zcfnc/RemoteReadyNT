import type { ReactNode } from 'react';
import { heroBackground } from './heroBackground';

type PageHeroProps = {
  kicker: string;
  title: string;
  titleId: string;
  status?: ReactNode;
};

export function PageHero({ kicker, title, titleId, status }: PageHeroProps) {
  return <header className="page-hero" style={{ backgroundImage: heroBackground }}>
    <div className="dashboard-container">
      <span className="page-hero-kicker">{kicker}</span>
      <h2 id={titleId}>{title}</h2>
      {status && <p className="page-hero-status">{status}</p>}
    </div>
  </header>;
}
