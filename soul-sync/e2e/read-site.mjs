// Prints the readable text of a website (home page plus its same-site links)
// so the product concept can be read from environments that can't reach it.
// Usage: node read-site.mjs https://soulsyncmode.com/ [maxPages]
import { chromium } from 'playwright';

const start = new URL(process.argv[2]);
const maxPages = Number(process.argv[3] ?? 12);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const seen = new Set();
const queue = [start.href];
while (queue.length && seen.size < maxPages) {
  const url = queue.shift();
  const key = url.split('#')[0];
  if (seen.has(key)) continue;
  seen.add(key);
  try {
    await page.goto(key, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    const title = await page.title();
    const text = (await page.innerText('body')).replace(/\n{3,}/g, '\n\n');
    console.log(`\n=================== ${key}\nTITLE: ${title}\n===================\n${text}`);
    const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
    for (const l of links) {
      try {
        const u = new URL(l);
        if (u.host === start.host && !seen.has(u.href.split('#')[0])) queue.push(u.href);
      } catch {}
    }
  } catch (e) {
    console.log(`\n=================== ${key}\nFAILED: ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
