require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const db = require("./db");
const { hashPassword, verifyPassword, issueToken, requireAuth, attachRole, requireEdit } = require("./auth");

const app = express();
app.use(cors());
app.use(express.json());

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

/* ============================== AUTH ============================== */

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password are required." });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: "Incorrect username or password." });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Incorrect username or password." });

  const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(user.role_id);
  const token = issueToken(user);

  res.json({
    token,
    mustChangePassword: !!user.must_change_password,
    user: { id: user.id, name: user.name, username: user.username, phone: user.phone, email: user.email },
    role: role ? { id: role.id, name: role.name, canEdit: !!role.can_edit, canSeeNotes: !!role.can_see_notes, canAdmin: !!role.can_admin } : null,
  });
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.sub);
  if (!user) return res.status(404).json({ error: "User not found." });

  const ok = await verifyPassword(currentPassword || "", user.password_hash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect." });

  const newHash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(newHash, user.id);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, attachRole(db), (req, res) => {
  const user = db.prepare("SELECT id, name, username, phone, email, must_change_password FROM users WHERE id = ?").get(req.user.sub);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({
    user: { ...user, mustChangePassword: !!user.must_change_password },
    role: { id: req.userRole.id, name: req.userRole.name, canEdit: !!req.userRole.can_edit, canSeeNotes: !!req.userRole.can_see_notes, canAdmin: !!req.userRole.can_admin },
  });
});

// All routes below this line require a valid signed-in session.
app.use("/api", requireAuth, attachRole(db));

require("./routes-core")(app, newId);
require("./routes-slips")(app, newId);
require("./routes-budget")(app, newId);
require("./routes-admin")(app, newId);

// Serve the built front-end as static files, so the same server that
// answers /api/* requests also serves the app itself — one process, one
// deployment, no separate front-end hosting to configure.
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found." });
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
const seed = require("./seed");

// Run the one-time seed automatically on startup against an empty database,
// so deploying for the first time doesn't require a separate manual step.
// seed() itself checks whether data already exists and does nothing if so,
// so this is always safe to run on every server restart.
seed()
  .then((credentials) => {
    app.listen(PORT, () => {
      console.log(`Santasi SDA Church accounting server running on port ${PORT}`);
      if (credentials) {
        console.log("\n*** FIRST-TIME SETUP: starter logins were created above. ***");
        console.log("*** Write them down now and share them with each person securely. ***\n");
      }
    });
  })
  .catch((err) => {
    console.error("Failed to seed database on startup:", err);
    process.exit(1);
  });

module.exports = { app, newId };
