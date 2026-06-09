# 🕌 دليل تكامل Al-Quran Cloud API

> **الحالة:** ✅ جاهز للتنفيذ | **الإصدار:** 1.0

---

## 📡 نبذة عن API

**Al-Quran Cloud** توفر API مجاني وسهل الاستخدام للوصول إلى:
- 📖 كل آيات القرآن الكريم (6236 آية)
- 🌍 11 لغة مترجمة
- 📚 عدة تفاسير (Tafsir)
- 🎤 تلاوات صوتية (اختياري)

**الموقع الرسمي:** https://alquran.cloud/api

---

## 🔗 نقاط الاتصال الرئيسية

### 1. الحصول على قائمة السور

```
GET https://api.alquran.cloud/v1/surah
```

**الاستجابة:**
```json
{
  "code": 200,
  "status": "OK",
  "data": [
    {
      "number": 1,
      "name": "Al-Faatiha",
      "englishName": "The Opening",
      "englishNameTranslation": "The Opening",
      "numberOfAyahs": 7,
      "revelationType": "Meccan"
    },
    ...
  ]
}
```

---

### 2. الحصول على سورة كاملة (مع ترجمة)

```
GET https://api.alquran.cloud/v1/surah/{surahNumber}/{edition}
```

**المتغيرات:**
- `surahNumber`: رقم السورة (1-114)
- `edition`: رمز الترجمة/القراءة

**الاستجابة:**
```json
{
  "code": 200,
  "status": "OK",
  "data": {
    "number": 1,
    "name": "الفاتحة",
    "englishName": "Al-Faatiha",
    "numberOfAyahs": 7,
    "ayahs": [
      {
        "number": 1,
        "text": "بسم الله الرحمن الرحيم",
        "surah": 1,
        "numberInSurah": 1,
        "juz": 1,
        "manzil": 1,
        "page": 1,
        "ruku": 1,
        "hizbQuar": 1,
        "sajdah": false
      }
    ]
  }
}
```

---

### 3. الحصول على تفسير سورة

```
GET https://api.alquran.cloud/v1/surah/{surahNumber}/tafsirs/{tafsirEdition}
```

**الاستجابة:**
```json
{
  "code": 200,
  "status": "OK",
  "data": {
    "number": 1,
    "ayahs": [
      {
        "number": 1,
        "text": "تفسير الآية الأولى..."
      }
    ]
  }
}
```

---

## 🗂️ الطبعات والترجمات المتاحة

### نصوص القرآن (Text Editions)

| الكود | الوصف | اللغة |
|------|-------|-------|
| `ar.alafasy` | القرآن الكريم | العربية |
| `ar.asad` | محمد أسد | العربية |
| `quran-simple-enhanced` | النص البسيط المحسّن | العربية |

### الترجمات (Translations)

| الكود | الوصف | اللغة |
|------|-------|-------|
| `en.sahih` | Sahih International | English |
| `en.yusufali` | Yusuf Ali | English |
| `en.pickthall` | Pickthall | English |
| `fr.hamidullah` | Hamidullah | Français |
| `es.cordoba` | Córdoba | Español |
| `de.bubenheim` | Bubenheim | Deutsch |
| `pt.portuguese` | Portuguese | Português |
| `ru.osmanov` | Osmanov | Русский |
| `ur.junagarhi` | Junagarhi | اردو |
| `fa.baghestan` | Baghestan | فارسی |
| `zh.jian` | Simplified Chinese | 中文 |

### التفاسير (Tafsirs)

| الكود | الوصف | اللغة |
|------|-------|-------|
| `ar.tabari` | تفسير الطبري | العربية |
| `ar.kathir` | تفسير ابن كثير | العربية |
| `ar.saddi` | تفسير السدي | العربية |
| `en.tafseer_ibn_kathir` | Tafseer Ibn Kathir | English |
| `en.tafseer_maududi` | Tafseer Maududi | English |

---

## 💻 كود التكامل

### 1. دالة جلب السور

```javascript
const axios = require('axios');

async function getAllSurahs() {
  try {
    const response = await axios.get('https://api.alquran.cloud/v1/surah');
    return response.data.data;
  } catch (error) {
    console.error('خطأ في جلب السور:', error);
    return [];
  }
}
```

### 2. دالة جلب سورة محددة

```javascript
async function getSurah(surahNumber, edition = 'ar.alafasy') {
  try {
    const response = await axios.get(
      `https://api.alquran.cloud/v1/surah/${surahNumber}/${edition}`
    );
    return response.data.data;
  } catch (error) {
    console.error(`خطأ في جلب السورة ${surahNumber}:`, error);
    return null;
  }
}

// الاستخدام:
const surah = await getSurah(1, 'ar.alafasy');
console.log(surah.name); // الفاتحة
console.log(surah.ayahs[0].text); // بسم الله الرحمن الرحيم
```

### 3. دالة جلب التفسير

```javascript
async function getTafsir(surahNumber, tafsirEdition = 'ar.tabari') {
  try {
    const response = await axios.get(
      `https://api.alquran.cloud/v1/surah/${surahNumber}/tafsirs/${tafsirEdition}`
    );
    return response.data.data;
  } catch (error) {
    console.error(`خطأ في جلب التفسير:`, error);
    return null;
  }
}
```

### 4. دالة تحويل رقم لغة إلى كود API

```javascript
const LANGUAGE_CODES = {
  'ar': 'ar.alafasy',        // العربية
  'en': 'en.sahih',          // الإنجليزية
  'fr': 'fr.hamidullah',     // الفرنسية
  'es': 'es.cordoba',        // الإسبانية
  'de': 'de.bubenheim',      // الألمانية
  'pt': 'pt.portuguese',     // البرتغالية
  'ru': 'ru.osmanov',        // الروسية
  'ur': 'ur.junagarhi',      // الأردية
  'fa': 'fa.baghestan',      // الفارسية
  'zh': 'zh.jian'            // الصينية
};

function getEditionCode(langCode) {
  return LANGUAGE_CODES[langCode] || 'ar.alafasy';
}
```

### 5. دالة عرض السورة مع التفسير

```javascript
async function displaySurahWithTafsir(ctx, surahNumber, langCode = 'ar') {
  const edition = getEditionCode(langCode);
  const tafsirCode = langCode === 'ar' ? 'ar.tabari' : 'en.tafseer_ibn_kathir';
  
  try {
    // جلب السورة
    const surah = await getSurah(surahNumber, edition);
    if (!surah) {
      return ctx.reply('❌ فشل جلب السورة. حاول لاحقاً.');
    }

    // جلب التفسير
    const tafsir = await getTafsir(surahNumber, tafsirCode);

    // بناء الرسالة
    let message = `📖 *سورة ${surah.name}*\n\n`;
    message += `🇸🇦 العدد: ${surah.numberOfAyahs} آية\n`;
    message += `📍 الترتيب: ${surah.number}\n`;
    message += `🕌 نوع التنزيل: ${surah.revelationType}\n\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // عرض الآيات
    for (const ayah of surah.ayahs.slice(0, 5)) { // أول 5 آيات
      message += `📝 *الآية ${ayah.numberInSurah}:*\n`;
      message += `${ayah.text}\n\n`;
    }

    if (surah.ayahs.length > 5) {
      message += `_... و ${surah.ayahs.length - 5} آية أخرى_\n\n`;
    }

    // عرض التفسير (آية واحدة)
    if (tafsir && tafsir.ayahs.length > 0) {
      message += `📚 *التفسير:*\n`;
      message += `${tafsir.ayahs[0].text}\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('خطأ:', error);
    ctx.reply('❌ حدث خطأ في جلب البيانات');
  }
}
```

---

## 🔄 التكامل مع لوحة الشيخ

### في `src/handlers/sheikh_new.js`

```javascript
// استبدال الدالة الحالية showSurahs
async function showSurahs(ctx) {
  const langCode = ctx.session.selectedQuranLang || 'ar';
  
  try {
    const surahs = await getAllSurahs();
    const buttons = surahs.map(surah => [
      Markup.button.callback(
        `${surah.number}. ${surah.name} (${surah.numberOfAyahs})`,
        `quran_surah_${surah.number}`
      )
    ]);
    
    buttons.push([Markup.button.callback('🔙 العودة', 'sheikh_quran')]);

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '📖 *اختر السورة:*',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  } catch (error) {
    ctx.answerCbQuery('❌ خطأ في جلب قائمة السور', true);
  }
}
```

### وفي الـ callbacks

```javascript
bot.action(/^quran_surah_(.+)$/, async (ctx) => {
  const surahNum = ctx.match[1];
  const lang = ctx.session.selectedQuranLang || 'ar';
  
  await ctx.answerCbQuery('⏳ جاري تحميل السورة...');
  
  try {
    const surah = await getSurah(surahNum, getEditionCode(lang));
    if (surah) {
      await ctx.reply(`📖 *سورة ${surah.name}*\n\n${surah.ayahs.map(a => a.text).join('\n')}`);
    } else {
      ctx.reply('❌ فشل تحميل السورة');
    }
  } catch (error) {
    ctx.reply('❌ حدث خطأ');
  }
});
```

---

## ⚙️ متطلبات التثبيت

```bash
npm install axios
```

---

## 📊 أمثلة على الاستجابات

### مثال 1: سورة الفاتحة (نص عربي)

```
📖 سورة الفاتحة

🇸🇦 العدد: 7 آيات
📍 الترتيب: 1
🕌 نوع التنزيل: Meccan

━━━━━━━━━━━━━━━━━━━━

📝 الآية 1:
بسم الله الرحمن الرحيم

📝 الآية 2:
الحمد لله رب العالمين

...

📚 التفسير:
هذه سورة الفاتحة وهي أول سورة في القرآن الكريم...
```

---

## 🔒 الحدود والقيود

- ✅ **لا توجد تفاصيل مفتاح API** - مجاني تماماً
- ✅ **بدون حد أقصى لعدد الطلبات** (أو حد معقول)
- ✅ **جميع البيانات متاحة للاستخدام التجاري**
- ⚠️ **قد يكون هناك تأخير في الاستجابة** (استخدم caching)

---

## 💾 التخزين المؤقت (Caching)

للحصول على أداء أفضل، يمكنك تخزين السور مؤقتاً:

```javascript
const surahCache = {};

async function getCachedSurah(surahNumber, edition) {
  const cacheKey = `${surahNumber}-${edition}`;
  
  if (surahCache[cacheKey]) {
    return surahCache[cacheKey];
  }
  
  const surah = await getSurah(surahNumber, edition);
  if (surah) {
    surahCache[cacheKey] = surah;
  }
  
  return surah;
}
```

---

## 🚀 الخطوات التالية

1. ✅ اختبار دوال API الأساسية
2. ✅ تكامل axios في المشروع
3. ✅ تحديث `sheikh_new.js` بدوال API
4. ✅ تطبيق caching للأداء
5. ✅ إضافة معالجة الأخطاء والتوقعات

---

**المرجع:** https://alquran.cloud/api
**آخر تحديث:** 2024
