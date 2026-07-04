function buildWhatsappLink(phone, prefillText) {
  const clean = String(phone || '').replace(/[^0-9]/g, '');
  if (!clean) return null;
  const query = prefillText ? `?text=${encodeURIComponent(prefillText)}` : '';
  return `https://wa.me/${clean}${query}`;
}

function formatWhatsappContactMessage(phone, prefillText) {
  const url = buildWhatsappLink(phone, prefillText);
  if (!url) return '⚠️ رقم واتساب غير متوفر.';
  return `📱 تواصل عبر واتساب:\n[اضغط هنا للتواصل](${url})`;
}

function buildTelegramUsernameLink(username) {
  const clean = String(username || '').replace('@', '');
  if (!clean) return null;
  return `https://t.me/${clean}`;
}

module.exports = {
  buildWhatsappLink,
  formatWhatsappContactMessage,
  buildTelegramUsernameLink
};
