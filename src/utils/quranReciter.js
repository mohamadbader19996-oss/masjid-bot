const { RECITERS } = require('../services/quranApi');

function getCurrentReciter(ctx) {
  const id = ctx.session?.quranReciter || 'ar.alafasy';
  return RECITERS.find((r) => r.id === id) || RECITERS[0];
}

module.exports = { getCurrentReciter };
