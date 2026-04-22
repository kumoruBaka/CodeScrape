// npm install axios cheerio
const axios = require('axios');
const cheerio = require('cheerio');

// ── config ─────────────────────────────────────────────
const BASE_URL = 'https://x2twitter.com';
const PAGE_URL = `${BASE_URL}/en4`;
const API_URL = `${BASE_URL}/api/ajaxSearch`;
const REQUEST_TIMEOUT_MS = 15_000; // 15s timeout to prevent hanging
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; Redmi Note 11) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/124.0.0.0 Mobile Safari/537.36';

// Reusable axios instance with shared defaults — avoids repeating headers/timeout
const client = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': UA_ANDROID },
});

// ── helpers ────────────────────────────────────────────

/**
 * Fetch the page and extract cookies from Set-Cookie headers.
 * Returns { cookieStr, html } so we only make ONE request instead of two.
 */
const fetchPageWithCookies = async () => {
  const res = await client.get('/en4');

  const raw = res.headers['set-cookie'] || [];
  // Extract only key=value, discard path/expires/etc.
  const cookieStr = raw.map((c) => c.split(';')[0]).join('; ');

  return { cookieStr, html: res.data };
};

/**
 * Try to extract Cloudflare Turnstile token from server-rendered HTML.
 * Returns the token string or empty string if not found (JS-only render).
 */
const extractCfToken = (html) => {
  const $ = cheerio.load(html);
  return $('[name="cf-turnstile-response"]').val() || '';
};

/**
 * Parse download links from the ajaxSearch HTML response.
 * Returns an array of { label, url } objects.
 */
const parseDownloadLinks = (htmlData) => {
  const $ = cheerio.load(htmlData);
  const links = [];

  $('a.tw-button-dl').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href !== '#') {
      links.push({
        label: $(el).text().trim(),
        url: href,
      });
    }
  });

  return links;
};

// ── main scrape ────────────────────────────────────────

/**
 * Scrape download links for a given tweet URL.
 * @param {string} tweetUrl - Full URL of the tweet/post.
 * @returns {Promise<Array<{label: string, url: string}>>}
 */
const scrape = async (tweetUrl) => {
  if (!tweetUrl) {
    throw new Error('tweetUrl is required');
  }

  console.log('[*] fetching page + cookies...');
  const { cookieStr, html } = await fetchPageWithCookies(); // single request

  const cftoken = extractCfToken(html);
  if (!cftoken) {
    console.log('[!] cftoken not found in HTML (Turnstile = JS-only)');
    console.log('[!] submitting without cftoken...');
  }

  console.log('[*] posting to ajaxSearch...');

  // Pass URLSearchParams directly — axios serializes it automatically
  const params = new URLSearchParams({ q: tweetUrl, lang: 'en', cftoken });

  const res = await client.post('/api/ajaxSearch', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr,
      'Origin': BASE_URL,
      'Referer': PAGE_URL,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  const json = res.data;
  if (!json || json.status !== 'ok') {
    throw new Error(`API error: ${json?.status ?? 'empty response'}`);
  }

  return parseDownloadLinks(json.data);
};

// ── run ────────────────────────────────────────────────

if (require.main === module) {
  // Accept tweet URL from CLI args, fall back to default for quick testing
  const tweetUrl = process.argv[2] || 'https://x.com/i/status/2039329003614720287';

  scrape(tweetUrl)
    .then((links) => {
      if (links.length === 0) {
        console.log('[!] no download links found');
        return;
      }
      console.log(`[+] found ${links.length} link(s):`);
      for (const { label, url } of links) { // for...of over .forEach for consistency
        console.log(`  ${label} → ${url}`);
      }
    })
    .catch((err) => {
      // Surface meaningful message; Axios errors have a .response property
      const status = err.response?.status;
      const msg = status ? `HTTP ${status}: ${err.message}` : err.message;
      console.error('[!]', msg);
      process.exitCode = 1; // signal failure to parent process
    });
}

module.exports = { scrape };
