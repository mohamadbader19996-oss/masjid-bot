const axios = require('axios');

const API_ROOT = 'https://api.alquran.cloud/v1';

async function getSurahs() {
  try {
    const response = await axios.get(`${API_ROOT}/surah`);
    return response.data?.data || [];
  } catch (error) {
    console.error('quranApi.getSurahs error:', error.message || error);
    return [];
  }
}

async function getSurah(number) {
  try {
    const response = await axios.get(`${API_ROOT}/surah/${Number(number)}`);
    return response.data?.data || null;
  } catch (error) {
    console.error(`quranApi.getSurah(${number}) error:`, error.message || error);
    return null;
  }
}

async function getSurahTranslation(number, edition = 'en.sahih') {
  try {
    const response = await axios.get(`${API_ROOT}/surah/${Number(number)}/${edition}`);
    return response.data?.data || null;
  } catch (error) {
    console.error(`quranApi.getSurahTranslation(${number}, ${edition}) error:`, error.message || error);
    return null;
  }
}

async function getAyah(surah, ayah) {
  try {
    const response = await axios.get(`${API_ROOT}/ayah/${Number(surah)}:${Number(ayah)}`);
    return response.data?.data || null;
  } catch (error) {
    console.error(`quranApi.getAyah(${surah}, ${ayah}) error:`, error.message || error);
    return null;
  }
}

async function searchQuran(keyword) {
  try {
    const response = await axios.get(`${API_ROOT}/search/${encodeURIComponent(keyword)}/all`);
    return response.data?.data || null;
  } catch (error) {
    console.error(`quranApi.searchQuran(${keyword}) error:`, error.message || error);
    return null;
  }
}

module.exports = {
  getSurahs,
  getSurah,
  getSurahTranslation,
  getAyah,
  searchQuran
};
