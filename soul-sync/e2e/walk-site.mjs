// Clicks through an interactive flow (e.g. a quiz) and prints every screen's
// text, so the flow can be read from environments that can't reach the site.
// It answers with the first choice offered, or a neutral sentence in text
// fields. Usage: node walk-site.mjs <url> [startButtonText] [maxSteps]
import { chromium } from 'playwright';

const [url, startText = "I'm Ready", maxSteps = '15'] = process.argv.slice(2);
const SAMPLE = "I keep saying yes to everyone else and I feel exhausted and a bit lost.";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
const dump = async (label) => console.log(`\n=================== ${label}\n${(await page.innerText('body')).replace(/\n{3,}/g, '\n\n')}`);
await dump('start');
await page.getByText(startText, { exact: false }).filter({ visible: true }).first().click();
await page.waitForTimeout(1500);
let last = '';
for (let i = 1; i <= Number(maxSteps); i++) {
  const text = await page.innerText('body');
  if (text === last) { console.log(`\n(no change after step ${i - 1}; stopping)`); break; }
  last = text;
  await dump(`screen ${i}`);
  // Fill any empty visible text field.
  for (const f of await page.locator('textarea:visible, input[type=text]:visible, input:not([type]):visible, input[type=email]:visible').all()) {
    if (!(await f.inputValue())) await f.fill((await f.getAttribute('type')) === 'email' ? 'reader@example.com' : SAMPLE);
  }
  // Pick the first option-like choice if present: a lettered "A" choice, a radio, or an option.
  const lettered = page.getByText(/^A$/).filter({ visible: true }).first();
  const option = (await lettered.count()) ? lettered : page.locator('input[type=radio]:visible, [role=radio]:visible, [role=option]:visible, label:visible').first();
  if (await option.count()) await option.click().catch(() => {});
  await page.waitForTimeout(800);
  // Then advance.
  const next = page.locator('button:visible, [role=button]:visible, a.button:visible').filter({ hasText: /next|continue|submit|reveal|get|see|show|finish|done|→/i }).last();
  if (await next.count()) await next.click().catch(() => {});
  else {
    const anyBtn = page.locator('button:visible').first();
    if (await anyBtn.count()) await anyBtn.click().catch(() => {});
  }
  await page.waitForTimeout(4000);
}
await dump('final');
await browser.close();
