const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const CHARTS_DIR = path.join(process.cwd(), 'data', 'stats-charts');

function buildSingleChartHtml({
  title,
  subtitle,
  labels,
  data,
  borderColor,
  fillColor,
  datasetLabel,
  xAxisTitle = 'يوم الشهر'
}) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    body { margin: 0; padding: 24px; font-family: 'Segoe UI', Tahoma, sans-serif; background: #fafafa; }
    h1 { font-size: 18px; text-align: center; margin: 0 0 4px; color: #1a1a1a; }
    h2 { font-size: 14px; text-align: center; margin: 0 0 16px; color: #666; font-weight: normal; }
    #wrap { width: 860px; height: 480px; background: #fff; border-radius: 12px; padding: 16px; box-sizing: border-box; }
    canvas { width: 100% !important; height: 100% !important; }
  </style>
</head>
<body>
  <div id="wrap">
    <h1>${title}</h1>
    <h2>${subtitle}</h2>
    <canvas id="chart"></canvas>
  </div>
  <script>
    window.__chartReady = false;
    const ctx = document.getElementById('chart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [{
          label: ${JSON.stringify(datasetLabel)},
          data: ${JSON.stringify(data)},
          borderColor: ${JSON.stringify(borderColor)},
          backgroundColor: ${JSON.stringify(fillColor)},
          tension: 0.25,
          fill: true,
          pointRadius: 3
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', rtl: true, labels: { font: { size: 13 } } }
        },
        scales: {
          x: { title: { display: true, text: ${JSON.stringify(xAxisTitle)} } },
          y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'العدد' } }
        }
      }
    });
    window.__chartReady = true;
  </script>
</body>
</html>`;
}

async function createStatsBrowser() {
  return puppeteer.launch({
    headless: true,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

async function screenshotChartHtml(html, outputPath, browser) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 920, height: 560, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction('window.__chartReady === true', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 300));
    const element = await page.$('#wrap');
    if (!element) throw new Error('عنصر الرسم غير موجود');
    await element.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await page.close();
  }
  const stat = fs.statSync(outputPath);
  return { pngPath: outputPath, size: stat.size };
}

async function renderMonthlyStatsCharts(stats, browser = null) {
  const ownBrowser = !browser;
  const br = browser || await createStatsBrowser();
  try {
    const dayLabels = Array.from({ length: stats.days }, (_, i) => String(i + 1));
    const mosquesHtml = buildSingleChartHtml({
      title: '📈 المساجد الجديدة هذا الشهر',
      subtitle: stats.label,
      labels: dayLabels,
      data: stats.mosquesDaily,
      borderColor: '#2563eb',
      fillColor: 'rgba(37, 99, 235, 0.12)',
      datasetLabel: '🕌 مساجد جديدة/يوم',
      xAxisTitle: 'يوم الشهر'
    });
    const moderatorsHtml = buildSingleChartHtml({
      title: '📈 المشرفون الجدد هذا الشهر',
      subtitle: stats.label,
      labels: dayLabels,
      data: stats.moderatorsDaily,
      borderColor: '#16a34a',
      fillColor: 'rgba(22, 163, 74, 0.12)',
      datasetLabel: '🪪 مشرفون جدد/يوم',
      xAxisTitle: 'يوم الشهر'
    });

    const mosques = await screenshotChartHtml(
      mosquesHtml,
      path.join(CHARTS_DIR, `chart_mosques_${stats.monthKey}.png`),
      br
    );
    const moderators = await screenshotChartHtml(
      moderatorsHtml,
      path.join(CHARTS_DIR, `chart_mods_${stats.monthKey}.png`),
      br
    );

    return { mosques, moderators };
  } finally {
    if (ownBrowser) await br.close();
  }
}

async function renderYearlyStatsCharts(stats, browser = null) {
  const ownBrowser = !browser;
  const br = browser || await createStatsBrowser();
  try {
    const mosquesHtml = buildSingleChartHtml({
      title: '📈 المساجد الجديدة هذه السنة',
      subtitle: stats.label,
      labels: stats.monthLabels,
      data: stats.mosquesMonthly,
      borderColor: '#2563eb',
      fillColor: 'rgba(37, 99, 235, 0.12)',
      datasetLabel: '🕌 مساجد جديدة/شهر',
      xAxisTitle: 'الشهر'
    });
    const moderatorsHtml = buildSingleChartHtml({
      title: '📈 المشرفون الجدد هذه السنة',
      subtitle: stats.label,
      labels: stats.monthLabels,
      data: stats.moderatorsMonthly,
      borderColor: '#16a34a',
      fillColor: 'rgba(22, 163, 74, 0.12)',
      datasetLabel: '🪪 مشرفون جدد/شهر',
      xAxisTitle: 'الشهر'
    });

    const mosques = await screenshotChartHtml(
      mosquesHtml,
      path.join(CHARTS_DIR, `chart_y_mosques_${stats.year}.png`),
      br
    );
    const moderators = await screenshotChartHtml(
      moderatorsHtml,
      path.join(CHARTS_DIR, `chart_y_mods_${stats.year}.png`),
      br
    );

    return { mosques, moderators };
  } finally {
    if (ownBrowser) await br.close();
  }
}

/** @deprecated استخدم renderMonthlyStatsCharts */
async function renderMonthlyStatsChart(stats, browser = null) {
  const { mosques } = await renderMonthlyStatsCharts(stats, browser);
  return mosques;
}

module.exports = {
  buildSingleChartHtml,
  renderMonthlyStatsCharts,
  renderYearlyStatsCharts,
  renderMonthlyStatsChart,
  createStatsBrowser
};
