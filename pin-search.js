// pin.js
const { chromium } = require('playwright');

async function scrapePinterest(query, {
  maxScroll = 6,
  headless = true,
} = {}) {
  const browser = await chromium.launch({ headless });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 2000 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  });

  const page = await context.newPage();

  const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // wait initial hydration
  await page.waitForTimeout(4000);

  let prevCount = 0;

  for (let i = 0; i < maxScroll; i++) {
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(2500);

    const count = await page.locator('a[href*="/pin/"]').count();
    if (count === prevCount) break;
    prevCount = count;
  }

  const data = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    document.querySelectorAll('a[href*="/pin/"]').forEach((el) => {
      const link = el.href;
      if (!link || seen.has(link)) return;
      seen.add(link);

      const img = el.querySelector('img');

      results.push({
        url: link,
        title:
          el.getAttribute('aria-label') ||
          img?.alt ||
          '',
        image:
          img?.currentSrc ||
          img?.src ||
          null,
      });
    });

    return results;
  });

  await browser.close();
  return data;
}

// run
(async () => {
  const query = process.argv[2] || 'senko-san';
  const res = await scrapePinterest(query, { maxScroll: 8 });

  console.log(res.slice(0, 20));
})();
// jan kelupaan npm i playwright && npx playwright install chromium
