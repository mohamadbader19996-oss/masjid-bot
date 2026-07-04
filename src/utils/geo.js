/**
 * حساب المسافة بين نقطتين جغرافيتين (Haversine Formula)
 * النتيجة بالكيلومترات
 */
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // نصف قطر الأرض بالكيلومترات
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * مستويات الجوار بالكيلومترات
 */
const PROXIMITY_LEVELS = {
  very_close:  { km: 10,  label: '🟢 قريب جداً',  time: '15 دقيقة' },
  close:       { km: 30,  label: '🔵 قريب',        time: '30 دقيقة' },
  medium:      { km: 60,  label: '🟡 متوسط',       time: 'ساعة' },
  far:         { km: 200, label: '🔴 بعيد',         time: '3 ساعات' },
};

/**
 * جلب المساجد المجاورة مع تصنيفها حسب المسافة
 */
function getNearbyMosquesByGPS(sourceMosque, allMosques) {
  if (!sourceMosque.lat || !sourceMosque.lng) return [];

  const results = [];
  for (const mosque of Object.values(allMosques)) {
    if (mosque.id === sourceMosque.id) continue;
    if (!mosque.lat || !mosque.lng) continue;

    const km = getDistance(
      sourceMosque.lat, sourceMosque.lng,
      mosque.lat, mosque.lng
    );

    let level = null;
    if (km <= PROXIMITY_LEVELS.very_close.km) level = 'very_close';
    else if (km <= PROXIMITY_LEVELS.close.km) level = 'close';
    else if (km <= PROXIMITY_LEVELS.medium.km) level = 'medium';
    else if (km <= PROXIMITY_LEVELS.far.km) level = 'far';

    if (level) {
      results.push({
        mosque,
        km: Math.round(km),
        level,
        label: PROXIMITY_LEVELS[level].label,
        time: PROXIMITY_LEVELS[level].time
      });
    }
  }

  // ترتيب من الأقرب للأبعد
  return results.sort((a, b) => a.km - b.km);
}

module.exports = { getDistance, getNearbyMosquesByGPS, PROXIMITY_LEVELS };
