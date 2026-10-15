const jwt = require('jsonwebtoken');
const config = require('./config');
const { query } = require('./db');
const { HttpError } = require('./http');

function signToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Requires "Authorization: Bearer <token>". Sets req.user.
async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Please log in.'));
  }
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(new HttpError(401, 'Your session has ended. Please log in again.'));
  }
  const { rows } = await query(
    `SELECT id, full_name, phone, email, preferred_language, platform_role
       FROM users WHERE id = $1 AND is_active`,
    [payload.sub]
  );
  if (!rows[0]) return next(new HttpError(401, 'Please log in.'));
  req.user = rows[0];
  next();
}

// Requires the logged-in user to belong to :businessId with one of `roles`.
// Every business-scoped route goes through this, so one business can
// never read or change another's records.
function requireMember(roles = ['owner', 'manager', 'staff', 'advisor']) {
  return async (req, res, next) => {
    const businessId = req.params.businessId;
    if (!/^[0-9a-f-]{36}$/i.test(businessId || '')) {
      return next(new HttpError(404, 'Business not found.'));
    }
    const { rows } = await query(
      `SELECT m.role FROM business_members m
         JOIN businesses b ON b.id = m.business_id AND b.deleted_at IS NULL
        WHERE m.business_id = $1 AND m.user_id = $2`,
      [businessId, req.user.id]
    );
    if (!rows[0]) return next(new HttpError(404, 'Business not found.'));
    if (!roles.includes(rows[0].role)) {
      return next(new HttpError(403, 'You do not have permission to do this.'));
    }
    req.businessId = businessId;
    req.memberRole = rows[0].role;
    next();
  };
}

module.exports = { signToken, requireAuth, requireMember };
