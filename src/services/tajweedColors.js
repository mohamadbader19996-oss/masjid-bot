const axios = require('axios');

const API_ROOT = 'https://api.alquran.cloud/v1';

/**
 * Al-Quran Cloud quran-tajweed markup (verified from live API):
 *   [RULE[:id][TEXT]   closed by ]
 * Example: بِسْمِ [h:1[ٱ]للَّهِ [h:2[ٱ][l[ل]رَّحْمَ[n[ـٰ]نِ
 */
const TAJWEED_RULES = {
  h: { ruleClass: 'ham_wasl', color: '#AAAAAA', labelAr: 'همزة الوصل', labelEn: 'Hamzat ul Wasl' },
  s: { ruleClass: 'silent', color: '#AAAAAA', labelAr: 'حرف ساكن', labelEn: 'Silent' },
  l: { ruleClass: 'laam_shamsiyah', color: '#AAAAAA', labelAr: 'لام شمسية', labelEn: 'Laam Shamsiyyah' },
  n: { ruleClass: 'madda_normal', color: '#537FFF', labelAr: 'مد عادي', labelEn: 'Madda Normal' },
  p: { ruleClass: 'madda_permissible', color: '#4050FF', labelAr: 'مد جائز', labelEn: 'Madda Permissible' },
  m: { ruleClass: 'madda_necessary', color: '#000EBC', labelAr: 'مد واجب', labelEn: 'Madda Necessary' },
  q: { ruleClass: 'qalqalah', color: '#DD0008', labelAr: 'قلقلة', labelEn: 'Qalqalah' },
  o: { ruleClass: 'ikhafa_shafawi', color: '#D500B7', labelAr: 'إخفاء شفوي', labelEn: 'Ikhafa Shafawi' },
  c: { ruleClass: 'ikhafa', color: '#9400A8', labelAr: 'إخفاء', labelEn: 'Ikhafa' },
  f: { ruleClass: 'idgham_wo_ghunnah', color: '#169200', labelAr: 'إدغام بلا غنة', labelEn: 'Idgham without Ghunnah' },
  w: { ruleClass: 'idgham_ghunnah', color: '#169200', labelAr: 'إدغام بغنة', labelEn: 'Idgham with Ghunnah' },
  i: { ruleClass: 'iqlab', color: '#26BFFD', labelAr: 'إقلاب', labelEn: 'Iqlab' },
  a: { ruleClass: 'idgham_mutajanisayn', color: '#A1A1A1', labelAr: 'إدغام متجانسين', labelEn: 'Idgham Mutajanisayn' },
  u: { ruleClass: 'idgham_mutaqaribayn', color: '#A1A1A1', labelAr: 'إدغام متقاربين', labelEn: 'Idgham Mutaqaribayn' },
  d: { ruleClass: 'ghunnah', color: '#FF7E1E', labelAr: 'غنة', labelEn: 'Ghunnah' },
  b: { ruleClass: 'idgham_shafawi', color: '#58B800', labelAr: 'إدغام شفوي', labelEn: 'Idgham Shafawi' },
  g: { ruleClass: 'ghunnah', color: '#FF7E1E', labelAr: 'غنة', labelEn: 'Ghunnah' }
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseTajweedText(rawText) {
  const segments = [];
  const text = String(rawText || '');
  let i = 0;

  while (i < text.length) {
    if (text[i] === '[') {
      const tagMatch = text.slice(i).match(/^\[([a-z])(?::(\d+))?\[([^\]]*)\]/);
      if (tagMatch) {
        const ruleLetter = tagMatch[1];
        const meta = TAJWEED_RULES[ruleLetter];
        segments.push({
          text: tagMatch[3],
          ruleClass: meta ? meta.ruleClass : null,
          ruleLetter
        });
        i += tagMatch[0].length;
        continue;
      }
    }

    let j = i;
    while (j < text.length && text[j] !== '[') j++;
    const plain = text.slice(i, j);
    if (plain) segments.push({ text: plain, ruleClass: null });
    i = j;
  }

  return segments;
}

function countSegmentStats(segments) {
  let withRule = 0;
  let withoutRule = 0;
  for (const seg of segments) {
    if (seg.ruleClass) withRule++;
    else withoutRule++;
  }
  return { withRule, withoutRule, total: segments.length };
}

function getRulesUsedInSegments(segments) {
  const used = new Map();
  for (const seg of segments) {
    if (!seg.ruleClass) continue;
    if (!used.has(seg.ruleClass)) {
      const meta = Object.values(TAJWEED_RULES).find((r) => r.ruleClass === seg.ruleClass);
      if (meta) used.set(seg.ruleClass, meta);
    }
  }
  return [...used.values()];
}

function renderTajweedHtml(parsedArray, options = {}) {
  const defaultColor = options.defaultColor || '#111111';
  return parsedArray.map((seg) => {
    if (!seg.ruleClass) {
      return `<span style="color:${defaultColor}">${escapeHtml(seg.text)}</span>`;
    }
    const meta = Object.values(TAJWEED_RULES).find((r) => r.ruleClass === seg.ruleClass);
    const color = meta ? meta.color : defaultColor;
    return `<span style="color:${color}">${escapeHtml(seg.text)}</span>`;
  }).join('');
}

const TAJWEED_THEMES = {
  light: {
    bodyBg: '#ffffff',
    contentBg: '#ffffff',
    contentBorder: '#dddddd',
    titleColor: '#222222',
    subtitleColor: '#666666',
    defaultColor: '#111111',
    ayahEndBorder: '#bbbbbb',
    ayahEndColor: '#555555',
    legendColor: '#444444',
    legendBorder: '#eeeeee'
  },
  dark: {
    bodyBg: '#1a1a1a',
    contentBg: '#1a1a1a',
    contentBorder: '#333333',
    titleColor: '#e8d9b5',
    subtitleColor: '#a89870',
    defaultColor: '#e8d9b5',
    ayahEndBorder: '#555555',
    ayahEndColor: '#a89870',
    legendColor: '#a89870',
    legendBorder: '#333333'
  }
};

function normalizeTajweedTheme(theme) {
  return theme === 'dark' ? 'dark' : 'light';
}

function renderTajweedPageHtml(parsedAyahs, options = {}) {
  const title = options.title || 'المصحف المجوّد';
  const subtitle = options.subtitle || '';
  const theme = normalizeTajweedTheme(options.theme);
  const colors = TAJWEED_THEMES[theme];
  const defaultColor = options.defaultColor || colors.defaultColor;
  const allSegments = parsedAyahs.flatMap((a) => a.segments);
  const legendRules = getRulesUsedInSegments(allSegments);

  const ayahBlocks = parsedAyahs.map((ayah) => {
    const textHtml = renderTajweedHtml(ayah.segments, { defaultColor });
    return `<div class="ayah-line"><span class="ayah-text">${textHtml}</span><span class="ayah-end"> ${escapeHtml(String(ayah.numberInSurah))}</span></div>`;
  }).join('\n');

  const legendHtml = legendRules.map((rule) =>
    `<span class="legend-item"><span class="swatch" style="background:${rule.color}"></span>${escapeHtml(rule.labelAr)}</span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${colors.bodyBg}; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 24px; }
  #tajweed-page { display: inline-block; max-width: 860px; }
  .title { text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 6px; color: ${colors.titleColor}; }
  .subtitle { text-align: center; font-size: 14px; color: ${colors.subtitleColor}; margin-bottom: 20px; }
  .content {
    border: 1px solid ${colors.contentBorder};
    border-radius: 12px;
    padding: 28px 24px;
    background: ${colors.contentBg};
  }
  .ayah-line {
    display: flex;
    flex-direction: row;
    direction: rtl;
    justify-content: center;
    align-items: baseline;
    flex-wrap: wrap;
    line-height: 2.2;
    font-size: 34px;
    margin-bottom: 8px;
  }
  .ayah-end {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid ${colors.ayahEndBorder};
    border-radius: 50%;
    font-size: 14px;
    color: ${colors.ayahEndColor};
    margin-right: 8px;
    flex-shrink: 0;
  }
  .legend {
    margin-top: 20px;
    border-top: 1px solid ${colors.legendBorder};
    padding-top: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    justify-content: center;
    font-size: 13px;
    color: ${colors.legendColor};
  }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .swatch { width: 14px; height: 14px; border-radius: 3px; display: inline-block; border: 1px solid #ccc; }
</style>
</head>
<body>
  <div id="tajweed-page">
    <div class="title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
    <div class="content">
      ${ayahBlocks}
      <div class="legend">${legendHtml}</div>
    </div>
  </div>
</body>
</html>`;
}

async function fetchTajweedAyah(surah, ayah) {
  const res = await axios.get(`${API_ROOT}/ayah/${surah}:${ayah}/quran-tajweed`, {
    timeout: 30000,
    validateStatus: (s) => s === 200
  });
  return res.data?.data?.text || '';
}

async function fetchTajweedSurah(surahNumber) {
  const res = await axios.get(`${API_ROOT}/surah/${surahNumber}/quran-tajweed`, {
    timeout: 30000,
    validateStatus: (s) => s === 200
  });
  const ayahs = res.data?.data?.ayahs || [];
  return ayahs.map((a) => ({
    numberInSurah: a.numberInSurah,
    text: a.text
  }));
}

async function resolveGlobalAyahNumber(surah, ayah) {
  const res = await axios.get(`${API_ROOT}/ayah/${surah}:${ayah}/quran-tajweed`, {
    timeout: 30000,
    validateStatus: (s) => s === 200
  });
  return res.data?.data?.number;
}

function parseTajweedAyahs(ayahs) {
  return ayahs.map((a) => ({
    numberInSurah: a.numberInSurah,
    text: a.text,
    segments: parseTajweedText(a.text)
  }));
}

async function fetchTajweedPageAyahs(verses) {
  const bySurah = new Map();
  for (const { surah, ayah } of verses) {
    if (!bySurah.has(surah)) bySurah.set(surah, []);
    bySurah.get(surah).push(ayah);
  }

  const textByKey = new Map();
  for (const [surah, ayahNums] of bySurah.entries()) {
    const surahAyahs = await fetchTajweedSurah(surah);
    const wanted = new Set(ayahNums);
    for (const a of surahAyahs) {
      if (wanted.has(a.numberInSurah)) {
        textByKey.set(surah + ':' + a.numberInSurah, a.text);
      }
    }
  }

  const ayahs = verses.map(({ surah, ayah }) => ({
    numberInSurah: ayah,
    text: textByKey.get(surah + ':' + ayah) || ''
  }));
  return parseTajweedAyahs(ayahs);
}

module.exports = {
  TAJWEED_RULES,
  parseTajweedText,
  countSegmentStats,
  renderTajweedHtml,
  renderTajweedPageHtml,
  TAJWEED_THEMES,
  normalizeTajweedTheme,
  fetchTajweedAyah,
  fetchTajweedSurah,
  parseTajweedAyahs,
  fetchTajweedPageAyahs,
  getRulesUsedInSegments
};
