// Generic novel scraper for quanben.io
// Part of the novel-to-get skill
// Usage: Modify the NOVEL_PATH, OUTPUT_FILE, and TOTAL_CHAPTERS constants, then run:
//   node scraper-quanben.js > scrape.log 2>&1 &

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// ============================================================
// CONFIGURE via command line:
//   node index.js <路径> <章节数> <输出文件名>
//   node index.js shenmifusu 1603 神秘复苏_佛前献花.txt
// ============================================================
const BASE_URL = 'https://www.quanben.io';
const NOVEL_PATH = '/n/' + process.argv[2] + '/';
const TOTAL_CHAPTERS = parseInt(process.argv[3]);
const OUTPUT_FILE = path.join(__dirname, process.argv[4]);

if (!process.argv[2] || !process.argv[3] || !process.argv[4]) {
  console.log('用法: node index.js <路径> <章节数> <输出文件名>');
  console.log('示例: node index.js shenmifusu 1603 神秘复苏_佛前献花.txt');
  process.exit(1);
}
// ============================================================

const CONCURRENCY = 10;
const DELAY_MS = 80;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const SAVE_INTERVAL = 50;

let completed = 0;
let failed = [];
let chapters = new Array(TOTAL_CHAPTERS + 1).fill(null);
let startTime = Date.now();

// --- Network ---
const client = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  },
  maxRedirects: 5
});

async function fetchUrl(url, retries = 0) {
  try {
    const { data } = await client.get(url);
    return data;
  } catch (err) {
    if (retries < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
      return fetchUrl(url, retries + 1);
    }
    throw err;
  }
}

// --- HTML Extraction ---
function extractChapter(html, chapterNum) {
  const $ = cheerio.load(html);

  // 标题：找 class="headline" 的 h1，找不到就用默认值
  const title = $('h1.headline').text().trim() || `第${chapterNum}章`;

  // 正文：找 class="articlebody" 的 div 里的所有 p 标签
  const body = $('.articlebody');
  if (!body.length) return null;

  // 去掉广告 span（不能删 #content，正文在里面）
  body.find('span#ad').remove();

  // 提取所有段落文字
  const $paragraphs = body.find('p');
  if (!$paragraphs.length) return { title, text: '' };

  const text = $paragraphs
    .map((_, p) => $(p).text().trim())
    .get()
    .filter(t => t.length > 0)
    .join('\n\n');

  return { title, text };
}

// --- File I/O ---
function saveProgress() {
  const sorted = chapters
    .map((ch, i) => ({ index: i, ...ch }))
    .filter(ch => ch && ch.text)
    .sort((a, b) => a.index - b.index);

  let output = '';
  for (const ch of sorted) {
    output += `${ch.title}\n\n${ch.text}\n\n`;
    output += '='.repeat(60) + '\n\n';
  }
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
  return sorted.length;
}

// --- Chapter Worker ---
async function scrapeChapter(chapterNum) {
  const url = `${BASE_URL}${NOVEL_PATH}/${chapterNum}.html`;
  try {
    const html = await fetchUrl(url);
    if (html.includes('参数错误') || html.includes('文件不存在')) {
      console.error(`  Chapter ${chapterNum}: Page not found/invalid`);
      failed.push(chapterNum);
      return null;
    }
    const result = extractChapter(html, chapterNum);
    if (!result || !result.text) {
      console.error(`  Chapter ${chapterNum}: Failed to extract content`);
      failed.push(chapterNum);
      return null;
    }
    return result;
  } catch (err) {
    console.error(`  Chapter ${chapterNum}: Error - ${err.message}`);
    failed.push(chapterNum);
    return null;
  }
}

async function scrapeWithConcurrency(start, end) {
  const queue = [];
  for (let i = start; i <= end; i++) queue.push(i);

  async function worker() {
    while (queue.length > 0) {
      const chapterNum = queue.shift();
      if (chapterNum === undefined) break;
      const result = await scrapeChapter(chapterNum);
      chapters[chapterNum] = result;
      completed++;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = completed / elapsed;
      const remaining = (end - start + 1 - completed) / rate;
      if (completed % 20 === 0 || completed === 1) {
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        console.log(`[${completed}/${end - start + 1}] ${(completed / (end - start + 1) * 100).toFixed(1)}% | ${rate.toFixed(1)} ch/s | ETA: ${mins}m ${secs}s | Ch${chapterNum}: ${result?.title || 'FAILED'}`);
      }
      if (completed % SAVE_INTERVAL === 0) {
        const saved = saveProgress();
        console.log(`  💾 Saved: ${saved} chapters`);
      }
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);
}

// --- Main ---
async function main() {
  console.log('='.repeat(60));
  console.log(`Novel Scraper | ${NOVEL_PATH} | ${TOTAL_CHAPTERS} chapters | ${CONCURRENCY}x concurrency`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('='.repeat(60));

  startTime = Date.now();
  await scrapeWithConcurrency(1, TOTAL_CHAPTERS);

  // Retry failed chapters with exponential backoff (up to 3 attempts)
  if (failed.length > 0) {
    const retryList = [...failed];
    failed = [];
    const MAX_CHAPTER_RETRIES = 3;
    console.log(`\n🔄 Retrying ${retryList.length} failed chapters (up to ${MAX_CHAPTER_RETRIES}x each)...`);
    for (const chapterNum of retryList) {
      let success = false;
      for (let attempt = 1; attempt <= MAX_CHAPTER_RETRIES; attempt++) {
        const result = await scrapeChapter(chapterNum);
        if (result && result.text) {
          chapters[chapterNum] = result;
          console.log(`  ✅ Ch${chapterNum}: ${result.title} (attempt ${attempt})`);
          success = true;
          break;
        }
        console.log(`  ⚠️ Ch${chapterNum}: attempt ${attempt} failed`);
        if (attempt < MAX_CHAPTER_RETRIES) {
          const delay = 500 * Math.pow(4, attempt - 1); // 500ms → 2000ms → 8000ms
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      if (!success) {
        failed.push(chapterNum);
        console.log(`  ❌ Ch${chapterNum}: all ${MAX_CHAPTER_RETRIES} attempts failed`);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const totalSaved = saveProgress();
  const elapsed = (Date.now() - startTime) / 1000;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Done! ${totalSaved}/${TOTAL_CHAPTERS} chapters saved`);
  if (failed.length > 0) console.log(`   ❌ Failed (${failed.length}): ${failed.join(', ')}`);
  console.log(`   ⏱️  ${mins}m ${secs}s | 📦 ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
  console.log('='.repeat(60));
}

main().catch(err => { console.error('Fatal:', err); saveProgress(); process.exit(1); });
