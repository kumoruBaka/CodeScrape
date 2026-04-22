// aio-scraper.js
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { randomUUID } from 'crypto';

const jar = new CookieJar();
const client = wrapper(axios.create({
  jar,
  headers: {
    'Origin': 'https://vidssave.com',
    'Referer': 'https://vidssave.com/index',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
  }
}));

await jar.setCookie(
  `uid=${randomUUID()}; Domain=vidssave.com; Path=/`,
  'https://vidssave.com'
);

async function aio(url) {
  const { data: json } = await client.post(
    'https://api.vidssave.com/api/contentsite_api/media/parse',
    new URLSearchParams({
      auth: '20250901majwlqo',
      domain: 'api-ak.vidssave.com',
      origin: 'source',
      link: url
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (json.status !== 1) throw new Error('Parse failed: ' + json.status_code);

  const result = {
    title: json.data.title,
    thumbnail: json.data.thumbnail,
    duration: json.data.duration,
    videos: [],
    audio: null
  };

  for (const m of json.data.media) {
    if (m.type === 'video') {
      result.videos = m.resources.map(r => ({
        quality: r.quality,
        format: r.format,
        url: r.download_url
      }));
    } else if (m.type === 'audio') {
      result.audio = {
        format: m.resources[0].format,
        url: m.resources[0].download_url
      };
    }
  }

  return result;
}

export default aio;