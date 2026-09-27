import { expect, test } from '@playwright/test';

test('dashboard matches the visual baseline', async ({ page }) => {
  await page.route('**://*.tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/#dashboard');
  await expect(page).toHaveScreenshot('dashboard.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
});

test('desktop dashboard keeps key interface text at readable sizes', async ({ page }) => {
  await page.goto('/#dashboard');
  test.skip((await page.evaluate(() => window.innerWidth)) <= 760, 'desktop typography only');
  await page.getByRole('tab', { name: 'Simulated outcome' }).click();
  const checks: Array<[string, number]> = [
    ['.primary-nav button', 12],
    ['.simulation-banner b', 12],
    ['.dashboard-metrics', 12],
    ['.map-explorer .layer', 12],
    ['.data-boundary-legend', 12],
    ['.exercise-timeline button', 12],
    ['.priority-card > p:not(.priority-label)', 14],
    ['.priority-context', 12],
  ];
  for (const [selector, minimum] of checks) {
    const fontSize = await page.locator(selector).first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize, `${selector} font size`).toBeGreaterThanOrEqual(minimum);
  }
});

test('mobile dashboard keeps key text visible and controls touch-sized', async ({ page }) => {
  await page.goto('/#dashboard');
  const width = await page.evaluate(() => window.innerWidth);
  test.skip(width > 760, 'mobile typography only');

  await expect(page.locator('.simulation-banner p')).toBeVisible();
  await expect(page.locator('.simulation-banner p')).toHaveCSS('font-size', '12px');
  await expect(page.locator('.dashboard-metrics')).toHaveCSS('font-size', '12px');
  await expect(page.locator('.primary-nav button').first()).toHaveCSS('font-size', '12px');
  await expect(page.locator('.map-explorer .layer').first()).toHaveCSS('font-size', '12px');
  await expect(page.locator('.exercise-timeline button').first()).toHaveCSS('font-size', '12px');
  const layerHeight = await page.locator('.map-explorer .layer').first().evaluate((element) => element.getBoundingClientRect().height);
  const searchButtonHeight = await page.getByRole('button', { name: 'Search map' }).evaluate((element) => element.getBoundingClientRect().height);
  const focusButtonHeight = await page.getByRole('button', { name: 'Galiwinku' }).evaluate((element) => element.getBoundingClientRect().height);
  const focusButtons = [page.getByRole('button', { name: 'Galiwinku' }), page.getByRole('button', { name: 'Milingimbi' })];
  const timelineBox = await page.locator('.exercise-timeline').boundingBox();
  const mapToolsBox = await page.locator('.map-tools').boundingBox();
  const navTop = await page.locator('.primary-nav').evaluate((element) => element.getBoundingClientRect().top);
  const metricsOverflow = await page.locator('.dashboard-metrics').evaluate((element) => element.scrollWidth > element.clientWidth);
  const focusTextClipped = await Promise.all(focusButtons.map((button) => button.evaluate((element) => element.scrollWidth > element.clientWidth)));
  expect(layerHeight).toBeGreaterThanOrEqual(44);
  expect(searchButtonHeight).toBeGreaterThanOrEqual(44);
  expect(focusButtonHeight).toBeGreaterThanOrEqual(44);
  expect(timelineBox!.height).toBeGreaterThanOrEqual(76);
  expect(timelineBox!.y + timelineBox!.height).toBeLessThanOrEqual(navTop);
  expect(mapToolsBox!.y + mapToolsBox!.height).toBeLessThanOrEqual(timelineBox!.y);
  expect(metricsOverflow).toBe(false);
  expect(focusTextClipped).toEqual([false, false]);
});

for (const [name, label] of [
  ['stage-2', '24 hours before'],
  ['stage-3', '12 hours before'],
  ['stage-4', 'Simulated outcome'],
] as const) {
  test(`dashboard ${name} matches the visual baseline`, async ({ page }) => {
    await page.route('**://*.tile.openstreetmap.org/**', (route) => route.abort());
    await page.goto('/#dashboard');
    await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 500 }).catch(() => undefined);
    await page.getByRole('tab', { name: label }).click();
    await expect(page).toHaveScreenshot(`dashboard-${name}.png`, { fullPage: true, maxDiffPixelRatio: 0.02 });
  });
}

test('map service markers use distinct clinic and hospital shapes', async ({ page }) => {
  await page.route('**://*.tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/#dashboard');
  await page.getByRole('checkbox', { name: /Clinics and hospitals/ }).check();

  await expect(page.locator('.location-marker-icon.clinic')).toHaveCount(116);
  await expect(page.locator('.location-marker-icon.hospital')).toHaveCount(9);
  await expect(page.locator('.location-marker-icon.clinic span').first()).toHaveCSS('border-radius', '50%');
  await expect(page.locator('.location-marker-icon.hospital span').first()).toHaveCSS('border-radius', '2px');
});

test('hovering a map facility shows its name and type', async ({ page }) => {
  await page.route('**://*.tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/#dashboard');
  await page.getByRole('checkbox', { name: /Schools/ }).check();

  const school = page.locator('.location-marker-icon.school').first();
  await school.hover();
  const tooltip = page.locator('.leaflet-tooltip.remote-node-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(/.+ · School/);
});

test('mobile dashboard shows the updated expanded layer panel and filtered counts', async ({ page }) => {
  await page.goto('/#dashboard');
  await expect(page.getByRole('button', { name: 'Essential services' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('125', { exact: true })).toBeVisible();
  await expect(page.getByText('237', { exact: true })).toBeVisible();
  await expect(page.getByText('23', { exact: true })).toBeVisible();
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  if (viewportWidth <= 760) {
    const panelBottom = await page.locator('.map-explorer').evaluate((element) => element.getBoundingClientRect().bottom);
    const mobileNavTop = await page.locator('.primary-nav').evaluate((element) => element.getBoundingClientRect().top);
    expect(panelBottom).toBeLessThan(mobileNavTop);
  }
});

test('selected community and simulated outcome have distinct map emphasis', async ({ page }) => {
  await page.route('**://*.tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/#dashboard');
  await page.getByRole('button', { name: 'Galiwinku', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Galiwinku' })).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path[fill="#07334e"]')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Simulated outcome' }).click();
  await expect(page.locator('.priority-community-icon')).toHaveCount(1);
  await expect(page.locator('.scenario-incident-icon')).toHaveCount(1);
  await expect(page.locator('.priority-community-icon')).toHaveAttribute('title', 'Modelled priority: Galiwinku');
  await expect(page.locator('.scenario-incident-icon')).toHaveAttribute('title', 'Simulated unavailable communications site A · exercise only');
});

test('priority explanation opens with rankings and a scrollable score breakdown', async ({ page }) => {
  await page.goto('/#dashboard');
  await page.getByRole('tab', { name: 'Simulated outcome' }).click();
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  if (viewportWidth <= 760) await page.getByRole('button', { name: /Next action/ }).click();
  await page.getByRole('button', { name: 'Why this community?' }).click();
  const dialog = page.getByRole('dialog', { name: 'Galiwinku' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Indicative Priority Score: 95.0 / 100')).toBeVisible();
  await expect(dialog.getByText('Modelled candidate ranking')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Confidence penalty' })).toBeVisible();
  const scrollable = await dialog.evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(scrollable).toBe(true);
  await dialog.getByRole('button', { name: 'Close priority explanation' }).click();
  await expect(dialog).not.toBeVisible();
});

test('candidate ranking buttons support keyboard selection', async ({ page }) => {
  await page.goto('/#dashboard');
  await page.getByRole('tab', { name: 'Simulated outcome' }).click();
  await page.getByRole('button', { name: 'Why this community?' }).click();
  const candidate = page.getByRole('button', { name: /Select Milingimbi, rank 2/ });
  await candidate.focus();
  await expect(candidate).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Milingimbi' })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('exercise focus shortcuts do not overlap or overflow the explorer panel', async ({ page }) => {
  await page.goto('/#dashboard');
  const panel = page.locator('.map-explorer');
  const label = panel.locator('.exercise-focus > span');
  const shortcuts = panel.locator('.exercise-focus-actions');
  const galiwinku = shortcuts.getByRole('button', { name: 'Galiwinku' });
  const milingimbi = shortcuts.getByRole('button', { name: 'Milingimbi' });
  await expect(label).toBeVisible();
  await expect(galiwinku).toBeVisible();
  await expect(milingimbi).toBeVisible();
  const [panelBox, labelBox, shortcutsBox, galiwinkuBox, milingimbiBox] = await Promise.all([
    panel.boundingBox(), label.boundingBox(), shortcuts.boundingBox(), galiwinku.boundingBox(), milingimbi.boundingBox(),
  ]);
  expect(panelBox && labelBox && shortcutsBox && galiwinkuBox && milingimbiBox).toBeTruthy();
  expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width);
  expect(shortcutsBox!.x + shortcutsBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width);
  expect(galiwinkuBox!.x + galiwinkuBox!.width).toBeLessThanOrEqual(milingimbiBox!.x);
});

test('preparedness matches the visual baseline', async ({ page }) => {
  await page.goto('/#preparedness');
  await expect(page).toHaveScreenshot('preparedness.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
});

test('data sources matches the visual baseline', async ({ page }) => {
  await page.goto('/#sources');
  await expect(page).toHaveScreenshot('sources.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
});
