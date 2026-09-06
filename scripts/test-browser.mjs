import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4273;
const server = spawn(process.execPath, ['scripts/serve-viewer.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Viewer server did not start.')), 5000);
  server.stdout.on('data', (chunk) => { if (String(chunk).includes('Viewer:')) { clearTimeout(timer); resolve(); } });
  server.once('exit', (code) => reject(new Error(`Viewer server exited with ${code}.`)));
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  if (await page.title() !== 'Geospatial World Synthesis — evidence viewer') throw new Error('Unexpected viewer title.');
  if (!await page.getByRole('heading', { name: 'See what the map knows—and where its sources disagree.' }).isVisible()) throw new Error('Viewer did not render the public introduction.');
  if (await page.locator('#entity-count').textContent() !== '4') throw new Error('Viewer did not render four entities.');
  await page.getByRole('button', { name: /Compare sources/ }).click();
  if (await page.locator('[data-layer="canonical"]').getAttribute('aria-pressed') !== 'false') throw new Error('Guided source comparison did not hide canonical output.');
  if (await page.getByRole('tab', { name: 'Evidence' }).getAttribute('aria-selected') !== 'true') throw new Error('Guided source comparison did not open evidence.');
  await page.getByRole('button', { name: /Inspect the result/ }).click();
  if (await page.getByRole('tab', { name: 'Summary' }).getAttribute('aria-selected') !== 'true') throw new Error('Guided result step did not open summary.');
  await page.locator('#entity-select').selectOption({ label: 'Workshop Entrance · poi' });
  if (!await page.locator('#entity-detail').getByRole('heading', { name: 'Workshop Entrance' }).isVisible()) throw new Error('Entity inspection interaction failed.');
  await page.locator('[data-layer="height-survey"]').click();
  if (await page.locator('[data-layer="height-survey"]').getAttribute('aria-pressed') !== 'true') throw new Error('Layer control interaction failed.');
  await page.getByRole('tab', { name: 'JSON' }).click();
  if (!await page.locator('.json-view').isVisible()) throw new Error('Raw JSON inspection failed.');
  for (const path of ['/data/world.json', '/data/world.geojson', '/assets/social-preview.png']) {
    const response = await page.request.get(`http://127.0.0.1:${port}${path}`);
    if (!response.ok()) throw new Error(`Viewer asset failed: ${path}`);
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error('Viewer has horizontal overflow on a mobile viewport.');
  await mobile.close();
  if (errors.length) throw new Error(`Browser console errors: ${errors.join('; ')}`);
  console.log('Browser demo loaded, completed the guided flow, switched entities, inspected JSON, served exports, and fit a mobile viewport without console errors.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
