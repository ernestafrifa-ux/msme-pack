const db = require("./db");
const { requireEdit } = require("./auth");

function registerBudgetRoutes(app, newId) {
  /* ============================== BUDGET ============================== */

  app.get("/api/budget/:year", (req, res) => {
    const rows = db.prepare("SELECT cat_id, amount FROM budgets WHERE year = ?").all(req.params.year);
    const byCategory = {};
    rows.forEach(r => { byCategory[r.cat_id] = r.amount; });
    res.json(byCategory);
  });

  app.put("/api/budget/:year/:catId", requireEdit, (req, res) => {
    const amount = parseFloat(req.body?.amount);
    if (isNaN(amount) || amount < 0) return res.status(400).json({ error: "Enter a valid amount, zero or greater." });
    db.prepare(`
      INSERT INTO budgets (year, cat_id, amount) VALUES (?, ?, ?)
      ON CONFLICT(year, cat_id) DO UPDATE SET amount = excluded.amount
    `).run(req.params.year, req.params.catId, amount);
    res.json({ ok: true });
  });

  app.get("/api/prior-year/:year", (req, res) => {
    const rows = db.prepare("SELECT cat_id, amount FROM prior_year WHERE year = ?").all(req.params.year);
    const byCategory = {};
    rows.forEach(r => { byCategory[r.cat_id] = r.amount; });
    res.json(byCategory);
  });

  /* ============================== DISCLOSURES ============================== */

  app.get("/api/disclosures", (req, res) => {
    const year = req.query.year;
    const rows = year
      ? db.prepare("SELECT * FROM disclosures WHERE year = ?").all(year)
      : db.prepare("SELECT * FROM disclosures").all();
    res.json(rows);
  });

  app.post("/api/disclosures", requireEdit, (req, res) => {
    const { year, category, label, amount, note } = req.body || {};
    if (!label || !label.trim()) return res.status(400).json({ error: "Description is required." });
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: "Enter an amount greater than zero." });
    const id = newId("disc");
    db.prepare("INSERT INTO disclosures (id, year, category, label, amount, note) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, year, category, label.trim(), parseFloat(amount), note || "");
    res.json({ id, year, category, label: label.trim(), amount: parseFloat(amount), note: note || "" });
  });

  app.put("/api/disclosures/:id", requireEdit, (req, res) => {
    const existing = db.prepare("SELECT * FROM disclosures WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Disclosure not found." });
    const { category, label, amount, note } = req.body || {};
    if (!label || !label.trim()) return res.status(400).json({ error: "Description is required." });
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: "Enter an amount greater than zero." });
    db.prepare("UPDATE disclosures SET category = ?, label = ?, amount = ?, note = ? WHERE id = ?")
      .run(category, label.trim(), parseFloat(amount), note || "", req.params.id);
    res.json({ ok: true });
  });

  app.delete("/api/disclosures/:id", requireEdit, (req, res) => {
    db.prepare("DELETE FROM disclosures WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });
}

module.exports = registerBudgetRoutes;
