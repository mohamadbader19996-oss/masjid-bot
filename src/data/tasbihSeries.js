const tasbihSeries = [
  {
    id: 'subhanallah',
    text: 'سُبْحَانَ اللَّهِ',
    target: 33,
    source: 'صحيح مسلم'
  },
  {
    id: 'alhamdulillah',
    text: 'الْحَمْدُ لِلَّهِ',
    target: 33,
    source: 'صحيح مسلم'
  },
  {
    id: 'allahuakbar',
    text: 'اللَّهُ أَكْبَرُ',
    target: 33,
    completion:
      'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
    source: 'صحيح مسلم'
  }
];

const tasbihExtended = [
  {
    id: 'istighfar',
    text: 'أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ',
    target: 100,
    source: 'سنن أبي داود والترمذي'
  },
  {
    id: 'subhanallah_wabihamdihi',
    text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
    target: 100,
    source: 'صحيح البخاري ومسلم'
  },
  {
    id: 'la_ilaha',
    text: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
    target: 100,
    source: 'صحيح البخاري'
  },
  {
    id: 'salah_nabi',
    text: 'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ',
    target: null,
    source: null
  },
  {
    id: 'free',
    text: 'عدّاد حر',
    target: null,
    source: null
  }
];

function findExtendedById(id) {
  return tasbihExtended.find((item) => item.id === id) || null;
}

function findDefaultByIndex(index) {
  return tasbihSeries[index] || null;
}

module.exports = {
  tasbihSeries,
  tasbihExtended,
  findExtendedById,
  findDefaultByIndex
};
