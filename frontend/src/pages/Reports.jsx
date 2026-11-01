import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  TrendingUp, TrendingDown, ArrowRightLeft, FileSpreadsheet, FileDown,
  ShieldCheck, StickyNote, FileText, ClipboardList,
} from "lucide-react";
import { Card, PageHeader, EmptyState, StatCard, Select, Modal, Pill, Toast, Btn } from "../ui-atoms.jsx";
import { fmt, fmtPlain, quarterOf, DISCLOSURE_CATEGORIES } from "../format.js";
import { api } from "../api.js";

export function ReportsPage({ slips, incomeCats, expenseCats, catLookup, accounts, accountBalances, totals, canSeeNotes, disclosures }) {
  const [reportType, setReportType] = useState("statement");
  const [year, setYear] = useState(2026);
  const [period, setPeriod] = useState("full");
  const [budgetYear, setBudgetYear] = useState({});
  const [priorYearData, setPriorYearData] = useState({});
  const [exporting, setExporting] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [activeNoteCat, setActiveNoteCat] = useState(null);

  useEffect(() => {
    Promise.all([api.getBudget(year), api.getPriorYear(year - 1)])
      .then(([b, p]) => { setBudgetYear(b); setPriorYearData(p); })
      .catch(err => setToastMsg(err.message));
  }, [year]);

  const PERIODS = {
    q1:   { end: `${year}-03-31`, label: `Quarter 1 ended 31/03/${year}`,  filename: "Q1" },
    q2:   { end: `${year}-06-30`, label: `Quarter 2 ended 30/06/${year}`,  filename: "Q2" },
    q3:   { end: `${year}-09-30`, label: `Quarter 3 ended 30/09/${year}`,  filename: "Q3" },
    q4:   { end: `${year}-12-31`, label: `Quarter 4 ended 31/12/${year}`,  filename: "Q4" },
    mid:  { end: `${year}-06-30`, label: `Half year ended 30/06/${year}`,  filename: "MidYear" },
    full: { end: `${year}-12-31`, label: `Year ended 31/12/${year}`,       filename: "FullYear" },
  };
  // Quarterly reports start from the beginning of each quarter, not from
  // Jan 1 — otherwise Q2 would include all of Q1's transactions too.
  const PERIOD_STARTS = { q1: `${year}-01-01`, q2: `${year}-04-01`, q3: `${year}-07-01`, q4: `${year}-10-01` };
  const isQuarterly = ["q1", "q2", "q3", "q4"].includes(period);
  const periodStart = isQuarterly ? PERIOD_STARTS[period] : `${year}-01-01`;
  const periodEnd = PERIODS[period]?.end || `${year}-12-31`;
  const periodLabel = PERIODS[period]?.label || `Year ended 31/12/${year}`;
  const periodFilename = PERIODS[period]?.filename || "FullYear";

  const slipsInPeriod = slips.filter(s =>
    s.date.slice(0, 4) === String(year) &&
    s.date >= periodStart &&
    s.date <= periodEnd
  );

  const actualsByCat = useMemo(() => {
    const map = {};
    slipsInPeriod.forEach(s => {
      if (s.kind !== "income" && s.kind !== "expense") return;
      s.lines.forEach(l => { map[l.catId] = (map[l.catId] || 0) + (l.amount || 0); });
    });
    return map;
  }, [slipsInPeriod]);

  const quarterlyByCat = useMemo(() => {
    const map = {};
    slipsInPeriod.forEach(s => {
      if (s.kind !== "income" && s.kind !== "expense") return;
      const q = quarterOf(s.date);
      s.lines.forEach(l => {
        if (!map[l.catId]) map[l.catId] = { 1: 0, 2: 0, 3: 0, 4: 0 };
        map[l.catId][q] += (l.amount || 0);
      });
    });
    return map;
  }, [slipsInPeriod]);

  const quarterlyBySubcat = useMemo(() => {
    const map = {};
    slipsInPeriod.forEach(s => {
      if (s.kind !== "income" && s.kind !== "expense") return;
      const q = quarterOf(s.date);
      s.lines.forEach(l => {
        const sub = l.subName || "(General)";
        if (!map[l.catId]) map[l.catId] = {};
        if (!map[l.catId][sub]) map[l.catId][sub] = { 1: 0, 2: 0, 3: 0, 4: 0 };
        map[l.catId][sub][q] += (l.amount || 0);
      });
    });
    return map;
  }, [slipsInPeriod]);

  const incomeTotal = incomeCats.reduce((s, c) => s + (actualsByCat[c.id] || 0), 0);
  const expenseTotal = expenseCats.reduce((s, c) => s + (actualsByCat[c.id] || 0), 0);

  // The base year is 2026 — the year the system was set up with real opening
  // balances. For any period that starts after Jan 1 2026, Balance b/f must
  // include all transactions that occurred before that period's start date.
  // For 2026 Q1 / full year / mid-year, the period starts on Jan 1 2026,
  // which is the same as the account opening date, so we just use a.opening.
  // For all other periods, we add the net of all transactions before the
  // period start to the account opening balances.
  const BASE_YEAR = 2026;
  const periodStartDate = isQuarterly ? PERIOD_STARTS[period] : `${year}-01-01`;
  const baseDate = `${BASE_YEAR}-01-01`;

  const openingBalance = (() => {
    if (periodStartDate <= baseDate) {
      return accounts.reduce((s, a) => s + a.opening, 0);
    }
    const priorSlips = slips.filter(s =>
      s.date >= baseDate && s.date < periodStartDate
    );
    let net = accounts.reduce((s, a) => s + a.opening, 0);
    priorSlips.forEach(s => {
      const total = s.kind === "transfer" ? 0 :
        s.lines.reduce((sum, l) => sum + (l.amount || 0), 0);
      if (s.kind === "income")  net += total;
      if (s.kind === "expense") net -= total;
    });
    return net;
  })();

  const totalReceipts = incomeTotal + openingBalance;
  const surplus = totalReceipts - expenseTotal;

  const cashAccounts = accounts.filter(a => a.kind === "cash");
  const bankAccounts = accounts.filter(a => a.kind === "bank");
  const totalCash = cashAccounts.reduce((s, a) => s + accountBalances[a.id], 0);
  const totalBank = bankAccounts.reduce((s, a) => s + accountBalances[a.id], 0);

  const notesEntries = slipsInPeriod.filter(s => s.note && s.note.trim());

  const exportExcel = () => {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      const sortedIncome = [...incomeCats].sort((a, b) => (a.noteNo || 999) - (b.noteNo || 999));
      const sortedExpense = [...expenseCats].sort((a, b) => (a.noteNo || 999) - (b.noteNo || 999));

      const rpRows = [
        [`Santasi S.D.A. Church — Receipts and Payments Account`],
        [periodLabel],
        [],
        ["RECEIPTS", "Note", `${year} Actuals`, `${year} Budget`, `${year - 1} Actuals`],
        ["Balance b/f", "", openingBalance, "", ""],
        ...sortedIncome.map(c => [c.name, c.noteNo || "", actualsByCat[c.id] || 0, budgetYear[c.id] || 0, priorYearData[c.id] || 0]),
        ["Total receipts", "", totalReceipts, incomeCats.reduce((s, c) => s + (budgetYear[c.id] || 0), 0), incomeCats.reduce((s, c) => s + (priorYearData[c.id] || 0), 0)],
        [],
        ["PAYMENTS", "Note", `${year} Actuals`, `${year} Budget`, `${year - 1} Actuals`],
        ...sortedExpense.map(c => [c.name, c.noteNo || "", actualsByCat[c.id] || 0, budgetYear[c.id] || 0, priorYearData[c.id] || 0]),
        ["Total payments", "", expenseTotal, expenseCats.reduce((s, c) => s + (budgetYear[c.id] || 0), 0), expenseCats.reduce((s, c) => s + (priorYearData[c.id] || 0), 0)],
        ["Surplus", "", surplus, "", ""],
        ["Cash at Bank", "", totalBank, "", ""],
        ["Cash in Hand", "", totalCash, "", ""],
      ];
      const wsRP = XLSX.utils.aoa_to_sheet(rpRows);
      wsRP["!cols"] = [{ wch: 32 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsRP, "Receipts & Payments");

      const notesRows = [["Note", "Category", "Subcategory", "Q1", "Q2", "Q3", "Q4", "Total"]];
      [...incomeCats, ...expenseCats].filter(c => c.noteNo).sort((a, b) => a.noteNo - b.noteNo).forEach(c => {
        const q = quarterlyByCat[c.id];
        if (!q || (q[1] + q[2] + q[3] + q[4]) === 0) return;
        const subBreakdown = quarterlyBySubcat[c.id] || {};
        const hasSubBreakdown = Object.keys(subBreakdown).length > 1 || (Object.keys(subBreakdown).length === 1 && Object.keys(subBreakdown)[0] !== "(General)");
        if (hasSubBreakdown) {
          Object.entries(subBreakdown).forEach(([sub, vals]) => {
            notesRows.push([c.noteNo, c.name, sub, vals[1], vals[2], vals[3], vals[4], vals[1] + vals[2] + vals[3] + vals[4]]);
          });
        } else {
          notesRows.push([c.noteNo, c.name, "", q[1], q[2], q[3], q[4], q[1] + q[2] + q[3] + q[4]]);
        }
      });
      const wsNotes = XLSX.utils.aoa_to_sheet(notesRows);
      wsNotes["!cols"] = [{ wch: 6 }, { wch: 26 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsNotes, "Notes to Accounts");

      const discRows = [["Category", "Description", "Amount", "Note"]];
      disclosures.filter(d => d.year === year).forEach(d => {
        const catLabel = DISCLOSURE_CATEGORIES.find(dc => dc.id === d.category)?.label || d.category;
        discRows.push([catLabel, d.label, d.amount, d.note || ""]);
      });
      const wsDisc = XLSX.utils.aoa_to_sheet(discRows);
      wsDisc["!cols"] = [{ wch: 26 }, { wch: 28 }, { wch: 16 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, wsDisc, "Disclosures");

      const cbRows = [["Account", "Type", "Balance"]];
      cashAccounts.forEach(a => cbRows.push([a.name, "Cash", accountBalances[a.id]]));
      bankAccounts.forEach(a => cbRows.push([a.name, "Bank", accountBalances[a.id]]));
      cbRows.push(["Total", "", totalCash + totalBank]);
      const wsCB = XLSX.utils.aoa_to_sheet(cbRows);
      wsCB["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsCB, "Cash Book Summary");

      const fname = `Santasi-SDA-${periodFilename}-Report-${year}.xlsx`;
      XLSX.writeFile(wb, fname);
      setToastMsg(`Downloaded ${fname}`);
    } catch (err) {
      console.error("Excel export failed:", err);
      setToastMsg("Could not generate the Excel file. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = () => {
    setExporting(true);
    try {
      const node = document.getElementById("report-print-area");
      if (!node) { setToastMsg("Nothing to print yet."); return; }
      const printWindow = window.open("", "_blank");
      if (!printWindow) { setToastMsg("Your browser blocked the pop-up window. Please allow pop-ups for this site and try again."); return; }
      printWindow.document.write(`
        <html><head><title>Santasi SDA Church — Report ${year}</title>
        <style>
          body { font-family: Georgia, 'Times New Roman', serif; color: #1B2A41; padding: 28px; }
          h1,h2,h3 { font-family: Georgia, serif; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 18px; font-size: 12px; }
          th, td { padding: 5px 8px; border-bottom: 1px solid #ddd; text-align: left; }
          th { text-transform: uppercase; font-size: 10px; letter-spacing: 0.3px; color: #555; border-bottom: 2px solid #999; }
          td.num, th.num { text-align: right; font-family: 'Courier New', monospace; }
          .section-title { font-weight: bold; margin: 18px 0 6px; font-size: 14px; }
          .header { text-align: center; margin-bottom: 22px; border-bottom: 2px solid #999; padding-bottom: 10px; }
          @media print { body { padding: 0; } }
        </style>
        </head><body>${node.innerHTML}</body></html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 350);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <Toast message={toastMsg} onDismiss={() => setToastMsg("")} tone={toastMsg.startsWith("Downloaded") ? "success" : "error"} />
      <PageHeader title="Reports" subtitle="Statements formatted to match the church's audited annual report"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" small icon={FileSpreadsheet} onClick={exportExcel} disabled={exporting}>Download Excel</Btn>
            <Btn variant="ghost" small icon={FileDown} onClick={exportPdf} disabled={exporting}>Download PDF</Btn>
          </div>
        } />

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { k: "statement", l: "Receipts & Payments" },
            { k: "notes", l: "Notes to Accounts" },
            { k: "disclosures", l: "Disclosures" },
            { k: "cashbook", l: "Cash Book Summary" },
            { k: "auditnotes", l: "Notes to Accounts (audit)" },
          ].map(r => (
            <button key={r.k} onClick={() => setReportType(r.k)} style={{
              padding: "9px 16px", borderRadius: 9, border: "1px solid " + (reportType === r.k ? "var(--ink)" : "var(--line)"),
              background: reportType === r.k ? "var(--ink)" : "var(--paper)", color: reportType === r.k ? "var(--paper)" : "var(--ink-soft)",
              fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}>{r.l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
          <Select value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 140 }}>
            <option value="q1">Q1 (Jan–Mar)</option>
            <option value="q2">Q2 (Apr–Jun)</option>
            <option value="q3">Q3 (Jul–Sep)</option>
            <option value="q4">Q4 (Oct–Dec)</option>
            <option value="mid">Mid-year</option>
            <option value="full">Full year</option>
          </Select>
          <Select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 100 }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </div>

      <div id="report-print-area">
      <div className="header" style={{ textAlign: "center", marginBottom: 18, padding: "10px 0", borderBottom: "2px solid var(--line-strong)" }}>
        <div style={{ fontSize: 11.5, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>Santasi S.D.A. Church</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, marginTop: 2 }}>Receipts and Payments Account</div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>{periodLabel}</div>
      </div>

      {reportType === "statement" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
            <StatCard label="Total receipts" value={fmt(totalReceipts)} tone="income" icon={TrendingUp} />
            <StatCard label="Total payments" value={fmt(expenseTotal)} tone="expense" icon={TrendingDown} />
            <StatCard label="Surplus / (deficit)" value={fmt(surplus)} tone="neutral" icon={ArrowRightLeft} />
          </div>

          <Card title="">
            <table>
              <thead>
                <tr>
                  <th>Receipts note</th>
                  <th style={{ textAlign: "right" }}>{year} Actuals</th>
                  <th style={{ textAlign: "right" }}>{year} Budget</th>
                  <th style={{ textAlign: "right" }}>{year - 1} Actuals</th>
                </tr>
              </thead>
              <tbody>
                <tr className="amt-row">
                  <td style={{ fontWeight: 600 }}>Balance b/f</td>
                  <td className="num">{fmtPlain(openingBalance)}</td>
                  <td className="num" style={{ color: "var(--ink-faint)" }}>—</td>
                  <td className="num" style={{ color: "var(--ink-faint)" }}>—</td>
                </tr>
                {[...incomeCats].sort((a, b) => (a.noteNo || 999) - (b.noteNo || 999))
                  .map(c => (
                    <tr key={c.id} className="amt-row" onClick={() => setActiveNoteCat({ ...c, kind: "income" })} style={{ cursor: "pointer" }}>
                      <td>{c.name}{c.noteNo && <span style={{ color: "var(--ink-faint)", fontSize: 12 }}> &nbsp;{c.noteNo}</span>}</td>
                      <td className="num" style={{ color: "var(--income)" }}>{fmtPlain(actualsByCat[c.id] || 0)}</td>
                      <td className="num" style={{ color: "var(--ink-faint)" }}>{fmtPlain(budgetYear[c.id] || 0)}</td>
                      <td className="num" style={{ color: "var(--ink-faint)" }}>{fmtPlain(priorYearData[c.id] || 0)}</td>
                    </tr>
                  ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>Total receipts</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(totalReceipts)}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--ink-faint)" }}>{fmtPlain(incomeCats.reduce((s, c) => s + (budgetYear[c.id] || 0), 0))}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--ink-faint)" }}>{fmtPlain(incomeCats.reduce((s, c) => s + (priorYearData[c.id] || 0), 0))}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <div style={{ height: 18 }} />

          <Card title="">
            <table>
              <thead>
                <tr>
                  <th>Payments note</th>
                  <th style={{ textAlign: "right" }}>{year} Actuals</th>
                  <th style={{ textAlign: "right" }}>{year} Budget</th>
                  <th style={{ textAlign: "right" }}>{year - 1} Actuals</th>
                </tr>
              </thead>
              <tbody>
                {[...expenseCats].sort((a, b) => (a.noteNo || 999) - (b.noteNo || 999))
                  .map(c => (
                    <tr key={c.id} className="amt-row" onClick={() => setActiveNoteCat({ ...c, kind: "expense" })} style={{ cursor: "pointer" }}>
                      <td>{c.name}{c.noteNo && <span style={{ color: "var(--ink-faint)", fontSize: 12 }}> &nbsp;{c.noteNo}</span>}</td>
                      <td className="num" style={{ color: "var(--expense)" }}>{fmtPlain(actualsByCat[c.id] || 0)}</td>
                      <td className="num" style={{ color: "var(--ink-faint)" }}>{fmtPlain(budgetYear[c.id] || 0)}</td>
                      <td className="num" style={{ color: "var(--ink-faint)" }}>{fmtPlain(priorYearData[c.id] || 0)}</td>
                    </tr>
                  ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>Total payments</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(expenseTotal)}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--ink-faint)" }}>{fmtPlain(expenseCats.reduce((s, c) => s + (budgetYear[c.id] || 0), 0))}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--ink-faint)" }}>{fmtPlain(expenseCats.reduce((s, c) => s + (priorYearData[c.id] || 0), 0))}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Surplus</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(surplus)}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--ink-faint)" }}>—</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--ink-faint)" }}>—</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Cash at Bank</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(totalBank)}</td>
                  <td colSpan={2}></td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Cash in Hand</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(totalCash)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </Card>

          {activeNoteCat && (
            <QuarterlyNoteModal cat={activeNoteCat} quarterlyByCat={quarterlyByCat} quarterlyBySubcat={quarterlyBySubcat}
              kind={activeNoteCat.kind} onClose={() => setActiveNoteCat(null)} />
          )}

          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 10, textAlign: "center" }}>
            Click any line to see its quarterly breakdown for {periodLabel.toLowerCase()}.
          </div>
        </>
      )}

      {reportType === "notes" && (
        <NotesToAccountReport incomeCats={incomeCats} expenseCats={expenseCats} quarterlyByCat={quarterlyByCat} quarterlyBySubcat={quarterlyBySubcat} />
      )}

      {reportType === "disclosures" && (
        <DisclosuresReport disclosures={disclosures.filter(d => d.year === year)} />
      )}

      {reportType === "cashbook" && (
        <Card title="Cash & bank position">
          <table>
            <thead><tr><th>Account</th><th>Type</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
            <tbody>
              {cashAccounts.map(a => (
                <tr key={a.id} className="amt-row"><td style={{ fontWeight: 600 }}>{a.name}</td><td><Pill>cash</Pill></td><td className="num">{fmtPlain(accountBalances[a.id])}</td></tr>
              ))}
              {bankAccounts.map(a => (
                <tr key={a.id} className="amt-row"><td style={{ fontWeight: 600 }}>{a.name}</td><td><Pill tone="transfer">bank</Pill></td><td className="num">{fmtPlain(accountBalances[a.id])}</td></tr>
              ))}
              <tr><td style={{ fontWeight: 700 }} colSpan={2}>Total cash + bank</td><td className="num" style={{ fontWeight: 700 }}>{fmtPlain(totalCash + totalBank)}</td></tr>
            </tbody>
          </table>
        </Card>
      )}
      </div>

      {reportType === "auditnotes" && (
        <Card title="Notes to accounts (transaction-level)">
          {!canSeeNotes ? (
            <EmptyState icon={ShieldCheck} title="Restricted" body="Notes to accounts are visible to the Treasurer and Auditor only." />
          ) : notesEntries.length === 0 ? (
            <EmptyState icon={StickyNote} title="No notes in this period" body="Notes added to income or expense entries will be listed here for audit reference." />
          ) : (
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Ref.</th><th style={{ textAlign: "right" }}>Amount</th><th>Note</th></tr></thead>
              <tbody>
                {notesEntries.map(s => {
                  const total = s.kind === "transfer" ? s.amount : s.lines.reduce((sum, l) => sum + (l.amount || 0), 0);
                  return (
                    <tr key={s.id} className="amt-row">
                      <td>{s.date}</td>
                      <td><Pill tone={s.kind}>{s.kind}</Pill></td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{s.chequeNo || s.pvNo || ""}</td>
                      <td className="num">{fmtPlain(total)}</td>
                      <td style={{ color: "var(--ink-soft)" }}>{s.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

function QuarterlyNoteModal({ cat, quarterlyByCat, quarterlyBySubcat, kind, onClose }) {
  const subBreakdown = quarterlyBySubcat[cat.id] || {};
  const hasSubBreakdown = Object.keys(subBreakdown).length > 1 || (Object.keys(subBreakdown).length === 1 && Object.keys(subBreakdown)[0] !== "(General)");
  const q = quarterlyByCat[cat.id] || { 1: 0, 2: 0, 3: 0, 4: 0 };
  const total = q[1] + q[2] + q[3] + q[4];

  return (
    <Modal title={`${cat.noteNo ? cat.noteNo + ". " : ""}${cat.name}`} onClose={onClose} width={560}>
      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 700 }}>{kind}</div>
      <table>
        <thead><tr><th></th><th style={{ textAlign: "right" }}>Q1</th><th style={{ textAlign: "right" }}>Q2</th><th style={{ textAlign: "right" }}>Q3</th><th style={{ textAlign: "right" }}>Q4</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
        <tbody>
          {hasSubBreakdown ? (
            Object.entries(subBreakdown).map(([sub, vals]) => (
              <tr key={sub} className="amt-row">
                <td>{sub}</td>
                <td className="num">{fmtPlain(vals[1])}</td>
                <td className="num">{fmtPlain(vals[2])}</td>
                <td className="num">{fmtPlain(vals[3])}</td>
                <td className="num">{fmtPlain(vals[4])}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(vals[1] + vals[2] + vals[3] + vals[4])}</td>
              </tr>
            ))
          ) : (
            <tr className="amt-row">
              <td>Total</td>
              <td className="num">{fmtPlain(q[1])}</td>
              <td className="num">{fmtPlain(q[2])}</td>
              <td className="num">{fmtPlain(q[3])}</td>
              <td className="num">{fmtPlain(q[4])}</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(total)}</td>
            </tr>
          )}
          {hasSubBreakdown && (
            <tr>
              <td style={{ fontWeight: 700 }}>Total</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(q[1])}</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(q[2])}</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(q[3])}</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(q[4])}</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(total)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </Modal>
  );
}

function NotesToAccountReport({ incomeCats, expenseCats, quarterlyByCat, quarterlyBySubcat }) {
  const allCats = [...incomeCats.map(c => ({ ...c, kind: "income" })), ...expenseCats.map(c => ({ ...c, kind: "expense" }))]
    .filter(c => c.noteNo)
    .filter(c => {
      const q = quarterlyByCat[c.id];
      return q && (q[1] + q[2] + q[3] + q[4]) > 0;
    })
    .sort((a, b) => a.noteNo - b.noteNo);

  const byNote = {};
  allCats.forEach(c => {
    if (!byNote[c.noteNo]) byNote[c.noteNo] = [];
    byNote[c.noteNo].push(c);
  });

  return (
    <Card title="">
      {Object.keys(byNote).length === 0 ? (
        <EmptyState icon={FileText} title="No note-numbered activity yet" body="Once transactions are recorded against numbered categories, their quarterly notes will appear here." />
      ) : (
        Object.entries(byNote).sort((a, b) => Number(a[0]) - Number(b[0])).map(([noteNo, cats]) => (
          <div key={noteNo} style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 10 }}>{noteNo}. {cats.map(c => c.name).join(" / ")}</div>
            {cats.map(cat => {
              const subBreakdown = quarterlyBySubcat[cat.id] || {};
              const hasSubBreakdown = Object.keys(subBreakdown).length > 1 || (Object.keys(subBreakdown).length === 1 && Object.keys(subBreakdown)[0] !== "(General)");
              const q = quarterlyByCat[cat.id] || { 1: 0, 2: 0, 3: 0, 4: 0 };
              const total = q[1] + q[2] + q[3] + q[4];
              return (
                <div key={cat.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: cat.kind === "income" ? "var(--income)" : "var(--expense)", letterSpacing: 0.3, marginBottom: 4 }}>
                    {cat.kind} — {cat.name}
                  </div>
                  <table>
                    <thead><tr><th></th><th style={{ textAlign: "right" }}>Q1</th><th style={{ textAlign: "right" }}>Q2</th><th style={{ textAlign: "right" }}>Q3</th><th style={{ textAlign: "right" }}>Q4</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
                    <tbody>
                      {hasSubBreakdown ? (
                        <>
                          {Object.entries(subBreakdown).map(([sub, vals]) => (
                            <tr key={sub} className="amt-row">
                              <td>{sub}</td>
                              <td className="num">{fmtPlain(vals[1])}</td><td className="num">{fmtPlain(vals[2])}</td>
                              <td className="num">{fmtPlain(vals[3])}</td><td className="num">{fmtPlain(vals[4])}</td>
                              <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(vals[1] + vals[2] + vals[3] + vals[4])}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: "2px solid var(--line-strong)" }}>
                            <td style={{ fontWeight: 700 }}>Total</td>
                            <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(q[1])}</td>
                            <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(q[2])}</td>
                            <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(q[3])}</td>
                            <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(q[4])}</td>
                            <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(total)}</td>
                          </tr>
                        </>
                      ) : (
                        <tr className="amt-row">
                          <td>Total</td>
                          <td className="num">{fmtPlain(q[1])}</td><td className="num">{fmtPlain(q[2])}</td>
                          <td className="num">{fmtPlain(q[3])}</td><td className="num">{fmtPlain(q[4])}</td>
                          <td className="num" style={{ fontWeight: 700 }}>{fmtPlain(total)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ))
      )}
    </Card>
  );
}

function DisclosuresReport({ disclosures }) {
  return (
    <Card title="">
      {DISCLOSURE_CATEGORIES.map(cat => {
        const items = disclosures.filter(d => d.category === cat.id);
        if (items.length === 0) return null;
        const total = items.reduce((s, d) => s + d.amount, 0);
        return (
          <div key={cat.id} style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{cat.label}</div>
            <table>
              <tbody>
                {items.map(d => (
                  <tr key={d.id} className="amt-row"><td>{d.label}</td><td className="num">{fmtPlain(d.amount)}</td></tr>
                ))}
                <tr><td style={{ fontWeight: 700 }}>Total</td><td className="num" style={{ fontWeight: 700 }}>{fmtPlain(total)}</td></tr>
              </tbody>
            </table>
          </div>
        );
      })}
      {disclosures.length === 0 && <EmptyState icon={ClipboardList} title="No disclosures for this year" body="Add entries in the Disclosures section to populate this report." />}
    </Card>
  );
}
