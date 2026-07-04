const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { getCountryArchiveDetails } = require('./hierarchicalStatsService');
const { getRegionName } = require('../data/geoRegions');

const ARCHIVE_DIR = path.join(process.cwd(), 'data', 'regional-archive');

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatIssueDate(date = new Date()) {
  return date.toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildArchiveReportHtml({ regionName, details, issueDate }) {
  const mosqueRows = details.mosques.length
    ? details.mosques.map((m, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(m.name)}</td>
          <td class="num">${m.worshippers}</td>
          <td>${m.active ? '✅ نشط' : '❄️ موقوف'}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="empty">لا مساجد مسجّلة</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; font-family: 'Segoe UI', Tahoma, sans-serif; background: #f4f6f8; color: #1a1a1a; }
    #report {
      max-width: 820px; margin: 0 auto; background: #fff; border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0f766e 0%, #115e59 100%);
      color: #fff; padding: 28px 32px; text-align: center;
    }
    .logo { font-size: 36px; margin-bottom: 8px; }
    .header h1 { margin: 0 0 8px; font-size: 22px; font-weight: 700; }
    .header .issue { font-size: 13px; opacity: 0.9; }
    .body { padding: 28px 32px; }
    .meta-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;
    }
    .meta-box {
      background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 16px;
    }
    .meta-box .label { font-size: 12px; color: #166534; margin-bottom: 4px; }
    .meta-box .value { font-size: 16px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #ecfdf5; color: #065f46; padding: 12px 10px; text-align: right; border-bottom: 2px solid #6ee7b7; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    td.num { text-align: center; font-weight: 600; color: #2563eb; }
    tr:nth-child(even) td { background: #fafafa; }
    .empty { text-align: center; color: #888; padding: 24px; }
    .totals {
      margin-top: 20px; padding: 16px; background: #eff6ff; border-radius: 10px;
      display: flex; justify-content: space-between; font-weight: 600;
    }
    .footer { text-align: center; padding: 16px; font-size: 11px; color: #888; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div id="report">
    <div class="header">
      <div class="logo">🕌</div>
      <h1>منارة المسلم — الأرشيف الإقليمي</h1>
      <div class="issue">📅 تاريخ الإصدار: ${escapeHtml(issueDate)}</div>
    </div>
    <div class="body">
      <div class="meta-grid">
        <div class="meta-box"><div class="label">🌍 المنطقة</div><div class="value">${escapeHtml(regionName)}</div></div>
        <div class="meta-box"><div class="label">🏳️ البلد</div><div class="value">${escapeHtml(details.name)}</div></div>
        <div class="meta-box"><div class="label">🪪 المشرف الإقليمي</div><div class="value">${escapeHtml(details.moderatorName || '—')}</div></div>
        <div class="meta-box"><div class="label">🕌 إجمالي المساجد</div><div class="value">${details.totalMosques}</div></div>
      </div>
      <table>
        <thead>
          <tr><th>#</th><th>المسجد</th><th>👥 المصلّون</th><th>الحالة</th></tr>
        </thead>
        <tbody>${mosqueRows}</tbody>
      </table>
      <div class="totals">
        <span>🕌 المساجد: ${details.totalMosques}</span>
        <span>👥 المصلّون: ${details.totalWorshippers}</span>
      </div>
    </div>
    <div class="footer">منارة المسلم — تقرير أرشيف إقليمي</div>
  </div>
</body>
</html>`;
}

async function createArchiveBrowser() {
  return puppeteer.launch({
    headless: true,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

async function renderCountryArchiveReport(regionId, countryCode, browser = null) {
  const details = getCountryArchiveDetails(countryCode);
  const regionName = getRegionName(regionId);
  const issueDate = formatIssueDate();
  const html = buildArchiveReportHtml({ regionName, details, issueDate });

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const stamp = Date.now();
  const pngPath = path.join(ARCHIVE_DIR, `archive_${details.code}_${stamp}.png`);
  const pdfPath = path.join(ARCHIVE_DIR, `archive_${details.code}_${stamp}.pdf`);

  const ownBrowser = !browser;
  const br = browser || await createArchiveBrowser();
  const page = await br.newPage();
  try {
    await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    const element = await page.$('#report');
    if (!element) throw new Error('عنصر التقرير غير موجود');
    await element.screenshot({ path: pngPath, type: 'png' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' }
    });
  } finally {
    await page.close();
    if (ownBrowser) await br.close();
  }

  return {
    pngPath,
    pdfPath,
    pngSize: fs.statSync(pngPath).size,
    pdfSize: fs.statSync(pdfPath).size,
    details,
    regionName
  };
}

module.exports = {
  buildArchiveReportHtml,
  formatIssueDate,
  renderCountryArchiveReport,
  createArchiveBrowser
};
