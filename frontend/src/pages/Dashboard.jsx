import { useMemo } from "react";
import { TrendingUp, TrendingDown, Banknote, Landmark, Receipt } from "lucide-react";
import { Card, PageHeader, EmptyState, StatCard } from "../ui-atoms.jsx";
import { fmt, fmtPlain } from "../format.js";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COLORS = ["#2F5233","#B8862E","#3D5066","#8B2E2E","#5C7A5E","#C9A458","#6B7FA0","#B05050",
                "#4A6B4D","#D4B06A","#8096B5","#C07070"];
const INCOME_COLOR  = "#2F5233";
const EXPENSE_COLOR = "#8B2E2E";
const GOLD_COLOR    = "#B8862E";

function fmtK(v) {
  if (v >= 1000000) return (v/1000000).toFixed(1)+"M";
  if (v >= 1000)    return (v/1000).toFixed(0)+"k";
  return String(Math.round(v));
}

/* ---- Horizontal bar chart (pure SVG) ---- */
function HBarChart({ data, valueKey, colorKey, labelKey, height = 220 }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const rowH = Math.min(32, (height - 20) / data.length);
  const labelW = 100;
  const barArea = 240;
  const numW = 70;
  const w = labelW + barArea + numW;
  const h = data.length * rowH + 20;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", maxHeight: height }}>
      {data.map((d, i) => {
        const barW = ((d[valueKey] || 0) / max) * barArea;
        const y = i * rowH + 4;
        const color = colorKey ? d[colorKey] : COLORS[i % COLORS.length];
        return (
          <g key={i}>
            <text x={labelW - 6} y={y + rowH * 0.65} textAnchor="end"
              style={{ fontSize: 10.5, fill: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
              {(d[labelKey] || "").length > 14 ? (d[labelKey] || "").slice(0,13)+"…" : (d[labelKey] || "")}
            </text>
            <rect x={labelW} y={y + 3} width={Math.max(barW, 2)} height={rowH - 8}
              rx={3} fill={color} opacity={0.9} />
            <text x={labelW + barW + 5} y={y + rowH * 0.65}
              style={{ fontSize: 10, fill: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
              {fmtK(d[valueKey] || 0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---- Grouped bar chart by month (pure SVG) ---- */
function MonthlyBarChart({ data }) {
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  const W = 560, H = 200, padL = 44, padB = 22, padT = 10, padR = 10;
  const chartW = W - padL - padR;
  const chartH = H - padB - padT;
  const colW = chartW / 12;
  const barW = (colW - 6) / 2;
  const ticks = 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {/* Y axis ticks */}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const val = (maxVal / ticks) * i;
        const y = padT + chartH - (chartH * i / ticks);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--line)" strokeWidth={0.8} />
            <text x={padL - 4} y={y + 3.5} textAnchor="end"
              style={{ fontSize: 9.5, fill: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
              {fmtK(val)}
            </text>
          </g>
        );
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const x = padL + i * colW;
        const incH = (d.income / maxVal) * chartH;
        const expH = (d.expense / maxVal) * chartH;
        return (
          <g key={i}>
            <rect x={x + 3} y={padT + chartH - incH} width={barW} height={incH}
              rx={2} fill={INCOME_COLOR} opacity={0.85} />
            <rect x={x + 3 + barW + 1} y={padT + chartH - expH} width={barW} height={expH}
              rx={2} fill={EXPENSE_COLOR} opacity={0.85} />
            <text x={x + colW / 2} y={H - 5} textAnchor="middle"
              style={{ fontSize: 9, fill: "var(--ink-faint)", fontFamily: "var(--font-body)" }}>
              {d.month}
            </text>
          </g>
        );
      })}
      {/* Legend */}
      <rect x={padL} y={3} width={8} height={8} rx={2} fill={INCOME_COLOR} />
      <text x={padL + 10} y={10} style={{ fontSize: 9.5, fill: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>Income</text>
      <rect x={padL + 60} y={3} width={8} height={8} rx={2} fill={EXPENSE_COLOR} />
      <text x={padL + 72} y={10} style={{ fontSize: 9.5, fill: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>Expenditure</text>
    </svg>
  );
}

/* ---- Donut chart (pure SVG) ---- */
function DonutChart({ data }) {
  if (!data.length) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const R = 60, r = 36, cx = 80, cy = 80;
  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle);
    const y1 = cy + R * Math.sin(angle);
    angle += sweep;
    const x2 = cx + R * Math.cos(angle);
    const y2 = cy + R * Math.sin(angle);
    const xi1 = cx + r * Math.cos(angle);
    const yi1 = cy + r * Math.sin(angle);
    const xi2 = cx + r * Math.cos(angle - sweep);
    const yi2 = cy + r * Math.sin(angle - sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} L${xi1},${yi1} A${r},${r},0,${large},0,${xi2},${yi2} Z`;
    return { path, color: COLORS[i % COLORS.length], pct: ((d.value / total) * 100).toFixed(1) };
  });

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <svg viewBox="0 0 160 160" style={{ width: 120, height: 120, flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="var(--paper)" strokeWidth={1.5} />
        ))}
        <circle cx={cx} cy={cy} r={r - 2} fill="var(--paper)" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {data.slice(0, 8).map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: "var(--ink-soft)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.name}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-faint)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>
              {slices[i]?.pct}%
            </div>
          </div>
        ))}
        <div style={{ marginTop: 6, paddingTop: 5, borderTop: "1px solid var(--line)", fontSize: 11, fontWeight: 700 }}>
          Total: <span style={{ fontFamily: "var(--font-mono)" }}>{fmtPlain(total)}</span>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ totals, accounts, accountBalances, totalCash, totalBank, slips, catLookup, accountLookup }) {
  const recent = [...slips].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const hasSlips = slips.length > 0;

  /* Monthly income vs expense */
  const monthlyData = useMemo(() => {
    const map = {};
    for (let m = 1; m <= 12; m++) map[String(m).padStart(2,"0")] = { month: MONTH_LABELS[m-1], income: 0, expense: 0 };
    slips.forEach(s => {
      const mo = s.date.slice(5,7);
      if (!map[mo]) return;
      const total = s.lines.reduce((sum, l) => sum + (l.amount||0), 0);
      if (s.kind === "income")  map[mo].income  += total;
      if (s.kind === "expense") map[mo].expense += total;
    });
    return Object.values(map);
  }, [slips]);

  /* Account balances */
  const accountData = useMemo(() =>
    accounts.map(a => ({ label: a.name, balance: accountBalances[a.id] || a.opening,
      color: a.kind === "cash" ? GOLD_COLOR : "#3D5066" })),
  [accounts, accountBalances]);

  /* Top expense categories */
  const topExpense = useMemo(() => {
    const m = {};
    slips.filter(s => s.kind === "expense").forEach(s =>
      s.lines.forEach(l => { m[l.catId] = (m[l.catId]||0) + l.amount; }));
    return Object.entries(m)
      .map(([id, v]) => ({ label: catLookup[id]?.name || id, balance: v, color: EXPENSE_COLOR }))
      .sort((a,b) => b.balance - a.balance).slice(0, 8);
  }, [slips, catLookup]);

  /* Income by category (pie) */
  const incomePie = useMemo(() => {
    const m = {};
    slips.filter(s => s.kind === "income").forEach(s =>
      s.lines.forEach(l => { m[l.catId] = (m[l.catId]||0) + l.amount; }));
    return Object.entries(m)
      .map(([id, v]) => ({ name: catLookup[id]?.name || id, value: v }))
      .sort((a,b) => b.value - a.value).slice(0, 10);
  }, [slips, catLookup]);

  /* Expense by category (pie) */
  const expensePie = useMemo(() => {
    const m = {};
    slips.filter(s => s.kind === "expense").forEach(s =>
      s.lines.forEach(l => { m[l.catId] = (m[l.catId]||0) + l.amount; }));
    return Object.entries(m)
      .map(([id, v]) => ({ name: catLookup[id]?.name || id, value: v }))
      .sort((a,b) => b.value - a.value).slice(0, 10);
  }, [slips, catLookup]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of church finances at a glance" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Total income"      value={fmt(totals.income)}  tone="income"   icon={TrendingUp} />
        <StatCard label="Total expenditure" value={fmt(totals.expense)} tone="expense"  icon={TrendingDown} />
        <StatCard label="Cash in hand"      value={fmt(totalCash)}      tone="neutral"  icon={Banknote} />
        <StatCard label="Total in banks"    value={fmt(totalBank)}      tone="neutral"  icon={Landmark} />
      </div>

      {/* Monthly bar chart */}
      <Card title="Monthly Income vs Expenditure">
        {!hasSlips
          ? <EmptyState icon={Receipt} title="No transactions yet" body="Charts will appear once transactions are recorded." />
          : <MonthlyBarChart data={monthlyData} />}
      </Card>

      <div style={{ height: 16 }} />

      {/* Account balances + Top expenditure */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Account balances">
          <HBarChart data={accountData} valueKey="balance" colorKey="color" labelKey="label" height={120} />
        </Card>
        <Card title="Top expenditure categories">
          {!hasSlips
            ? <EmptyState icon={Receipt} title="No data yet" body="Record transactions to see spending." />
            : <HBarChart data={topExpense} valueKey="balance" colorKey="color" labelKey="label" height={220} />}
        </Card>
      </div>

      <div style={{ height: 16 }} />

      {/* Donut charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Income by category">
          {!hasSlips || !incomePie.length
            ? <EmptyState icon={Receipt} title="No data yet" body="Record income transactions to see the breakdown." />
            : <DonutChart data={incomePie} />}
        </Card>
        <Card title="Expenditure by category">
          {!hasSlips || !expensePie.length
            ? <EmptyState icon={Receipt} title="No data yet" body="Record expense transactions to see the breakdown." />
            : <DonutChart data={expensePie} />}
        </Card>
      </div>

      <div style={{ height: 16 }} />

      {/* Recent transactions */}
      <Card title="Recent transactions">
        {!recent.length
          ? <EmptyState icon={Receipt} title="No transactions yet" body="Recorded income and expenses will appear here." />
          : <table>
              <thead><tr><th>Date</th><th>Details</th><th>Type</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
              <tbody>
                {recent.map(s => {
                  const slipTotal = s.kind==="transfer" ? s.amount : s.lines.reduce((sum,l)=>sum+(l.amount||0),0);
                  return (
                    <tr key={s.id} className="amt-row">
                      <td>{s.date}</td>
                      <td>{s.kind==="transfer"
                        ? `${accountLookup[s.accountId]?.name} → ${accountLookup[s.toAccountId]?.name}`
                        : s.lines.length===1
                          ? `${catLookup[s.lines[0].catId]?.name||"—"}${s.lines[0].subName?" · "+s.lines[0].subName:""}`
                          : `${s.lines.length} categories`}</td>
                      <td style={{textTransform:"capitalize",color:s.kind==="income"?"var(--income)":s.kind==="expense"?"var(--expense)":"var(--ink-soft)",fontWeight:600,fontSize:12.5}}>{s.kind}</td>
                      <td className="num" style={{color:s.kind==="income"?"var(--income)":s.kind==="expense"?"var(--expense)":"var(--ink-soft)"}}>
                        {s.kind==="expense"?"-":""}{fmtPlain(slipTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>}
      </Card>
    </div>
  );
}
