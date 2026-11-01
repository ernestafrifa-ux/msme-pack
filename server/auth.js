// Authentication helpers. Passwords are hashed with bcrypt before they ever
// touch the database — the database never stores a password anyone could
// read back out, only a one-way hash of it. Sessions are JSON Web Tokens
// (JWTs): a signed token the browser holds and sends with each request,
// rather than the server keeping a list of "who's logged in" in memory.

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail loudly rather than silently signing tokens with a guessable
  // default — a missing secret in production is a configuration mistake
  // that should be caught immediately, not discovered later as a security
  // hole.
  throw new Error(
    "JWT_SECRET environment variable is not set. Add it to your .env file " +
    "(local) or your hosting provider's environment variables (production). " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

const TOKEN_EXPIRY = "12h";

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, roleId: user.role_id },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

// Attaches req.userRole (the full role row) by looking up the role referenced
// in the token. Routes that change data call requireEdit after this to check
// the actual permission flag, rather than trusting a role name string.
function attachRole(db) {
  return (req, res, next) => {
    const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(req.user.roleId);
    if (!role) return res.status(403).json({ error: "Your role no longer exists. Contact the Treasurer." });
    req.userRole = role;
    next();
  };
}

function requireEdit(req, res, next) {
  if (!req.userRole?.can_edit) {
    return res.status(403).json({ error: "Your role doesn't have permission to make changes." });
  }
  next();
}

// Separate from requireEdit on purpose: a role can have full edit access
// (Assistant Treasurer, Data Entry) without being allowed into Admin, so
// Admin routes must check this specific flag rather than reusing can_edit.
function requireAdmin(req, res, next) {
  if (!req.userRole?.can_admin) {
    return res.status(403).json({ error: "Your role doesn't have access to Admin." });
  }
  next();
}

module.exports = { hashPassword, verifyPassword, issueToken, requireAuth, attachRole, requireEdit, requireAdmin };
