const COUNTRY_PHONE_CODES = [
  // الدول الأكثر استخداماً في المشروع (تظهر أولاً)
  { name: 'ألمانيا', flag: '🇩🇪', code: '+49' },
  { name: 'السعودية', flag: '🇸🇦', code: '+966' },
  { name: 'تركيا', flag: '🇹🇷', code: '+90' },
  { name: 'المغرب', flag: '🇲🇦', code: '+212' },
  { name: 'مصر', flag: '🇪🇬', code: '+20' },
  { name: 'باكستان', flag: '🇵🇰', code: '+92' },
  { name: 'سوريا', flag: '🇸🇾', code: '+963' },
  { name: 'الإمارات', flag: '🇦🇪', code: '+971' },
  { name: 'فرنسا', flag: '🇫🇷', code: '+33' },
  { name: 'هولندا', flag: '🇳🇱', code: '+31' },
  { name: 'بلجيكا', flag: '🇧🇪', code: '+32' },
  { name: 'النمسا', flag: '🇦🇹', code: '+43' },
  { name: 'سويسرا', flag: '🇨🇭', code: '+41' },
  { name: 'السويد', flag: '🇸🇪', code: '+46' },
  { name: 'بريطانيا', flag: '🇬🇧', code: '+44' },
  // باقي دول العالم (ترتيب هجائي عربي)
  { name: 'أذربيجان', flag: '🇦🇿', code: '+994' },
  { name: 'أرمينيا', flag: '🇦🇲', code: '+374' },
  { name: 'أروبا', flag: '🇦🇼', code: '+297' },
  { name: 'أستراليا', flag: '🇦🇺', code: '+61' },
  { name: 'إستونيا', flag: '🇪🇪', code: '+372' },
  { name: 'إسبانيا', flag: '🇪🇸', code: '+34' },
  { name: 'أفغانستان', flag: '🇦🇫', code: '+93' },
  { name: 'ألبانيا', flag: '🇦🇱', code: '+355' },
  { name: 'ألاسكا', flag: '🇺🇸', code: '+1' },
  { name: 'إندونيسيا', flag: '🇮🇩', code: '+62' },
  { name: 'إريتريا', flag: '🇪🇷', code: '+291' },
  { name: 'الأرجنتين', flag: '🇦🇷', code: '+54' },
  { name: 'الأردن', flag: '🇯🇴', code: '+962' },
  { name: 'الإكوادور', flag: '🇪🇨', code: '+593' },
  { name: 'ألمانيا الشرقية', flag: '🇩🇪', code: '+49' },
  { name: 'الباهاما', flag: '🇧🇸', code: '+1242' },
  { name: 'البحرين', flag: '🇧🇭', code: '+973' },
  { name: 'البرازيل', flag: '🇧🇷', code: '+55' },
  { name: 'البرتغال', flag: '🇵🇹', code: '+351' },
  { name: 'البوسنة والهرسك', flag: '🇧🇦', code: '+387' },
  { name: 'التشيك', flag: '🇨🇿', code: '+420' },
  { name: 'التوغو', flag: '🇹🇬', code: '+228' },
  { name: 'الجابون', flag: '🇬🇦', code: '+241' },
  { name: 'الجزائر', flag: '🇩🇿', code: '+213' },
  { name: 'الدانمارك', flag: '🇩🇰', code: '+45' },
  { name: 'الرأس الأخضر', flag: '🇨🇻', code: '+238' },
  { name: 'السلفادور', flag: '🇸🇻', code: '+503' },
  { name: 'السنغال', flag: '🇸🇳', code: '+221' },
  { name: 'الصومال', flag: '🇸🇴', code: '+252' },
  { name: 'الصين', flag: '🇨🇳', code: '+86' },
  { name: 'العراق', flag: '🇮🇶', code: '+964' },
  { name: 'الفاتيكان', flag: '🇻🇦', code: '+379' },
  { name: 'الفلبين', flag: '🇵🇭', code: '+63' },
  { name: 'الكاميرون', flag: '🇨🇲', code: '+237' },
  { name: 'الكونغو الديمقراطية', flag: '🇨🇩', code: '+243' },
  { name: 'الكونغو', flag: '🇨🇬', code: '+242' },
  { name: 'الكويت', flag: '🇰🇼', code: '+965' },
  { name: 'المالديف', flag: '🇲🇻', code: '+960' },
  { name: 'المجر', flag: '🇭🇺', code: '+36' },
  { name: 'المكسيك', flag: '🇲🇽', code: '+52' },
  { name: 'المملكة المتحدة', flag: '🇬🇧', code: '+44' },
  { name: 'النرويج', flag: '🇳🇴', code: '+47' },
  { name: 'النيجر', flag: '🇳🇪', code: '+227' },
  { name: 'الهند', flag: '🇮🇳', code: '+91' },
  { name: 'الولايات المتحدة', flag: '🇺🇸', code: '+1' },
  { name: 'اليابان', flag: '🇯🇵', code: '+81' },
  { name: 'اليمن', flag: '🇾🇪', code: '+967' },
  { name: 'اليونان', flag: '🇬🇷', code: '+30' },
  { name: 'أنتيغوا وباربودا', flag: '🇦🇬', code: '+1268' },
  { name: 'أندورا', flag: '🇦🇩', code: '+376' },
  { name: 'أنغولا', flag: '🇦🇴', code: '+244' },
  { name: 'أوروغواي', flag: '🇺🇾', code: '+598' },
  { name: 'أوزبكستان', flag: '🇺🇿', code: '+998' },
  { name: 'أوغندا', flag: '🇺🇬', code: '+256' },
  { name: 'أوكرانيا', flag: '🇺🇦', code: '+380' },
  { name: 'أيرلندا', flag: '🇮🇪', code: '+353' },
  { name: 'أيسلندا', flag: '🇮🇸', code: '+354' },
  { name: 'إيطاليا', flag: '🇮🇹', code: '+39' },
  { name: 'باراغواي', flag: '🇵🇾', code: '+595' },
  { name: 'بنغلاديش', flag: '🇧🇩', code: '+880' },
  { name: 'بنما', flag: '🇵🇦', code: '+507' },
  { name: 'بنين', flag: '🇧🇯', code: '+229' },
  { name: 'بوتان', flag: '🇧🇹', code: '+975' },
  { name: 'بوتسوانا', flag: '🇧🇼', code: '+267' },
  { name: 'بوركينا فاسو', flag: '🇧🇫', code: '+226' },
  { name: 'بوروندي', flag: '🇧🇮', code: '+257' },
  { name: 'بولندا', flag: '🇵🇱', code: '+48' },
  { name: 'بوليفيا', flag: '🇧🇴', code: '+591' },
  { name: 'بيرو', flag: '🇵🇪', code: '+51' },
  { name: 'بيلاروسيا', flag: '🇧🇾', code: '+375' },
  { name: 'تايلاند', flag: '🇹🇭', code: '+66' },
  { name: 'تايوان', flag: '🇹🇼', code: '+886' },
  { name: 'تشاد', flag: '🇹🇩', code: '+235' },
  { name: 'تشيلي', flag: '🇨🇱', code: '+56' },
  { name: 'تنزانيا', flag: '🇹🇿', code: '+255' },
  { name: 'تونس', flag: '🇹🇳', code: '+216' },
  { name: 'توفالو', flag: '🇹🇻', code: '+688' },
  { name: 'تونغا', flag: '🇹🇴', code: '+676' },
  { name: 'ترينيداد وتوباغو', flag: '🇹🇹', code: '+1868' },
  { name: 'تركمانستان', flag: '🇹🇲', code: '+993' },
  { name: 'جامايكا', flag: '🇯🇲', code: '+1876' },
  { name: 'جزر القمر', flag: '🇰🇲', code: '+269' },
  { name: 'جزر المالديف', flag: '🇲🇻', code: '+960' },
  { name: 'جزر مارشال', flag: '🇲🇭', code: '+692' },
  { name: 'جزر سليمان', flag: '🇸🇧', code: '+677' },
  { name: 'جنوب أفريقيا', flag: '🇿🇦', code: '+27' },
  { name: 'جنوب السودان', flag: '🇸🇸', code: '+211' },
  { name: 'جورجيا', flag: '🇬🇪', code: '+995' },
  { name: 'جيبوتي', flag: '🇩🇯', code: '+253' },
  { name: 'دومينيكا', flag: '🇩🇲', code: '+1767' },
  { name: 'رواندا', flag: '🇷🇼', code: '+250' },
  { name: 'رومانيا', flag: '🇷🇴', code: '+40' },
  { name: 'روسيا', flag: '🇷🇺', code: '+7' },
  { name: 'زامبيا', flag: '🇿🇲', code: '+260' },
  { name: 'زيمبابوي', flag: '🇿🇼', code: '+263' },
  { name: 'ساموا', flag: '🇼🇸', code: '+685' },
  { name: 'سان مارينو', flag: '🇸🇲', code: '+378' },
  { name: 'سانت كيتس ونيفيس', flag: '🇰🇳', code: '+1869' },
  { name: 'سانت لوسيا', flag: '🇱🇨', code: '+1758' },
  { name: 'سري لانكا', flag: '🇱🇰', code: '+94' },
  { name: 'سلوفاكيا', flag: '🇸🇰', code: '+421' },
  { name: 'سلوفينيا', flag: '🇸🇮', code: '+386' },
  { name: 'سنغافورة', flag: '🇸🇬', code: '+65' },
  { name: 'سورينام', flag: '🇸🇷', code: '+597' },
  { name: 'سيراليون', flag: '🇸🇱', code: '+232' },
  { name: 'سيشيل', flag: '🇸🇨', code: '+248' },
  { name: 'صربيا', flag: '🇷🇸', code: '+381' },
  { name: 'عُمان', flag: '🇴🇲', code: '+968' },
  { name: 'غامبيا', flag: '🇬🇲', code: '+220' },
  { name: 'غانا', flag: '🇬🇭', code: '+233' },
  { name: 'غرينادا', flag: '🇬🇩', code: '+1473' },
  { name: 'غواتيمالا', flag: '🇬🇹', code: '+502' },
  { name: 'غويانا', flag: '🇬🇾', code: '+592' },
  { name: 'غينيا الاستوائية', flag: '🇬🇶', code: '+240' },
  { name: 'غينيا بيساو', flag: '🇬🇼', code: '+245' },
  { name: 'غينيا', flag: '🇬🇳', code: '+224' },
  { name: 'فانواتو', flag: '🇻🇺', code: '+678' },
  { name: 'فلسطين', flag: '🇵🇸', code: '+970' },
  { name: 'فنزويلا', flag: '🇻🇪', code: '+58' },
  { name: 'فنلندا', flag: '🇫🇮', code: '+358' },
  { name: 'فيجي', flag: '🇫🇯', code: '+679' },
  { name: 'فيتنام', flag: '🇻🇳', code: '+84' },
  { name: 'قبرص', flag: '🇨🇾', code: '+357' },
  { name: 'قطر', flag: '🇶🇦', code: '+974' },
  { name: 'قيرغيزستان', flag: '🇰🇬', code: '+996' },
  { name: 'كازاخستان', flag: '🇰🇿', code: '+7' },
  { name: 'كرواتيا', flag: '🇭🇷', code: '+385' },
  { name: 'كمبوديا', flag: '🇰🇭', code: '+855' },
  { name: 'كندا', flag: '🇨🇦', code: '+1' },
  { name: 'كوبا', flag: '🇨🇺', code: '+53' },
  { name: 'كوت ديفوار', flag: '🇨🇮', code: '+225' },
  { name: 'كوريا الجنوبية', flag: '🇰🇷', code: '+82' },
  { name: 'كوريا الشمالية', flag: '🇰🇵', code: '+850' },
  { name: 'كوستاريكا', flag: '🇨🇷', code: '+506' },
  { name: 'كولومبيا', flag: '🇨🇴', code: '+57' },
  { name: 'كيريباتي', flag: '🇰🇮', code: '+686' },
  { name: 'كينيا', flag: '🇰🇪', code: '+254' },
  { name: 'لاتفيا', flag: '🇱🇻', code: '+371' },
  { name: 'لاوس', flag: '🇱🇦', code: '+856' },
  { name: 'لبنان', flag: '🇱🇧', code: '+961' },
  { name: 'لكسمبورغ', flag: '🇱🇺', code: '+352' },
  { name: 'ليبيا', flag: '🇱🇾', code: '+218' },
  { name: 'ليبيريا', flag: '🇱🇷', code: '+231' },
  { name: 'ليتوانيا', flag: '🇱🇹', code: '+370' },
  { name: 'ليسوتو', flag: '🇱🇸', code: '+266' },
  { name: 'ليختنشتاين', flag: '🇱🇮', code: '+423' },
  { name: 'مالطا', flag: '🇲🇹', code: '+356' },
  { name: 'مالي', flag: '🇲🇱', code: '+223' },
  { name: 'ماليزيا', flag: '🇲🇾', code: '+60' },
  { name: 'مدغشقر', flag: '🇲🇬', code: '+261' },
  { name: 'مقدونيا الشمالية', flag: '🇲🇰', code: '+389' },
  { name: 'موريتانيا', flag: '🇲🇷', code: '+222' },
  { name: 'موريشيوس', flag: '🇲🇺', code: '+230' },
  { name: 'موزمبيق', flag: '🇲🇿', code: '+258' },
  { name: 'مولدوفا', flag: '🇲🇩', code: '+373' },
  { name: 'موناكو', flag: '🇲🇨', code: '+377' },
  { name: 'منغوليا', flag: '🇲🇳', code: '+976' },
  { name: 'ميانمار', flag: '🇲🇲', code: '+95' },
  { name: 'ميكرونيزيا', flag: '🇫🇲', code: '+691' },
  { name: 'ناميبيا', flag: '🇳🇦', code: '+264' },
  { name: 'ناورو', flag: '🇳🇷', code: '+674' },
  { name: 'نيبال', flag: '🇳🇵', code: '+977' },
  { name: 'نيجيريا', flag: '🇳🇬', code: '+234' },
  { name: 'نيكاراغوا', flag: '🇳🇮', code: '+505' },
  { name: 'نيوزيلندا', flag: '🇳🇿', code: '+64' },
  { name: 'هايتي', flag: '🇭🇹', code: '+509' },
  { name: 'هندوراس', flag: '🇭🇳', code: '+504' },
  { name: 'بابوا غينيا الجديدة', flag: '🇵🇬', code: '+675' }
];

const PAGE_SIZE = 8;

function buildCountryKeyboard(page = 0) {
  const totalPages = Math.ceil(COUNTRY_PHONE_CODES.length / PAGE_SIZE);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * PAGE_SIZE;
  const pageItems = COUNTRY_PHONE_CODES.slice(start, start + PAGE_SIZE);

  const buttons = pageItems.map((country, idxInPage) => {
    const realIndex = start + idxInPage;
    return [{
      text: `${country.flag} ${country.name} (${country.code})`,
      callback_data: `country_select_${realIndex}`
    }];
  });

  const navRow = [];
  if (safePage > 0) {
    navRow.push({ text: '⬅️ السابق', callback_data: `country_page_${safePage - 1}` });
  }
  navRow.push({ text: `📄 ${safePage + 1}/${totalPages}`, callback_data: 'country_page_noop' });
  if (safePage < totalPages - 1) {
    navRow.push({ text: 'التالي ➡️', callback_data: `country_page_${safePage + 1}` });
  }
  buttons.push(navRow);

  return { inline_keyboard: buttons };
}

function getCountryByIndex(index) {
  const i = parseInt(index, 10);
  if (isNaN(i) || i < 0 || i >= COUNTRY_PHONE_CODES.length) return null;
  return COUNTRY_PHONE_CODES[i];
}

function formatPhoneNumber(callingCode, localNumber) {
  if (!callingCode || !localNumber) return null;
  let cleaned = String(localNumber).trim().replace(/[\s\-\(\)]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
    return '+' + cleaned;
  }
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }
  return callingCode + cleaned;
}

module.exports = { COUNTRY_PHONE_CODES, buildCountryKeyboard, getCountryByIndex, formatPhoneNumber };
