/**
 * Instagram Photo / Video / Reel Downloader
 * Source: snapinsta.app (public API)
 * By: lynl_ — Necode
 */

'use strict';

const axios     = require('axios');
const cheerio   = require('cheerio');

const BASE   = 'https://snapinsta.app';
const API    = BASE + '/api/ajaxSearch';
const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

function _clean(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

const IG_RE = /instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/;

function extractShortcode(input) {
  const m = input.match(IG_RE);
  return m ? m[2] : null;
}

/**
 * Download Instagram post/reel/video.
 * @param {string} input - Instagram post URL
 * @returns {Promise<{ shortcode, type, items: Array<{url, type}> }>}
 */
async function igdown(input) {
  const sc = extractShortcode(input);
  if (!sc) throw new Error('Cannot extract shortcode from: ' + input);

  // Fetch token
  const homePage = await axios.get(BASE, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });
  const $home  = cheerio.load(homePage.data);
  const token  = $home('meta[name="csrf-token"]').attr('content') || '';

  const form = new URLSearchParams({ q: _clean(input), t: 'media', lang: 'en' });
  const res  = await axios.post(API, form.toString(), {
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'User-Agent':    UA,
      'Referer':       BASE + '/',
      'X-CSRF-Token':  token,
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: 20000,
  });

  if (!res.data?.data) throw new Error('No data returned from Instagram scraper');

  const $ = cheerio.load(res.data.data);
  const items = [];

  // Multiple items (carousel)
  $('.download-items__btn a, .download-items a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('http')) {
      const type = href.includes('.mp4') ? 'video' : 'image';
      items.push({ url: href, type });
    }
  });

  // Fallback: single item
  if (items.length === 0) {
    $('a[href*="instagram"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) items.push({ url: href, type: 'unknown' });
    });
  }

  if (items.length === 0) throw new Error('No media found — post may be private');

  const type = items.every(i => i.type === 'video') ? 'video'
             : items.every(i => i.type === 'image') ? 'photo'
             : 'carousel';

  return { shortcode: sc, type, items };
}

module.exports = { igdown, extractShortcode };
