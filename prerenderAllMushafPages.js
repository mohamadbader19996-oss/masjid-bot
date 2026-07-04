const {
  renderMushafPageImage,
  createMushafBrowser,
  isMushafPageCached,
  savedMushafPagePath,
  MUSHAF_PAGES_DIR
} = require('./src/services/mushafRenderer');

async function main() {
  const maxPage = Math.min(604, Math.max(1, parseInt(process.env.MAX_PAGES || '604', 10)));
  console.log('Mushaf prerender — pages 1 to', maxPage);
  console.log('Output dir:', MUSHAF_PAGES_DIR);

  const browser = await createMushafBrowser();
  let rendered = 0;
  let skipped = 0;

  try {
    for (let page = 1; page <= maxPage; page++) {
      if (isMushafPageCached(page, 'light')) {
        skipped++;
      } else {
        await renderMushafPageImage(page, { browser, theme: 'light' });
        rendered++;
        console.log('  rendered page', page, '→', savedMushafPagePath(page, 'light'));
      }

      if (page % 20 === 0 || page === maxPage) {
        console.log(`Progress ${page}/${maxPage} — rendered: ${rendered}, skipped: ${skipped}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (maxPage === 604) {
    console.log('✅ انتهى رسم كل الصفحات الـ604');
  } else {
    console.log('✅ test run finished — pages 1 to', maxPage);
  }
  console.log('Total rendered this run:', rendered, '| already cached:', skipped);
}

main().catch((err) => {
  console.error('Prerender failed:', err.message);
  process.exit(1);
});
