import { useState, useEffect, useMemo } from "react";
import { Pencil, Check, AlertTriangle, Target, TrendingUp, TrendingDown, ArrowRightLeft, Search } from "lucide-react";
import { Card, PageHeader, ReadOnlyNotice, StatCard, Select, Modal, Btn, Field, Input, Toast, iconBtnStyle } from "../ui-atoms.jsx";
import { fmt, fmtPlain } from "../format.js";
import { api } from "../api.js";

export function BudgetPage({ incomeCats, expenseCats, slips, canEdit }) {
  const [year, setYear] = useState(2026);
  const [tab, setTab] = useState("expense");
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [yearBudget, setYearBudget] = useState({});
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState("");

  const allCats = tab === "income" ? incomeCats : expenseCats;
  const cats = useMemo(() => {
    if (!search.trim()) return allCats;
    const q = search.toLowerCase();
    return allCats.filter(c => c.name.toLowerCase().includes(q) || (c.noteNo && String(c.noteNo).includes(q)));
  }, [allCats, search]);

  const loadBudget = async () => {
    setLoading(true);
    try {
      setYearBudget(await api.getBudget(year));
    } catch (err) {
      setToastMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBudget(); }, [year]);

  const actuals = useMemo(() => {
    const map = {};
    slips.filter(s => s.date.startsWith(String(year)) && s.kind === tab).forEach(s => {
      s.lines.forEach(l => { map[l.catId] = (map[l.catId] || 0) + (l.amount || 0); });
    });
    return map;
  }, [slips, year, tab]);

  const saveBudgetFigure = async (catId, amount) => {
    try {
      await api.setBudgetFigure(year, catId, amount);
      setEditTarget(null);
      await loadBudget();
    } catch (err) {
      setToastMsg(err.message);
    }
  };

  const totalBudget = allCats.reduce((s, c) => s + (yearBudget[c.id] || 0), 0);
  const totalActual = allCats.reduce((s, c) => s + (actuals[c.id] || 0), 0);

  return (
    <div>
      <Toast message={toastMsg} onDismiss={() => setToastMsg("")} />
      <PageHeader title="Budget vs Actual" subtitle="Annual budget compared against recorded transactions"
        action={
          <Select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 110 }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        } />

      {!canEdit && <ReadOnlyNotice />}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[{ k: "income", l: "Income" }, { k: "expense", l: "Expenditure" }].map(t => (
          <button key={t.k} onClick={() => { setTab(t.k); setSearch(""); }} style={{
            padding: "9px 16px", borderRadius: 9, border: "1px solid " + (tab === t.k ? "var(--ink)" : "var(--line)"),
            background: tab === t.k ? "var(--ink)" : "var(--paper)", color: tab === t.k ? "var(--paper)" : "var(--ink-soft)",
            fontSize: 13.5, fontWeight: 700, cursor: "pointer",
          }}>{t.l}</button>
        ))}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--ink-faint)", pointerEvents: "none" }} />
          <Input placeholder="Search categories…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
        <StatCard label={`Total budgeted ${year}`} value={fmt(totalBudget)} tone="neutral" icon={Target} />
        <StatCard label="Total actual" value={fmt(totalActual)} tone={tab === "income" ? "income" : "expense"} icon={tab === "income" ? TrendingUp : TrendingDown} />
        <StatCard label="Variance" value={fmt(tab === "income" ? totalActual - totalBudget : totalBudget - totalActual)} tone="neutral" icon={ArrowRightLeft} />
      </div>

      <Card title="">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-faint)" }}>Loading…</div>
        ) : (
          <table style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ textAlign: "right", width: 120 }}>Budget ({year})</th>
                <th style={{ textAlign: "right", width: 110 }}>Actual</th>
                <th style={{ textAlign: "right", width: 110 }}>Variance</th>
                <th style={{ width: 110 }}>Progress</th>
                {canEdit && <th style={{ width: 50 }}></th>}
              </tr>
            </thead>
            <tbody>
              {cats.map(c => {
                const b = yearBudget[c.id] || 0;
                const a = actuals[c.id] || 0;
                const variance = tab === "income" ? a - b : b - a;
                const pct = b > 0 ? Math.min(100, (a / b) * 100) : (a > 0 ? 100 : 0);
                const over = tab === "expense" && b > 0 && a > b;
                return (
                  <tr key={c.id} className="amt-row">
                    <td style={{ fontWeight: 600 }}>{c.noteNo ? `${c.noteNo}. ` : ""}{c.name}</td>
                    <td className="num">{fmtPlain(b)}</td>
                    <td className="num">{fmtPlain(a)}</td>
                    <td className="num" style={{ color: variance < 0 ? "var(--expense)" : "var(--income)" }}>
                      {variance < 0 ? "-" : ""}{fmtPlain(Math.abs(variance))}
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <div style={{ height: 7, background: "var(--paper-3)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: over ? "var(--expense)" : "var(--gold)", borderRadius: 4 }} />
                      </div>
                    </td>
                    {canEdit && (
                      <td>
                        <button onClick={() => setEditTarget(c)} title="Set budget" style={iconBtnStyle}><Pencil size={14} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {editTarget && (
        <BudgetFigureModal
          cat={editTarget}
          year={year}
          current={yearBudget[editTarget.id] || 0}
          onClose={() => setEditTarget(null)}
          onSave={(amount) => saveBudgetFigure(editTarget.id, amount)}
        />
      )}
    </div>
  );
}

function BudgetFigureModal({ cat, year, current, onClose, onSave }) {
  const [amount, setAmount] = useState(current || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (amount !== "" && (isNaN(val) || val < 0)) { setError("Enter a valid amount, zero or greater."); return; }
    setBusy(true);
    try {
      await onSave(val || 0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Set budget — ${cat.name}`} onClose={onClose} width={420}>
      <Toast message={error} onDismiss={() => setError("")} />
      <div>
        {error && (
          <div style={{
            display: "flex", gap: 9, alignItems: "flex-start", background: "var(--pill-expense-bg)",
            color: "var(--expense)", border: "1px solid var(--expense-line)", borderRadius: 9,
            padding: "11px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 16
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}
        <Field label={`Annual budget for ${year} (GH₵)`} hint="Leave blank or enter 0 to clear the budget for this category.">
          <Input autoFocus type="number" step="0.01" min="0" value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
            placeholder="0.00" />
        </Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn icon={Check} onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
