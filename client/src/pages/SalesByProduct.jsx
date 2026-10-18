import { useState } from 'react';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { money, longDate, todayGhana } from '../format';
import { useReport } from '../useReport';
import { monthRange, PeriodPicker, StatementHead, StatementActions, downloadCsv } from '../statements.jsx';

export default function SalesByProduct() {
  const { t } = useT();
  const [range, setRange] = useState(() => monthRange(todayGhana()));
  const { data: s, error } = useReport('sales-by-product', range);
  const period = s && t('rp.period', { from: longDate(s.from, t), to: longDate(s.to, t) });

  function csv() {
    downloadCsv(`sales-by-product-${s.from}-to-${s.to}.csv`, [
      [t('st.sales.statement')], [s.business?.name], [period], [],
      [t('st.stock.product'), t('st.sales.qty'), t('st.sales.sales'), t('st.sales.cost'), t('st.sales.profit'), t('st.sales.margin')],
      ...s.items.map((i) => [i.name, i.qty, i.sales, i.cost, i.profit, i.margin ?? '']),
      [t('st.stock.total'), '', s.totals.sales, s.totals.cost, s.totals.profit, ''],
    ]);
  }

  return (
    <main className="screen">
      <div className="no-print"><TopBar title={t('st.sales.title')} back="/reports" /></div>
      <PeriodPicker range={range} onChange={setRange} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {s && (
        <>
          <article className="paper statement" aria-label={t('st.sales.statement')}>
            <StatementHead business={s.business} title={t('st.sales.statement')} sub={period} />
            {!s.items.length && <p className="paper-muted">{t('st.sales.none')}</p>}
            <ul className="stock-lines">
              {s.items.map((i) => (
                <li key={i.id}>
                  <div className="stock-line-top">
                    <span className="stock-name">{i.name}</span>
                    <span className="num">{money(i.profit)}</span>
                  </div>
                  <div className="paper-muted small">
                    {t('st.sales.flow', { qty: i.qty, unit: i.unit, sales: money(i.sales), cost: money(i.cost) })}
                    {i.margin !== null && ` · ${t('st.sales.marginN', { pct: i.margin })}`}
                  </div>
                </li>
              ))}
            </ul>
            <table className="statement-table"><tbody>
              <tr className="subtotal"><td>{t('st.sales.sales')}</td><td className="num">{money(s.totals.sales)}</td></tr>
              <tr className="subtotal"><td>{t('st.sales.cost')}</td><td className="num">{money(s.totals.cost)}</td></tr>
              <tr className="total"><td>{t('st.sales.profit')}</td><td className="num">{money(s.totals.profit)}</td></tr>
            </tbody></table>
            {Number(s.typedSales) > 0 && <p className="paper-muted small">{t('st.sales.typed', { amount: money(s.typedSales) })}</p>}
            <p className="paper-muted small">{t('st.sales.note')}</p>
          </article>
          <StatementActions onCsv={csv} />
        </>
      )}
    </main>
  );
}
