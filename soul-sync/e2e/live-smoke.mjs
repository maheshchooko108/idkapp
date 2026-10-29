// Opens the published web preview in headless Chromium against the LIVE
// backend, walks onboarding up to the first reading, and logs every console
// message, failed request and Supabase response. Creates one anonymous test
// user named "Smoke Test" per run.
// Usage: node live-smoke.mjs <url> [chromium|webkit]
// webkit runs Safari's engine with an iPhone profile.
import { chromium, devices, webkit } from 'playwright';

const url = process.argv[2];
const engine = process.argv[3] ?? 'chromium';
const browser = await (engine === 'webkit' ? webkit : chromium).launch();
const page = await browser.newPage(engine === 'webkit' ? { ...devices['iPhone 15'] } : { viewport: { width: 390, height: 844 } });
console.log(`engine: ${engine}`);
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
page.on('console', (m) => log('console', m.type(), m.text().slice(0, 500)));
page.on('pageerror', (e) => log('PAGEERROR', String(e).slice(0, 800)));
page.on('requestfailed', (r) => log('REQFAIL', r.method(), r.url().slice(0, 160), r.failure()?.errorText));
page.on('response', async (r) => {
  if (!r.url().includes('supabase.co')) return;
  let body = '';
  if (r.status() >= 400) body = (await r.text().catch(() => '')).slice(0, 400);
  log('supabase', r.status(), r.request().method(), r.url().replace(/apikey=[^&]+/, 'apikey=…').slice(0, 160), body);
});
const text = async (label) => log(`SCREEN ${label}:`, (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 400));
const step = async (label, fn) => {
  try { await fn(); await text(label); }
  catch (e) { log(`STUCK at ${label}:`, e.message.split('\n')[0]); await text(`${label} (stuck)`); await browser.close(); process.exit(1); }
};

await page.goto(url, { waitUntil: 'load' });
await step('welcome', () => page.getByText('Get my first reading').waitFor({ timeout: 30000 }));
await step('birth', async () => {
  await page.getByText('Get my first reading').click();
  await page.getByText('Your timing', { exact: true }).waitFor();
  await page.getByLabel('First name').fill('Smoke Test');
  await page.getByLabel('Birth date', { exact: true }).fill('1985-03-14');
  await page.getByLabel('Birth time', { exact: true }).fill('06:45');
  await page.getByLabel('Birthplace').fill('Port of Spain');
  await page.getByText('Trinidad and Tobago').first().click({ timeout: 15000 });
});
await step('arrive', async () => {
  await page.getByText('Continue', { exact: true }).last().click();
  await page.getByText('One quick question', { exact: true }).waitFor({ timeout: 20000 });
  await page.getByLabel(/^Low, 2 of 5/).click();
  await page.getByLabel(/^Tired, 2 of 5/).click();
});
await step('reading', async () => {
  await page.getByText('See my reading').click();
  await page.getByText(/first reading|took longer|support/i).last().waitFor({ timeout: 90000 });
});
log('DONE');
await browser.close();
