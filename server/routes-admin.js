const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const { hashPassword, requireAdmin } = require("./auth");

function randomTempPassword() {
  const words = ["harbor", "cedar", "amber", "willow", "granite", "ridge", "ember", "river", "summit", "maple"];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(10 + Math.random() * 89);
  return `${w1}-${num}-${w2}`;
}

function usernameFromName(name, db) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "user";
  let candidate = base;
  let n = 1;
  while (db.prepare("SELECT 1 FROM users WHERE username = ?").get(candidate)) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

function registerAdminRoutes(app, newId) {
  // Every route below requires both a valid session (already enforced
  // globally) and edit-level permission, since user/role management is
  // Treasurer-only territory.

  /* ============================== USERS ============================== */

  app.get("/api/admin/users", requireAdmin, (req, res) => {
    const rows = db.prepare("SELECT id, name, username, role_id, phone, email FROM users").all();
    res.json(rows.map(u => ({ id: u.id, name: u.name, username: u.username, roleId: u.role_id, phone: u.phone, email: u.email })));
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    const { name, roleId, phone, email } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required." });
    if (!roleId) return res.status(400).json({ error: "Select a role." });
    const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(roleId);
    if (!role) return res.status(400).json({ error: "That role doesn't exist." });

    const username = usernameFromName(name.trim(), db);
    const tempPassword = randomTempPassword();
    const hash = await hashPassword(tempPassword);
    const id = newId("user");

    db.prepare(`
      INSERT INTO users (id, name, username, password_hash, role_id, phone, email, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, name.trim(), username, hash, roleId, phone || "", email || "");

    // The temporary password is returned exactly once, here, at creation
    // time. It is never stored anywhere in readable form and can't be
    // retrieved again — only reset.
    res.json({ id, name: name.trim(), username, roleId, phone: phone || "", email: email || "", tempPassword });
  });

  app.put("/api/admin/users/:id", requireAdmin, (req, res) => {
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "User not found." });
    const { name, roleId, phone, email } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required." });
    if (!roleId) return res.status(400).json({ error: "Select a role." });
    db.prepare("UPDATE users SET name = ?, role_id = ?, phone = ?, email = ? WHERE id = ?")
      .run(name.trim(), roleId, phone || "", email || "", req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "User not found." });
    const tempPassword = randomTempPassword();
    const hash = await hashPassword(tempPassword);
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?").run(hash, req.params.id);
    res.json({ tempPassword });
  });

  app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ error: "You can't remove the account you're currently signed in as." });
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  /* ============================== ROLES ============================== */

  app.get("/api/admin/roles", requireAdmin, (req, res) => {
    const roles = db.prepare("SELECT * FROM roles").all();
    const counts = db.prepare("SELECT role_id, COUNT(*) as n FROM users GROUP BY role_id").all();
    const countMap = {};
    counts.forEach(c => { countMap[c.role_id] = c.n; });
    res.json(roles.map(r => ({
      id: r.id, name: r.name, canEdit: !!r.can_edit, canSeeNotes: !!r.can_see_notes, canAdmin: !!r.can_admin,
      builtIn: !!r.built_in, userCount: countMap[r.id] || 0,
    })));
  });

  app.post("/api/admin/roles", requireAdmin, (req, res) => {
    const { name, canEdit, canSeeNotes, canAdmin } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Role name is required." });
    // Only someone who already has Admin access can create a role that
    // grants Admin access to others — otherwise a Data Entry or Assistant
    // Treasurer account (which has full edit rights but no Admin page) could
    // call this endpoint directly and hand itself Admin access despite the
    // UI never offering that option.
    const grantingAdmin = !!canAdmin && req.userRole.can_admin;
    const id = newId("role");
    db.prepare("INSERT INTO roles (id, name, can_edit, can_see_notes, can_admin, built_in) VALUES (?, ?, ?, ?, ?, 0)")
      .run(id, name.trim(), canEdit ? 1 : 0, canSeeNotes ? 1 : 0, grantingAdmin ? 1 : 0);
    res.json({ id, name: name.trim(), canEdit: !!canEdit, canSeeNotes: !!canSeeNotes, canAdmin: grantingAdmin, builtIn: false });
  });

  app.put("/api/admin/roles/:id", requireAdmin, (req, res) => {
    const existing = db.prepare("SELECT * FROM roles WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Role not found." });
    const { name, canEdit, canSeeNotes, canAdmin } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Role name is required." });
    // Same protection as above: keep existing admin status unless the
    // person making the change already has admin access themselves.
    const grantingAdmin = req.userRole.can_admin ? !!canAdmin : !!existing.can_admin;
    db.prepare("UPDATE roles SET name = ?, can_edit = ?, can_see_notes = ?, can_admin = ? WHERE id = ?")
      .run(name.trim(), canEdit ? 1 : 0, canSeeNotes ? 1 : 0, grantingAdmin ? 1 : 0, req.params.id);
    res.json({ ok: true });
  });

  app.delete("/api/admin/roles/:id", requireAdmin, (req, res) => {
    const inUse = db.prepare("SELECT COUNT(*) as n FROM users WHERE role_id = ?").get(req.params.id);
    if (inUse.n > 0) {
      return res.status(400).json({ error: "This role is assigned to one or more people — reassign them before deleting it." });
    }
    db.prepare("DELETE FROM roles WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  /* ============================== BACKUP ============================== */

  // Streams the live database file straight to the browser as a download.
  // Deliberately does not copy it into the public/ static folder first —
  // anything placed there would be reachable by anyone with the URL, which
  // is not acceptable for a file containing the church's financial records.
  // res.download() reads the file directly and is never exposed at a
  // guessable or public path.
  app.get("/api/admin/backup", requireAdmin, (req, res) => {
    const dbPath = path.join(__dirname, "..", "data", "church.db");
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: "No database file found to back up yet." });
    }
    // The database runs in WAL mode, which means the most recent writes can
    // sit in a separate -wal file rather than church.db itself until they're
    // checkpointed. Force that checkpoint here so the backup actually
    // includes everything up to this exact moment, not a slightly stale
    // snapshot missing the latest transactions.
    db.pragma("wal_checkpoint(FULL)");
    const stamp = new Date().toISOString().slice(0, 10);
    res.download(dbPath, `santasi-sda-backup-${stamp}.db`, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Could not generate the backup file." });
      }
    });
  });
}

module.exports = registerAdminRoutes;
