const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { renderTajweedPageHtml, fetchTajweedPageAyahs, normalizeTajweedTheme } = require('./tajweedColors');
const { getPageVerseRange } = require('./quranApi');

const OUTPUT_DIR = path.join(process.cwd(), 'temp', 'tajweed');

async function createTajweedBrowser() {
  return puppeteer.launch({
    headless: true,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

/**
 * المصحف المجوّد — يرسم HTML ملوّن بالتجويد (renderTajweedPageHtml).
 * لا يستخدم renderMushafPageImage / mushafRenderer.
 */
async function renderTajweedPageImage(parsedAyahs, outputPath, options = {}) {
  const html = renderTajweedPageHtml(parsedAyahs, options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = options.browser || await createTajweedBrowser();
  const ownBrowser = !options.browser;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 920, height: 1400, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const element = await page.$('#tajweed-page');
    if (!element) throw new Error('عنصر tajweed-page غير موجود');
    await element.screenshot({ path: outputPath, type: 'png' });
    await page.close();
  } finally {
    if (ownBrowser) await browser.close();
  }

  return { pngPath: outputPath, renderer: 'renderTajweedPageHtml', theme: normalizeTajweedTheme(options.theme) };
}

async function renderTajweedMushafPageImage(pageNumber, outputPath, options = {}) {
  const num = Number(pageNumber);
  if (!Number.isFinite(num) || num < 1 || num > 604) {
    throw new Error('رقم الصفحة يجب أن يكون بين 1 و 604');
  }
  const theme = normalizeTajweedTheme(options.theme);
  const verses = await getPageVerseRange(num);
  if (!verses?.length) {
    throw new Error('لم أتمكن من جلب آيات الصفحة ' + num);
  }
  const parsedAyahs = await fetchTajweedPageAyahs(verses);
  return renderTajweedPageImage(parsedAyahs, outputPath, {
    title: 'المصحف المجوّد',
    subtitle: options.subtitle || 'صفحة ' + num,
    theme,
    ...options
  });
}

function tajweedMushafPagePath(pageNumber, theme = 'light') {
  const num = Number(pageNumber);
  const t = normalizeTajweedTheme(theme);
  return path.join(OUTPUT_DIR, 'page_' + num + '_' + t + '_tajweed.png');
}

module.exports = {
  renderTajweedPageImage,
  renderTajweedMushafPageImage,
  tajweedMushafPagePath,
  createTajweedBrowser,
  OUTPUT_DIR
};
