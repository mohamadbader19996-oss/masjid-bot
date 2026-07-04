const crypto = require('crypto');
const db = require('../database');

function normalizeQuestion(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function resolveQaMode(options = {}) {
  if (options.khutbahMode) return `khutbah_${options.khutbahMode}`;
  if (options.scholarAdvanced) return 'scholar_advanced';
  return 'general';
}

function buildQaCacheKey(question, user, mode) {
  const payload = [
    normalizeQuestion(question),
    user?.religion || 'muslim',
    user?.madhab || '',
    user?.sect || '',
    mode || 'general'
  ].join('\x1f');
  return crypto.createHash('md5').update(payload, 'utf8').digest('hex');
}

function getCachedQaAnswer(question, user, options = {}) {
  const mode = resolveQaMode(options);
  const key = buildQaCacheKey(question, user, mode);
  const entry = db.getQaCacheEntry(key);
  if (!entry?.answer) return null;
  db.touchQaCacheEntry(key);
  return entry.answer;
}

function saveQaCacheAnswer(question, user, options, answer) {
  const mode = resolveQaMode(options);
  const key = buildQaCacheKey(question, user, mode);
  db.setQaCacheEntry(key, {
    answer,
    question: normalizeQuestion(question),
    religion: user?.religion || 'muslim',
    madhab: user?.madhab || '',
    sect: user?.sect || '',
    mode
  });
  return key;
}

module.exports = {
  normalizeQuestion,
  resolveQaMode,
  buildQaCacheKey,
  getCachedQaAnswer,
  saveQaCacheAnswer
};
