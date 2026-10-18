import { useState } from 'react';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { money, longDate, todayGhana } from '../format';
import { useReport } from '../useReport';
import { monthRange, PeriodPicker, StatementHead, StatementActions, downloadCsv, Head, Row, Subtotal, Total } from '../statements.jsx';

export function plLabel(r, t) {
  const base = t(`st.pl.line.${r.line}`);
  return r.category ? `${base}: ${r.category}` : base;
}

export default function ProfitLoss() {
  const { t } = useT();
  const [range, setRange] = useState(() => monthRange(todayGhana()));
  const { data: s, error } = useReport('profit-loss', range);
  const period = s && t('rp.period', { from: longDate(s.from, t), to: longDate(s.to, t) });
  // Owner pay comes out of the profit, so it is shown after it, not among the expenses.
  const owner = s ? Number(s.ownerPay) : 0;
  const kept = s ? Math.round((Number(s.totals.netProfit) - owner) * 100) / 100 : 0;

  function csv() {
    downloadCsv(`profit-and-loss-${s.from}-to-${s.to}.csv`, [
      [t('st.pl.statement')], [s.business?.name], [period], [],
      [t('st.pl.income')], ...s.income.map((r) => [`  ${plLabel(r, t)}`, r.amount]), [t('st.pl.totalIncome'), s.totals.income],
      [t('st.pl.cogs'), s.totals.costOfSales], [t('st.pl.gross'), s.totals.grossProfit], [],
      [t('st.pl.expenses')], ...s.expenses.map((r) => [`  ${plLabel(r, t)}`, r.amount]), [t('st.pl.totalExpenses'), s.totals.expenses], [],
      [Number(s.totals.netProfit) < 0 ? t('st.pl.netLoss') : t('st.pl.net'), s.totals.netProfit],
      ...(owner > 0 ? [[t('st.pl.ownerPayLine'), `-${s.ownerPay}`], [t('st.pl.kept'), kept.toFixed(2)]] : []),
    ]);
  }

  return (
    <main className="screen">
      <div className="no-print"><TopBar title={t('st.pl.title')} back="/reports" /></div>
      <PeriodPicker range={range} onChange={setRange} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {s && (
        <>
          <article className="paper statement" aria-label={t('st.pl.statement')}>
            <StatementHead business={s.business} title={t('st.pl.statement')} sub={period} />
            <table className="statement-table"><tbody>
              <Head>{t('st.pl.income')}</Head>
              {s.income.length ? s.income.map((r) => <Row key={`${r.line}${r.category}`} label={plLabel(r, t)} amount={money(r.amount)} />)
                : <Row label={t('rp.none')} amount="0.00" muted />}
              <Subtotal label={t('st.pl.totalIncome')} amount={money(s.totals.income)} />
              <Row label={t('st.pl.cogs')} amount={`(${money(s.totals.costOfSales)})`} indent={false} />
              <Subtotal label={t('st.pl.gross')} amount={money(s.totals.grossProfit)} />
              <Head>{t('st.pl.expenses')}</Head>
              {s.expenses.length ? s.expenses.map((r) => <Row key={`${r.line}${r.category}`} label={plLabel(r, t)} amount={money(r.amount)} />)
                : <Row label={t('rp.none')} amount="0.00" muted />}
              <Subtotal label={t('st.pl.totalExpenses')} amount={money(s.totals.expenses)} />
              <Total label={Number(s.totals.netProfit) < 0 ? t('st.pl.netLoss') : t('st.pl.net')} amount={money(s.totals.netProfit)} />
              {owner > 0 && (
                <>
                  <Row label={t('st.pl.ownerPayLine')} amount={`(${money(owner)})`} indent={false} />
                  <Subtotal label={kept < 0 ? t('st.pl.keptNeg') : t('st.pl.kept')} amount={money(kept)} />
                </>
              )}
            </tbody></table>
            {s.totals.grossMargin !== null && <p className="paper-muted small">{t('st.pl.margin', { pct: s.totals.grossMargin })}</p>}
            {owner > 0 && <p className="paper-muted small">{t('st.pl.ownerPay', { amount: money(owner) })}</p>}
            {owner > 0 && kept < 0 && <p className="warn-text small">{t('st.pl.tooMuch')}</p>}
            <p className="paper-muted small">{t('st.pl.note')}</p>
          </article>
          <StatementActions onCsv={csv} />
        </>
      )}
    </main>
  );
}
