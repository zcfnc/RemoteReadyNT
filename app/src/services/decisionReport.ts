import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { ExerciseCommunity } from '../types/data';
import type { PriorityResult } from '../features/dashboard/dashboard';

export type ReportChecklistItem = { title: string; done: boolean };
export type SelectedCommunityReport = {
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
  checklist?: ReportChecklistItem[];
  selectedCommunity?: SelectedCommunityReport;
};

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
  doc.text('Exercise: TC Lam resilience exercise', 138, 14);
  doc.text(`Stage: ${input.stage}`, 138, 19);
  doc.text(`Generated: ${generatedAt.toLocaleDateString('en-AU')}`, 138, 24);
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
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text(title, x + 5, y + 6);
  doc.setFontSize(13); doc.text(value, x + 5, y + 15);
  doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4);
  doc.text(doc.splitTextToSize(note, width - 8), x + 5, y + 20, { lineHeightFactor: 1.15 });
}

function drawPageOne(doc: jsPDF, input: DecisionReportInput) {
  const selected = input.selectedCommunity;
  const record = selected?.record;
  const selectedPriority = input.priorities?.find((item) => item.record.community_id === record?.community_id);
  let y = 61;
  sectionTitle(doc, 'Executive summary', y); y += 8;
  const summary = selected
    ? `${selected.name} is the selected community for this report. The assessment combines published communications and facility records with the TC Lam exercise assumptions. The current model indicates ${humanise(record?.exposure)} exposure, ${humanise(record?.redundancy)} communications redundancy and ${humanise(record?.access)} access. All operational decisions require local verification.`
    : `This report provides a whole-of-exercise view across ${input.scenario?.communities.length ?? 0} communities. It combines published location data, modelled exercise priorities and preparedness checks to support resource planning. Select a community on the Dashboard to generate a targeted community report.`;
  const summaryBottom = drawParagraph(doc, summary, 14, y, selected ? 111 : 182, 8.2);
  if (selected) {
    doc.setDrawColor(...colours.line); doc.setFillColor(248, 251, 252); doc.roundedRect(130, 59, 66, 42, 1.5, 1.5, 'FD');
    doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('SELECTED COMMUNITY', 134, 66);
    doc.setTextColor(...colours.navy); doc.setFontSize(16); doc.text(selected.name, 134, 75);
    doc.setTextColor(...colours.blue); doc.setFontSize(8); doc.text(selected.region || 'Northern Territory', 134, 81);
    doc.setFillColor(...colours.red); doc.roundedRect(134, 86, 27, 8, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(6.7); doc.text('HIGH PRIORITY', 147.5, 91.2, { align: 'center' });
    doc.setFillColor(...colours.amber); doc.roundedRect(164, 86, 27, 8, 1.5, 1.5, 'F');
    doc.setTextColor(...colours.navy); doc.text('VERIFY LOCALLY', 177.5, 91.2, { align: 'center' });
  }
  y = selected ? Math.max(108, summaryBottom + 5) : summaryBottom + 8;
  sectionTitle(doc, 'Key indicators', y); y += 6;
  drawMetricCard(doc, 14, y, 34.8, 'Connectivity', selected?.coverage ? '2 / 5' : '- / 5', selected?.coverage || 'Published status not linked', colours.blue);
  drawMetricCard(doc, 51, y, 34.8, 'Access', record ? `${scoreFor(record, 'access')} / 5` : '- / 5', humanise(record?.access), colours.amber);
  drawMetricCard(doc, 88, y, 34.8, 'Essential services', record ? `${scoreFor(record, 'essential')} / 5` : '- / 5', humanise(record?.essential_service_priority), colours.red);
  drawMetricCard(doc, 125, y, 34.8, 'Redundancy', record ? `${scoreFor(record, 'redundancy')} / 5` : '- / 5', humanise(record?.redundancy), colours.cyan);
  drawMetricCard(doc, 162, y, 34, 'Confidence', record ? `${scoreFor(record, 'confidence')} / 5` : '- / 5', humanise(record?.confidence), colours.green);
  y += 35;
  sectionTitle(doc, 'Priority score and evidence', y); y += 7;
  const averageScore = input.priorities?.length ? input.priorities.reduce((total, item) => total + item.score, 0) / input.priorities.length : 0;
  const score = selectedPriority?.score ?? averageScore;
  doc.setFillColor(223, 230, 234); doc.roundedRect(14, y, 74, 6, 1, 1, 'F');
  const priorityColour = score >= 70 ? colours.red : colours.amber;
  doc.setFillColor(priorityColour[0], priorityColour[1], priorityColour[2]);
  doc.roundedRect(14, y, Math.max(2, 74 * Math.min(score, 100) / 100), 6, 1, 1, 'F');
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(selectedPriority ? `${score.toFixed(0)} / 100` : `Average ${score.toFixed(0)} / 100`, 14, y + 13);
  doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4);
  const evidence = selected ? [
    `Communications: ${selected.provider || 'provider not linked'}; ${selected.backhaul || 'backhaul not linked'}`,
    `Facilities: ${selected.facilities.length ? selected.facilities.join(', ') : 'no linked facility references'}`,
    `Access: ${humanise(record?.access)}`,
    `Scenario confidence: ${humanise(record?.confidence)}`,
  ] : ['Published community and communications locations', 'TC Lam historical and exercise context', 'Essential facility references', 'Preparedness checklist status'];
  let evidenceY = y;
  evidence.forEach((item) => {
    const evidenceLines = doc.splitTextToSize(`- ${item}`, 78) as string[];
    doc.text(evidenceLines, 118, evidenceY, { lineHeightFactor: 1.15 });
    evidenceY += evidenceLines.length * 3.4 + 1.2;
  });
  y = Math.max(y + 29, evidenceY + 3);
  doc.setFillColor(...colours.paleGreen); doc.setDrawColor(188, 223, 199); doc.roundedRect(14, y, 86, 32, 1.5, 1.5, 'FD');
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Recommended resource', 19, y + 7);
  doc.setTextColor(...colours.green); doc.setFontSize(11); doc.text(humanise(record?.recommended_resource), 19, y + 15);
  doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2);
  doc.text(doc.splitTextToSize('Confirm availability, local need, safe access and trained personnel before dispatch.', 75), 19, y + 21);
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
    { title: 'Review the ranked community priorities', detail: 'Start with the highest modelled priority and check confidence.' },
    { title: 'Confirm current access and communications status', detail: 'Verify network, road, airstrip and weather conditions.' },
    { title: 'Verify resource availability before dispatch', detail: 'Confirm stock, trained personnel and safe deployment.' },
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

function drawPageTwo(doc: jsPDF, input: DecisionReportInput) {
  let y = 61;
  sectionTitle(doc, input.selectedCommunity ? 'Community evidence summary' : 'Community priority ranking', y); y += 6;
  const rows = input.selectedCommunity
    ? [[input.selectedCommunity.name, input.selectedCommunity.provider || 'Not linked', humanise(input.selectedCommunity.record?.access), input.selectedCommunity.facilities.length ? input.selectedCommunity.facilities.join(', ') : 'No linked facilities', humanise(input.selectedCommunity.record?.recommended_resource)]]
    : (input.priorities ?? []).map((item, index) => [String(index + 1), item.feature.properties.name, item.record.essential_service_priority, item.score.toFixed(0), humanise(item.record.recommended_resource), item.record.confidence]);
  autoTable(doc, {
    startY: y,
    head: [input.selectedCommunity ? ['Community', 'Communications', 'Access', 'Facilities', 'Resource'] : ['#', 'Community', 'Priority', 'Score', 'Resource', 'Verify']],
    body: rows,
    margin: { left: 14, right: 14 }, theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 2.2, textColor: [...colours.ink], lineColor: [...colours.line], lineWidth: 0.2 },
    headStyles: { fillColor: [...colours.navy], textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244, 248, 250] },
  });
  const tableEnd = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 25;
  y = tableEnd + 11;
  sectionTitle(doc, 'Preparedness checklist progress', y); y += 7;
  const checklist = input.checklist ?? [];
  const done = checklist.filter((item) => item.done).length;
  const percentage = checklist.length ? Math.round(done / checklist.length * 100) : 0;
  doc.setFillColor(225, 232, 235); doc.roundedRect(14, y, 78, 7, 1, 1, 'F');
  const progressWidth = percentage > 0 ? 78 * percentage / 100 : 3;
  const progressColour = percentage > 0 ? colours.green : colours.amber;
  doc.setFillColor(progressColour[0], progressColour[1], progressColour[2]); doc.roundedRect(14, y, progressWidth, 7, 1, 1, 'F');
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`${done} of ${checklist.length || 8} checks complete`, 97, y + 5.5);
  doc.setTextColor(...colours.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
  doc.text(percentage === 0 ? 'No checklist items have been confirmed yet. Complete these before field deployment.' : `${percentage}% preparedness progress recorded on this device.`, 14, y + 12);
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
  autoTable(doc, {
    startY: y,
    head: [['Data source', 'Purpose', 'Limitations']],
    body: [
      ['NT Government Open Data', 'Community and mobile coverage locations', 'Published locations do not confirm current service availability.'],
      ['OpenStreetMap contributors', 'Essential facility references', 'Community maintained data may be incomplete or outdated.'],
      ['Bureau of Meteorology', 'Historical cyclone context', 'Historical tracks are not live forecasts.'],
      ['RemoteReady NT exercise model', 'Priority and resource planning', 'Scenario assumptions are simulated and require local verification.'],
    ],
    margin: { left: 14, right: 14 }, theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.8, cellPadding: 2.2, textColor: [...colours.ink], lineColor: [...colours.line], lineWidth: 0.2 },
    headStyles: { fillColor: [...colours.navy], textColor: [255, 255, 255], fontStyle: 'bold' }, columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 55 } },
  });
  const dataEnd = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  doc.setFillColor(236, 245, 250); doc.setDrawColor(183, 211, 225); doc.roundedRect(14, dataEnd + 8, 182, 25, 1.5, 1.5, 'FD');
  doc.setTextColor(...colours.navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text('Important note', 19, dataEnd + 15);
  doc.setTextColor(...colours.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2);
  doc.text(doc.splitTextToSize('This report uses the best available published and exercise information at the time of generation. It is not a live incident report. Conditions may change quickly and all findings must be verified locally before operational decisions are made.', 168), 19, dataEnd + 21, { lineHeightFactor: 1.25 });
}

export async function downloadDecisionSupportReport(input: DecisionReportInput) {
  const generatedAt = input.generatedAt ?? new Date();
  const logo = await loadBrandIcon();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: 'RemoteReady NT Decision Support Report', subject: 'Emergency connectivity and preparedness planning', author: 'RemoteReady NT' });
  addHeader(doc, input, generatedAt, logo); drawPageOne(doc, input); addFooter(doc, 1, 2);
  doc.addPage(); addHeader(doc, input, generatedAt, logo); drawPageTwo(doc, input); addFooter(doc, 2, 2);
  const suffix = input.selectedCommunity ? `-${input.selectedCommunity.name.replaceAll(/[^a-z0-9]+/gi, '-')}` : '-all-communities';
  doc.save(`RemoteReady-NT-decision-support${suffix}-${generatedAt.toISOString().slice(0, 10)}.pdf`);
}
