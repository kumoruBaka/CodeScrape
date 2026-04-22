/**
 * Facebook Video Downloader
 * Source: fdown.net (leaked API)
 * By: lynl_ — Necode
 */

'use strict';

const axios      = require('axios');
const { wrapper }  = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio    = require('cheerio');

const FDOWN_BASE = 'https://fdown.net';
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// Simple in-process URL resolution cache
const _urlCache = new Map();

function _createClient() {
  return wrapper(axios.create({
    jar: new CookieJar(),
    headers: {
      'User-Agent': UA,
      'Referer':    FDOWN_BASE + '/',
      'Origin':     FDOWN_BASE,
    },
    withCredentials: true,
    timeout: 20000,
  }));
}

const FB_ID_RE = /\/(?:watch\?v=|reel\/|videos\/)(\d+)/;

function extractFbId(url) {
  const match = url.match(FB_ID_RE);
  return match ? match[1] : null;
}

async function _resolveRedirect(url) {
  if (_urlCache.has(url)) return _urlCache.get(url);
  const res = await axios.get(url, {
    maxRedirects: 10,
    validateStatus: () => true,
    timeout: 15000,
    headers: {
      'User-Agent':       UA,
      'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language':  'en-US,en;q=0.5',
    },
  });
  const resolved = res.request?.res?.responseUrl || url;
  _urlCache.set(url, resolved);
  if (_urlCache.size > 200) {
    const first = _urlCache.keys().next().value;
    _urlCache.delete(first);
  }
  return resolved;
}

/**
 * Download Facebook video (SD + HD links).
 * @param {string} input - Facebook video URL (watch/reel/share/videos)
 * @param {{ verbose?: boolean }} options
 * @returns {Promise<{ id, sd, hd, thumbnail, duration }>}
 */
async function fbdown(input, { verbose = false } = {}) {
  let url = input;

  // Resolve share links and short URLs
  if (input.includes('/share/') || !extractFbId(input)) {
    url = await _resolveRedirect(input);
    if (verbose) console.log('[fbdown] Resolved:', url);
  }

  const id = extractFbId(url);
  if (!id) throw new Error('Cannot extract Facebook video ID from: ' + url);
  if (verbose) console.log('[fbdown] Video ID:', id);

  const client = _createClient();
  // Warm up session / cookies
  await client.get(FDOWN_BASE + '/');

  const res = await client.post(
    FDOWN_BASE + '/download.php',
    new URLSearchParams({ URLz: url }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  const $         = cheerio.load(res.data);
  const sd        = $('#sdlink').attr('href')        || null;
  const hd        = $('#hdlink').attr('href')        || null;
  const thumbnail = $('.lib-img-show').attr('src')?.trim() || null;
  const duration  = $('.lib-desc').eq(1).text().replace('Duration:', '').trim() || null;

  if (!sd && !hd) throw new Error('No download links found — video may be private or unavailable');

  return { id, sd, hd, thumbnail, duration };
}

module.exports = { fbdown, extractFbId };
