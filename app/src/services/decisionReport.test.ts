import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import simulationJson from '../../public/data/community-resilience-simulation.json';
import type { ConnectivityProperties, ExerciseScenario, FeatureCollection, ResilienceSimulationData } from '../types/data';
import { priorityResults } from '../features/dashboard/dashboard';
import { deriveIndicativeRecords } from '../features/dashboard/useDashboardData';
import { createAllCommunitiesReport, createCommunityReport, createDecisionSupportDocument, portfolioReportSummary, resilienceReportView } from './decisionReport';

const simulation = simulationJson as unknown as ResilienceSimulationData;
const connectivity = JSON.parse(readFileSync('public/data/connectivity.geojson', 'utf8')) as FeatureCollection<ConnectivityProperties>;
const exercise = JSON.parse(readFileSync('public/data/lam-exercise-scenario.json', 'utf8')) as ExerciseScenario;

describe('decision report resilience summary', () => {
  it('uses a community score breakdown that exactly matches the dashboard baseline', () => {
    const community = simulation.communities.find((item) => item.communityId === 'minjilang')!;
    const view = resilienceReportView(simulation, 'minjilang');

    expect(view).not.toBeNull();
    expect(view?.score).toBe(community.baselineScore);
    expect(view?.dimensions.reduce((total, item) => total + item.points, 0)).toBe(community.baselineScore);
    expect(view?.dimensions.reduce((total, item) => total + item.weight, 0)).toBe(100);
    expect(view?.sourceSupportedCount).toBe(2);
    expect(view?.simulatedCount).toBe(3);
    expect(view?.level).toMatch(/planning/);
    expect(view?.sourceNames).toContain('Mobile Network Hardening Program (MNHP)');
    expect(view?.recommendations.length).toBeGreaterThan(0);
  });

  it('returns no score when the community is unmatched or its total is inconsistent', () => {
    expect(resilienceReportView(simulation, 'not-a-community')).toBeNull();
    const changed = structuredClone(simulation);
    changed.communities[0].baselineScore += 1;
    expect(resilienceReportView(changed, changed.communities[0].communityId)).toBeNull();
  });

  it('marks unsupported scores as not available instead of inferring zero', () => {
    expect(resilienceReportView(undefined, 'minjilang')).toBeNull();
    expect(resilienceReportView(simulation, undefined)).toBeNull();
  });

  it('renders selected-community and all-community PDF layouts with the added score content', async () => {
    const priorities = priorityResults(connectivity, exercise.communities);
    const galiwinku = connectivity.features.find((item) => item.properties.id === 'galiwinku')!;
    const record = exercise.communities.find((item) => item.community_id === 'galiwinku')!;
    const common = { stage: 'Planning', generatedAt: new Date('2026-09-30T00:00:00Z'), scenario: exercise, priorities, resilienceSimulation: simulation, checklist: [] };

    const selectedDoc = await createDecisionSupportDocument({ ...common, selectedCommunity: { id: 'galiwinku', name: galiwinku.properties.name, facilities: [], record } });
    const allCommunitiesDoc = await createDecisionSupportDocument(common);

    expect(selectedDoc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(allCommunitiesDoc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(selectedDoc.getNumberOfPages()).toBeLessThanOrEqual(5);
    expect(allCommunitiesDoc.getNumberOfPages()).toBeLessThanOrEqual(5);
  });

  it('separates the 64-community portfolio from selected-community report content', async () => {
    const scenario = deriveIndicativeRecords(connectivity, exercise);
    const priorities = priorityResults(connectivity, scenario.communities);
    const common = { stage: 'Planning', generatedAt: new Date('2026-09-30T00:00:00Z'), scenario, priorities, resilienceSimulation: simulation };
    const summary = portfolioReportSummary(common);
    expect(summary).toMatchObject({ assessed: 64, early: 18, developing: 38, strong: 8, priorityCount: 64, original: 7, derived: 57, matched: 32, unmatched: 32, supportedDimensions: 33, simulatedDimensions: 287 });
    expect(summary.mean?.toFixed(1)).toBe('48.2');
    expect(summary.confidence).toEqual({ low: 60, medium: 4, high: 0 });

    const portfolio = await createAllCommunitiesReport(common);
    const galiwinku = connectivity.features.find((item) => item.properties.id === 'galiwinku')!;
    const minjilang = connectivity.features.find((item) => item.properties.id === 'minjilang')!;
    const community = (feature: typeof galiwinku) => createCommunityReport({ ...common, selectedCommunity: {
      id: feature.properties.id, name: feature.properties.name, provider: feature.properties.provider,
      coverage: feature.properties.coverage, backhaul: feature.properties.backhaul, facilities: feature.properties.facilities ?? [],
      record: scenario.communities.find((item) => item.community_id === feature.properties.id),
    } });
    const publishedMatch = await community(minjilang);
    const mostlySimulated = await community(galiwinku);
    const pageText = (doc: typeof portfolio, page: number) => ((doc.internal.pages as unknown as string[][])[page] ?? []).join('\n');
    const portfolioText = Array.from({ length: portfolio.getNumberOfPages() }, (_, index) => pageText(portfolio, index + 1)).join('\n');
    expect(portfolio.getNumberOfPages()).toBe(6);
    expect(publishedMatch.getNumberOfPages()).toBe(4);
    expect(mostlySimulated.getNumberOfPages()).toBe(4);
    expect(portfolioText).toContain('Whole-of-Exercise Overview');
    expect(portfolioText).toContain('Community review priorities');
    expect(portfolioText).toContain('Portfolio Insights');
    expect(portfolioText).toContain('Data sources and limitations');
    expect(portfolioText).not.toContain('Coverage record');
    expect(portfolioText).not.toContain('Device checklist progress');
    expect(portfolioText).not.toContain('Verification checklist');
    expect(portfolioText).not.toContain('Resilience / 100');
    for (const item of connectivity.features.filter((feature) => feature.properties.kind === 'community')) {
      expect(portfolioText).toContain(item.properties.name);
    }
    for (let page = 1; page <= portfolio.getNumberOfPages(); page += 1) {
      expect(pageText(portfolio, page)).toContain('SIMULATED PLANNING INFORMATION');
      expect(pageText(portfolio, page)).toContain(`Page ${page} of ${portfolio.getNumberOfPages()}`);
    }
    for (let page = 2; page <= 4; page += 1) {
      expect(pageText(portfolio, page)).toContain('Community review priorities');
      expect(pageText(portfolio, page)).toContain('Priority score');
    }
    expect(pageText(portfolio, 5)).toContain('Portfolio Insights');
    expect(pageText(portfolio, 6)).toContain('Data sources and limitations');
    expect(pageText(publishedMatch, 2)).toContain('published');
    expect(pageText(mostlySimulated, 2)).toContain('simulated planning values');
    expect(pageText(publishedMatch, 3)).toContain('Device checklist progress');
    if (process.env.WRITE_REPORT_PREVIEW === '1') {
      mkdirSync('output/pdf', { recursive: true });
      for (const [name, doc] of [['all-communities-portfolio', portfolio], ['Minjilang-community', publishedMatch], ['Galiwinku-community', mostlySimulated]] as const) {
        writeFileSync(`output/pdf/RemoteReady-NT-${name}-preview-2026-09-30.pdf`, new Uint8Array(doc.output('arraybuffer')));
      }
    }
  });

  it('does not generate an empty all-communities ranking', async () => {
    await expect(createAllCommunitiesReport({ stage: 'Planning', resilienceSimulation: simulation })).rejects.toThrow('requires community review-priority records');
  });

  it('keeps the Alyangula source table together across pages', async () => {
    const point = connectivity.features.find((item) => item.properties.id === 'alyangula')!;
    const doc = await createDecisionSupportDocument({
      stage: '48 hours before',
      generatedAt: new Date('2026-09-30T00:00:00Z'),
      scenario: exercise,
      priorities: priorityResults(connectivity, exercise.communities),
      resilienceSimulation: simulation,
      checklist: [
        'Download the local map and community pack', 'Confirm emergency contacts', 'Test backup power', 'Test satellite or radio backup',
        'Confirm the community meeting point', 'Review road and air access', 'Prepare essential health information', 'Run a no-signal drill',
      ].map((title) => ({ title, done: false })),
      selectedCommunity: {
        id: 'alyangula', name: point.properties.name, region: point.properties.region,
        provider: point.properties.provider, coverage: point.properties.coverage, backhaul: point.properties.backhaul,
        facilities: point.properties.facilities ?? [],
      },
    });
    expect(resilienceReportView(simulation, 'alyangula')?.score).toBe(55);
    expect(doc.getNumberOfPages()).toBe(4);
    const pageText = (page: number) => ((doc.internal.pages as unknown as string[][])[page] ?? []).join('\n');
    expect(pageText(1)).toContain('Coverage record');
    expect(pageText(1)).toContain('Planning review priority');
    expect(pageText(2)).toContain('Scenario planning score');
    expect(pageText(2)).toContain('Developing planning capability');
    expect(pageText(4)).toContain('Data sources and limitations');
    expect(pageText(4)).toContain('Secure NT Emergency Alert guidance');
    expect(pageText(4)).toContain('Northern Territory Government Open Data');
    expect(pageText(4)).toContain('RemoteReady NT exercise model');
    if (process.env.WRITE_REPORT_PREVIEW === '1') {
      mkdirSync('output/pdf', { recursive: true });
      writeFileSync('output/pdf/RemoteReady-NT-decision-support-Alyangula-2026-09-30.pdf', new Uint8Array(doc.output('arraybuffer')));
    }
  });
});
