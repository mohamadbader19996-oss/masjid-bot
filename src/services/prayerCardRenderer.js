const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');
const {
  PRAYER_KEYS,
  PRAYER_NAMES,
  PRAYER_ICONS
} = require('./prayerTimes');
const { getCurrentHijriInfo } = require('../utils/islamicDatesNotifier');

const CARD_WIDTH = 800;
const CARD_HEIGHT = 1000;

const ROW_BG_A = '#1a2f4a';
const ROW_BG_B = '#243b5c';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatGregorianDate() {
  return new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

async function resolveHijriDateLine() {
  try {
    const info = await getCurrentHijriInfo();
    return `${info.day} ${info.monthName} ${info.year}هـ`;
  } catch {
    return '';
  }
}

function buildPrayerRowsHtml(times) {
  return PRAYER_KEYS.map((key, i) => {
    const time = times?.[key] || '—';
    const bg = i % 2 === 0 ? ROW_BG_A : ROW_BG_B;
    return `
      <div class="row" style="background: ${bg};">
        <span class="row-icon">${PRAYER_ICONS[i]}</span>
        <span class="row-name">${escapeHtml(PRAYER_NAMES[i])}</span>
        <span class="row-time">${escapeHtml(time)}</span>
      </div>`;
  }).join('');
}

function buildCardHtml(mosque, times, gregorianDate, hijriDate) {
  const hijriLine = hijriDate
    ? `<div class="date-hijri">${escapeHtml(hijriDate)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${CARD_WIDTH}px;
      height: ${CARD_HEIGHT}px;
      font-family: 'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif;
      background: linear-gradient(165deg, #0a1628 0%, #12243d 45%, #1a2f4a 100%);
      color: #f0f4f8;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #card {
      width: 720px;
      padding: 40px 36px 32px;
      border-radius: 24px;
      border: 1px solid rgba(212, 175, 55, 0.25);
      background: rgba(10, 22, 40, 0.55);
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
    }
    .brand {
      text-align: center;
      font-size: 42px;
      font-weight: 700;
      letter-spacing: 2px;
      background: linear-gradient(135deg, #c9a227 0%, #e8d48b 35%, #9b7fd4 70%, #6b4fa0 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 8px;
    }
    .subtitle {
      text-align: center;
      font-size: 15px;
      color: rgba(212, 175, 55, 0.75);
      margin-bottom: 20px;
      letter-spacing: 1px;
    }
    .mosque-name {
      text-align: center;
      font-size: 26px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 28px;
      line-height: 1.4;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 28px;
    }
    .row {
      display: flex;
      align-items: center;
      padding: 16px 20px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.14);
    }
    .row-icon {
      font-size: 28px;
      width: 44px;
      text-align: center;
      flex-shrink: 0;
    }
    .row-name {
      flex: 1;
      font-size: 22px;
      font-weight: 700;
      color: #f0f4f8;
    }
    .row-time {
      font-size: 26px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: #f5d76e;
      letter-spacing: 1px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    }
    .footer {
      text-align: center;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .date-gregorian {
      font-size: 16px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.85);
      margin-bottom: 6px;
    }
    .date-hijri {
      font-size: 15px;
      font-weight: 600;
      color: rgba(245, 215, 110, 0.95);
    }
  </style>
</head>
<body>
  <div id="card">
    <div class="brand">Talaqi</div>
    <div class="subtitle">مواقيت الصلاة</div>
    <div class="mosque-name">${escapeHtml(mosque.name)}</div>
    <div class="rows">
      ${buildPrayerRowsHtml(times)}
    </div>
    <div class="footer">
      <div class="date-gregorian">${escapeHtml(gregorianDate)}</div>
      ${hijriLine}
    </div>
  </div>
</body>
</html>`;
}

async function createPrayerCardBrowser() {
  return puppeteer.launch({
    headless: true,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

async function renderPrayerTimesCard(mosque, browser = null) {
  const times = mosque?.prayerTimes || {};
  const gregorianDate = formatGregorianDate();
  const hijriDate = await resolveHijriDateLine();
  const html = buildCardHtml(mosque, times, gregorianDate, hijriDate);

  const ownBrowser = !browser;
  const br = browser || await createPrayerCardBrowser();
  const tmpPath = path.join(os.tmpdir(), `talaqi-prayer-${Date.now()}.png`);

  const page = await br.newPage();
  try {
    await page.setViewport({
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      deviceScaleFactor: 2
    });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 200));
    const element = await page.$('#card');
    if (!element) throw new Error('عنصر البطاقة غير موجود');
    await element.screenshot({ path: tmpPath, type: 'png' });
  } finally {
    await page.close();
    if (ownBrowser) await br.close();
  }

  return tmpPath;
}

module.exports = {
  renderPrayerTimesCard,
  createPrayerCardBrowser
};
