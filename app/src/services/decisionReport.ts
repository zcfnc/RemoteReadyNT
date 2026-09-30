import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { ExerciseCommunity, ResilienceDimensionId, ResilienceSimulationData } from '../types/data';
import type { PriorityResult } from '../features/dashboard/dashboard';

export type ReportChecklistItem = { title: string; done: boolean };
export type SelectedCommunityReport = {
  id: string;
  name: string;
  region?: string | null;
  provider?: string | null;
  coverage?: string | null;
  backhaul?: string | null;
  facilities: string[];
  record?: ExerciseCommunity;
};

export type DecisionReportInput = {
  stage: string;
  generatedAt?: Date;
  scenario?: { exercise_id: string; updated_at: string; notice: string; communities: ExerciseCommunity[] };
  priorities?: PriorityResult[];
  resilienceSimulation?: ResilienceSimulationData;
  checklist?: ReportChecklistItem[];
  selectedCommunity?: SelectedCommunityReport;
};

export type ResilienceReportView = {
  score: number;
  level: string;
  simulatedCount: number;
  sourceSupportedCount: number;
  dimensions: Array<{ id: ResilienceDimensionId; label: string; points: number; weight: number; status: string; basis: 'simulated' | 'published · not field verified' }>;
  recommendations: Array<{ title: string; detail: string }>;
  sourceNames: string[];
};

const resilienceOrder: ResilienceDimensionId[] = ['route_redundancy', 'backup_power', 'critical_service_continuity', 'alerts_and_offline', 'operational_readiness'];

export function resilienceReportView(data: ResilienceSimulationData | undefined, communityId: string | undefined): ResilienceReportView | null {
  if (!data || !communityId) return null;
  const scenario = data.communities.find((item) => item.communityId === communityId);
  if (!scenario) return null;
  const dimensions = resilienceOrder.map((id) => {
    const value = scenario.dimensions[id];
    const definition = data.dimensions[id];
    if (!value || !definition || !definition.states.some((state) => state.id === value.state && state.level === value.level) || value.points !== definition.weight * value.level) return null;
    return {
      id,
      label: definition.label,
      points: value.points,
      weight: definition.weight,
      status: humanise(value.state),
      basis: value.sourceType === 'evidence' ? 'published · not field verified' as const : 'simulated' as const,
    };
  });
  if (dimensions.some((item) => !item)) return null;
  const validDimensions = dimensions as NonNullable<(typeof dimensions)[number]>[];
  const score = Math.round(validDimensions.reduce((total, item) => total + item.points, 0) * 10) / 10;
  if (score !== scenario.baselineScore) return null;
  const sourceSupportedCount = validDimensions.filter((item) => item.basis === 'published · not field verified').length;
  const simulatedCount = validDimensions.length - sourceSupportedCount;
  const level = score < 40 ? 'Early planning capability' : score < 70 ? 'Developing planning capability' : 'Strong planning capability';
  const resources = new Map(data.resourceCatalog.map((resource) => [resource.id, resource]));
  const eligible = scenario.resourceEvaluations
    .filter((item) => item.planningEligible && item.scoreAfter !== null && item.upliftPoints !== null)
    .sort((left, right) => (right.upliftPoints ?? 0) - (left.upliftPoints ?? 0))
    .slice(0, 3)
    .flatMap((evaluation) => {
      const resource = resources.get(evaluation.resourceId);
      if (!resource) return [];
      const prerequisiteText = Object.entries(resource.prerequisites).map(([id, minimum]) => `${data.dimensions[id as ResilienceDimensionId]?.label ?? id} at least ${Math.round(minimum * 100)}%`).join('; ');
      return [{
        title: `Consider planning for ${resource.label}`,
        detail: `Modelled score change: +${evaluation.upliftPoints!.toFixed(1)} points. This is an illustrative option, not a guaranteed outcome.${prerequisiteText ? ` Prerequisites to verify: ${prerequisiteText}.` : ''}`,
      }];
    });
  const recommendations = eligible.length ? eligible : scenario.gapDimensions.slice(0, 3).map((id) => ({
    title: `Review ${data.dimensions[id].label.toLowerCase()}`,
    detail: `This is a planning gap in the current scenario. Confirm the local arrangements and needs before choosing an action.`,
  }));
  const sourceNames = [...new Set(resilienceOrder.flatMap((id) => scenario.dimensions[id].sourcesReviewed?.map((source) => source.name) ?? []))];
  return { score, level, simulatedCount, sourceSupportedCount, dimensions: validDimensions, recommendations, sourceNames };
}

const colours = {
  navy: [7, 51, 78] as const,
  blue: [25, 105, 151] as const,
  cyan: [44, 169, 201] as const,
  green: [42, 145, 86] as const,
  amber: [237, 166, 28] as const,
  red: [194, 47, 47] as const,
  ink: [25, 44, 57] as const,
  muted: [82, 106, 121] as const,
  paleGreen: [232, 246, 236] as const,
  line: [207, 220, 226] as const,
};

async function loadBrandIcon() {
  try {
    const response = await fetch('/assets/remoteready-nt-icon.png');
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

function humanise(value?: string | null) {
  return value ? value.replaceAll('_', ' ') : 'Not linked';
}

function addHeader(doc: jsPDF, input: DecisionReportInput, generatedAt: Date, logo?: string) {
  if (logo) doc.addImage(logo, 'PNG', 14, 10, 20, 20, undefined, 'FAST');
  else {
    doc.setFillColor(...colours.navy); doc.roundedRect(14, 10, 20, 20, 3, 3, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('RR', 24, 22, { align: 'center' });
  }
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('RemoteReady NT', 38, 17);
  doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text('Emergency connectivity and preparedness', 38, 22);
  doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Decision Support Report', 14, 39);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3);
  doc.text('Planning context: Communications resilience', 138, 14);
  doc.text(`Stage: ${input.stage}`, 138, 19);
  doc.text(`Generated: ${generatedAt.toLocaleDateString('en-AU')}`, 138, 24);
  doc.text(`Scope: ${input.selectedCommunity ? 'Selected community' : 'All communities'}`, 138, 29);
  doc.setFillColor(...colours.navy); doc.rect(14, 44, 182, 9, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.7);
  doc.text('SIMULATED PLANNING INFORMATION - NOT A LIVE INCIDENT REPORT', 18, 49.8);
  doc.setFont('helvetica', 'normal'); doc.text('Planning and preparedness use only', 192, 49.8, { align: 'right' });
}

function addFooter(doc: jsPDF, page: number, total: number) {
  doc.setDrawColor(...colours.line); doc.line(14, 282, 196, 282);
  doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('RemoteReady NT - Verify current conditions and emergency advice locally.', 14, 287);
  doc.text(`Page ${page} of ${total}`, 196, 287, { align: 'right' });
}

function sectionTitle(doc: jsPDF, title: string, y: number) {
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(title, 14, y);
  doc.setDrawColor(...colours.line); doc.line(14, y + 2.5, 196, y + 2.5);
}

function drawParagraph(doc: jsPDF, text: string, x: number, y: number, width: number, size = 8.4) {
  doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, width) as string[];
  doc.text(lines, x, y, { lineHeightFactor: 1.35 });
  return y + lines.length * size * 0.36 + 1.5;
}

function scoreFor(record: ExerciseCommunity | undefined, type: 'access' | 'essential' | 'redundancy' | 'confidence') {
  if (!record) return 0;
  if (type === 'access') return ({ highly_constrained: 1, constrained: 2, partly_constrained: 3, accessible_with_limits: 4 } as const)[record.access];
  if (type === 'essential') return ({ critical: 5, high: 4, medium: 3 } as const)[record.essential_service_priority];
  if (type === 'redundancy') return ({ fragile: 1, limited: 2, partial: 3, higher: 5 } as const)[record.redundancy];
  return ({ low: 1, medium: 3, high: 5 } as const)[record.confidence];
}

function drawMetricCard(doc: jsPDF, x: number, y: number, width: number, title: string, value: string, note: string, accent: readonly [number, number, number]) {
  doc.setFillColor(241, 247, 250); doc.setDrawColor(...colours.line); doc.roundedRect(x, y, width, 28, 1.2, 1.2, 'FD');
  doc.setFillColor(...accent); doc.rect(x, y, 2.2, 28, 'F');
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  const titleLines = doc.splitTextToSize(title, width - 9) as string[];
  doc.text(titleLines, x + 5, y + 6, { lineHeightFactor: 1.05 });
  const valueY = titleLines.length > 1 ? y + 18 : y + 15;
  doc.setFontSize(13); doc.text(value, x + 5, valueY);
  doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4);
  doc.text(doc.splitTextToSize(note, width - 9), x + 5, valueY + 5, { lineHeightFactor: 1.15 });
}

function drawCommunityOverview(doc: jsPDF, input: DecisionReportInput & { selectedCommunity: SelectedCommunityReport }) {
  const selected = input.selectedCommunity;
  const record = selected?.record;
  const selectedPriority = input.priorities?.find((item) => item.record.community_id === record?.community_id);
  let y = 61;
  sectionTitle(doc, 'Executive summary', y); y += 8;
  const summary = `${selected.name} is the selected community for this report. The assessment combines published communications and facility records with planning scenario assumptions. The current model indicates ${humanise(record?.exposure)} exposure, ${humanise(record?.redundancy)} communications redundancy and ${humanise(record?.access)} access. All operational decisions require local verification.`;
  const summaryBottom = drawParagraph(doc, summary, 14, y, 111, 8.2);
  doc.setDrawColor(...colours.line); doc.setFillColor(248, 251, 252); doc.roundedRect(130, 59, 66, 42, 1.5, 1.5, 'FD');
  doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('SELECTED COMMUNITY', 134, 66);
  doc.setTextColor(...colours.navy); doc.setFontSize(16); doc.text(selected.name, 134, 75);
  doc.setTextColor(...colours.blue); doc.setFontSize(8); doc.text(selected.region || 'Northern Territory', 134, 81);
  doc.setFillColor(...colours.navy); doc.roundedRect(134, 86, 27, 8, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(6.2); doc.text(selectedPriority ? 'REVIEW PRIORITY' : 'NOT ASSESSED', 147.5, 91.2, { align: 'center' });
  doc.setFillColor(...colours.amber); doc.roundedRect(164, 86, 27, 8, 1.5, 1.5, 'F');
  doc.setTextColor(...colours.navy); doc.text('VERIFY LOCALLY', 177.5, 91.2, { align: 'center' });
  y = Math.max(108, summaryBottom + 5);
  sectionTitle(doc, 'Key indicators', y); y += 6;
  drawMetricCard(doc, 14, y, 34.8, 'Coverage record', selected.coverage ? 'Linked' : 'Not linked', selected.coverage ? 'Recorded mobile coverage; does not confirm current service' : 'No coverage record linked', colours.blue);
  drawMetricCard(doc, 51, y, 34.8, 'Access', record ? `${scoreFor(record, 'access')} / 5` : '- / 5', humanise(record?.access), colours.amber);
  drawMetricCard(doc, 88, y, 34.8, 'Essential services', record ? `${scoreFor(record, 'essential')} / 5` : '- / 5', humanise(record?.essential_service_priority), colours.red);
  drawMetricCard(doc, 125, y, 34.8, 'Redundancy', record ? `${scoreFor(record, 'redundancy')} / 5` : '- / 5', humanise(record?.redundancy), colours.cyan);
  drawMetricCard(doc, 162, y, 34, 'Confidence', record ? `${scoreFor(record, 'confidence')} / 5` : '- / 5', humanise(record?.confidence), colours.green);
  y += 35;
  sectionTitle(doc, 'Planning review priority', y); y += 7;
  const score = selectedPriority?.score;
  if (score !== undefined) {
    doc.setFillColor(223, 230, 234); doc.roundedRect(14, y, 74, 6, 1, 1, 'F');
    const priorityColour = score >= 70 ? colours.red : colours.amber;
    doc.setFillColor(priorityColour[0], priorityColour[1], priorityColour[2]);
    doc.roundedRect(14, y, Math.max(2, 74 * Math.min(score, 100) / 100), 6, 1, 1, 'F');
    doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`${score.toFixed(0)} / 100`, 14, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...colours.muted);
    doc.text('Higher means earlier review, not better resilience.', 14, y + 19);
  } else {
    doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Not assessed', 14, y + 13);
  }
  doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4);
  const evidence = [
    `Communications: ${selected.provider || 'provider not linked'}; ${selected.backhaul || 'backhaul not linked'}`,
    `Facilities: ${selected.facilities.length ? selected.facilities.join(', ') : 'no linked facility references'}`,
    `Access: ${humanise(record?.access)}`,
    `Scenario confidence: ${humanise(record?.confidence)}`,
  ];
  let evidenceY = y;
  evidence.forEach((item) => {
    const evidenceLines = doc.splitTextToSize(`- ${item}`, 78) as string[];
    doc.text(evidenceLines, 118, evidenceY, { lineHeightFactor: 1.15 });
    evidenceY += evidenceLines.length * 3.4 + 1.2;
  });
  y = Math.max(y + 29, evidenceY + 3);
  doc.setFillColor(...colours.paleGreen); doc.setDrawColor(188, 223, 199); doc.roundedRect(14, y, 86, 32, 1.5, 1.5, 'FD');
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2); doc.text('Exercise resource to consider', 19, y + 7);
  doc.setTextColor(...colours.green); doc.setFontSize(10); doc.text(humanise(record?.recommended_resource), 19, y + 15);
  doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2);
  doc.text(doc.splitTextToSize('Illustrative only — not a deployment instruction. Confirm local need, availability, safe access and trained personnel first.', 75), 19, y + 21);
  doc.setFillColor(249, 251, 252); doc.setDrawColor(...colours.line); doc.roundedRect(104, y, 92, 32, 1.5, 1.5, 'FD');
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Verification checklist', 109, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...colours.ink); doc.setFontSize(7.1);
  const verify = record?.verify_locally ?? ['Confirm current network status', 'Confirm safe road and air access', 'Confirm community need and local contacts'];
  verify.slice(0, 4).forEach((item, index) => { doc.rect(109, y + 11 + index * 6, 3, 3); doc.text(item, 115, y + 13.6 + index * 6); });
  const actionsY = y + 42;
  sectionTitle(doc, 'Recommended next actions', actionsY);
  const actions = record ? [
    { title: record.verify_locally[0] || 'Confirm network status', detail: 'Contact the provider and community before taking action.' },
    { title: record.verify_locally[1] || 'Confirm safe access', detail: 'Check current road, airstrip, sea and weather conditions.' },
    { title: record.verify_locally[2] || 'Confirm community need', detail: 'Validate priority needs and the proposed resource locally.' },
  ] : [
    { title: 'Confirm current network status', detail: 'Check the provider and local contacts before taking action.' },
    { title: 'Confirm safe access', detail: 'Check current road, airstrip, sea and weather conditions.' },
    { title: 'Confirm community needs', detail: 'Validate local priorities before considering resources.' },
  ];
  actions.forEach((action, index) => {
    const x = 14 + index * 62;
    doc.setFillColor(index === 0 ? 237 : 246, index === 0 ? 246 : 249, index === 0 ? 250 : 250);
    doc.setDrawColor(...colours.line); doc.roundedRect(x, actionsY + 6, 58, 24, 1.5, 1.5, 'FD');
    const actionColour = index === 0 ? colours.blue : index === 1 ? colours.amber : colours.green;
    doc.setFillColor(actionColour[0], actionColour[1], actionColour[2]); doc.circle(x + 7, actionsY + 13, 3.6, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(String(index + 1), x + 7, actionsY + 15, { align: 'center' });
    doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.text(doc.splitTextToSize(action.title, 42), x + 13, actionsY + 11, { lineHeightFactor: 1.15 });
    doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.1); doc.text(doc.splitTextToSize(action.detail, 48), x + 5, actionsY + 21, { lineHeightFactor: 1.15 });
  });
}

function drawResiliencePage(doc: jsPDF, input: DecisionReportInput) {
  const selected = input.selectedCommunity;
  const view = resilienceReportView(input.resilienceSimulation, selected?.id);
  let y = 61;
  sectionTitle(doc, 'Scenario planning score', y); y += 8;
  if (!view) {
    drawParagraph(doc, 'Not assessed. A community-level resilience scenario could not be matched to this report. No score has been inferred or set to zero.', 14, y, 182, 9);
    return;
  }

  doc.setFillColor(241, 247, 250); doc.setDrawColor(...colours.line); doc.roundedRect(14, y, 72, 39, 1.5, 1.5, 'FD');
  doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('SCENARIO PLANNING CAPABILITY', 19, y + 7);
  doc.setTextColor(...colours.navy); doc.setFontSize(22); doc.text(`${view.score.toFixed(1)} / 100`, 19, y + 20);
  doc.setTextColor(...colours.blue); doc.setFontSize(9); doc.text(view.level, 19, y + 30);
  doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const provenance = `This is a scenario-based planning score, not a measured resilience rating. ${view.simulatedCount} of 5 dimensions use simulated planning values; ${view.sourceSupportedCount} are supported by matched published records.`;
  doc.text(doc.splitTextToSize(provenance, 100), 94, y + 9, { lineHeightFactor: 1.4 });
  y += 47;

  sectionTitle(doc, 'Score breakdown', y); y += 5;
  autoTable(doc, {
    startY: y,
    head: [['Capability area', 'Score', 'Current planning status', 'Basis']],
    body: view.dimensions.map((item) => [item.label, `${item.points.toFixed(1)} / ${item.weight}`, item.status, item.basis]),
    margin: { left: 14, right: 14 }, theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.2, cellPadding: 2.1, textColor: [...colours.ink], lineColor: [...colours.line], lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: [...colours.navy], textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244, 248, 250] },
    columnStyles: { 0: { cellWidth: 67 }, 1: { cellWidth: 27 }, 2: { cellWidth: 52 }, 3: { cellWidth: 36 } },
  });
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40) + 8;
  sectionTitle(doc, 'Suggested planning actions', y); y += 7;
  view.recommendations.forEach((item, index) => {
    doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.8);
    const titleLines = doc.splitTextToSize(`${index + 1}. ${item.title}`, 178) as string[];
    doc.text(titleLines, 15, y);
    y += titleLines.length * 3.8 + 1;
    y = drawParagraph(doc, item.detail, 20, y, 176, 7.2) + 2;
  });
  const sources = view.sourceNames.length ? view.sourceNames.join('; ') : 'No matched published source records used for this community.';
  y += 1;
  y = drawParagraph(doc, `Source records: ${sources}`, 14, y, 182, 7.2);
  drawParagraph(doc, 'Published records support only the listed status; they do not confirm current operation, emergency availability, community-wide reach, independent end-to-end routing or successful testing. Simulated values are planning examples; missing data is not zero. Resource effects are illustrative, not guaranteed.', 14, y + 1, 182, 7.1);
}

export function portfolioReportSummary(input: DecisionReportInput) {
  const views = (input.resilienceSimulation?.communities ?? []).map((item) => resilienceReportView(input.resilienceSimulation, item.communityId)).filter((view): view is ResilienceReportView => view !== null);
  const priorities = input.priorities ?? [];
  const original = priorities.filter((item) => item.record.scenario_source !== 'indicative_public_data').length;
  const derived = priorities.filter((item) => item.record.scenario_source === 'indicative_public_data').length;
  const matched = views.filter((view) => view.sourceSupportedCount > 0).length;
  const supportedDimensions = views.reduce((total, view) => total + view.sourceSupportedCount, 0);
  return {
    assessed: views.length,
    mean: views.length ? views.reduce((total, view) => total + view.score, 0) / views.length : null,
    early: views.filter((view) => view.score < 40).length,
    developing: views.filter((view) => view.score >= 40 && view.score < 70).length,
    strong: views.filter((view) => view.score >= 70).length,
    priorityCount: priorities.length,
    original,
    derived,
    confidence: { low: priorities.filter((item) => item.record.confidence === 'low').length, medium: priorities.filter((item) => item.record.confidence === 'medium').length, high: priorities.filter((item) => item.record.confidence === 'high').length },
    matched,
    unmatched: views.length - matched,
    supportedDimensions,
    simulatedDimensions: views.length * resilienceOrder.length - supportedDimensions,
  };
}

function drawPortfolioOverview(doc: jsPDF, input: DecisionReportInput) {
  const summary = portfolioReportSummary(input);
  let y = 61;
  sectionTitle(doc, 'Whole-of-Exercise Overview', y); y += 9;
  y = drawParagraph(doc, `This portfolio report compares ${summary.assessed} communities with valid scenario planning scores and ${summary.priorityCount} communities with modelled review priorities. It supports exercise planning and local verification, not live deployment or a measured assessment of real-world resilience.`, 14, y, 182, 8.2) + 5;
  drawMetricCard(doc, 14, y, 43, 'Communities assessed', String(summary.assessed), 'Valid planning scores', colours.blue);
  drawMetricCard(doc, 60, y, 43, 'Average planning capability', summary.mean === null ? 'Unavailable' : `${summary.mean.toFixed(1)} / 100`, 'Scenario-based score', colours.cyan);
  drawMetricCard(doc, 106, y, 43, 'Review-priority records', String(summary.priorityCount), 'Exercise model', colours.amber);
  drawMetricCard(doc, 152, y, 44, 'Published match', String(summary.matched), 'Not field verified', colours.green);
  y += 37;
  sectionTitle(doc, 'Planning capability distribution', y); y += 7;
  drawMetricCard(doc, 14, y, 58, 'Early planning capability', String(summary.early), 'Below 40 / 100', colours.red);
  drawMetricCard(doc, 76, y, 58, 'Developing planning capability', String(summary.developing), '40 to below 70', colours.amber);
  drawMetricCard(doc, 138, y, 58, 'Strong planning capability', String(summary.strong), '70 or above', colours.green);
  y += 38;
  sectionTitle(doc, 'Two different planning measures', y); y += 7;
  y = drawParagraph(doc, 'Review Priority indicates which communities should be reviewed earlier under the exercise model. Scenario Planning Capability describes modelled communications preparedness. A community can score highly on one and still need attention under the other; neither is a field-verified resilience rating.', 14, y, 182, 8) + 4;
  sectionTitle(doc, 'Record and confidence context', y); y += 7;
  y = drawParagraph(doc, `${summary.original} review-priority records come from the original exercise scenario; ${summary.derived} are indicative records generated by the application from published location fields and planning rules. These are not equally evidenced.`, 14, y, 182, 8) + 3;
  drawParagraph(doc, `Scenario confidence among ${summary.priorityCount} priority records: ${summary.confidence.low} low, ${summary.confidence.medium} medium, ${summary.confidence.high} high. Application-derived records default to low confidence; this is not a field-verification result.`, 14, y, 182, 8);
}

function drawPortfolioTable(doc: jsPDF, input: DecisionReportInput, generatedAt: Date, logo?: string) {
  sectionTitle(doc, 'Community review priorities', 61);
  drawParagraph(doc, 'Higher Priority score means earlier exercise review, not better planning capability. Resources are illustrative exercise options; confirm need, availability, safe access and trained personnel locally.', 14, 69, 182, 7.4);
  const ordered = [...(input.priorities ?? [])].sort((a, b) => b.score - a.score || a.feature.properties.name.localeCompare(b.feature.properties.name));
  const rows = ordered.map((item) => {
    const view = resilienceReportView(input.resilienceSimulation, item.feature.properties.id);
    return [
      item.feature.properties.name,
      `${item.score.toFixed(0)} / 100`,
      view ? `${view.score.toFixed(1)} / 100` : 'Not assessed',
      view?.level.replace(' planning capability', '') ?? 'Not assessed',
      item.record.scenario_source === 'indicative_public_data' ? 'Application-derived' : 'Exercise scenario',
      humanise(item.record.recommended_resource),
      humanise(item.record.confidence),
    ];
  });
  autoTable(doc, {
    startY: 85,
    head: [['Community', 'Priority score', 'Planning capability / 100', 'Planning level', 'Record basis', 'Exercise resource to consider', 'Confidence']],
    body: rows,
    margin: { left: 14, right: 14, top: 70, bottom: 28 }, theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.8, cellPadding: { top: 2, right: 1.4, bottom: 2, left: 1.4 }, textColor: [...colours.ink], lineColor: [...colours.line], lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: [...colours.navy], textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244, 248, 250] },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 18 }, 2: { cellWidth: 25 }, 3: { cellWidth: 23 }, 4: { cellWidth: 24 }, 5: { cellWidth: 37 }, 6: { cellWidth: 21 } },
    rowPageBreak: 'avoid', showHead: 'everyPage',
    didDrawPage: ({ pageNumber }) => {
      if (pageNumber > 1) {
        addHeader(doc, input, generatedAt, logo);
        sectionTitle(doc, 'Community review priorities - continued', 61);
      }
    },
  });
}

function drawPortfolioInsights(doc: jsPDF, input: DecisionReportInput) {
  const summary = portfolioReportSummary(input);
  let y = 61;
  sectionTitle(doc, 'Portfolio Insights', y); y += 10;
  const groups = [
    ['Scenario planning capability', `Early ${summary.early}  |  Developing ${summary.developing}  |  Strong ${summary.strong}`, `Based on ${summary.assessed} valid community scores. Missing scores are not treated as zero.`],
    ['Review-priority record basis', `Original exercise ${summary.original}  |  Application-derived ${summary.derived}`, `Priority scores are modelled. Derived records are indicative and default to low confidence.`],
    ['Scenario confidence', `Low ${summary.confidence.low}  |  Medium ${summary.confidence.medium}  |  High ${summary.confidence.high}`, `Counts cover ${summary.priorityCount} priority records, not field-verified community assessments.`],
    ['Matched evidence coverage', `${summary.matched} with a published match  |  ${summary.unmatched} without a match`, `${summary.supportedDimensions} of ${summary.assessed * resilienceOrder.length} scoring dimensions have a matched published record; ${summary.simulatedDimensions} are simulated. A match does not confirm current operation.`],
  ];
  groups.forEach(([title, value, note]) => {
    doc.setFillColor(246, 249, 250); doc.setDrawColor(...colours.line); doc.roundedRect(14, y, 182, 40, 1.5, 1.5, 'FD');
    doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(title, 19, y + 8);
    doc.setTextColor(...colours.blue); doc.setFontSize(10); doc.text(value, 19, y + 17);
    drawParagraph(doc, note, 19, y + 24, 171, 7.3);
    y += 48;
  });
  drawParagraph(doc, 'Evidence gaps are not evidence of absent capability. Published datasets, application rules and scenario assumptions should be checked with the community and providers before operational use.', 14, y + 2, 182, 7.8);
}

const sourceColumnWidths = [47, 38, 52, 45] as const;
const sourceCellPadding = 1.8;
const sourceTableFontSize = 6.5;

function sourceRowHeight(doc: jsPDF, cells: string[], bold = false) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(sourceTableFontSize);
  const lineHeight = doc.getLineHeight() / doc.internal.scaleFactor;
  const lines = Math.max(...cells.map((cell, index) => (doc.splitTextToSize(cell, sourceColumnWidths[index] - sourceCellPadding * 2) as string[]).length));
  return lines * lineHeight + sourceCellPadding * 2 + 0.8;
}

function drawSourceTable(doc: jsPDF, input: DecisionReportInput, generatedAt: Date, logo: string | undefined, startY: number, rows: string[][]) {
  const headings = ['Data source', 'Dimension(s)', 'Limitation', 'Evidence relationship'];
  const pageBottom = 269;
  const continuedStartY = 70;
  const headingHeight = sourceRowHeight(doc, headings, true);
  const heights = rows.map((row) => sourceRowHeight(doc, row));
  let index = 0;
  let tableY = startY;

  while (index < rows.length) {
    let height = headingHeight;
    let count = 0;
    while (index + count < rows.length && height + heights[index + count] <= pageBottom - tableY) {
      height += heights[index + count];
      count += 1;
    }

    const remaining = rows.length - index - count;
    if (remaining > 0 && remaining < 3) {
      const moveToNextPage = 3 - remaining;
      if (count - moveToNextPage >= 2) count -= moveToNextPage;
      else if (tableY !== continuedStartY) count = 0;
      else if (count > 1) count -= 1;
    }
    if ((count === 0 || (count === 1 && remaining > 0)) && tableY !== continuedStartY) {
      doc.addPage();
      addHeader(doc, input, generatedAt, logo);
      sectionTitle(doc, 'Data sources and limitations — continued', 61);
      tableY = continuedStartY;
      continue;
    }
    if (count === 0) throw new Error('A data-source row exceeds the available PDF page height.');

    autoTable(doc, {
      startY: tableY,
      head: [headings],
      body: rows.slice(index, index + count),
      margin: { left: 14, right: 14, top: continuedStartY, bottom: 28 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: sourceTableFontSize, cellPadding: sourceCellPadding, textColor: [...colours.ink], lineColor: [...colours.line], lineWidth: 0.2, overflow: 'linebreak' },
      headStyles: { fillColor: [...colours.navy], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: Object.fromEntries(sourceColumnWidths.map((width, column) => [column, { cellWidth: width }])),
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
    });
    index += count;
    if (index < rows.length) {
      doc.addPage();
      addHeader(doc, input, generatedAt, logo);
      sectionTitle(doc, 'Data sources and limitations — continued', 61);
      tableY = continuedStartY;
    }
  }
}

function drawCommunityEvidencePage(doc: jsPDF, input: DecisionReportInput & { selectedCommunity: SelectedCommunityReport }, generatedAt: Date, logo?: string) {
  let y = 61;
  sectionTitle(doc, 'Community evidence summary', y); y += 6;
  const selected = input.selectedCommunity;
  autoTable(doc, {
    startY: y,
    head: [['Community', 'Communications', 'Access', 'Facilities', 'Exercise resource']],
    body: [[selected.name, selected.provider || 'Not linked', humanise(selected.record?.access), selected.facilities.length ? selected.facilities.join(', ') : 'No linked facilities', humanise(selected.record?.recommended_resource)]],
    margin: { left: 14, right: 14 }, theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 2.2, textColor: [...colours.ink], lineColor: [...colours.line], lineWidth: 0.2 },
    headStyles: { fillColor: [...colours.navy], textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244, 248, 250] },
  });
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 25) + 11;
  sectionTitle(doc, 'Device checklist progress', y); y += 7;
  const checklist = input.checklist ?? [];
  const done = checklist.filter((item) => item.done).length;
  const percentage = checklist.length ? Math.round(done / checklist.length * 100) : undefined;
  if (percentage !== undefined) {
    doc.setFillColor(225, 232, 235); doc.roundedRect(14, y, 78, 7, 1, 1, 'F');
    const progressWidth = percentage > 0 ? 78 * percentage / 100 : 3;
    const progressColour = percentage > 0 ? colours.green : colours.amber;
    doc.setFillColor(progressColour[0], progressColour[1], progressColour[2]); doc.roundedRect(14, y, progressWidth, 7, 1, 1, 'F');
    doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`${done} of ${checklist.length} items saved on this device`, 97, y + 5.5);
  } else {
    doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Checklist status not available', 14, y + 5.5);
  }
  doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
  doc.text('Browser-local checklist only; not a verified community preparedness record.', 14, y + 12);
  y += 20;
  checklist.forEach((item, index) => {
    const x = index < 4 ? 14 : 107; const rowY = y + (index % 4) * 7;
    const checkColour = item.done ? colours.green : colours.muted;
    doc.setDrawColor(checkColour[0], checkColour[1], checkColour[2]); doc.rect(x, rowY - 3, 3.5, 3.5);
    if (item.done) { doc.setFont('helvetica', 'bold'); doc.setTextColor(...colours.green); doc.setFontSize(6); doc.text('x', x + 1.75, rowY - 0.1, { align: 'center' }); }
    doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.text(item.title, x + 6, rowY);
  });
  y += 36;
  sectionTitle(doc, 'Data sources and limitations', y); y += 6;
  y = drawParagraph(doc, 'Published records do not confirm current operation or field conditions. Scenario values are illustrative; verify operational decisions locally.', 14, y, 182, 7.1) + 2;
  drawSourceTable(doc, input, generatedAt, logo, y, buildSourceTableRows(input));
}

function buildSourceTableRows(input: DecisionReportInput) {
  const sourceRows = new Map<string, { dimensions: Set<string>; limitation: string; matched: boolean; date: string | null }>();
  const scenarios = input.resilienceSimulation?.communities.filter((scenario) => !input.selectedCommunity || scenario.communityId === input.selectedCommunity.id) ?? [];
  scenarios.forEach((scenario) => resilienceOrder.forEach((id) => {
    const definition = input.resilienceSimulation?.dimensions[id];
    const score = scenario.dimensions[id];
    (score?.sourcesReviewed ?? definition?.sourcesReviewed ?? []).forEach((source) => {
      const existing = sourceRows.get(source.name) ?? { dimensions: new Set<string>(), limitation: source.limitation, matched: false, date: source.date };
      existing.dimensions.add(definition?.label ?? id);
      existing.matched ||= score?.sourceType === 'evidence';
      sourceRows.set(source.name, existing);
    });
  }));
  const sourceTableRows = [...sourceRows.entries()].map(([name, source]) => [
    source.date ? `${name}\nSource data date: ${source.date}` : name,
    [...source.dimensions].join(', '),
    source.limitation,
    source.matched
      ? input.selectedCommunity ? 'Matched published record; not field verified' : 'Matched for at least one community; not field verified'
      : 'Reference reviewed; not matched as community-level evidence',
  ]);
  const pointSource = input.resilienceSimulation?.sourceBoundaries.communityPoints;
  if (pointSource) sourceTableRows.push([
    `${pointSource.provider || pointSource.file}${pointSource.upstreamRecordDate ? `\nSource data date: ${pointSource.upstreamRecordDate}` : ''}`,
    'Community point and coverage context',
    pointSource.dateCaveat,
    'Published location data; does not confirm current service',
  ]);
  if (input.scenario) sourceTableRows.push(['RemoteReady NT exercise model', 'Planning priority and exercise resource context', 'Scenario values are illustrative and require local verification.', 'Scenario assumption']);
  if (sourceTableRows.length === 0) sourceTableRows.push(['No source records available', 'Not assessed', 'No source metadata was supplied to this report.', 'Not assessed']);
  return sourceTableRows;
}

function drawPortfolioSourcesPage(doc: jsPDF, input: DecisionReportInput, generatedAt: Date, logo?: string) {
  sectionTitle(doc, 'Data sources and limitations', 61);
  let y = drawParagraph(doc, 'Published records provide location or planning context, not proof of current operation, emergency availability, independent end-to-end routing, battery runtime, successful testing or community-wide reach. Scenario values are illustrative; verify locally.', 14, 69, 182, 7.5) + 3;
  y = drawParagraph(doc, 'A matched published record supports only its listed status and is not field verified. Other reviewed references remain contextual, while exercise priorities and resource options include scenario assumptions. Application-derived records are indicative planning inputs.', 14, y, 182, 7.5) + 3;
  drawSourceTable(doc, input, generatedAt, logo, y, buildSourceTableRows(input));
}

function finishReport(doc: jsPDF) {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    addFooter(doc, page, totalPages);
  }
  return doc;
}

async function reportDocument(input: DecisionReportInput) {
  const generatedAt = input.generatedAt ?? new Date();
  const logo = await loadBrandIcon();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: 'RemoteReady NT Decision Support Report', subject: 'Emergency connectivity and preparedness planning', author: 'RemoteReady NT' });
  return { doc, generatedAt, logo };
}

export async function createCommunityReport(input: DecisionReportInput & { selectedCommunity: SelectedCommunityReport }) {
  const { doc, generatedAt, logo } = await reportDocument(input);
  addHeader(doc, input, generatedAt, logo);
  drawCommunityOverview(doc, input);
  doc.addPage(); addHeader(doc, input, generatedAt, logo);
  drawResiliencePage(doc, input);
  doc.addPage(); addHeader(doc, input, generatedAt, logo); drawCommunityEvidencePage(doc, input, generatedAt, logo);
  return finishReport(doc);
}

export async function createAllCommunitiesReport(input: DecisionReportInput) {
  if (!input.priorities?.length) throw new Error('All-communities report requires community review-priority records.');
  const { doc, generatedAt, logo } = await reportDocument(input);
  addHeader(doc, input, generatedAt, logo);
  drawPortfolioOverview(doc, input);
  doc.addPage(); addHeader(doc, input, generatedAt, logo);
  drawPortfolioTable(doc, input, generatedAt, logo);
  doc.addPage(); addHeader(doc, input, generatedAt, logo);
  drawPortfolioInsights(doc, input);
  doc.addPage(); addHeader(doc, input, generatedAt, logo);
  drawPortfolioSourcesPage(doc, input, generatedAt, logo);
  return finishReport(doc);
}

export async function createDecisionSupportDocument(input: DecisionReportInput) {
  return input.selectedCommunity ? createCommunityReport(input as DecisionReportInput & { selectedCommunity: SelectedCommunityReport }) : createAllCommunitiesReport(input);
}

export async function downloadDecisionSupportReport(input: DecisionReportInput) {
  const generatedAt = input.generatedAt ?? new Date();
  const doc = await createDecisionSupportDocument(input);
  const suffix = input.selectedCommunity ? `-${input.selectedCommunity.name.replaceAll(/[^a-z0-9]+/gi, '-')}` : '-all-communities';
  doc.save(`RemoteReady-NT-decision-support${suffix}-${generatedAt.toISOString().slice(0, 10)}.pdf`);
}
