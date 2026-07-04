const fs = require('fs');
const path = require('path');
const axios = require('axios');
const puppeteer = require('puppeteer');

const QCF4_BASE = 'https://raw.githubusercontent.com/MohamadHajjRabee/quran-qcf4/main';
const PAGES_CACHE_DIR = path.join(process.cwd(), 'data', 'qcf4', 'pages');
const FONTS_CACHE_DIR = path.join(process.cwd(), 'fonts', 'qcf4');
const MUSHAF_PAGES_DIR = path.join(process.cwd(), 'data', 'mushaf-pages');

const THEMES = {
  light: {
    bodyBg: '#ffffff',
    pageBg: '#ffffff',
    textColor: '#000000',
    endColor: '#666666',
    headerColor: '#000000'
  },
  dark: {
    bodyBg: '#1a1a1a',
    pageBg: '#1a1a1a',
    textColor: '#e8d9b5',
    endColor: '#a89870',
    headerColor: '#e8d9b5'
  }
};

function normalizeTheme(theme) {
  return theme === 'dark' ? 'dark' : 'light';
}

function parseRenderOptions(themeOrOptions = 'light') {
  if (typeof themeOrOptions === 'string') {
    return { theme: normalizeTheme(themeOrOptions), browser: null };
  }
  return {
    theme: normalizeTheme(themeOrOptions.theme || 'light'),
    browser: themeOrOptions.browser || null
  };
}

function fontFileName(fontName) {
  if (fontName === 'QCF4_QBSML') return 'QCF4_QBSML.ttf';
  return `${fontName}_W.ttf`;
}

function fontDownloadUrl(fontName) {
  return `${QCF4_BASE}/fonts/${fontFileName(fontName)}`;
}

function pageDownloadUrl(pageNumber) {
  const padded = String(pageNumber).padStart(3, '0');
  return `${QCF4_BASE}/pages/${padded}.json`;
}

function pageCachePath(pageNumber) {
  const padded = String(pageNumber).padStart(3, '0');
  return path.join(PAGES_CACHE_DIR, `${padded}.json`);
}

function fontCachePath(fontName) {
  return path.join(FONTS_CACHE_DIR, fontFileName(fontName));
}

function savedMushafPagePath(pageNumber, theme = 'light') {
  const num = Number(pageNumber);
  if (!Number.isFinite(num) || num < 1 || num > 604) {
    throw new Error('رقم الصفحة يجب أن يكون بين 1 و 604');
  }
  const t = normalizeTheme(theme);
  return path.join(MUSHAF_PAGES_DIR, `page_${num}_${t}.png`);
}

function isMushafPageCached(pageNumber, theme = 'light') {
  const filePath = savedMushafPagePath(pageNumber, theme);
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectFontsFromPage(pageData) {
  const fonts = new Set(['QCF4_QBSML']);
  if (pageData.font) fonts.add(pageData.font);
  for (const line of pageData.lines || []) {
    for (const word of line.words || []) {
      if (word.font) fonts.add(word.font);
    }
  }
  return [...fonts];
}

async function downloadToCache(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    validateStatus: (s) => s === 200
  });
  fs.writeFileSync(destPath, Buffer.from(res.data));
  return destPath;
}

async function ensureFontCached(fontName) {
  const dest = fontCachePath(fontName);
  if (fs.existsSync(dest)) return dest;
  await downloadToCache(fontDownloadUrl(fontName), dest);
  return dest;
}

async function loadPageData(pageNumber) {
  const num = Number(pageNumber);
  if (!Number.isFinite(num) || num < 1 || num > 604) {
    throw new Error('رقم الصفحة يجب أن يكون بين 1 و 604');
  }

  const cachePath = pageCachePath(num);
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }

  const data = (await axios.get(pageDownloadUrl(num), {
    timeout: 30000,
    validateStatus: (s) => s === 200
  })).data;

  if (!data || !Array.isArray(data.lines)) {
    throw new Error('بيانات الصفحة غير صالحة');
  }

  fs.mkdirSync(PAGES_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data));
  return data;
}

function readFontBase64(fontName) {
  const filePath = fontCachePath(fontName);
  if (!fs.existsSync(filePath)) {
    throw new Error('الخط غير موجود في الكاش: ' + fontName);
  }
  return fs.readFileSync(filePath).toString('base64');
}

async function ensureFontBase64(fontName) {
  await ensureFontCached(fontName);
  return readFontBase64(fontName);
}

function buildPageHtml(pageData, fontBase64Map, theme = 'light') {
  const colors = THEMES[normalizeTheme(theme)];
  const fontFaces = Object.entries(fontBase64Map).map(([name, base64]) =>
    `@font-face { font-family: '${name}'; src: url(data:font/truetype;base64,${base64}) format('truetype'); font-display: block; }`
  ).join('\n');

  const linesHtml = (pageData.lines || []).map((line) => {
    const wordsHtml = (line.words || []).map((word) => {
      const cls = `mushaf-word type-${word.type || 'word'}`;
      return `<span class="${cls}" style="font-family:'${word.font}'">${escapeHtml(word.char)}</span>`;
    }).join('');
    return `<div class="mushaf-line">${wordsHtml}</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${colors.bodyBg}; margin: 0; padding: 16px; }
  #mushaf-page {
    background: ${colors.pageBg};
    display: inline-block;
    padding: 24px 20px;
    direction: rtl;
  }
  .mushaf-line {
    display: flex;
    flex-direction: row;
    direction: rtl;
    justify-content: center;
    width: 100%;
    flex-wrap: nowrap;
    line-height: 1.9;
  }
  .mushaf-word {
    display: inline-block;
    font-size: 42px;
    padding: 0 1px;
    color: ${colors.textColor};
  }
  .mushaf-word.type-surah_header {
    display: block;
    text-align: center;
    width: 100%;
    margin: 8px 0;
    font-size: 52px;
    color: ${colors.headerColor};
  }
  .mushaf-word.type-end {
    color: ${colors.endColor};
  }
  ${fontFaces}
</style>
</head>
<body>
  <div id="mushaf-page">${linesHtml}</div>
</body>
</html>`;
}

function extractVerseKeys(pageData) {
  const keys = new Set();
  for (const line of pageData.lines || []) {
    for (const word of line.words || []) {
      if (word.verse_key) keys.add(word.verse_key);
    }
  }
  return [...keys].sort((a, b) => {
    const [sa, aa] = a.split(':').map(Number);
    const [sb, ab] = b.split(':').map(Number);
    return sa - sb || aa - ab;
  });
}

async function createMushafBrowser() {
  return puppeteer.launch({
    headless: true,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

async function screenshotPageWithBrowser(browser, pageNumber, outputPath, theme = 'light') {
  const pageData = await loadPageData(pageNumber);
  const fontsNeeded = collectFontsFromPage(pageData);
  const fontBase64Map = {};
  for (const fontName of fontsNeeded) {
    fontBase64Map[fontName] = await ensureFontBase64(fontName);
  }

  const html = buildPageHtml(pageData, fontBase64Map, theme);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.evaluateHandle(() => document.fonts.ready);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.fonts].map((face) => face.load()));
    });
    const fontStatus = await page.evaluate(() => ({
      size: document.fonts.size,
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').length
    }));
    if (!fontStatus.size || fontStatus.loaded < fontStatus.size) {
      throw new Error('فشل تحميل خط QCF4 (' + fontStatus.loaded + '/' + fontStatus.size + ')');
    }
    const element = await page.$('#mushaf-page');
    if (!element) throw new Error('عنصر الصفحة غير موجود');
    await element.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await page.close();
  }

  return { pngPath: outputPath, pageData, verseKeys: extractVerseKeys(pageData), cached: false, theme: normalizeTheme(theme) };
}

async function renderMushafPageImage(pageNumber, themeOrOptions = 'light') {
  const { theme, browser } = parseRenderOptions(themeOrOptions);
  const num = Number(pageNumber);
  if (!Number.isFinite(num) || num < 1 || num > 604) {
    throw new Error('رقم الصفحة يجب أن يكون بين 1 و 604');
  }

  const outputPath = savedMushafPagePath(num, theme);
  if (isMushafPageCached(num, theme)) {
    const pageData = await loadPageData(num);
    return {
      pngPath: outputPath,
      pageData,
      verseKeys: extractVerseKeys(pageData),
      cached: true,
      theme
    };
  }

  if (browser) {
    return screenshotPageWithBrowser(browser, num, outputPath, theme);
  }

  const ownBrowser = await createMushafBrowser();
  try {
    return await screenshotPageWithBrowser(ownBrowser, num, outputPath, theme);
  } finally {
    await ownBrowser.close();
  }
}

module.exports = {
  renderMushafPageImage,
  loadPageData,
  extractVerseKeys,
  savedMushafPagePath,
  isMushafPageCached,
  createMushafBrowser,
  normalizeTheme,
  parseRenderOptions,
  THEMES,
  fontFileName,
  QCF4_BASE,
  MUSHAF_PAGES_DIR
};
