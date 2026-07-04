require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const path = require('path');
const { startMushafPage } = require('./src/handlers/quran');

const REFERENCE_SIZE = 132089;
const TOLERANCE = 15000;

async function main() {
  const messages = [];
  let photoPath = null;

  const ctx = {
    from: { id: 999001 },
    session: {},
    reply: async (text) => {
      messages.push({ type: 'text', text });
      return {};
    },
    replyWithPhoto: async (media, opts) => {
      const src = media.source;
      photoPath = typeof src === 'string' ? src : src;
      messages.push({ type: 'photo', path: photoPath, caption: opts?.caption });
      return {};
    }
  };

  await startMushafPage(ctx, '1');

  if (!photoPath || !fs.existsSync(photoPath)) {
    throw new Error('No photo was sent');
  }
  if (!photoPath.includes('tajweed')) {
    throw new Error('Photo path does not look like tajweed output: ' + photoPath);
  }

  const size = fs.statSync(photoPath).size;
  const diff = Math.abs(size - REFERENCE_SIZE);

  console.log('Bot handler test: startMushafPage(ctx, "1")');
  console.log('Messages:', messages.map((m) => m.type + (m.text ? ': ' + m.text.slice(0, 40) : '')).join(' | '));
  console.log('Photo path:', photoPath);
  console.log('Photo caption:', messages.find((m) => m.type === 'photo')?.caption);
  console.log('PNG size bytes:', size);
  console.log('Reference size bytes:', REFERENCE_SIZE);
  console.log('Difference bytes:', diff);

  if (diff > TOLERANCE) {
    throw new Error('Size differs too much — likely wrong renderer');
  }
  if (!messages.some((m) => m.type === 'photo' && m.caption?.includes('المصحف المجوّد'))) {
    throw new Error('Caption missing المصحف المجوّد');
  }

  console.log('Hafiz tajweed bot flow test passed.');
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});
