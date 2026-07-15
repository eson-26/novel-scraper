// Retry failed chapters with 500ms delay between each
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.quanben.io';
const NOVEL_PATH = '/n/shenmifusu/';
const OUTPUT_FILE = path.join(__dirname, '神秘复苏_佛前献花.txt');

// Reuse same fetch (simplified)
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function extractChapter(html, chapterNum) {
  const $ = cheerio.load(html);
  const title = $('h1.headline').text().trim() || `第${chapterNum}章`;
  const body = $('.articlebody');
  if (!body.length) return null;
  body.find('span#ad').remove();
  const $paragraphs = body.find('p');
  if (!$paragraphs.length) return { title, text: '' };
  const text = $paragraphs
    .map((_, p) => $(p).text().trim())
    .get()
    .filter(t => t.length > 0)
    .join('\n\n');
  return { title, text };
}

async function retryFailed(failedList) {
  console.log(`Retrying ${failedList.length} failed chapters...\n`);
  const results = [];

  for (const num of failedList) {
    try {
      const url = `${BASE_URL}${NOVEL_PATH}/${num}.html`;
      const html = await fetchUrl(url);
      const result = extractChapter(html, num);
      if (result && result.text) {
        console.log(`[${num}] OK: ${result.title}`);
        results.push({ chapter: num, ...result });
        // Append to file immediately
        const entry = `${result.title}\n\n${result.text}\n\n${'='.repeat(60)}\n\n`;
        fs.appendFileSync(OUTPUT_FILE, entry, 'utf-8');
      } else {
        console.log(`[${num}] FAIL: extract failed`);
      }
    } catch (err) {
      console.log(`[${num}] FAIL: ${err.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\nAppended ${results.length} chapters to file.`);
}

// Dedupe the failed list
const failed = [...new Set([405,404,403,920,921,927,922,925,926,929,930,934,931,933,1403,1404,1405])];
retryFailed(failed);
