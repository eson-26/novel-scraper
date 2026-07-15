// Patch missing chapters for a given book
// Usage: node patch.js <路径> <输出文件名> <章节号1> <章节号2> ...
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.quanben.io';
const NOVEL_PATH = '/n/' + process.argv[2] + '/';
const OUTPUT_FILE = path.join(__dirname, process.argv[3]);
const chapters = process.argv.slice(4).map(Number);

if (chapters.length === 0) {
  console.log('Usage: node patch.js <路径> <输出文件名> <章节号...>');
  process.exit(1);
}

const client = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9'
  }
});

async function fetchUrl(url) {
  const { data } = await client.get(url);
  return data;
}

function extractChapter(html, chapterNum) {
  const $ = cheerio.load(html);
  const title = $('h1.headline').text().trim() || `第${chapterNum}章`;
  const body = $('.articlebody');
  if (!body.length) return null;
  body.find('span#ad').remove();
  const text = body.find('p').map((_, p) => $(p).text().trim()).get().filter(t => t.length > 0).join('\n\n');
  return { title, text };
}

async function patch() {
  console.log(`Patching ${chapters.length} chapters for ${process.argv[2]}...`);
  let added = 0;
  for (const num of chapters) {
    try {
      const url = `${BASE_URL}${NOVEL_PATH}/${num}.html`;
      const html = await fetchUrl(url);
      if (html.includes('参数错误') || html.includes('文件不存在')) {
        console.log(`  Ch${num}: Page not found`);
        continue;
      }
      const result = extractChapter(html, num);
      if (result && result.text) {
        const entry = `${result.title}\n\n${result.text}\n\n${'='.repeat(60)}\n\n`;
        fs.appendFileSync(OUTPUT_FILE, entry, 'utf-8');
        console.log(`  Ch${num}: OK - ${result.title}`);
        added++;
      } else {
        console.log(`  Ch${num}: Extract failed`);
      }
    } catch (err) {
      console.log(`  Ch${num}: Error - ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\nAdded ${added} chapters to ${process.argv[3]}`);
}

patch();
