function getRoleInMosque(userId, mosqueId, db) {
  const roles = db?.mosque_roles?.[mosqueId];
  if (!roles) return null;
  const entry = roles[String(userId)];
  if (!entry) return null;
  return typeof entry === 'string' ? entry : entry.role || null;
}

module.exports = { getRoleInMosque };
