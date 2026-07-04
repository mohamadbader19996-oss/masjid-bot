// الأربعون حديثاً قدسياً — ترتيب عز الدين إبراهيم / ITS
// expectedBooks: الكتاب الأساسي أولاً، ثم باقي الكتب الستة التي رويت فيها (حسب عمود «رواه»)
module.exports = [
  {
    number: 1,
    title: 'رحمتي تغلب غضبي',
    phrase: 'إِنَّ رَحْمَتِي تَغْلِبُ غَضَبِي',
    expectedBooks: ['muslim', 'bukhari', 'nasai', 'ibnmajah']
  },
  {
    number: 2,
    title: 'تكذيب ابن آدم وشتمه',
    phrase: 'كَذَّبَنِي ابْنُ آدَمَ وَلَمْ يَكُنْ لَهُ ذَلِكَ، وَشَتَمَنِي وَلَمْ يَكُنْ لَهُ ذَلِكَ',
    expectedBooks: ['bukhari', 'nasai']
  },
  {
    number: 3,
    title: 'المطر بفضل الله أو بالكواكب',
    phrase: 'أَصْبَحَ مِنْ عِبَادِي مُؤْمِنٌ بِي وَكَافِرٌ',
    expectedBooks: ['bukhari', 'nasai']
  },
  {
    number: 4,
    title: 'سب الدهر',
    phrase: 'قَالَ اللَّهُ يَسُبُّ بَنُو آدَمَ الدَّهْرَ، وَأَنَا الدَّهْرُ',
    expectedBooks: ['bukhari', 'muslim']
  },
  {
    number: 5,
    title: 'أغنى الشركاء عن الشرك',
    phrase: 'أَنَا أَغْنَى الشُّرَكَاءِ عَنْ الشِّرْكِ',
    expectedBooks: ['muslim', 'ibnmajah']
  },
  {
    number: 6,
    title: 'أول من يُقضى عليه يوم القيامة',
    phrase: 'إِنَّ أَوَّلَ النَّاسِ يُقْضَى يَوْمَ الْقِيَامَةِ عَلَيْهِ رَجُلٌ اسْتُشْهِدَ',
    expectedBooks: ['muslim', 'tirmidhi', 'nasai']
  },
  {
    number: 7,
    title: 'يعجب ربك من راعي غنم',
    phrase: 'يَعْجَبُ رَبُّكَ مِنْ رَاعِي غَنَمٍ فِي رَأْسِ شَظِيَّةِ الْجَبَلِ',
    expectedBooks: ['nasai']
  },
  {
    number: 8,
    title: 'قسمت الصلاة بيني وبين عبدي',
    phrase: 'قَسَمْتُ الصَّلَاةَ بَيْنِي وَبَيْنَ عَبْدِي نِصْفَيْنِ',
    expectedBooks: ['muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah']
  },
  {
    number: 9,
    title: 'أول ما يُحاسب به العبد صلاته',
    phrase: 'إِنَّ أَوَّلَ مَا يُحَاسَبُ بِهِ الْعَبْدُ يَوْمَ الْقِيَامَةِ مِنْ عَمَلِهِ صَلَاتُهُ',
    expectedBooks: ['tirmidhi', 'abudawud', 'nasai', 'ibnmajah']
  },
  {
    number: 10,
    title: 'الصوم لي وأنا أجزي به',
    phrase: 'الصَّوْمُ لِي وَأَنَا أَجْزِي بِهِ',
    expectedBooks: ['bukhari', 'muslim', 'tirmidhi', 'nasai', 'ibnmajah']
  },
  {
    number: 11,
    title: 'أنفق يا ابن آدم',
    phrase: 'قَالَ اللَّهُ أَنْفِقْ يَا ابْنَ آدَمَ أُنْفِقْ عَلَيْكَ',
    expectedBooks: ['bukhari']
  },
  {
    number: 12,
    title: 'تجاوزوا عن المعسر',
    phrase: 'نَحْنُ أَحَقُّ بِذَلِكَ مِنْهُ تَجَاوَزُوا عَنْهُ',
    expectedBooks: ['muslim', 'bukhari', 'nasai']
  },
  {
    number: 13,
    title: 'الوقوف بين يدي الله',
    phrase: 'ثُمَّ لَيَقِفَنَّ أَحَدُكُمْ بَيْنَ يَدَيْ اللَّهِ',
    expectedBooks: ['bukhari']
  },
  {
    number: 14,
    title: 'ملائكة سيارة في مجالس الذكر',
    phrase: 'إِنَّ لِلَّهِ تَبَارَكَ وَتَعَالَى مَلَائِكَةً سَيَّارَةً فُضُلًا',
    expectedBooks: ['muslim', 'bukhari', 'tirmidhi', 'nasai']
  },
  {
    number: 15,
    title: 'أنا عند ظن عبدي بي',
    phrase: 'أَنَا عِنْدَ ظَنِّ عَبْدِي بِي، وَأَنَا مَعَهُ إِذَا ذَكَرَنِي',
    expectedBooks: ['bukhari', 'muslim', 'tirmidhi', 'ibnmajah']
  },
  {
    number: 16,
    title: 'كتب الحسنات والسيئات',
    phrase: 'إِنَّ اللَّهَ كَتَبَ الْحَسَنَاتِ وَالسَّيِّئَاتِ، ثُمَّ بَيَّنَ ذَلِكَ',
    expectedBooks: ['bukhari', 'muslim']
  },
  {
    number: 17,
    title: 'يا عبادي حرمت الظلم',
    phrase: 'حَرَّمْتُ الظُّلْمَ عَلَى نَفْسِي وَجَعَلْتُهُ بَيْنَكُمْ مُحَرَّمًا',
    expectedBooks: ['muslim', 'tirmidhi', 'ibnmajah']
  },
  {
    number: 18,
    title: 'مرضت فلم تعدني',
    phrase: 'مَرِضْتُ فَلَمْ تَعُدْنِي',
    expectedBooks: ['muslim']
  },
  {
    number: 19,
    title: 'الكبرياء ردائي والعظمة إزاري',
    phrase: 'الْكِبْرِيَاءُ رِدَائِي وَالْعَظَمَةُ إِزَارِي',
    expectedBooks: ['abudawud', 'ibnmajah']
  },
  {
    number: 20,
    title: 'تُفتح أبواب الجنة الاثنين والخميس',
    phrase: 'تُفْتَحُ أَبْوَابُ الْجَنَّةِ يَوْمَ الِاثْنَيْنِ وَيَوْمَ الْخَمِيسِ',
    expectedBooks: ['muslim', 'abudawud']
  },
  {
    number: 21,
    title: 'ثلاثة أنا خصمهم',
    phrase: 'ثَلَاثَةٌ أَنَا خَصْمُهُمْ يَوْمَ الْقِيَامَةِ',
    expectedBooks: ['bukhari', 'ibnmajah']
  },
  {
    number: 22,
    title: 'فإياي كنت أحق أن تخشى',
    phrase: 'فَإِيَّايَ كُنْتَ أَحَقَّ أَنْ تَخْشَى',
    expectedBooks: ['ibnmajah']
  },
  {
    number: 23,
    title: 'المتحابون في جلالي',
    phrase: 'الْمُتَحَابُّونَ بِجَلَالِي الْيَوْمَ أُظِلُّهُمْ فِي ظِلِّي',
    expectedBooks: ['muslim', 'bukhari']
  },
  {
    number: 24,
    title: 'إذا أحب الله عبداً دعا جبريل',
    phrase: 'إِنَّ اللَّهَ إِذَا أَحَبَّ عَبْدًا دَعَا جِبْرِيلَ',
    expectedBooks: ['muslim', 'bukhari', 'tirmidhi']
  },
  {
    number: 25,
    title: 'من عادى لي ولياً',
    phrase: 'مَنْ عَادَى لِي وَلِيًّا فَقَدْ آذَنْتُهُ بِالْحَرْبِ',
    expectedBooks: ['bukhari']
  },
  {
    number: 26,
    title: 'أغبط أوليائي عندي',
    phrase: 'إِنَّ أَغْبَطَ أَوْلِيَائِي عِنْدِي لَمُؤْمِنٌ خَفِيفُ الْحَاذِ',
    expectedBooks: ['tirmidhi', 'ibnmajah']
  },
  {
    number: 27,
    title: 'أرواح الشهداء في طير خضر',
    phrase: 'أَرْوَاحُهُمْ فِي جَوْفِ طَيْرٍ خُضْرٍ',
    expectedBooks: ['muslim', 'tirmidhi', 'nasai', 'ibnmajah']
  },
  {
    number: 28,
    title: 'بادرني عبدي بنفسه',
    phrase: 'بَادَرَنِي عَبْدِي بِنَفْسِهِ، حَرَّمْتُ عَلَيْهِ الْجَنَّةَ',
    expectedBooks: ['bukhari']
  },
  {
    number: 29,
    title: 'جزاء المؤمن عند قبض صفيه',
    phrase: 'مَا لِعَبْدِي الْمُؤْمِنِ عِنْدِي جَزَاءٌ، إِذَا قَبَضْتُ صَفِيَّهُ',
    expectedBooks: ['bukhari']
  },
  {
    number: 30,
    title: 'إذا أحب عبدي لقائي',
    phrase: 'قَالَ اللَّهُ إِذَا أَحَبَّ عَبْدِي لِقَائِي أَحْبَبْتُ لِقَاءَهُ',
    expectedBooks: ['bukhari', 'muslim']
  },
  {
    number: 31,
    title: 'من يتألى أن لا أغفر لفلان',
    phrase: 'مَنْ ذَا الَّذِي يَتَأَلَّى عَلَيَّ أَنْ لَا أَغْفِرَ لِفُلَانٍ',
    expectedBooks: ['muslim']
  },
  {
    number: 32,
    title: 'أحرقني فلم يعذبني',
    phrase: 'فَقَالَ لِلأَرْضِ أَدِّي مَا أَخَذْتِ',
    expectedBooks: ['muslim', 'bukhari', 'nasai', 'ibnmajah']
  },
  {
    number: 33,
    title: 'أذنب عبد فاستغفر ثلاثاً',
    phrase: 'أَذْنَبَ عَبْدِي ذَنْبًا فَعَلِمَ أَنَّ لَهُ رَبًّا يَغْفِرُ الذَّنْبَ',
    expectedBooks: ['muslim', 'bukhari']
  },
  {
    number: 34,
    title: 'يا ابن آدم ما دعوتني ورجوتني',
    phrase: 'قَالَ اللَّهُ يَا ابْنَ آدَمَ إِنَّكَ مَا دَعَوْتَنِي وَرَجَوْتَنِي',
    expectedBooks: ['tirmidhi']
  },
  {
    number: 35,
    title: 'تنزل ربنا كل ليلة',
    phrase: 'يَتَنَزَّلُ رَبُّنَا تَبَارَكَ وَتَعَالَى كُلَّ لَيْلَةٍ',
    expectedBooks: ['bukhari', 'muslim', 'tirmidhi', 'abudawud', 'nasai', 'ibnmajah']
  },
  {
    number: 36,
    title: 'الشفاعة يوم القيامة',
    phrase: 'يَجْتَمِعُ الْمُؤْمِنُونَ يَوْمَ الْقِيَامَةِ فَيَقُولُونَ لَوِ اسْتَشْفَعْنَا',
    expectedBooks: ['bukhari', 'muslim', 'tirmidhi', 'ibnmajah']
  },
  {
    number: 37,
    title: 'أعددت لعبادي الصالحين',
    phrase: 'أَعْدَدْتُ لِعِبَادِي الصَّالِحِينَ مَا لَا عَيْنٌ رَأَتْ وَلَا أُذُنٌ سَمِعَتْ',
    expectedBooks: ['bukhari', 'muslim', 'tirmidhi', 'ibnmajah']
  },
  {
    number: 38,
    title: 'حُفّت الجنة بالمكاره',
    phrase: 'لَمَّا خَلَقَ اللَّهُ الْجَنَّةَ وَالنَّارَ أَرْسَلَ جِبْرِيلَ إِلَى الْجَنَّةِ',
    expectedBooks: ['tirmidhi', 'abudawud', 'nasai']
  },
  {
    number: 39,
    title: 'احتجت الجنة والنار',
    phrase: 'احْتَجَّتِ الْجَنَّةُ وَالنَّارُ',
    expectedBooks: ['muslim', 'bukhari', 'tirmidhi']
  },
  {
    number: 40,
    title: 'رضواني على أهل الجنة',
    phrase: 'أُحِلُّ عَلَيْكُمْ رِضْوَانِي فَلَا أَسْخَطُ عَلَيْكُمْ',
    expectedBooks: ['bukhari', 'muslim', 'tirmidhi']
  }
];
