/**
 * ssstik.io scraper
 * GET homepage -> extract tt -> POST /abc?url=dl -> parse links
 */

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const BASE   = 'https://ssstik.io';
const API_DL = `${BASE}/abc?url=dl`;

const BROWSER_HEADERS = {
  'User-Agent'                : 'Mozilla/5.0 (Linux; Android 14; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  'Accept-Language'           : 'en-US,en;q=0.5',
  'Accept-Encoding'           : 'gzip, deflate, br',
  'Connection'                : 'keep-alive',
  'DNT'                       : '1',
  'Sec-Fetch-Site'            : 'same-origin',
  'Sec-Fetch-Mode'            : 'cors',
  'Sec-Fetch-Dest'            : 'empty',
};

function makeClient() {
  const jar = new CookieJar();
  return wrapper(axios.create({
    jar,
    withCredentials: true,
    decompress: true,
    headers: BROWSER_HEADERS,
  }));
}

async function getTtToken(client) {
  const res = await client.get(BASE, {
    headers: {
      'Accept'               : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Site'       : 'none',
      'Sec-Fetch-Mode'       : 'navigate',
      'Sec-Fetch-User'       : '?1',
      'Sec-Fetch-Dest'       : 'document',
    },
  });
  const m = res.data.match(/s_tt\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('tt token not found in page');
  return m[1];
}

async function fetchResult(client, tiktokUrl, tt, locale = 'en') {
  const res = await client.post(API_DL,
    new URLSearchParams({ id: tiktokUrl, locale, tt }),
    {
      headers: {
        'Accept'        : '*/*',
        'Content-Type'  : 'application/x-www-form-urlencoded',
        'Referer'       : BASE + '/',
        'Origin'        : BASE,
        'HX-Request'    : 'true',
        'HX-Target'     : 'target',
        'HX-Current-URL': BASE + '/',
      },
    }
  );
  return res.data;
}

function parseLinks(html) {
  // Author & description
  const author  = html.match(/alt="([^"]+)"/)?.[1] ?? null;
  const desc    = html.match(/class="maintext">([^<]+)</)?.[1]?.trim() ?? null;

  // Thumbnail from CSS background-image
  const thumb   = html.match(/url\((https:\/\/tikcdn\.io\/ssstik\/p\/[^)]+)\)/)?.[1] ?? null;

  // Without watermark (direct tikcdn link, NOT the HD one)
  const nowm    = html.match(/class="[^"]*without_watermark vignette_active[^"]*"\s*href="([^"]+)"/)?.[1]
               ?? html.match(/href="(https:\/\/tikcdn\.io\/ssstik\/\d+[^"]+)"/)?.[1]
               ?? null;

  // HD: needs a 2nd POST to this path
  const hdPath  = html.match(/data-directurl="([^"]+)"/)?.[1] ?? null;

  // MP3 direct with fallback
  const mp3     = html.match(/href="(https:\/\/tikcdn\.io\/ssstik\/m\/[^"]+)"/)?.[1]
               ?? html.match(/class="[^"]*music[^"]*"\s*href="([^"]+)"/)?.[1]
               ?? null;

  // tt token embedded in result (used for HD 2nd request)
  const ttHd    = html.match(/name="tt"\s+value="([^"]+)"/)?.[1] ?? null;

  return { author, desc, thumb, no_watermark: nowm, hd_path: hdPath, mp3, tt_for_hd: ttHd };
}

// Optional: resolve HD link (2nd POST)
async function resolveHd(client, hdPath, ttToken) {
  const res = await client.post(`${BASE}${hdPath}`,
    new URLSearchParams({ tt: ttToken }),
    {
      timeout: 8000,   // <-- tambahin ini!!
      headers: {
        'Accept'        : '*/*',
        'Content-Type'  : 'application/x-www-form-urlencoded',
        'Referer'       : BASE + '/',
        'Origin'        : BASE,
        'HX-Request'    : 'true',
      },
    }
  );
  const html = res.data;
  return html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/)?.[1]
      ?? html.match(/href="(https:\/\/tikcdn\.io\/[^"]+)"/)?.[1]
      ?? null;
}

/**
 * Main function
 * @param {string} tiktokUrl
 * @param {{ hd?: boolean, locale?: string }} opts
 */
async function scrape(tiktokUrl, { hd = false, locale = 'en' } = {}) {
  const client = makeClient();

  console.log('[ssstik] 1/3 Getting tt token...');
  const tt = await getTtToken(client);
  console.log(`[ssstik]     tt = ${tt}`);

  console.log('[ssstik] 2/3 Fetching download links...');
  const html = await fetchResult(client, tiktokUrl, tt, locale);

  console.log('[ssstik] 3/3 Parsing result...');
  const links = parseLinks(html);

  // Fix 2: Early return if HD is not requested to avoid unnecessary hangs/delays
  if (!hd) return links;

  if (links.hd_path && links.tt_for_hd) {
    console.log('[ssstik] +   Resolving HD link...');
    links.no_watermark_hd = await resolveHd(client, links.hd_path, links.tt_for_hd);
  }

  return links;
}

// --- CLI ---
if (require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node ssstik.js <tiktok_url> [--hd]');
    process.exit(1);
  }
  scrape(url, { hd: process.argv.includes('--hd') })
    .then(r => console.log('\nResult:', JSON.stringify(r, null, 2)))
    .catch(e => {
      console.error('Error:', e.message);
      if (e.response) console.error('HTTP', e.response.status);
    });
}

module.exports = { scrape };