const axios = require('axios');

const BASE_URL = 'https://api.alquran.cloud/v1';

async function getSurahs() {
  const res = await axios.get(`${BASE_URL}/surah`);
  return res.data.data;
}

async function getSurah(surahNumber) {
  const res = await axios.get(`${BASE_URL}/surah/${surahNumber}`);
  return res.data.data;
}

async function getSurahTranslation(surahNumber, edition) {
  const res = await axios.get(`${BASE_URL}/surah/${surahNumber}/${edition}`);
  return res.data.data;
}

async function getAyah(surahNumber, ayahNumber) {
  const res = await axios.get(`${BASE_URL}/ayah/${surahNumber}:${ayahNumber}`);
  return res.data.data;
}

async function searchQuran(keyword, surah = 'all') {
  const res = await axios.get(`${BASE_URL}/search/${keyword}/${surah}/ar`);
  return res.data.data;
}

module.exports = { getSurahs, getSurah, getSurahTranslation, getAyah, searchQuran };