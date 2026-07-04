const { normalizeCountryCode, getCountryName } = require('./muslimCountries');

/** مناطق جغرافية كبرى — معرّفات قصيرة لـ callback_data */
const REGIONS = [
  { id: 'middle_east', name: 'الشرق الأوسط' },
  { id: 'north_africa', name: 'شمال أفريقيا' },
  { id: 'sub_saharan', name: 'أفريقيا جنوب الصحراء' },
  { id: 'central_asia', name: 'آسيا الوسطى' },
  { id: 'south_asia', name: 'جنوب آسيا' },
  { id: 'southeast_asia', name: 'جنوب شرق آسيا' },
  { id: 'east_asia', name: 'شرق آسيا' },
  { id: 'west_europe', name: 'أوروبا الغربية' },
  { id: 'east_europe', name: 'أوروبا الشرقية' },
  { id: 'north_europe', name: 'شمال أوروبا' },
  { id: 'south_europe', name: 'جنوب أوروبا' },
  { id: 'north_america', name: 'أمريكا الشمالية' },
  { id: 'latin_america', name: 'أمريكا اللاتينية' },
  { id: 'oceania', name: 'أوقيانوسيا' },
  { id: 'other', name: 'مناطق أخرى' }
];

const ISO_TO_REGION = {
  sa: 'middle_east', ae: 'middle_east', kw: 'middle_east', qa: 'middle_east', bh: 'middle_east',
  om: 'middle_east', ye: 'middle_east', iq: 'middle_east', sy: 'middle_east', jo: 'middle_east',
  lb: 'middle_east', ps: 'middle_east', il: 'middle_east', tr: 'middle_east', ir: 'middle_east',
  eg: 'north_africa', ly: 'north_africa', tn: 'north_africa', dz: 'north_africa', ma: 'north_africa',
  sd: 'north_africa', ss: 'sub_saharan', et: 'sub_saharan', er: 'sub_saharan', so: 'sub_saharan',
  dj: 'sub_saharan', ke: 'sub_saharan', ug: 'sub_saharan', tz: 'sub_saharan', rw: 'sub_saharan',
  ng: 'sub_saharan', gh: 'sub_saharan', sn: 'sub_saharan', ci: 'sub_saharan', cm: 'sub_saharan',
  za: 'sub_saharan', mz: 'sub_saharan', ao: 'sub_saharan', cd: 'sub_saharan', cg: 'sub_saharan',
  kz: 'central_asia', uz: 'central_asia', tm: 'central_asia', kg: 'central_asia', tj: 'central_asia',
  af: 'central_asia', pk: 'south_asia', in: 'south_asia', bd: 'south_asia', lk: 'south_asia',
  np: 'south_asia', mv: 'south_asia', bt: 'south_asia',
  id: 'southeast_asia', my: 'southeast_asia', sg: 'southeast_asia', bn: 'southeast_asia',
  th: 'southeast_asia', vn: 'southeast_asia', ph: 'southeast_asia', mm: 'southeast_asia',
  kh: 'southeast_asia', la: 'southeast_asia', tl: 'southeast_asia',
  cn: 'east_asia', jp: 'east_asia', kr: 'east_asia', kp: 'east_asia', tw: 'east_asia',
  hk: 'east_asia', mo: 'east_asia', mn: 'east_asia',
  de: 'west_europe', fr: 'west_europe', nl: 'west_europe', be: 'west_europe', lu: 'west_europe',
  at: 'west_europe', ch: 'west_europe', ie: 'west_europe', gb: 'west_europe', uk: 'west_europe',
  pl: 'east_europe', cz: 'east_europe', sk: 'east_europe', hu: 'east_europe', ro: 'east_europe',
  bg: 'east_europe', ua: 'east_europe', by: 'east_europe', md: 'east_europe', rs: 'east_europe',
  hr: 'east_europe', ba: 'east_europe', si: 'east_europe', mk: 'east_europe', al: 'east_europe',
  me: 'east_europe', xk: 'east_europe', lt: 'east_europe', lv: 'east_europe', ee: 'east_europe',
  se: 'north_europe', no: 'north_europe', dk: 'north_europe', fi: 'north_europe', is: 'north_europe',
  it: 'south_europe', es: 'south_europe', pt: 'south_europe', gr: 'south_europe', cy: 'south_europe',
  mt: 'south_europe', ad: 'south_europe', mc: 'south_europe', sm: 'south_europe', va: 'south_europe',
  us: 'north_america', ca: 'north_america', mx: 'north_america',
  br: 'latin_america', ar: 'latin_america', cl: 'latin_america', co: 'latin_america',
  pe: 'latin_america', ve: 'latin_america', ec: 'latin_america', uy: 'latin_america',
  py: 'latin_america', bo: 'latin_america', cr: 'latin_america', pa: 'latin_america',
  au: 'oceania', nz: 'oceania', fj: 'oceania', pg: 'oceania'
};

function getRegionIdForCountry(countryCode) {
  const code = normalizeCountryCode(countryCode);
  return ISO_TO_REGION[code] || 'other';
}

function getRegionById(regionId) {
  return REGIONS.find(r => r.id === regionId) || null;
}

function getRegionName(regionId) {
  return getRegionById(regionId)?.name || regionId;
}

module.exports = {
  REGIONS,
  getRegionIdForCountry,
  getRegionById,
  getRegionName,
  getCountryName
};
