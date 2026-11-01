const db = require("./db");
const { requireEdit } = require("./auth");

function registerCoreRoutes(app, newId) {
  /* ============================== CATEGORIES ============================== */

  app.get("/api/categories", (req, res) => {
    const rows = db.prepare("SELECT * FROM categories").all();
    res.json(rows.map(r => ({
      id: r.id, kind: r.kind, name: r.name, noteNo: r.note_no, subs: JSON.parse(r.subs),
    })));
  });

  app.post("/api/categories", requireEdit, (req, res) => {
    const { kind, name, noteNo } = req.body || {};
    if (!kind || !["income", "expense"].includes(kind)) return res.status(400).json({ error: "Category kind must be income or expense." });
    if (!name || !name.trim()) return res.status(400).json({ error: "Category name is required." });
    const id = newId(kind === "income" ? "inc" : "exp");
    db.prepare("INSERT INTO categories (id, kind, name, note_no, subs) VALUES (?, ?, ?, ?, '[]')")
      .run(id, kind, name.trim(), noteNo || null);
    res.json({ id, kind, name: name.trim(), noteNo: noteNo || null, subs: [] });
  });

  app.put("/api/categories/:id", requireEdit, (req, res) => {
    const { name, noteNo, subs } = req.body || {};
    const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Category not found." });
    if (!name || !name.trim()) return res.status(400).json({ error: "Category name is required." });
    db.prepare("UPDATE categories SET name = ?, note_no = ?, subs = ? WHERE id = ?")
      .run(name.trim(), noteNo ?? null, JSON.stringify(subs || []), req.params.id);
    res.json({ ok: true });
  });

  app.delete("/api/categories/:id", requireEdit, (req, res) => {
    try {
      db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      // SQLite will reject this if the category is referenced by existing
      // transactions (slip_lines), budget figures, or prior-year data.
      // Return a clear message rather than letting the error propagate silently.
      return res.status(400).json({
        error: "This category can't be deleted because it has transactions, budget figures, or prior-year data recorded against it. Remove those first, or leave the category in place."
      });
    }
  });

  /* ============================== ACCOUNTS ============================== */

  app.get("/api/accounts", (req, res) => {
    const accounts = db.prepare("SELECT * FROM accounts").all();
    const slips = db.prepare("SELECT * FROM slips").all();
    const balances = {};
    accounts.forEach(a => { balances[a.id] = a.opening; });
    slips.forEach(s => {
      const lines = db.prepare("SELECT amount FROM slip_lines WHERE slip_id = ?").all(s.id);
      const total = s.kind === "transfer" ? s.amount : lines.reduce((sum, l) => sum + l.amount, 0);
      if (s.kind === "income" && balances[s.account_id] !== undefined) balances[s.account_id] += total;
      else if (s.kind === "expense" && balances[s.account_id] !== undefined) balances[s.account_id] -= total;
      else if (s.kind === "transfer") {
        if (balances[s.account_id] !== undefined) balances[s.account_id] -= total;
        if (balances[s.to_account_id] !== undefined) balances[s.to_account_id] += total;
      }
    });
    res.json(accounts.map(a => ({
      id: a.id, kind: a.kind, name: a.name, accNo: a.acc_no, opening: a.opening,
      deletable: !!a.deletable, balance: balances[a.id] ?? a.opening,
    })));
  });

  app.post("/api/accounts", requireEdit, (req, res) => {
    const { name, accNo, opening } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Account name is required." });
    if (!accNo || !accNo.trim()) return res.status(400).json({ error: "Account number is required." });
    const id = newId("bank");
    db.prepare("INSERT INTO accounts (id, kind, name, acc_no, opening, deletable) VALUES (?, 'bank', ?, ?, ?, 1)")
      .run(id, name.trim(), accNo.trim(), parseFloat(opening) || 0);
    res.json({ id, kind: "bank", name: name.trim(), accNo: accNo.trim(), opening: parseFloat(opening) || 0, deletable: true });
  });

  app.put("/api/accounts/:id", requireEdit, (req, res) => {
    const existing = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Account not found." });
    const { name, accNo, opening } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Account name is required." });
    db.prepare("UPDATE accounts SET name = ?, acc_no = ?, opening = ? WHERE id = ?")
      .run(name.trim(), existing.kind === "cash" ? existing.acc_no : (accNo || "").trim(), parseFloat(opening) || 0, req.params.id);
    res.json({ ok: true });
  });

  app.delete("/api/accounts/:id", requireEdit, (req, res) => {
    const existing = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Account not found." });
    if (!existing.deletable) return res.status(400).json({ error: "This account can't be deleted." });
    db.prepare("DELETE FROM accounts WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  /* ============================== MEMBERS ============================== */

  app.get("/api/members", (req, res) => {
    res.json(db.prepare("SELECT * FROM members").all().map(m => ({
      id: m.id, name: m.name, envelopeNo: m.envelope_no, phone: m.phone, email: m.email,
    })));
  });

  app.post("/api/members", requireEdit, (req, res) => {
    const { name, envelopeNo, phone, email } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Member name is required." });
    if (!envelopeNo || !envelopeNo.trim()) return res.status(400).json({ error: "Envelope/member number is required." });
    const id = newId("mem");
    db.prepare("INSERT INTO members (id, name, envelope_no, phone, email) VALUES (?, ?, ?, ?, ?)")
      .run(id, name.trim(), envelopeNo.trim(), phone || "", email || "");
    res.json({ id, name: name.trim(), envelopeNo: envelopeNo.trim(), phone: phone || "", email: email || "" });
  });

  app.put("/api/members/:id", requireEdit, (req, res) => {
    const existing = db.prepare("SELECT * FROM members WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Member not found." });
    const { name, envelopeNo, phone, email } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Member name is required." });
    db.prepare("UPDATE members SET name = ?, envelope_no = ?, phone = ?, email = ? WHERE id = ?")
      .run(name.trim(), (envelopeNo || "").trim(), phone || "", email || "", req.params.id);
    res.json({ ok: true });
  });

  app.delete("/api/members/:id", requireEdit, (req, res) => {
    db.prepare("DELETE FROM members WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });
}

module.exports = registerCoreRoutes;
