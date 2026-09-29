import { expect, test } from '@playwright/test';

test('historical proximity ranking stays linked to the existing map', async ({ page }) => {
  await page.goto('/#dashboard');
  await page.getByRole('button', { name: 'Historical proximity' }).click();
  const panel = page.getByRole('complementary', { name: 'Historical cyclone proximity analysis' });
  await expect(panel.getByText('Coverage point proximity')).toBeVisible();
  await expect(panel.getByText(/2007–2026 · within 100 km/)).toBeVisible();
  await panel.getByRole('button', { name: /Bynoe.*Nearest path/ }).click();
  await expect(panel.getByText('Rank #1')).toBeVisible();
  await expect(page.locator('.exposure-community-icon.selected')).toHaveCount(1);
  const popup = page.locator('.exposure-popup-card');
  await expect(popup).toBeVisible();
  await expect(popup).toBeInViewport();
  await expect(popup.getByRole('heading', { name: 'Bynoe' })).toBeVisible();
  await expect(popup.getByText('MBSP')).toBeVisible();
  await expect(popup.getByText('72.5/100')).toBeVisible();
  await expect(popup.getByText(/Place name requires review/)).toBeVisible();
  const planning = page.getByRole('region', { name: 'Community resilience' });
  await expect(planning.getByText('72.5 / 100')).toBeVisible();
  await expect(planning.getByText(/Installation site unconfirmed/)).toBeVisible();
  await planning.getByRole('button', { name: /Critical-service comms kit/ }).click();
  await expect(planning.getByRole('status', { name: /Critical-service comms kit comparison/ }).getByText('82.5 / 100')).toBeVisible();
  await planning.getByRole('button', { name: /Independent satellite link/ }).click();
  await expect(planning.getByText(/Unavailable: .*prerequisite not met/)).toBeVisible();
  await panel.getByLabel('Proximity radius').selectOption('50');
  await expect(panel.getByText(/2007–2026 · within 50 km/)).toBeVisible();
  await expect(popup.getByText('2007–2026 · within 50 km')).toBeVisible();
  await page.locator('.leaflet-popup-close-button').click();
  await expect(popup).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: 'Bynoe' })).toBeVisible();
  await panel.getByRole('button', { name: /Bynoe.*Nearest path/ }).click();
  await expect(popup).toBeVisible();
  await panel.getByRole('button', { name: /2011.*AU201011_17U/ }).first().click();
  await expect(page.locator('.leaflet-interactive[stroke="#a83020"]')).toHaveCount(1);

  if (await page.evaluate(() => window.innerWidth <= 760)) {
    const map = await page.locator('.is-exposure-view .leaflet-map').boundingBox();
    const panelBox = await panel.boundingBox();
    expect(map && panelBox).toBeTruthy();
    expect(panelBox!.y).toBeGreaterThanOrEqual(map!.y + map!.height - 1);
  } else {
    const tools = await page.locator('.map-tools').boundingBox();
    const panelBox = await panel.boundingBox();
    expect(tools && panelBox).toBeTruthy();
    expect(panelBox!.x).toBeGreaterThan(tools!.x + tools!.width);
  }

  await page.getByRole('button', { name: 'TC Lam exercise' }).click();
  await expect(page.getByRole('tab', { name: 'Simulated outcome' })).toBeVisible();
  await expect(panel).toHaveCount(0);
});
