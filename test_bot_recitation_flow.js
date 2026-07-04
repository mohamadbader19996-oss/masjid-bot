require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.ACTION_REGISTRY_SILENT = '1';

const { startRecitationCheckPage } = require('./src/handlers/quran');

async function main() {
  const messages = [];
  const ctx = {
    from: { id: 999004 },
    session: {},
    reply: async (text, opts) => {
      messages.push({ text, parseMode: opts?.parse_mode });
      return {};
    }
  };

  await startRecitationCheckPage(ctx, '1');

  if (!ctx.session.awaitingRecitationVoice || ctx.session.awaitingRecitationVoice !== 1) {
    throw new Error('awaitingRecitationVoice should be page number 1');
  }
  if (!ctx.session.recitationExpectedText || ctx.session.recitationExpectedText.length < 20) {
    throw new Error('recitationExpectedText not stored');
  }
  if (ctx.session.recitationCheck) {
    throw new Error('recitationCheck ayah session should not exist');
  }

  const prompt = messages.find((m) => m.text.includes('كاملة من حفظك'));
  if (!prompt) throw new Error('Full-page hafiz prompt not sent');
  if (prompt.text.includes('الۡحَمۡد') || prompt.text.includes('بِسۡم')) {
    throw new Error('Prompt must not display ayah text to user');
  }

  console.log('Full-page recitation flow test passed.');
  console.log('User prompt:', prompt.text.replace(/\n/g, ' | '));
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});
