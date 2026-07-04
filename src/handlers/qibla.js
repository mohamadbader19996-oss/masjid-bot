const { Markup } = require('telegraf');
const { mainKeyboard } = require('../keyboards');

const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

const COMPASS_DIRECTIONS = [
  'شمال',
  'شمال شرقي',
  'شرق',
  'جنوب شرقي',
  'جنوب',
  'جنوب غربي',
  'غرب',
  'شمال غربي'
];

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function calculateQiblaBearing(lat, lng) {
  const φ1 = toRadians(lat);
  const φ2 = toRadians(KAABA_LAT);
  const Δλ = toRadians(KAABA_LNG - lng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const bearing = toDegrees(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

function getCompassDirection(bearing) {
  const normalized = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return COMPASS_DIRECTIONS[index];
}

async function handleQiblaRequest(ctx) {
  ctx.session = ctx.session || {};
  ctx.session.awaitingQiblaLocation = true;
  return ctx.reply(
    '📍 شارك موقعك الحالي لحساب اتجاه القبلة بدقة',
    Markup.keyboard([Markup.button.locationRequest('📍 مشاركة موقعي')]).resize().oneTime()
  );
}

async function handleQiblaLocation(ctx) {
  if (ctx.session?.updatingGPS) return;
  if (!ctx.session?.awaitingQiblaLocation) return;

  const { latitude, longitude } = ctx.message.location;
  const bearing = calculateQiblaBearing(latitude, longitude);
  const bearingRounded = Math.round(bearing * 10) / 10;
  const direction = getCompassDirection(bearing);

  delete ctx.session.awaitingQiblaLocation;

  const role = ctx.user?.role || ctx.session?.userRole || 'worshipper';
  return ctx.reply(
    `🧭 *اتجاه القبلة من موقعك:*\n\nالزاوية: ${bearingRounded}° من الشمال\nالاتجاه التقريبي: ${direction}`,
    { parse_mode: 'Markdown', ...mainKeyboard(role) }
  );
}

function registerQiblaHandlers(bot) {
  bot.on('location', async (ctx) => {
    await handleQiblaLocation(ctx);
  });
}

module.exports = {
  calculateQiblaBearing,
  getCompassDirection,
  handleQiblaRequest,
  handleQiblaLocation,
  registerQiblaHandlers
};
