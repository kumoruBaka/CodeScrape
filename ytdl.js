/**
 * y2mate scraper
 * GET www-y2mate.com (redirect) -> cookies -> POST /convert/ -> formats
 */

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const BASE_REDIRECT = 'https://www-y2mate.com/';
const BASE         = 'https://v10.www-y2mate.com';
const CONVERT_API  = `${BASE}/convert/`;

const HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT'            : '1',
};

function makeClient() {
  const jar = new CookieJar();
  return wrapper(axios.create({
    jar,
    withCredentials: true,
    decompress: true,
    headers: HEADERS,
    maxRedirects: 5,
  }));
}

// Extract YouTube video ID from any format
function extractVideoId(input) {
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const m = input.match(re);
    if (m) return m[1];
  }
  return null;
}

// Step 1: GET base to grab _ga cookies
async function initSession(client) {
  await client.get(BASE_REDIRECT, {
    headers: {
      'Accept'     : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    },
  });
}

// Step 2: POST /convert/ with videoId
async function convert(client, videoId) {
  const res = await client.post(CONVERT_API,
    new URLSearchParams({ videoId }),
    {
      headers: {
        'Accept'      : 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer'     : `${BASE}/`,
        'Origin'      : BASE,
        'X-Requested-With': 'XMLHttpRequest',
      },
    }
  );
  return res.data;
}

// Parse response into clean format
function parseFormats(data, videoId) {
  // Response could be JSON or HTML
  if (typeof data === 'string') {
    // Try parse as JSON
    try { data = JSON.parse(data); } catch (_) {}
  }

  // If JSON with links/formats
  if (data && typeof data === 'object') {
    return {
      videoId,
      title  : data.title ?? data.videoTitle ?? null,
      thumb  : data.thumbnail ?? data.thumb ?? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      formats: data.links ?? data.formats ?? data.result ?? data,
      raw    : data,
    };
  }

  // HTML response - parse download links
  const html = String(data);
  require('fs').writeFileSync('/tmp/y2mate_result.html', html);

  const formats = [];
  // Common pattern: quality links in response
  const linkPattern = /href="([^"]+)"[^>]*>([^<]+(?:MP4|MP3|WEBM|360|480|720|1080)[^<]*)</gi;
  let m;
  while ((m = linkPattern.exec(html)) !== null) {
    formats.push({ url: m[1], label: m[2].trim() });
  }

  const title = html.match(/<title[^>]*>([^<]+)</)?.[1]?.trim()
             ?? html.match(/class="title"[^>]*>([^<]+)</)?.[1]?.trim()
             ?? null;

  return {
    videoId,
    title,
    thumb : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    formats,
    raw   : html.slice(0, 500) + '...',
  };
}

// Main
async function scrape(youtubeUrl) {
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) throw new Error(`Cannot extract video ID from: ${youtubeUrl}`);

  const client = makeClient();

  console.log(`[y2mate] VideoID: ${videoId}`);
  console.log('[y2mate] 1/2 Init session (cookies)...');
  await initSession(client);

  console.log('[y2mate] 2/2 Fetching formats...');
  const raw = await convert(client, videoId);

  console.log('[y2mate] Raw response type:', typeof raw);
  console.log('[y2mate] Raw preview:', JSON.stringify(raw).slice(0, 300));

  const result = parseFormats(raw, videoId);
  return result;
}

// CLI
if (require.main === module) {
  const url = process.argv[2] ?? 'https://youtu.be/9jjRazRtUOU';
  scrape(url)
    .then(r => console.log('\nResult:', JSON.stringify(r, null, 2)))
    .catch(e => {
      console.error('Error:', e.message);
      if (e.response) console.error('HTTP', e.response.status, JSON.stringify(e.response.data).slice(0, 200));
    });
}

module.exports = { scrape, extractVideoId };