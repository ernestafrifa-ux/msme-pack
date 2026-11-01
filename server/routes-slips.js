const db = require("./db");
const { requireEdit } = require("./auth");

function registerSlipRoutes(app, newId) {
  function slipWithLines(slip) {
    const lines = db.prepare("SELECT * FROM slip_lines WHERE slip_id = ?").all(slip.id);
    return {
      id: slip.id, date: slip.date, kind: slip.kind, method: slip.method,
      accountId: slip.account_id, toAccountId: slip.to_account_id,
      chequeNo: slip.cheque_no, payerBank: slip.payer_bank, pvNo: slip.pv_no,
      amount: slip.amount, note: slip.note, recordedBy: slip.recorded_by,
      lines: lines.map(l => ({ id: l.id, catId: l.cat_id, subName: l.sub_name, memberId: l.member_id, amount: l.amount })),
    };
  }

  app.get("/api/slips", (req, res) => {
    const slips = db.prepare("SELECT * FROM slips ORDER BY date DESC, created_at DESC").all();
    res.json(slips.map(slipWithLines));
  });

  app.post("/api/slips", requireEdit, (req, res) => {
    const body = req.body || {};
    const { date, kind, method, accountId, toAccountId, chequeNo, payerBank, pvNo, note, lines, amount } = body;

    if (!date) return res.status(400).json({ error: "Date is required." });
    if (!["income", "expense", "transfer"].includes(kind)) return res.status(400).json({ error: "Invalid transaction type." });
    if (!accountId) return res.status(400).json({ error: "An account is required." });

    if (kind === "transfer") {
      if (!toAccountId) return res.status(400).json({ error: "Select both the source and destination accounts." });
      if (accountId === toAccountId) return res.status(400).json({ error: "Source and destination accounts must be different." });
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: "Enter a transfer amount greater than zero." });

      const id = newId("slip");
      db.prepare(`
        INSERT INTO slips (id, date, kind, method, account_id, to_account_id, cheque_no, payer_bank, pv_no, amount, note, recorded_by)
        VALUES (?, ?, 'transfer', ?, ?, ?, '', '', '', ?, ?, ?)
      `).run(id, date, method, accountId, toAccountId, amt, note || "", req.user.username);
      return res.json(slipWithLines(db.prepare("SELECT * FROM slips WHERE id = ?").get(id)));
    }

    // income / expense
    if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: "At least one category line is required." });
    for (const l of lines) {
      if (!l.catId) return res.status(400).json({ error: "Every line needs a category selected." });
      if (!l.amount || parseFloat(l.amount) <= 0) return res.status(400).json({ error: "Every line needs an amount greater than zero." });
    }

    const id = newId("slip");
    const insertSlip = db.prepare(`
      INSERT INTO slips (id, date, kind, method, account_id, to_account_id, cheque_no, payer_bank, pv_no, amount, note, recorded_by)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 0, ?, ?)
    `);
    const insertLine = db.prepare(`
      INSERT INTO slip_lines (id, slip_id, cat_id, sub_name, member_id, amount) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      insertSlip.run(id, date, kind, method, accountId, chequeNo || "", payerBank || "", pvNo || "", note || "", req.user.username);
      for (const l of lines) {
        insertLine.run(newId("ln"), id, l.catId, l.subName || "", l.memberId || null, parseFloat(l.amount));
      }
    });
    tx();

    res.json(slipWithLines(db.prepare("SELECT * FROM slips WHERE id = ?").get(id)));
  });

  app.put("/api/slips/:id", requireEdit, (req, res) => {
    const existing = db.prepare("SELECT * FROM slips WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Transaction not found." });

    const body = req.body || {};
    const { date, kind, method, accountId, toAccountId, chequeNo, payerBank, pvNo, note, lines, amount } = body;

    if (!date) return res.status(400).json({ error: "Date is required." });
    if (!accountId) return res.status(400).json({ error: "An account is required." });

    if (kind === "transfer") {
      if (!toAccountId || accountId === toAccountId) return res.status(400).json({ error: "Select two different accounts." });
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: "Enter a transfer amount greater than zero." });
      db.prepare(`
        UPDATE slips SET date=?, kind='transfer', method=?, account_id=?, to_account_id=?,
          cheque_no='', payer_bank='', pv_no='', amount=?, note=? WHERE id=?
      `).run(date, method, accountId, toAccountId, amt, note || "", req.params.id);
      db.prepare("DELETE FROM slip_lines WHERE slip_id = ?").run(req.params.id);
      return res.json(slipWithLines(db.prepare("SELECT * FROM slips WHERE id = ?").get(req.params.id)));
    }

    if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: "At least one category line is required." });
    for (const l of lines) {
      if (!l.catId) return res.status(400).json({ error: "Every line needs a category selected." });
      if (!l.amount || parseFloat(l.amount) <= 0) return res.status(400).json({ error: "Every line needs an amount greater than zero." });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE slips SET date=?, kind=?, method=?, account_id=?, to_account_id=NULL,
          cheque_no=?, payer_bank=?, pv_no=?, amount=0, note=? WHERE id=?
      `).run(date, kind, method, accountId, chequeNo || "", payerBank || "", pvNo || "", note || "", req.params.id);
      db.prepare("DELETE FROM slip_lines WHERE slip_id = ?").run(req.params.id);
      const insertLine = db.prepare(`INSERT INTO slip_lines (id, slip_id, cat_id, sub_name, member_id, amount) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const l of lines) {
        insertLine.run(newId("ln"), req.params.id, l.catId, l.subName || "", l.memberId || null, parseFloat(l.amount));
      }
    });
    tx();

    res.json(slipWithLines(db.prepare("SELECT * FROM slips WHERE id = ?").get(req.params.id)));
  });

  app.delete("/api/slips/:id", requireEdit, (req, res) => {
    db.prepare("DELETE FROM slips WHERE id = ?").run(req.params.id); // slip_lines cascade-delete via foreign key
    res.json({ ok: true });
  });
}

module.exports = registerSlipRoutes;
