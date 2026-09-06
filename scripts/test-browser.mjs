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
  if (await page.locator('#entity-count').textContent() !== '4') throw new Error('Viewer did not render four entities.');
  await page.locator('#entity-select').selectOption({ label: 'Workshop Entrance · poi' });
  if (!await page.locator('#entity-detail').getByRole('heading', { name: 'Workshop Entrance' }).isVisible()) throw new Error('Entity inspection interaction failed.');
  await page.getByRole('button', { name: 'Survey source' }).click();
  if (await page.getByRole('button', { name: 'Survey source' }).getAttribute('aria-pressed') !== 'false') throw new Error('Layer control interaction failed.');
  if (errors.length) throw new Error(`Browser console errors: ${errors.join('; ')}`);
  console.log('Browser demo loaded, rendered canonical data, switched entities, and toggled a source layer without console errors.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
